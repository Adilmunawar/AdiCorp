-- Foundation 1/7: staff roles, RLS helper functions, profile lockdown, secure onboarding.
-- Idempotent. Compatible with existing rows (is_admin=true profiles become 'owner').

-- ---------------------------------------------------------------------------
-- profiles.role (owner | hr | finance); legacy is_admin kept in sync
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'hr', 'finance'));
  END IF;
END $$;

UPDATE public.profiles SET role = 'owner' WHERE is_admin AND role IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_role ON public.profiles (company_id, role);

CREATE OR REPLACE FUNCTION public.tg_profiles_sync_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Legacy writers that only flip is_admin=true get the owner role.
  IF NEW.role IS NULL AND NEW.is_admin
     AND (TG_OP = 'INSERT' OR OLD.is_admin IS DISTINCT FROM NEW.is_admin) THEN
    NEW.role := 'owner';
  END IF;
  -- role is the source of truth.
  NEW.is_admin := COALESCE(NEW.role IN ('owner', 'hr'), false);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_profiles_sync_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_role ON public.profiles;
CREATE TRIGGER profiles_sync_role
  BEFORE INSERT OR UPDATE OF role, is_admin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_sync_role();

-- ---------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER, STABLE, empty search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role FROM public.profiles p
  WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.auth_is_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.role = 'owner' FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.auth_is_hr()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.role IN ('owner', 'hr') FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.auth_is_finance()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.role IN ('owner', 'finance') FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.auth_is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.role IS NOT NULL FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false)
$$;

REVOKE ALL ON FUNCTION public.auth_company_id(), public.auth_role(), public.auth_is_owner(),
  public.auth_is_hr(), public.auth_is_finance(), public.auth_is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_company_id(), public.auth_role(), public.auth_is_owner(),
  public.auth_is_hr(), public.auth_is_finance(), public.auth_is_staff() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles: users may only edit cosmetic columns of their own row
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (first_name, last_name, avatar_url) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view profiles in their company" ON public.profiles;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR company_id = (SELECT public.auth_company_id()));

CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Onboarding: companies are created only through this RPC
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS authenticated_users_can_create_companies ON public.companies;

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

  -- Sensible defaults so every module has its configuration rows.
  INSERT INTO public.company_working_settings (company_id) VALUES (v_company) ON CONFLICT DO NOTHING;
  INSERT INTO public.overtime_config (company_id) VALUES (v_company) ON CONFLICT DO NOTHING;
  INSERT INTO public.tier_config (company_id, tier, tier_name, description, regular_multiplier, weekend_multiplier, holiday_multiplier, max_daily_hours, max_monthly_hours)
  VALUES
    (v_company, 'tier_a', 'Management', 'Senior staff and office management', 1.5, 2.0, 2.5, 4, 40),
    (v_company, 'tier_b', 'Supervisors', 'Team leads and coordinators', 1.5, 2.0, 2.5, 5, 50),
    (v_company, 'tier_c', 'Workers', 'General and support staff', 1.5, 2.0, 3.0, 6, 60)
  ON CONFLICT (company_id, tier) DO NOTHING;

  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id)
  VALUES ('company.create', 'Created company ' || v_name, jsonb_build_object('company_id', v_company), v_uid, v_company);

  RETURN v_company;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_for_current_user(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_for_current_user(text, text, text, text, text, text, text, text) TO authenticated;
