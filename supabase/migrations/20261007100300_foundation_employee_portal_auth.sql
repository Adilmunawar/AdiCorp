-- Foundation 4/7: employee portal security.
-- Hashed passwords, opaque session tokens, login throttling, portal_* RPCs,
-- and the old unauthenticated RPC surface closed.

-- ---------------------------------------------------------------------------
-- Password hashing
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Hash existing plaintext passwords; the shared default 'stg1' must be changed at next login.
UPDATE public.employees
SET password_hash = extensions.crypt(password, extensions.gen_salt('bf', 10)),
    must_change_password = (password = 'stg1')
WHERE password IS NOT NULL AND btrim(password) <> '' AND password_hash IS NULL;

-- No shared default password for new employees any more.
ALTER TABLE public.employees ALTER COLUMN password DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- Sessions and login throttle (definer-only tables, no client access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_sessions (
  token_hash bytea PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee ON public.employee_sessions (employee_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_company_created ON public.employee_sessions (company_id, created_at DESC);
ALTER TABLE public.employee_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_sessions FROM anon, authenticated;
DROP POLICY IF EXISTS employee_sessions_no_client_access ON public.employee_sessions;
CREATE POLICY employee_sessions_no_client_access ON public.employee_sessions FOR SELECT TO authenticated USING (false);

-- Keyed by a digest of the CNIC (attempts may not match any company, so no company_id).
CREATE TABLE IF NOT EXISTS public.portal_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnic_key text NOT NULL,
  ip text,
  succeeded boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_login_attempts_cnic ON public.portal_login_attempts (cnic_key, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_login_attempts_ip ON public.portal_login_attempts (ip, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_login_attempts_time ON public.portal_login_attempts (attempted_at);
ALTER TABLE public.portal_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_login_attempts FROM anon, authenticated;
DROP POLICY IF EXISTS portal_login_attempts_no_client_access ON public.portal_login_attempts;
CREATE POLICY portal_login_attempts_no_client_access ON public.portal_login_attempts FOR SELECT TO authenticated USING (false);

-- ---------------------------------------------------------------------------
-- HR sets/resets a portal password by writing employees.password (plaintext):
-- it is hashed here, the plaintext column is always cleared, and the employee
-- must change it at next login.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_employees_hash_password()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.password IS NOT NULL AND btrim(NEW.password) <> '' THEN
    IF length(NEW.password) < 6 OR length(NEW.password) > 72 THEN
      RAISE EXCEPTION 'Portal password must be 6 to 72 characters' USING ERRCODE = '22023';
    END IF;
    NEW.password_hash := extensions.crypt(NEW.password, extensions.gen_salt('bf', 10));
    NEW.must_change_password := true;
  END IF;
  NEW.password := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_employees_hash_password() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_hash_password ON public.employees;
CREATE TRIGGER employees_hash_password
  BEFORE INSERT OR UPDATE OF password ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_employees_hash_password();

-- Staff-initiated password changes and deactivation end every portal session.
CREATE OR REPLACE FUNCTION public.tg_employees_revoke_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.password_hash IS DISTINCT FROM OLD.password_hash AND auth.uid() IS NOT NULL)
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'active')
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    UPDATE public.employee_sessions SET revoked_at = now()
    WHERE employee_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_employees_revoke_sessions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_revoke_sessions ON public.employees;
CREATE TRIGGER employees_revoke_sessions
  AFTER UPDATE OF password_hash, status, company_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_employees_revoke_sessions();

-- Plaintext passwords are now empty everywhere (column kept for compatibility).
UPDATE public.employees SET password = NULL WHERE password IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Session resolution
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._portal_employee(p_token text)
RETURNS public.employees
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
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
  RETURN v_emp;
END;
$$;
REVOKE ALL ON FUNCTION public._portal_employee(text) FROM PUBLIC, anon, authenticated, service_role;

-- Used only by the 'portal-files' Edge Function (service role).
CREATE OR REPLACE FUNCTION public._portal_resolve_session(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN json_build_object('employee_id', v_emp.id, 'company_id', v_emp.company_id);
END;
$$;
REVOKE ALL ON FUNCTION public._portal_resolve_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._portal_resolve_session(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Login / logout
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.employee_login(text, text);
CREATE FUNCTION public.employee_login(p_cnic text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cnic text := regexp_replace(COALESCE(p_cnic, ''), '\D', '', 'g');
  v_key text;
  v_ip text;
  v_cnic_failures integer := 0;
  v_ip_failures integer := 0;
  v_emp public.employees;
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
BEGIN
  IF v_cnic = '' OR COALESCE(p_password, '') = '' THEN
    RETURN json_build_object('error', 'Enter your CNIC and password.');
  END IF;

  v_key := encode(extensions.digest(v_cnic, 'sha256'), 'hex');
  BEGIN
    v_ip := NULLIF(btrim(split_part(COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  DELETE FROM public.portal_login_attempts WHERE attempted_at < now() - interval '1 day';

  SELECT count(*) INTO v_cnic_failures FROM public.portal_login_attempts
  WHERE cnic_key = v_key AND NOT succeeded AND attempted_at > now() - interval '15 minutes';
  IF v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_ip_failures FROM public.portal_login_attempts
    WHERE ip = v_ip AND NOT succeeded AND attempted_at > now() - interval '15 minutes';
  END IF;
  IF v_cnic_failures >= 5 OR v_ip_failures >= 30 THEN
    RETURN json_build_object('error', 'Too many failed attempts. Please wait 15 minutes and try again.', 'code', 'throttled');
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
REVOKE ALL ON FUNCTION public.employee_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employee_login(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_logout(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_token IS NOT NULL AND p_token ~ '^[0-9a-f]{64}$' THEN
    UPDATE public.employee_sessions SET revoked_at = now()
    WHERE token_hash = extensions.digest(p_token, 'sha256') AND revoked_at IS NULL;
  END IF;
  RETURN json_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_logout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_logout(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- portal_me / portal_change_password / notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_me(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
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
    'weekend_saturday', e.weekend_saturday,
    'weekend_sunday', e.weekend_sunday,
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
  WHERE e.id = v_emp.id;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_me(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_me(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_change_password(p_token text, p_old text, p_new text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
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
REVOKE ALL ON FUNCTION public.portal_change_password(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_change_password(text, text, text) TO anon, authenticated;

-- Latest 100 notifications for the signed-in employee, newest first.
CREATE OR REPLACE FUNCTION public.portal_notifications(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_result json;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
           'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
           'href', n.href, 'read_at', n.read_at, 'created_at', n.created_at
         ) ORDER BY n.created_at DESC), '[]'::json)
    INTO v_result
  FROM (
    SELECT * FROM public.notifications
    WHERE employee_id = v_emp.id AND company_id = v_emp.company_id
    ORDER BY created_at DESC
    LIMIT 100
  ) n;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_notifications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_notifications(text) TO anon, authenticated;

-- Marks the given ids read (or all unread when p_ids is NULL). Returns rows updated.
CREATE OR REPLACE FUNCTION public.portal_mark_notifications_read(p_token text, p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_count integer := 0;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE employee_id = v_emp.id
    AND company_id = v_emp.company_id
    AND read_at IS NULL
    AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_mark_notifications_read(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_mark_notifications_read(text, uuid[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Close the old insecure RPC surface
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.employee_get_admin_id(uuid) SET search_path = public;
ALTER FUNCTION public.employee_get_announcements(uuid) SET search_path = public;
ALTER FUNCTION public.employee_get_polls(uuid) SET search_path = public;
ALTER FUNCTION public.employee_cast_vote(uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.employee_get_chat(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.employee_send_message(uuid, uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.employee_mark_chat_read(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.employee_get_unread_counts(uuid) SET search_path = public;
ALTER FUNCTION public.employee_get_complaints(uuid) SET search_path = public;
ALTER FUNCTION public.employee_submit_complaint(uuid, uuid, text, text, boolean) SET search_path = public;

REVOKE EXECUTE ON FUNCTION
  public.get_employee_portal_data(uuid),
  public.update_employee_password(uuid, text, text),
  public.update_employee_avatar(uuid, text),
  public.submit_update_request(uuid, jsonb),
  public.employee_get_admin_id(uuid),
  public.employee_get_announcements(uuid),
  public.employee_get_polls(uuid),
  public.employee_cast_vote(uuid, uuid, uuid),
  public.employee_get_chat(uuid, uuid),
  public.employee_send_message(uuid, uuid, uuid, text),
  public.employee_mark_chat_read(uuid, uuid),
  public.employee_get_unread_counts(uuid),
  public.employee_get_complaints(uuid),
  public.employee_submit_complaint(uuid, uuid, text, text, boolean),
  public.get_user_company_id(uuid),
  public.is_admin(uuid),
  public.handle_new_user(),
  public.update_leave_balance_on_approval()
FROM PUBLIC, anon, authenticated;

-- get_user_profile: own row only, runs with the caller's rights (RLS applies).
CREATE OR REPLACE FUNCTION public.get_user_profile(user_id uuid)
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p.* FROM public.profiles p
  WHERE p.id = get_user_profile.user_id AND p.id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;

-- initialize_tier_config: caller's rights, so tier_config RLS (Finance/owner) decides.
CREATE OR REPLACE FUNCTION public.initialize_tier_config(target_company_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF target_company_id IS DISTINCT FROM public.auth_company_id() OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.tier_config (company_id, tier, tier_name, description, regular_multiplier, weekend_multiplier, holiday_multiplier, max_daily_hours, max_monthly_hours)
  VALUES
    (target_company_id, 'tier_a', 'Management', 'Senior staff and office management', 1.5, 2.0, 2.5, 4, 40),
    (target_company_id, 'tier_b', 'Supervisors', 'Team leads and coordinators', 1.5, 2.0, 2.5, 5, 50),
    (target_company_id, 'tier_c', 'Workers', 'General and support staff', 1.5, 2.0, 3.0, 6, 60)
  ON CONFLICT (company_id, tier) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.initialize_tier_config(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initialize_tier_config(uuid) TO authenticated;

-- process_update_request: HR/owner of the request's company only; caller's rights.
CREATE OR REPLACE FUNCTION public.process_update_request(p_req_id uuid, p_status text)
RETURNS json
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_req public.employee_update_requests;
  v_changes jsonb;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RETURN json_build_object('error', 'Invalid status');
  END IF;
  IF NOT public.auth_is_hr() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_req FROM public.employee_update_requests
  WHERE id = p_req_id AND company_id = public.auth_company_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Request not found');
  END IF;
  IF v_req.status IS DISTINCT FROM 'pending' THEN
    RETURN json_build_object('error', 'Request already processed');
  END IF;

  v_changes := COALESCE(v_req.requested_changes, '{}'::jsonb);
  IF p_status = 'approved' THEN
    UPDATE public.employees
    SET phone = COALESCE(NULLIF(v_changes ->> 'phone', ''), phone),
        email = COALESCE(NULLIF(v_changes ->> 'email', ''), email),
        date_of_birth = COALESCE(NULLIF(v_changes ->> 'date_of_birth', '')::date, date_of_birth),
        father_name = COALESCE(NULLIF(v_changes ->> 'father_name', ''), father_name),
        emergency_contact = COALESCE(NULLIF(v_changes ->> 'emergency_contact', ''), emergency_contact),
        address = COALESCE(NULLIF(v_changes ->> 'address', ''), address),
        gender = COALESCE(NULLIF(v_changes ->> 'gender', ''), gender),
        education = COALESCE(NULLIF(v_changes ->> 'education', ''), education),
        bank_name = COALESCE(NULLIF(v_changes ->> 'bank_name', ''), bank_name),
        bank_account_number = COALESCE(NULLIF(v_changes ->> 'bank_account_number', ''), bank_account_number)
    WHERE id = v_req.employee_id AND company_id = v_req.company_id;
  END IF;

  UPDATE public.employee_update_requests
  SET status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_req_id;

  PERFORM public.notify_employee(
    v_req.company_id, v_req.employee_id, 'profile.update_request',
    CASE WHEN p_status = 'approved' THEN 'Profile changes approved' ELSE 'Profile changes declined' END,
    CASE WHEN p_status = 'approved' THEN 'HR approved the changes you requested to your profile.'
         ELSE 'HR declined the changes you requested to your profile.' END,
    '/portal/profile'
  );
  PERFORM public.log_activity(
    'employee.update_request.' || p_status,
    CASE WHEN p_status = 'approved' THEN 'Approved a profile change request' ELSE 'Declined a profile change request' END,
    jsonb_build_object('request_id', p_req_id),
    v_req.employee_id
  );

  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_update_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_update_request(uuid, text) TO authenticated;

-- Trigger function hygiene.
CREATE OR REPLACE FUNCTION public.update_leave_balance_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    UPDATE public.leave_balances
    SET used_days = used_days + NEW.days_count, updated_at = now()
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
    UPDATE public.leave_balances
    SET used_days = GREATEST(used_days - OLD.days_count, 0), updated_at = now()
    WHERE employee_id = OLD.employee_id
      AND leave_type_id = OLD.leave_type_id
      AND year = EXTRACT(YEAR FROM OLD.start_date);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.update_leave_balance_on_approval() FROM PUBLIC, anon, authenticated;

-- Future functions in public are not executable by anon/PUBLIC unless granted explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
