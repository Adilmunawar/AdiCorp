-- Security hardening (audit findings 1-6).
--
-- 1. activity_logs: the client never inserts directly (log_activity / _portal_log are SECURITY DEFINER),
--    so staff can no longer forge the audit trail or the _portal_throttled() counters.
-- 2. require_staff_mfa is enforced everywhere: the role helpers used by every policy and RPC return
--    false while the session is below the assurance level the company (or the user's own factor)
--    requires. The MFA gate learns the rule through mfa_required() instead of reading company_settings.
-- 3. Client IP: the LAST x-forwarded-for hop is the one the gateway appended; the first is caller-chosen.
--    Per-CNIC lockout becomes a growing delay (2^(failures-5) s, max 60 s) so a stranger cannot lock a
--    real employee out for 15 minutes. The 30-per-IP limit and the reply shape are unchanged.
-- 4. logos bucket: uploads only under <company_id>/ by the owner (was: any authenticated user, any path).
-- 5. must_change_password is enforced server-side: a pending session may only call portal_me and
--    portal_change_password (portal_logout never resolves the employee).
-- 6. Temporary portal passwords follow the portal rule: 8 to 72 characters with letters and digits.

-- ---------------------------------------------------------------- 1. activity_logs
DROP POLICY IF EXISTS activity_logs_insert ON public.activity_logs;
REVOKE INSERT ON public.activity_logs FROM authenticated;

-- ---------------------------------------------------------------- 2. MFA-aware role helpers
CREATE OR REPLACE FUNCTION public.auth_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE((
    SELECT p.role IS NOT NULL FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false) AND public.auth_mfa_ok()
$$;

CREATE OR REPLACE FUNCTION public.auth_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE((
    SELECT p.role = 'owner' FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false) AND public.auth_mfa_ok()
$$;

CREATE OR REPLACE FUNCTION public.auth_is_hr()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE((
    SELECT p.role IN ('owner', 'hr') FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false) AND public.auth_mfa_ok()
$$;

CREATE OR REPLACE FUNCTION public.auth_is_finance()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE((
    SELECT p.role IN ('owner', 'finance') FROM public.profiles p
    WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
  ), false) AND public.auth_mfa_ok()
$$;

-- The MFA gate (any signed-in member, at any assurance level) asks whether the company requires
-- two-step verification; company_settings itself stays readable only to verified staff.
CREATE OR REPLACE FUNCTION public.mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.company_settings s
    WHERE s.company_id = public.auth_company_id() AND s.require_staff_mfa
  )
$$;
REVOKE ALL ON FUNCTION public.mfa_required() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mfa_required() TO authenticated;

-- ---------------------------------------------------------------- 3. client IP + login throttle
CREATE OR REPLACE FUNCTION public._policies_request_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_headers json;
  v_chain text;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  v_chain := COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', '');
  -- The last hop is the address the gateway saw; earlier hops are whatever the caller sent.
  RETURN left(NULLIF(btrim(regexp_replace(v_chain, '^.*,', '')), ''), 64);
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_login(p_cnic text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cnic text := regexp_replace(COALESCE(p_cnic, ''), '\D', '', 'g');
  v_key text;
  v_ip text;
  v_cnic_failures integer := 0;
  v_ip_failures integer := 0;
  v_last_failed timestamptz;
  v_wait integer;
  v_emp public.employees;
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
BEGIN
  IF v_cnic = '' OR COALESCE(p_password, '') = '' THEN
    RETURN json_build_object('error', 'Enter your CNIC and password.');
  END IF;

  v_key := encode(extensions.digest(v_cnic, 'sha256'), 'hex');
  BEGIN
    -- Last x-forwarded-for hop: appended by the gateway, not chosen by the caller.
    v_ip := left(NULLIF(btrim(regexp_replace(
      COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), '^.*,', '')), ''), 64);
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  DELETE FROM public.portal_login_attempts WHERE attempted_at < now() - interval '1 day';

  SELECT count(*), max(attempted_at) INTO v_cnic_failures, v_last_failed FROM public.portal_login_attempts
  WHERE cnic_key = v_key AND NOT succeeded AND attempted_at > now() - interval '15 minutes';
  IF v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_ip_failures FROM public.portal_login_attempts
    WHERE ip = v_ip AND NOT succeeded AND attempted_at > now() - interval '15 minutes';
  END IF;
  IF v_ip_failures >= 30 THEN
    RETURN json_build_object('error', 'Too many failed attempts. Please wait 15 minutes and try again.', 'code', 'throttled');
  END IF;
  -- After 5 failures in 15 minutes each further attempt must wait 2^(failures-5) seconds (at most 60):
  -- slows a guesser down without locking the real employee out.
  IF v_cnic_failures >= 5 THEN
    v_wait := least(60, power(2, v_cnic_failures - 5))::integer;
    IF v_last_failed > now() - make_interval(secs => v_wait) THEN
      RETURN json_build_object(
        'error', format('Too many failed attempts. Please wait %s seconds and try again.', v_wait),
        'code', 'throttled');
    END IF;
  END IF;

  SELECT e.* INTO v_emp
  FROM public.employees e
  WHERE e.cnic IS NOT NULL AND btrim(e.cnic) <> ''
    AND regexp_replace(e.cnic, '\D', '', 'g') = v_cnic
    AND e.password_hash IS NOT NULL
    AND e.password_hash = extensions.crypt(p_password, e.password_hash)
  ORDER BY (e.status = 'active') DESC, e.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Equalise timing for unknown CNICs.
    PERFORM extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    INSERT INTO public.portal_login_attempts (cnic_key, ip, succeeded) VALUES (v_key, v_ip, false);
    RETURN json_build_object('error', 'Invalid CNIC or password.');
  END IF;

  IF v_emp.status <> 'active' THEN
    INSERT INTO public.portal_login_attempts (cnic_key, ip, succeeded) VALUES (v_key, v_ip, false);
    RETURN json_build_object('error', 'Your portal access is no longer active. Please contact HR.', 'code', 'inactive');
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.employee_sessions (token_hash, employee_id, company_id, expires_at, last_seen_at)
  VALUES (extensions.digest(v_token, 'sha256'), v_emp.id, v_emp.company_id, v_expires, now());

  DELETE FROM public.employee_sessions
  WHERE employee_id = v_emp.id AND (expires_at < now() OR revoked_at < now() - interval '1 day');
  DELETE FROM public.portal_login_attempts WHERE cnic_key = v_key AND NOT succeeded;
  INSERT INTO public.portal_login_attempts (cnic_key, ip, succeeded) VALUES (v_key, v_ip, true);

  RETURN json_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'employee', json_build_object(
      'id', v_emp.id,
      'name', v_emp.name,
      'company_id', v_emp.company_id,
      'rank', v_emp.rank,
      'avatar_url', v_emp.avatar_url,
      'needs_password_change', v_emp.must_change_password
    )
  );
END;
$$;

-- ---------------------------------------------------------------- 4. logos bucket
DROP POLICY IF EXISTS tenant_objects_insert ON storage.objects;
CREATE POLICY tenant_objects_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  (bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (SELECT public.auth_is_owner()))
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id = ANY (ARRAY['employee-documents'::text, 'cvs'::text]) AND (SELECT public.auth_is_hr()))
      OR (bucket_id = ANY (ARRAY['avatars'::text, 'company-files'::text]) AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files'
          AND ((SELECT public.auth_is_finance())
               OR ((SELECT public.auth_is_hr()) AND (storage.foldername(name))[2] = ANY (ARRAY['quote'::text, 'certificate'::text]))))
    )
  )
);

-- ---------------------------------------------------------------- 5. must_change_password server-side
DROP FUNCTION IF EXISTS public._portal_employee(text);
CREATE OR REPLACE FUNCTION public._portal_employee(p_token text, p_allow_pending boolean DEFAULT false)
RETURNS public.employees
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_emp public.employees;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid session' USING ERRCODE = '28000';
  END IF;
  SELECT e.* INTO v_emp
  FROM public.employee_sessions s
  JOIN public.employees e ON e.id = s.employee_id AND e.company_id = s.company_id
  WHERE s.token_hash = extensions.digest(p_token, 'sha256')
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND e.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid session' USING ERRCODE = '28000';
  END IF;
  -- A temporary password only opens portal_me and portal_change_password.
  IF v_emp.must_change_password AND NOT COALESCE(p_allow_pending, false) THEN
    RAISE EXCEPTION 'password_change_required' USING ERRCODE = '28000';
  END IF;
  RETURN v_emp;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_change_password(p_token text, p_old text, p_new text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token, true);
BEGIN
  IF v_emp.password_hash IS NULL OR v_emp.password_hash <> extensions.crypt(COALESCE(p_old, ''), v_emp.password_hash) THEN
    RETURN json_build_object('error', 'Your current password is incorrect.');
  END IF;
  IF p_new IS NULL OR length(p_new) < 8 OR length(p_new) > 72 THEN
    RETURN json_build_object('error', 'New password must be 8 to 72 characters.');
  END IF;
  IF p_new !~ '[A-Za-z]' OR p_new !~ '[0-9]' THEN
    RETURN json_build_object('error', 'New password must contain letters and numbers.');
  END IF;
  IF p_new = p_old THEN
    RETURN json_build_object('error', 'New password must be different from the current one.');
  END IF;

  UPDATE public.employees
  SET password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
      must_change_password = false
  WHERE id = v_emp.id;

  -- Sign out every other device.
  UPDATE public.employee_sessions SET revoked_at = now()
  WHERE employee_id = v_emp.id AND revoked_at IS NULL
    AND token_hash <> extensions.digest(p_token, 'sha256');

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_me(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token, true);
  v_today date := public._time_today(v_emp.company_id);
  v_result json;
BEGIN
  UPDATE public.employee_sessions SET last_seen_at = now()
  WHERE token_hash = extensions.digest(p_token, 'sha256')
    AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes');

  SELECT json_build_object(
    'id', e.id,
    'company_id', e.company_id,
    'employee_code', e.employee_code,
    'name', e.name,
    'rank', e.rank,
    'department_id', e.department_id,
    'department', d.name,
    'status', e.status,
    'joining_date', e.joining_date,
    'separation_date', e.separation_date,
    'email', e.email,
    'phone', e.phone,
    'cnic', e.cnic,
    'father_name', e.father_name,
    'date_of_birth', e.date_of_birth,
    'gender', e.gender,
    'address', e.address,
    'education', e.education,
    'emergency_contact', e.emergency_contact,
    'bank_name', e.bank_name,
    'bank_account_number', e.bank_account_number,
    'avatar_url', e.avatar_url,
    'shift_type', e.shift_type,
    'working_hours_per_day', e.working_hours_per_day,
    -- The weekend that applies to the employee: their own setting, else the company rule today.
    'weekend_saturday', COALESCE(
      e.weekend_saturday,
      COALESCE(s.weekend_saturday, false)
        AND (s.saturday_off_from IS NULL OR v_today >= s.saturday_off_from)
        AND (s.saturday_off_until IS NULL OR v_today <= s.saturday_off_until)
    ),
    'weekend_sunday', COALESCE(e.weekend_sunday, s.weekend_sunday, true),
    'saturday_pattern', CASE WHEN e.weekend_saturday IS NULL THEN COALESCE(s.saturday_pattern, 'all') ELSE 'all' END,
    'needs_password_change', e.must_change_password,
    'company', json_build_object(
      'id', c.id, 'name', c.name, 'logo', c.logo, 'currency', c.currency,
      'phone', c.phone, 'website', c.website, 'address', c.address
    )
  )
  INTO v_result
  FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.company_working_settings s ON s.company_id = e.company_id
  WHERE e.id = v_emp.id;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------- 6. temporary password rule
CREATE OR REPLACE FUNCTION public.tg_employees_hash_password()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.password IS NOT NULL AND btrim(NEW.password) <> '' THEN
    IF length(NEW.password) < 8 OR length(NEW.password) > 72
       OR NEW.password !~ '[A-Za-z]' OR NEW.password !~ '[0-9]' THEN
      RAISE EXCEPTION 'Portal password must be 8 to 72 characters with letters and numbers' USING ERRCODE = '22023';
    END IF;
    NEW.password_hash := extensions.crypt(NEW.password, extensions.gen_salt('bf', 10));
    NEW.must_change_password := true;
  END IF;
  NEW.password := NULL;
  RETURN NEW;
END;
$$;
