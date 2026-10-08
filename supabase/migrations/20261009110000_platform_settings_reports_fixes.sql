-- Platform fixes.
--
-- 1. platform_update_settings
--    - Working hours were accepted in quarter hours up to 16, but company_settings only holds 1 to 12
--      in half hours, so 7.25 or 13 failed with a raw check-constraint error. The time module (the source
--      of truth, time_settings) allows 1 to 16 in half hours: validate that, and keep the company_settings
--      fallback within its own range.
--    - The letters module allows 2 to 8 character prefixes (letter_settings), but company_settings only
--      holds 6 per segment, so a longer prefix set under Letters broke every later settings save. The
--      fallback copy is cut to 6 characters.
--    - Turning Saturdays off cleared saturday_off_from, which made every past Saturday a day off
--      (working_dates applies saturday_off_from to every pattern), so past attendance and leave counts
--      changed. Like time_save_settings, Saturdays switched off now start today, and a rule that was
--      already on keeps its start date.
--    - "changed 1 setting(s)" in the owner notification now reads "1 setting" / "2 settings".
-- 2. platform_update_company: the time module reads its own timezone (time_settings.timezone) for
--    punches and attendance days, so changing the company timezone now keeps it in step.
-- 3. platform_report_attendance: working days are counted per person (personal weekends, joining and
--    leaving dates) instead of by the company week, so people with Saturdays off no longer show their
--    Saturdays as unmarked days.
-- 4. platform_dashboard: today's register only expects people for whom today is a working day, and
--    upcoming events carry their end date (an event that started earlier is still on).

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
  v_sat_from date;
  v_actor text;
  v_count integer;
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
  -- Same rule as the time module (time_settings): 1 to 16 hours, in half hours.
  IF v_hours IS NULL OR v_hours < 1 OR v_hours > 16
     OR (p_patch ? 'working_hours_per_day' AND (v_hours * 2) <> trunc(v_hours * 2)) THEN
    RAISE EXCEPTION 'Working hours per day must be between 1 and 16, in half hours' USING ERRCODE = '22023';
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
    -- company_settings is only the fallback copy of hours and prefix (time_settings and letter_settings
    -- are read first), and its columns are narrower: 1 to 12 hours in halves, 6-character prefixes.
    v_company, v_new ->> 'saturday_policy', v_from, v_until, (v_new ->> 'sunday_off')::boolean,
    LEAST(round(v_hours * 2) / 2, 12),
    v_threshold::smallint, (v_new ->> 'require_push_notifications')::boolean, (v_new ->> 'self_service_edits')::boolean,
    (v_new ->> 'leave_requires_approval')::boolean,
    NULLIF(btrim(COALESCE(v_new ->> 'letter_signatory_name', '')), ''),
    NULLIF(btrim(COALESCE(v_new ->> 'letter_signatory_title', '')), ''),
    left(v_prefix, 6), (v_new ->> 'require_staff_mfa')::boolean, auth.uid(), now()
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
    -- working_dates applies saturday_off_from to every Saturday rule. Saturdays switched off start today,
    -- so Saturdays already worked stay working days (as in time_save_settings); a rule that was already
    -- off keeps its start date.
    v_sat_from := CASE
      WHEN (v_new ->> 'saturday_policy') = 'seasonal' THEN v_from
      WHEN (v_new ->> 'saturday_policy') = 'working' THEN NULL
      WHEN (v_old ->> 'saturday_policy') IN ('off', 'alternate_1_3', 'alternate_2_4') THEN NULLIF(v_old ->> 'saturday_off_from', '')::date
      ELSE public.company_today(v_company)
    END;
    INSERT INTO public.company_working_settings (
      company_id, weekend_saturday, weekend_sunday, saturday_pattern, saturday_off_from, saturday_off_until
    )
    VALUES (
      v_company,
      (v_new ->> 'saturday_policy') <> 'working',
      (v_new ->> 'sunday_off')::boolean,
      CASE v_new ->> 'saturday_policy' WHEN 'alternate_2_4' THEN 'alt_2_4' WHEN 'alternate_1_3' THEN 'alt_1_3_5' ELSE 'all' END,
      v_sat_from,
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
      SELECT count(*) INTO v_count FROM jsonb_object_keys(v_changes);
      PERFORM public.notify_roles(
        v_company, ARRAY['owner'], 'settings.updated', 'Company settings changed',
        COALESCE(v_actor, 'HR') || ' changed ' || v_count || CASE WHEN v_count = 1 THEN ' setting.' ELSE ' settings.' END,
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

  -- The time module keeps its own copy of the timezone (punches and attendance days): keep it in step,
  -- so "today" is the same day on the dashboard, in attendance and in leave.
  IF v_new.timezone IS DISTINCT FROM v_old.timezone THEN
    UPDATE public.time_settings ts
    SET timezone = v_new.timezone, updated_by = auth.uid(), updated_at = now()
    WHERE ts.company_id = v_company;
  END IF;

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

-- ---------------------------------------------------------------------------
-- Attendance (month): per person working days so far, present, half day, leave, absent, unmarked.
-- Approved leave on an unmarked working day counts as leave. Working days are each person's own:
-- personal weekends, and only the days between joining and leaving.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_report_attendance(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_today date;
  v_start date;
  v_end date;
  v_cut date;
BEGIN
  v_today := public.company_today(v_company);
  v_start := date_trunc('month', COALESCE(p_month, v_today))::date;
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_cut := LEAST(v_end, v_today);

  IF v_start > v_today THEN
    RETURN jsonb_build_object('month', v_start, 'through', NULL, 'working_days', 0, 'rows', '[]'::jsonb);
  END IF;

  RETURN (
    WITH wd AS (
      SELECT d FROM public.working_dates(v_company, v_start, v_cut) AS d
    ), emp AS (
      SELECT e.id, e.name, e.employee_code, e.rank, dep.name AS department, e.joining_date, e.separation_date
      FROM public.employees e
      LEFT JOIN public.departments dep ON dep.id = e.department_id
      WHERE e.company_id = v_company
        AND (e.joining_date IS NULL OR e.joining_date <= v_cut)
        AND (e.status = 'active' OR (e.separation_date IS NOT NULL AND e.separation_date >= v_start))
    ), per AS (
      SELECT emp.*, a.*
      FROM emp
      CROSS JOIN LATERAL (
        SELECT
          count(*) AS working_days,
          count(*) FILTER (WHERE att.status IN ('present', 'late')) AS present,
          count(*) FILTER (WHERE att.status IN ('short_leave', 'half_day')) AS short_leave,
          count(*) FILTER (WHERE att.status = 'leave' OR (att.status IS NULL AND lv.on_leave)) AS on_leave,
          count(*) FILTER (WHERE att.status = 'absent') AS absent,
          count(*) FILTER (WHERE att.status IS NULL AND NOT lv.on_leave) AS unmarked
        FROM public.working_dates(v_company, v_start, v_cut, emp.id) AS wd(d)
        LEFT JOIN public.attendance att ON att.employee_id = emp.id AND att.date = wd.d
        CROSS JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1 FROM public.leave_requests lr
            WHERE lr.employee_id = emp.id AND lr.status = 'approved' AND wd.d BETWEEN lr.start_date AND lr.end_date
          ) AS on_leave
        ) lv
        WHERE wd.d >= COALESCE(emp.joining_date, v_start)
          AND (emp.separation_date IS NULL OR wd.d <= emp.separation_date)
      ) a
    )
    SELECT jsonb_build_object(
      'month', v_start,
      'through', v_cut,
      'working_days', (SELECT count(*) FROM wd),
      'rows', COALESCE(jsonb_agg(jsonb_build_object(
        'employee_id', per.id, 'name', per.name, 'code', per.employee_code, 'rank', per.rank, 'department', per.department,
        'working_days', per.working_days, 'present', per.present, 'short_leave', per.short_leave, 'leave', per.on_leave,
        'absent', per.absent, 'unmarked', per.unmarked,
        'days_worked', per.present + 0.5 * per.short_leave,
        'pct', CASE WHEN per.working_days > 0
                    THEN round((per.present + 0.5 * per.short_leave) * 100.0 / per.working_days, 1) END
      ) ORDER BY per.name), '[]'::jsonb)
    )
    FROM per
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_dashboard(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_role text := public.auth_role();
  v_hr boolean := public.auth_role() IN ('owner', 'hr');
  v_fin boolean := public.auth_role() IN ('owner', 'finance');
  v_today date;
  v_month date;
  v_next_month date;
  v_out jsonb;
  v_part jsonb;
  v_tmp jsonb;
  v_tbl text;
BEGIN
  v_today := COALESCE(p_date, public.company_today(v_company));
  v_month := date_trunc('month', v_today)::date;
  v_next_month := (v_month + interval '1 month')::date;

  v_out := jsonb_build_object(
    'role', v_role,
    'today', v_today,
    'month', v_month,
    'is_working_day', public.is_working_day(v_company, v_today),
    'holiday', (
      SELECT ev.title FROM public.events ev
      WHERE ev.company_id = v_company AND v_today BETWEEN ev.date AND COALESCE(ev.end_date, ev.date)
        AND ev.type IN ('holiday', 'off_day')
      ORDER BY ev.date DESC, ev.created_at LIMIT 1
    )
  );

  -- People (every role)
  SELECT jsonb_build_object(
    'active', count(*) FILTER (WHERE e.status = 'active'),
    'separated', count(*) FILTER (WHERE e.status <> 'active'),
    'joiners_month', count(*) FILTER (WHERE e.joining_date >= v_month AND e.joining_date <= v_today),
    'leavers_month', count(*) FILTER (WHERE e.separation_date >= v_month AND e.separation_date <= v_today),
    'starting_soon', count(*) FILTER (WHERE e.status = 'active' AND e.joining_date > v_today),
    'incomplete_profiles', count(*) FILTER (
      WHERE e.status = 'active'
        AND (e.cnic IS NULL OR e.phone IS NULL OR e.joining_date IS NULL OR e.date_of_birth IS NULL OR e.department_id IS NULL)
    ),
    'no_portal_access', count(*) FILTER (WHERE e.status = 'active' AND e.password_hash IS NULL)
  )
  INTO v_part
  FROM public.employees e
  WHERE e.company_id = v_company;
  v_out := v_out || jsonb_build_object('people', v_part);

  v_out := v_out || jsonb_build_object('departments', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', x.name, 'count', x.n) ORDER BY x.n DESC, x.name), '[]'::jsonb)
    FROM (
      SELECT COALESCE(d.name, 'Unassigned') AS name, count(*) AS n
      FROM public.employees e
      LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE e.company_id = v_company AND e.status = 'active'
      GROUP BY 1
    ) x
  ));

  v_out := v_out || jsonb_build_object('headcount_trend', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'month', m.mon,
      'active', (
        SELECT count(*) FROM public.employees e
        WHERE e.company_id = v_company
          AND COALESCE(e.joining_date, e.created_at::date) <= m.last_day
          AND (e.separation_date IS NULL OR e.separation_date > m.last_day)
          AND (e.status = 'active' OR e.separation_date IS NOT NULL)
      ),
      'joiners', (SELECT count(*) FROM public.employees e WHERE e.company_id = v_company AND e.joining_date BETWEEN m.mon AND m.last_day),
      'leavers', (SELECT count(*) FROM public.employees e WHERE e.company_id = v_company AND e.separation_date BETWEEN m.mon AND m.last_day)
    ) ORDER BY m.mon), '[]'::jsonb)
    FROM (
      SELECT g::date AS mon, LEAST((g + interval '1 month - 1 day')::date, v_today) AS last_day
      FROM generate_series(v_month - interval '11 months', v_month::timestamp, interval '1 month') AS g
    ) m
  ));

  -- Recent activity: HR never sees payroll.*, Finance sees its own areas.
  v_out := v_out || jsonb_build_object('activity', (
    SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb)
    FROM (
      SELECT l.id, l.action_type AS action, l.description, l.created_at,
             public._platform_person(l.user_id) AS actor, e.name AS employee
      FROM public.activity_logs l
      LEFT JOIN public.employees e ON e.id = l.employee_id
      WHERE l.company_id = v_company
        AND (v_fin OR l.action_type NOT LIKE 'payroll.%')
        AND (v_role <> 'finance' OR l.action_type LIKE 'payroll.%' OR l.action_type LIKE 'expense%' OR l.action_type LIKE 'settings.%')
      ORDER BY l.created_at DESC
      LIMIT 8
    ) x
  ));

  -- ---------------------------------------------------------------- HR / owner
  IF v_hr THEN
    -- Expected today: active people for whom today is a working day (personal weekends included).
    WITH act AS (
      SELECT e.id FROM public.employees e
      WHERE e.company_id = v_company AND e.status = 'active' AND (e.joining_date IS NULL OR e.joining_date <= v_today)
        AND EXISTS (SELECT 1 FROM public.working_dates(v_company, v_today, v_today, e.id))
    ), mark AS (
      SELECT a.employee_id, a.status FROM public.attendance a WHERE a.company_id = v_company AND a.date = v_today
    ), lv AS (
      SELECT DISTINCT lr.employee_id FROM public.leave_requests lr
      WHERE lr.company_id = v_company AND lr.status = 'approved' AND v_today BETWEEN lr.start_date AND lr.end_date
    )
    SELECT jsonb_build_object(
      'expected', count(*),
      'present', count(*) FILTER (WHERE m.status IN ('present', 'late')),
      'short_leave', count(*) FILTER (WHERE m.status IN ('short_leave', 'half_day')),
      'leave', count(*) FILTER (WHERE m.status = 'leave' OR (m.status IS NULL AND lv.employee_id IS NOT NULL)),
      'absent', count(*) FILTER (WHERE m.status = 'absent'),
      'unmarked', count(*) FILTER (WHERE m.status IS NULL AND lv.employee_id IS NULL)
    )
    INTO v_part
    FROM act
    LEFT JOIN mark m ON m.employee_id = act.id
    LEFT JOIN lv ON lv.employee_id = act.id;
    v_out := v_out || jsonb_build_object('attendance_today', v_part);

    v_out := v_out || jsonb_build_object('attendance_trend', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', w.d, 'expected', x.expected, 'present', x.present, 'short_leave', x.short_leave,
        'leave', x.on_leave, 'absent', x.absent
      ) ORDER BY w.d), '[]'::jsonb)
      FROM (SELECT d FROM public.working_dates(v_company, v_today - 41, v_today) AS d ORDER BY d DESC LIMIT 14) w
      CROSS JOIN LATERAL (
        SELECT
          (SELECT count(*) FROM public.employees e
           WHERE e.company_id = v_company
             AND COALESCE(e.joining_date, e.created_at::date) <= w.d
             AND (e.separation_date IS NULL OR e.separation_date >= w.d)
             AND (e.status = 'active' OR e.separation_date IS NOT NULL)) AS expected,
          count(*) FILTER (WHERE a.status IN ('present', 'late')) AS present,
          count(*) FILTER (WHERE a.status IN ('short_leave', 'half_day')) AS short_leave,
          count(*) FILTER (WHERE a.status = 'leave') AS on_leave,
          count(*) FILTER (WHERE a.status = 'absent') AS absent
        FROM public.attendance a
        WHERE a.company_id = v_company AND a.date = w.d
      ) x
    ));

    v_out := v_out || jsonb_build_object('approvals', jsonb_build_object(
      'leave', (SELECT count(*) FROM public.leave_requests lr WHERE lr.company_id = v_company AND lr.status = 'pending'),
      'overtime', (SELECT count(*) FROM public.overtime_records o WHERE o.company_id = v_company AND o.status = 'pending'),
      'profile_updates', (SELECT count(*) FROM public.employee_update_requests u WHERE u.company_id = v_company AND u.status = 'pending'),
      'complaints', (SELECT count(*) FROM public.complaints c WHERE c.company_id = v_company AND c.status IN ('pending', 'investigating'))
    ));

    v_out := v_out || jsonb_build_object('pending_leave', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.start_date, x.created_at), '[]'::jsonb)
      FROM (
        SELECT lr.id, lr.employee_id, e.name, lt.name AS type_name, lr.start_date, lr.end_date, lr.days_count, lr.created_at
        FROM public.leave_requests lr
        JOIN public.employees e ON e.id = lr.employee_id
        LEFT JOIN public.leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.company_id = v_company AND lr.status = 'pending'
        ORDER BY lr.start_date, lr.created_at
        LIMIT 5
      ) x
    ));

    v_out := v_out || jsonb_build_object('upcoming_leave', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.start_date), '[]'::jsonb)
      FROM (
        SELECT lr.id, lr.employee_id, e.name, lt.name AS type_name, lr.start_date, lr.end_date, lr.days_count
        FROM public.leave_requests lr
        JOIN public.employees e ON e.id = lr.employee_id
        LEFT JOIN public.leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.company_id = v_company AND lr.status = 'approved'
          AND lr.end_date >= v_today AND lr.start_date <= v_today + 14
        ORDER BY lr.start_date
        LIMIT 6
      ) x
    ));

    v_out := v_out || jsonb_build_object('celebrations', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.date, x.kind, x.name), '[]'::jsonb)
      FROM (
        SELECT e.id AS employee_id, e.name, e.avatar_url, 'birthday'::text AS kind, d.day AS date, NULL::integer AS years
        FROM public.employees e
        CROSS JOIN LATERAL (SELECT v_today + i AS day FROM generate_series(0, 7) AS i) d
        WHERE e.company_id = v_company AND e.status = 'active' AND e.date_of_birth IS NOT NULL
          AND (
            to_char(e.date_of_birth, 'MM-DD') = to_char(d.day, 'MM-DD')
            OR (to_char(e.date_of_birth, 'MM-DD') = '02-29' AND to_char(d.day, 'MM-DD') = '02-28'
                AND to_char((date_trunc('year', d.day) + interval '1 year - 1 day')::date, 'DDD') = '365')
          )
        UNION ALL
        SELECT e.id, e.name, e.avatar_url, 'anniversary', d.day,
               (extract(year FROM d.day) - extract(year FROM e.joining_date))::integer
        FROM public.employees e
        CROSS JOIN LATERAL (SELECT v_today + i AS day FROM generate_series(0, 7) AS i) d
        WHERE e.company_id = v_company AND e.status = 'active' AND e.joining_date IS NOT NULL
          AND e.joining_date < d.day - 300
          AND (
            to_char(e.joining_date, 'MM-DD') = to_char(d.day, 'MM-DD')
            OR (to_char(e.joining_date, 'MM-DD') = '02-29' AND to_char(d.day, 'MM-DD') = '02-28'
                AND to_char((date_trunc('year', d.day) + interval '1 year - 1 day')::date, 'DDD') = '365')
          )
        UNION ALL
        SELECT e.id, e.name, e.avatar_url, 'joining', e.joining_date, 0
        FROM public.employees e
        WHERE e.company_id = v_company AND e.status = 'active' AND e.joining_date BETWEEN v_today AND v_today + 7
      ) x
    ));

    v_out := v_out || jsonb_build_object('events', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.date), '[]'::jsonb)
      FROM (
        SELECT ev.id, ev.title, ev.date, ev.end_date, ev.type, ev.description
        FROM public.events ev
        WHERE ev.company_id = v_company AND ev.date <= v_today + 30 AND COALESCE(ev.end_date, ev.date) >= v_today
        ORDER BY ev.date
        LIMIT 6
      ) x
    ));

    -- Hiring funnel (careers module tables, when present)
    FOREACH v_tbl IN ARRAY ARRAY['job_applications', 'applications', 'careers_applications', 'candidates'] LOOP
      IF public._platform_has_cols(v_tbl, ARRAY['company_id', 'status', 'created_at']) THEN
        BEGIN
          EXECUTE format($q$
            SELECT jsonb_build_object(
              'total', count(*),
              'last_7_days', count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
              'by_status', COALESCE((
                SELECT jsonb_object_agg(x.s, x.n)
                FROM (SELECT status::text AS s, count(*) AS n FROM public.%1$I WHERE company_id = $1 GROUP BY 1) x
              ), '{}'::jsonb)
            )
            FROM public.%1$I WHERE company_id = $1
          $q$, v_tbl)
          INTO v_part USING v_company;
          v_out := v_out || jsonb_build_object('hiring', v_part);
        EXCEPTION WHEN others THEN
          NULL;
        END;
        EXIT;
      END IF;
    END LOOP;

    FOREACH v_tbl IN ARRAY ARRAY['jobs', 'job_postings', 'job_openings', 'careers_jobs'] LOOP
      IF public._platform_has_cols(v_tbl, ARRAY['company_id', 'status']) THEN
        BEGIN
          EXECUTE format($q$
            SELECT to_jsonb(count(*)) FROM public.%1$I
            WHERE company_id = $1 AND status::text IN ('open', 'published', 'active', 'live')
          $q$, v_tbl)
          INTO v_tmp USING v_company;
          v_out := jsonb_set(v_out, '{hiring}', COALESCE(v_out -> 'hiring', '{}'::jsonb) || jsonb_build_object('open_jobs', v_tmp));
        EXCEPTION WHEN others THEN
          NULL;
        END;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------- Finance / owner
  IF v_fin THEN
    SELECT jsonb_build_object(
      'month', v_month,
      'payslips', count(*),
      'employees', count(DISTINCT ps.employee_id),
      'gross', COALESCE(sum(ps.gross_salary), 0),
      'net', COALESCE(sum(ps.net_salary), 0),
      'deductions', COALESCE(sum(ps.total_deductions), 0),
      'overtime', COALESCE(sum(ps.overtime_earnings), 0)
    )
    INTO v_part
    FROM public.payslips ps
    WHERE ps.company_id = v_company AND ps.month >= v_month AND ps.month < v_next_month;

    IF public._platform_has_cols('payslips', ARRAY['status']) THEN
      BEGIN
        EXECUTE $q$
          SELECT COALESCE(jsonb_object_agg(x.s, x.n), '{}'::jsonb)
          FROM (
            SELECT status::text AS s, count(*) AS n FROM public.payslips
            WHERE company_id = $1 AND month >= $2 AND month < $3 GROUP BY 1
          ) x
        $q$
        INTO v_tmp USING v_company, v_month, v_next_month;
        v_part := v_part || jsonb_build_object('by_status', v_tmp);
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
    v_out := v_out || jsonb_build_object('payroll_month', v_part);

    v_out := v_out || jsonb_build_object('payroll_trend', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', m.mon, 'gross', COALESCE(s.gross, 0), 'net', COALESCE(s.net, 0), 'payslips', COALESCE(s.n, 0)
      ) ORDER BY m.mon), '[]'::jsonb)
      FROM (
        SELECT g::date AS mon FROM generate_series(v_month - interval '5 months', v_month::timestamp, interval '1 month') AS g
      ) m
      LEFT JOIN LATERAL (
        SELECT sum(ps.gross_salary) AS gross, sum(ps.net_salary) AS net, count(*) AS n
        FROM public.payslips ps
        WHERE ps.company_id = v_company AND ps.month >= m.mon AND ps.month < (m.mon + interval '1 month')
      ) s ON true
    ));

    v_out := v_out || jsonb_build_object('cost_by_department', (
      WITH lm AS (
        SELECT date_trunc('month', max(ps.month))::date AS m
        FROM public.payslips ps
        WHERE ps.company_id = v_company AND ps.month < v_next_month
      )
      SELECT jsonb_build_object(
        'month', lm.m,
        'rows', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', x.name, 'net', x.net, 'gross', x.gross, 'people', x.n) ORDER BY x.net DESC)
          FROM (
            SELECT COALESCE(d.name, 'Unassigned') AS name, sum(ps.net_salary) AS net, sum(ps.gross_salary) AS gross,
                   count(DISTINCT ps.employee_id) AS n
            FROM public.payslips ps
            JOIN public.employees e ON e.id = ps.employee_id
            LEFT JOIN public.departments d ON d.id = e.department_id
            WHERE ps.company_id = v_company AND ps.month >= lm.m AND ps.month < (lm.m + interval '1 month')
            GROUP BY 1
          ) x
        ), '[]'::jsonb)
      )
      FROM lm
    ));

    SELECT jsonb_build_object(
      'monthly_total', COALESCE(sum(sh.monthly_salary + COALESCE(sh.other_allowance, 0)), 0),
      'with_salary', count(sh.monthly_salary),
      'without_salary', count(*) - count(sh.monthly_salary),
      'changes_this_month', (
        SELECT count(*) FROM public.salary_history s2
        WHERE s2.company_id = v_company AND s2.effective_from >= v_month AND s2.effective_from < v_next_month
      )
    )
    INTO v_part
    FROM public.employees e
    LEFT JOIN LATERAL (
      SELECT s.monthly_salary, s.other_allowance
      FROM public.salary_history s
      WHERE s.employee_id = e.id AND s.effective_from <= v_today
      ORDER BY s.effective_from DESC, s.created_at DESC
      LIMIT 1
    ) sh ON true
    WHERE e.company_id = v_company AND e.status = 'active';
    v_out := v_out || jsonb_build_object('salary_bill', v_part);

    SELECT jsonb_build_object(
      'approved_hours', COALESCE(sum(o.hours) FILTER (WHERE o.status = 'approved'), 0),
      'approved_entries', count(*) FILTER (WHERE o.status = 'approved'),
      'pending_entries', count(*) FILTER (WHERE o.status = 'pending')
    )
    INTO v_part
    FROM public.overtime_records o
    WHERE o.company_id = v_company AND o.date >= v_month AND o.date < v_next_month;
    v_out := v_out || jsonb_build_object('overtime_month', v_part);

    -- Spending: money actually paid out (expense_payments, company currency), by the day it was paid.
    -- Quoted amounts on expenses can be in other currencies, so they are never summed here.
    IF public._platform_has_cols('expense_payments', ARRAY['company_id', 'expense_id', 'amount', 'paid_on']) THEN
      SELECT jsonb_build_object(
        'month_total', COALESCE(sum(p.amount) FILTER (WHERE p.paid_on >= v_month), 0),
        'previous_total', COALESCE(sum(p.amount) FILTER (WHERE p.paid_on < v_month), 0),
        'month_count', count(DISTINCT p.expense_id) FILTER (WHERE p.paid_on >= v_month),
        'trend', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m.mon, 'total', COALESCE((
            SELECT sum(t.amount) FROM public.expense_payments t
            WHERE t.company_id = v_company AND t.paid_on >= m.mon AND t.paid_on < (m.mon + interval '1 month')::date
          ), 0)) ORDER BY m.mon), '[]'::jsonb)
          FROM (SELECT g::date AS mon FROM generate_series(v_month - interval '5 months', v_month::timestamp, interval '1 month') AS g) m
        )
      )
      INTO v_part
      FROM public.expense_payments p
      WHERE p.company_id = v_company
        AND p.paid_on >= (v_month - interval '1 month')::date AND p.paid_on < v_next_month;
      v_out := v_out || jsonb_build_object('spending', v_part);
    END IF;
  END IF;

  RETURN v_out;
END;
$fn$;
REVOKE ALL ON FUNCTION public.platform_dashboard(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_dashboard(date) TO authenticated;
