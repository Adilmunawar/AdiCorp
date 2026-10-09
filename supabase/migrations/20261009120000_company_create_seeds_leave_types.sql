-- A brand-new company could run payroll but its employees could not request leave: leave types were
-- only seeded when HR found the button. Company creation now seeds the standard leave types too, and
-- the overtime tiers get neutral names (they were factory-floor labels from the first customer).

CREATE OR REPLACE FUNCTION public.create_company_for_current_user(
  p_name text,
  p_currency text DEFAULT 'USD',
  p_company_size text DEFAULT NULL,
  p_company_type text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_logo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(COALESCE(p_name, ''));
  v_currency text := upper(btrim(COALESCE(NULLIF(btrim(p_currency), ''), 'USD')));
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Company name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;
  PERFORM 1 FROM public.profiles WHERE id = v_uid FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'You already belong to a company' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.companies (name, currency, company_size, company_type, phone, website, address, logo, created_by)
  VALUES (
    v_name, v_currency,
    NULLIF(btrim(p_company_size), ''), NULLIF(btrim(p_company_type), ''),
    NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_website), ''),
    NULLIF(btrim(p_address), ''), NULLIF(btrim(p_logo), ''),
    v_uid
  )
  RETURNING id INTO v_company;

  UPDATE public.profiles SET company_id = v_company, role = 'owner' WHERE id = v_uid;

  -- Sensible defaults so every module works on day one; all of it is editable in Settings.
  INSERT INTO public.company_working_settings (company_id) VALUES (v_company) ON CONFLICT DO NOTHING;
  INSERT INTO public.overtime_config (company_id) VALUES (v_company) ON CONFLICT DO NOTHING;
  INSERT INTO public.tier_config (company_id, tier, tier_name, description, regular_multiplier, weekend_multiplier, holiday_multiplier, max_daily_hours, max_monthly_hours)
  VALUES
    (v_company, 'tier_a', 'Senior staff', 'Managers and senior specialists', 1.5, 2.0, 2.5, 4, 40),
    (v_company, 'tier_b', 'Team leads', 'Supervisors and coordinators', 1.5, 2.0, 2.5, 5, 50),
    (v_company, 'tier_c', 'Staff', 'Everyone else', 1.5, 2.0, 2.5, 6, 60)
  ON CONFLICT (company_id, tier) DO NOTHING;

  INSERT INTO public.leave_types (company_id, name, type, days_per_year, is_paid, is_active)
  SELECT v_company, x.name, x.kind::public.leave_type_enum, x.days, x.paid, true
  FROM (VALUES
    ('Annual', 'annual', 14, true),
    ('Sick', 'sick', 8, true),
    ('Casual', 'casual', 10, true),
    ('Unpaid', 'unpaid', 0, false),
    ('Maternity', 'maternity', 90, true),
    ('Paternity', 'paternity', 7, true)
  ) AS x(name, kind, days, paid)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id)
  VALUES ('company.create', 'Created company ' || v_name, jsonb_build_object('company_id', v_company), v_uid, v_company);

  RETURN v_company;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_for_current_user(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_for_current_user(text, text, text, text, text, text, text, text) TO authenticated;
