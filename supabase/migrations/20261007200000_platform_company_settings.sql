-- Platform 1/4: company profile fields, company settings, working-day helpers, MFA policy.
-- Idempotent. Requires the foundation migrations (auth_* helpers, notify_*, log_activity, _portal_employee).
-- Existing companies keep working without a company_settings row: readers resolve defaults
-- from company_working_settings, so no rows of other tenants are written here.

-- ---------------------------------------------------------------------------
-- companies: public address (slug), legal identity, timezone
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_slug_format_chk' AND conrelid = 'public.companies'::regclass) THEN
    ALTER TABLE public.companies
      -- Same rule as the careers module's companies_slug_chk (it generates the existing slugs).
      ADD CONSTRAINT companies_slug_format_chk
        CHECK (slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 60)) NOT VALID;
    ALTER TABLE public.companies VALIDATE CONSTRAINT companies_slug_format_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_country_chk' AND conrelid = 'public.companies'::regclass) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_country_chk CHECK (country IS NULL OR country ~ '^[A-Z]{2}$') NOT VALID;
    ALTER TABLE public.companies VALIDATE CONSTRAINT companies_country_chk;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key ON public.companies (lower(slug)) WHERE slug IS NOT NULL;

-- Nexus Orbits Pakistan runs on Pakistan time.
UPDATE public.companies SET timezone = 'Asia/Karachi'
WHERE id = 'bc8defea-829f-4eeb-b210-6918e88e3019' AND timezone = 'UTC';

-- ---------------------------------------------------------------------------
-- company_settings: one row per company, written only through platform_update_settings()
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  saturday_policy text NOT NULL DEFAULT 'working'
    CHECK (saturday_policy IN ('working', 'off', 'alternate_1_3', 'alternate_2_4', 'seasonal')),
  saturday_off_from date,
  saturday_off_until date,
  sunday_off boolean NOT NULL DEFAULT true,
  working_hours_per_day numeric(3,1) NOT NULL DEFAULT 8
    CHECK (working_hours_per_day BETWEEN 1 AND 12 AND (working_hours_per_day * 2) = trunc(working_hours_per_day * 2)),
  hours_threshold_pct smallint NOT NULL DEFAULT 90 CHECK (hours_threshold_pct BETWEEN 50 AND 100),
  require_push_notifications boolean NOT NULL DEFAULT false,
  self_service_edits boolean NOT NULL DEFAULT true,
  leave_requires_approval boolean NOT NULL DEFAULT true,
  letter_signatory_name text CHECK (letter_signatory_name IS NULL OR length(letter_signatory_name) <= 80),
  letter_signatory_title text CHECK (letter_signatory_title IS NULL OR length(letter_signatory_title) <= 80),
  letter_reference_prefix text NOT NULL DEFAULT 'HR' CHECK (letter_reference_prefix ~ '^[A-Z0-9]{1,6}(/[A-Z0-9]{1,6})?$'),
  require_staff_mfa boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_seasonal_chk CHECK (
    saturday_policy <> 'seasonal'
    OR (saturday_off_from IS NOT NULL AND saturday_off_until IS NOT NULL AND saturday_off_from <= saturday_off_until)
  )
);
CREATE INDEX IF NOT EXISTS idx_company_settings_updated_by ON public.company_settings (updated_by);
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.company_settings FROM authenticated;
GRANT SELECT ON public.company_settings TO authenticated;

DROP POLICY IF EXISTS company_settings_select ON public.company_settings;
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));

-- ---------------------------------------------------------------------------
-- MFA: aal2 is required when the user has a verified factor, or when the owner
-- requires two-step verification for every staff account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_mfa_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      OR NOT (
        EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = (SELECT auth.uid()) AND f.status = 'verified')
        OR EXISTS (
          SELECT 1 FROM public.company_settings s
          WHERE s.company_id = public.auth_company_id() AND s.require_staff_mfa
        )
      )
$$;
REVOKE ALL ON FUNCTION public.auth_mfa_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_mfa_ok() TO authenticated, service_role;

-- Internal: caller must hold one of p_roles and satisfy the MFA policy. Returns the company.
CREATE OR REPLACE FUNCTION public._platform_assert(p_roles text[])
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_role text := public.auth_role();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR v_role IS NULL OR NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION 'You do not have access to this' USING ERRCODE = '42501';
  END IF;
  IF NOT public.auth_mfa_ok() THEN
    RAISE EXCEPTION 'Two-step verification is required' USING ERRCODE = '42501', HINT = 'mfa_required';
  END IF;
  RETURN v_company;
END;
$$;
REVOKE ALL ON FUNCTION public._platform_assert(text[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Calendar helpers (shared with other modules)
-- ---------------------------------------------------------------------------

-- Today's date in the company's timezone.
CREATE OR REPLACE FUNCTION public.company_today(p_company uuid)
RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE COALESCE((SELECT c.timezone FROM public.companies c WHERE c.id = p_company), 'UTC'))::date
$$;

-- Is this Saturday off under the policy? (1st/3rd and 2nd/4th count Saturdays within the month.)
CREATE OR REPLACE FUNCTION public.is_saturday_off(p_policy text, p_from date, p_until date, p_date date)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_policy
    WHEN 'off' THEN true
    WHEN 'alternate_1_3' THEN ((extract(day FROM p_date)::int - 1) / 7 + 1) IN (1, 3, 5)
    WHEN 'alternate_2_4' THEN ((extract(day FROM p_date)::int - 1) / 7 + 1) IN (2, 4)
    WHEN 'seasonal' THEN p_from IS NOT NULL AND p_until IS NOT NULL AND p_date BETWEEN p_from AND p_until
    ELSE false
  END
$$;

-- Effective working week of a company, read from company_working_settings: the table the time
-- module's public.working_dates uses, so Settings, attendance, leave and payroll always agree.
CREATE OR REPLACE FUNCTION public.company_week(p_company uuid)
RETURNS TABLE (saturday_policy text, saturday_off_from date, saturday_off_until date, sunday_off boolean)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN NOT COALESCE(w.weekend_saturday, false) THEN 'working'
           WHEN COALESCE(w.saturday_pattern, 'all') = 'alt_2_4' THEN 'alternate_2_4'
           WHEN COALESCE(w.saturday_pattern, 'all') = 'alt_1_3_5' THEN 'alternate_1_3'
           WHEN w.saturday_off_from IS NOT NULL AND w.saturday_off_until IS NOT NULL THEN 'seasonal'
           ELSE 'off'
         END,
         w.saturday_off_from,
         w.saturday_off_until,
         COALESCE(w.weekend_sunday, true)
  FROM (SELECT 1) AS one
  LEFT JOIN public.company_working_settings w ON w.company_id = p_company
$$;

-- Working dates come from the time module's public.working_dates(company, from, to, employee default null)
-- (20261007130100), the single definition used by time, leave, payroll and these reports. A second
-- three-argument overload would make every three-argument call ambiguous, so make sure none exists.
DROP FUNCTION IF EXISTS public.working_dates(uuid, date, date);

CREATE OR REPLACE FUNCTION public.is_working_day(p_company uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.working_dates(p_company, p_date, p_date))
$$;

REVOKE ALL ON FUNCTION public.company_today(uuid), public.is_saturday_off(text, date, date, date),
  public.company_week(uuid), public.is_working_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_today(uuid), public.is_saturday_off(text, date, date, date),
  public.company_week(uuid), public.is_working_day(uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Resolved settings (defaults when no row exists yet)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._platform_settings_json(p_company uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'saturday_policy', wk.saturday_policy,
    'saturday_off_from', wk.saturday_off_from,
    'saturday_off_until', wk.saturday_off_until,
    'sunday_off', wk.sunday_off,
    'working_hours_per_day', COALESCE(ts.hours_per_day, s.working_hours_per_day, 8),
    'hours_threshold_pct', COALESCE(ts.hours_threshold_pct, s.hours_threshold_pct, 90),
    'require_push_notifications', COALESCE(s.require_push_notifications, false),
    'self_service_edits', COALESCE(s.self_service_edits, true),
    'leave_requires_approval', COALESCE(ls.requires_approval, s.leave_requires_approval, true),
    'letter_signatory_name', COALESCE(NULLIF(lt.signatory_name, ''), s.letter_signatory_name),
    'letter_signatory_title', COALESCE(NULLIF(lt.signatory_title, ''), s.letter_signatory_title),
    'letter_reference_prefix', COALESCE(lt.ref_prefix, s.letter_reference_prefix, public._letters_default_prefix(p_company)),
    'require_staff_mfa', COALESCE(s.require_staff_mfa, false),
    'updated_at', s.updated_at,
    'updated_by', s.updated_by
  )
  FROM public.company_week(p_company) AS wk
  LEFT JOIN public.company_settings s ON s.company_id = p_company
  -- The modules' own settings tables are the source of truth; company_settings is the fallback.
  LEFT JOIN public.time_settings ts ON ts.company_id = p_company
  LEFT JOIN public.leave_settings ls ON ls.company_id = p_company
  LEFT JOIN public.letter_settings lt ON lt.company_id = p_company
$$;
REVOKE ALL ON FUNCTION public._platform_settings_json(uuid) FROM PUBLIC, anon, authenticated;

-- Staff: resolved settings plus the editor's name.
CREATE OR REPLACE FUNCTION public.platform_get_settings()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_settings jsonb := public._platform_settings_json(v_company);
BEGIN
  RETURN v_settings || jsonb_build_object(
    'updated_by_name',
    (SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
     FROM public.profiles p WHERE p.id = (v_settings ->> 'updated_by')::uuid)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_get_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_settings() TO authenticated;

-- Owner or HR. HR may change everything except the staff two-step verification policy.
-- p_patch: any subset of the setting keys. Every change is logged with from/to.
CREATE OR REPLACE FUNCTION public.platform_update_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr']);
  v_role text := public.auth_role();
  v_allowed text[] := ARRAY[
    'saturday_policy', 'saturday_off_from', 'saturday_off_until', 'sunday_off', 'working_hours_per_day',
    'hours_threshold_pct', 'require_push_notifications', 'self_service_edits', 'leave_requires_approval',
    'letter_signatory_name', 'letter_signatory_title', 'letter_reference_prefix', 'require_staff_mfa'
  ];
  v_key text;
  v_old jsonb;
  v_new jsonb;
  v_after jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_hours numeric;
  v_threshold numeric;
  v_prefix text;
  v_from date;
  v_until date;
  v_actor text;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Nothing to save' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Unknown setting: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_patch ? 'require_staff_mfa' AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can change the two-step verification policy' USING ERRCODE = '42501';
  END IF;

  -- Serialise concurrent saves for this company.
  PERFORM 1 FROM public.companies c WHERE c.id = v_company FOR UPDATE;

  v_old := public._platform_settings_json(v_company) - 'updated_at' - 'updated_by';
  v_new := v_old || p_patch;

  IF NOT (COALESCE(v_new ->> 'saturday_policy', '') = ANY (ARRAY['working', 'off', 'alternate_1_3', 'alternate_2_4', 'seasonal'])) THEN
    RAISE EXCEPTION 'Choose how Saturdays work' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_from := NULLIF(v_new ->> 'saturday_off_from', '')::date;
    v_until := NULLIF(v_new ->> 'saturday_off_until', '')::date;
    v_hours := (v_new ->> 'working_hours_per_day')::numeric;
    v_threshold := (v_new ->> 'hours_threshold_pct')::numeric;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Some values are not valid. Check the dates and numbers.' USING ERRCODE = '22023';
  END;
  IF (v_new ->> 'saturday_policy') = 'seasonal' AND (v_from IS NULL OR v_until IS NULL OR v_from > v_until) THEN
    RAISE EXCEPTION 'Give the first and the last Saturday off, in order' USING ERRCODE = '22023';
  END IF;
  IF v_hours IS NULL OR v_hours < 1 OR v_hours > 16 OR (v_hours * 4) <> trunc(v_hours * 4) THEN
    RAISE EXCEPTION 'Working hours per day must be between 1 and 16, in quarter hours' USING ERRCODE = '22023';
  END IF;
  IF v_threshold IS NULL OR v_threshold < 50 OR v_threshold > 100 OR v_threshold <> trunc(v_threshold) THEN
    RAISE EXCEPTION 'The hours threshold must be a whole percentage between 50 and 100' USING ERRCODE = '22023';
  END IF;
  v_prefix := upper(btrim(COALESCE(v_new ->> 'letter_reference_prefix', '')));
  IF v_prefix !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'The letter reference prefix uses 2 to 8 letters or digits' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(v_new ->> 'letter_signatory_name', ''))) > 80
     OR length(btrim(COALESCE(v_new ->> 'letter_signatory_title', ''))) > 80 THEN
    RAISE EXCEPTION 'Signatory name and title are limited to 80 characters' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['sunday_off', 'require_push_notifications', 'self_service_edits', 'leave_requires_approval', 'require_staff_mfa'] LOOP
    IF jsonb_typeof(v_new -> v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Setting % must be on or off', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.company_settings AS s (
    company_id, saturday_policy, saturday_off_from, saturday_off_until, sunday_off, working_hours_per_day,
    hours_threshold_pct, require_push_notifications, self_service_edits, leave_requires_approval,
    letter_signatory_name, letter_signatory_title, letter_reference_prefix, require_staff_mfa, updated_by, updated_at
  ) VALUES (
    v_company, v_new ->> 'saturday_policy', v_from, v_until, (v_new ->> 'sunday_off')::boolean, v_hours,
    v_threshold::smallint, (v_new ->> 'require_push_notifications')::boolean, (v_new ->> 'self_service_edits')::boolean,
    (v_new ->> 'leave_requires_approval')::boolean,
    NULLIF(btrim(COALESCE(v_new ->> 'letter_signatory_name', '')), ''),
    NULLIF(btrim(COALESCE(v_new ->> 'letter_signatory_title', '')), ''),
    v_prefix, (v_new ->> 'require_staff_mfa')::boolean, auth.uid(), now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    saturday_policy = EXCLUDED.saturday_policy,
    saturday_off_from = EXCLUDED.saturday_off_from,
    saturday_off_until = EXCLUDED.saturday_off_until,
    sunday_off = EXCLUDED.sunday_off,
    working_hours_per_day = EXCLUDED.working_hours_per_day,
    hours_threshold_pct = EXCLUDED.hours_threshold_pct,
    require_push_notifications = EXCLUDED.require_push_notifications,
    self_service_edits = EXCLUDED.self_service_edits,
    leave_requires_approval = EXCLUDED.leave_requires_approval,
    letter_signatory_name = EXCLUDED.letter_signatory_name,
    letter_signatory_title = EXCLUDED.letter_signatory_title,
    letter_reference_prefix = EXCLUDED.letter_reference_prefix,
    require_staff_mfa = EXCLUDED.require_staff_mfa,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  -- company_working_settings drives public.working_dates (time, leave, payroll), so mirror the week there.
  IF p_patch ? 'saturday_policy' OR p_patch ? 'sunday_off' OR p_patch ? 'saturday_off_from' OR p_patch ? 'saturday_off_until' THEN
    INSERT INTO public.company_working_settings (
      company_id, weekend_saturday, weekend_sunday, saturday_pattern, saturday_off_from, saturday_off_until
    )
    VALUES (
      v_company,
      (v_new ->> 'saturday_policy') <> 'working',
      (v_new ->> 'sunday_off')::boolean,
      CASE v_new ->> 'saturday_policy' WHEN 'alternate_2_4' THEN 'alt_2_4' WHEN 'alternate_1_3' THEN 'alt_1_3_5' ELSE 'all' END,
      CASE WHEN (v_new ->> 'saturday_policy') = 'seasonal' THEN v_from END,
      CASE WHEN (v_new ->> 'saturday_policy') = 'seasonal' THEN v_until END
    )
    ON CONFLICT (company_id) DO UPDATE
      SET weekend_saturday = EXCLUDED.weekend_saturday,
          weekend_sunday = EXCLUDED.weekend_sunday,
          saturday_pattern = EXCLUDED.saturday_pattern,
          saturday_off_from = EXCLUDED.saturday_off_from,
          saturday_off_until = EXCLUDED.saturday_off_until;
  END IF;

  -- Mirror into the modules' own settings, which their RPCs read.
  IF p_patch ? 'working_hours_per_day' OR p_patch ? 'hours_threshold_pct' THEN
    INSERT INTO public.time_settings (company_id, timezone, hours_per_day, hours_threshold_pct, updated_by, updated_at)
    VALUES (
      v_company,
      COALESCE((SELECT NULLIF(c.timezone, '') FROM public.companies c WHERE c.id = v_company), 'UTC'),
      v_hours, v_threshold::integer, auth.uid(), now()
    )
    ON CONFLICT (company_id) DO UPDATE
      SET hours_per_day = EXCLUDED.hours_per_day,
          hours_threshold_pct = EXCLUDED.hours_threshold_pct,
          updated_by = EXCLUDED.updated_by,
          updated_at = now();
  END IF;
  IF p_patch ? 'leave_requires_approval' THEN
    INSERT INTO public.leave_settings (company_id, requires_approval, updated_by, updated_at)
    VALUES (v_company, (v_new ->> 'leave_requires_approval')::boolean, auth.uid(), now())
    ON CONFLICT (company_id) DO UPDATE
      SET requires_approval = EXCLUDED.requires_approval, updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;
  IF p_patch ? 'letter_reference_prefix' OR p_patch ? 'letter_signatory_name' OR p_patch ? 'letter_signatory_title' THEN
    INSERT INTO public.letter_settings (company_id, ref_prefix, signatory_name, signatory_title, updated_by, updated_at)
    VALUES (
      v_company, v_prefix,
      btrim(COALESCE(v_new ->> 'letter_signatory_name', '')),
      COALESCE(NULLIF(btrim(COALESCE(v_new ->> 'letter_signatory_title', '')), ''), 'Human Resources'),
      auth.uid(), now()
    )
    ON CONFLICT (company_id) DO UPDATE
      SET ref_prefix = EXCLUDED.ref_prefix,
          signatory_name = EXCLUDED.signatory_name,
          signatory_title = EXCLUDED.signatory_title,
          updated_by = EXCLUDED.updated_by,
          updated_at = now();
  END IF;

  v_after := public._platform_settings_json(v_company);
  FOREACH v_key IN ARRAY v_allowed LOOP
    IF (v_old -> v_key) IS DISTINCT FROM (v_after -> v_key) THEN
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_after -> v_key));
    END IF;
  END LOOP;

  IF v_changes <> '{}'::jsonb THEN
    PERFORM public.log_activity(
      'settings.updated',
      'Changed company settings: ' || (SELECT string_agg(replace(k, '_', ' '), ', ' ORDER BY k) FROM jsonb_object_keys(v_changes) AS k),
      jsonb_build_object('changes', v_changes)
    );

    IF v_changes ? 'require_staff_mfa' AND (v_after ->> 'require_staff_mfa')::boolean THEN
      PERFORM public.notify_roles(
        v_company, ARRAY['hr', 'finance'], 'security.mfa_required',
        'Two-step verification is now required',
        'Set up an authenticator app under My account. You will be asked for a code at every sign-in.',
        '/account?tab=security'
      );
    END IF;

    IF v_role = 'hr' THEN
      SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();
      PERFORM public.notify_roles(
        v_company, ARRAY['owner'], 'settings.updated', 'Company settings changed',
        COALESCE(v_actor, 'HR') || ' changed ' || (SELECT count(*) FROM jsonb_object_keys(v_changes)) || ' setting(s).',
        '/timeline?area=settings'
      );
    END IF;
  END IF;

  RETURN v_after;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_settings(jsonb) TO authenticated;

-- Owner only: company profile. p_patch: any subset of name, legal_name, slug, currency, phone, website,
-- address, logo, tax_id, country, timezone, company_size, company_type.
CREATE OR REPLACE FUNCTION public.platform_update_company(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner']);
  v_allowed text[] := ARRAY['name', 'legal_name', 'slug', 'currency', 'phone', 'website', 'address', 'logo',
                            'tax_id', 'country', 'timezone', 'company_size', 'company_type'];
  v_reserved text[] := ARRAY['admin', 'api', 'app', 'auth', 'portal', 'careers', 'www', 'dashboard', 'settings',
                             'login', 'signup', 'help', 'support', 'status', 'static', 'assets', 'onboarding'];
  v_old public.companies;
  v_new public.companies;
  v_key text;
  v_changes jsonb := '{}'::jsonb;
  v_old_json jsonb;
  v_new_json jsonb;
  v_desc text;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Nothing to save' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Unknown company field: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_old FROM public.companies c WHERE c.id = v_company FOR UPDATE;
  v_new := v_old;

  IF p_patch ? 'name' THEN v_new.name := btrim(COALESCE(p_patch ->> 'name', '')); END IF;
  IF p_patch ? 'legal_name' THEN v_new.legal_name := NULLIF(btrim(COALESCE(p_patch ->> 'legal_name', '')), ''); END IF;
  IF p_patch ? 'slug' THEN v_new.slug := NULLIF(lower(btrim(COALESCE(p_patch ->> 'slug', ''))), ''); END IF;
  IF p_patch ? 'currency' THEN v_new.currency := upper(btrim(COALESCE(p_patch ->> 'currency', ''))); END IF;
  IF p_patch ? 'phone' THEN v_new.phone := NULLIF(btrim(COALESCE(p_patch ->> 'phone', '')), ''); END IF;
  IF p_patch ? 'website' THEN v_new.website := NULLIF(btrim(COALESCE(p_patch ->> 'website', '')), ''); END IF;
  IF p_patch ? 'address' THEN v_new.address := NULLIF(btrim(COALESCE(p_patch ->> 'address', '')), ''); END IF;
  IF p_patch ? 'logo' THEN v_new.logo := NULLIF(btrim(COALESCE(p_patch ->> 'logo', '')), ''); END IF;
  IF p_patch ? 'tax_id' THEN v_new.tax_id := NULLIF(btrim(COALESCE(p_patch ->> 'tax_id', '')), ''); END IF;
  IF p_patch ? 'country' THEN v_new.country := NULLIF(upper(btrim(COALESCE(p_patch ->> 'country', ''))), ''); END IF;
  IF p_patch ? 'timezone' THEN v_new.timezone := btrim(COALESCE(p_patch ->> 'timezone', '')); END IF;
  IF p_patch ? 'company_size' THEN v_new.company_size := NULLIF(btrim(COALESCE(p_patch ->> 'company_size', '')), ''); END IF;
  IF p_patch ? 'company_type' THEN v_new.company_type := NULLIF(btrim(COALESCE(p_patch ->> 'company_type', '')), ''); END IF;

  IF length(v_new.name) < 2 OR length(v_new.name) > 120 THEN
    RAISE EXCEPTION 'Company name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_new.legal_name IS NOT NULL AND length(v_new.legal_name) > 160 THEN
    RAISE EXCEPTION 'Legal name is limited to 160 characters' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_new.currency, '') !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code' USING ERRCODE = '22023';
  END IF;
  IF v_new.slug IS NOT NULL THEN
    IF v_new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_new.slug) NOT BETWEEN 2 AND 60 THEN
      RAISE EXCEPTION 'The address uses 2 to 60 lowercase letters, digits and single hyphens' USING ERRCODE = '22023';
    END IF;
    IF v_new.slug = ANY (v_reserved) THEN
      RAISE EXCEPTION 'That address is reserved. Choose another one.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.companies c WHERE lower(c.slug) = v_new.slug AND c.id <> v_company) THEN
      RAISE EXCEPTION 'That address is already taken' USING ERRCODE = '23505';
    END IF;
  END IF;
  IF v_new.website IS NOT NULL THEN
    IF v_new.website !~* '^https?://' THEN v_new.website := 'https://' || v_new.website; END IF;
    IF length(v_new.website) > 200 OR v_new.website ~ '\s' THEN
      RAISE EXCEPTION 'Enter a valid website address' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_new.logo IS NOT NULL AND (v_new.logo !~ '^https://' OR length(v_new.logo) > 1000) THEN
    RAISE EXCEPTION 'The logo must be an uploaded image' USING ERRCODE = '22023';
  END IF;
  IF v_new.phone IS NOT NULL AND length(v_new.phone) > 40 THEN
    RAISE EXCEPTION 'Phone is limited to 40 characters' USING ERRCODE = '22023';
  END IF;
  IF v_new.address IS NOT NULL AND length(v_new.address) > 400 THEN
    RAISE EXCEPTION 'Address is limited to 400 characters' USING ERRCODE = '22023';
  END IF;
  IF v_new.tax_id IS NOT NULL AND length(v_new.tax_id) > 40 THEN
    RAISE EXCEPTION 'Tax ID is limited to 40 characters' USING ERRCODE = '22023';
  END IF;
  IF v_new.country IS NOT NULL AND v_new.country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Choose a country' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name = v_new.timezone) THEN
    RAISE EXCEPTION 'Choose a valid timezone' USING ERRCODE = '22023';
  END IF;

  UPDATE public.companies c SET
    name = v_new.name, legal_name = v_new.legal_name, slug = v_new.slug, currency = v_new.currency,
    phone = v_new.phone, website = v_new.website, address = v_new.address, logo = v_new.logo,
    tax_id = v_new.tax_id, country = v_new.country, timezone = v_new.timezone,
    company_size = v_new.company_size, company_type = v_new.company_type
  WHERE c.id = v_company;

  v_old_json := to_jsonb(v_old);
  v_new_json := to_jsonb(v_new);
  FOREACH v_key IN ARRAY v_allowed LOOP
    IF (v_old_json -> v_key) IS DISTINCT FROM (v_new_json -> v_key) THEN
      v_changes := v_changes || jsonb_build_object(
        v_key,
        CASE WHEN v_key IN ('logo', 'tax_id') THEN to_jsonb('changed'::text)
             ELSE jsonb_build_object('from', v_old_json -> v_key, 'to', v_new_json -> v_key) END
      );
    END IF;
  END LOOP;

  IF v_changes <> '{}'::jsonb THEN
    v_desc := CASE
      WHEN v_changes ? 'currency' THEN 'Changed the company currency from ' || v_old.currency || ' to ' || v_new.currency
      ELSE 'Updated the company profile: ' || (SELECT string_agg(replace(k, '_', ' '), ', ' ORDER BY k) FROM jsonb_object_keys(v_changes) AS k)
    END;
    PERFORM public.log_activity('settings.company', v_desc, jsonb_build_object('changes', v_changes));
  END IF;

  RETURN v_new_json;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_company(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_company(jsonb) TO authenticated;

-- Portal: the settings an employee's app needs (push gate, hours, week, self-service).
CREATE OR REPLACE FUNCTION public.portal_company_settings(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_settings jsonb := public._platform_settings_json(v_emp.company_id);
BEGIN
  RETURN jsonb_build_object(
    'require_push_notifications', v_settings -> 'require_push_notifications',
    'working_hours_per_day', v_settings -> 'working_hours_per_day',
    'hours_threshold_pct', v_settings -> 'hours_threshold_pct',
    'self_service_edits', v_settings -> 'self_service_edits',
    'leave_requires_approval', v_settings -> 'leave_requires_approval',
    'saturday_policy', v_settings -> 'saturday_policy',
    'saturday_off_from', v_settings -> 'saturday_off_from',
    'saturday_off_until', v_settings -> 'saturday_off_until',
    'sunday_off', v_settings -> 'sunday_off',
    'timezone', (SELECT c.timezone FROM public.companies c WHERE c.id = v_emp.company_id),
    'today', public.company_today(v_emp.company_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.portal_company_settings(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_company_settings(text) TO anon, authenticated;
