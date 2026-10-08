-- People 4/5: staff RPCs for employees (save, import, separate, rejoin, codes,
-- bulk department), profile-request review, checklist auto-step sync and the
-- sidebar badge counts. Every function checks the HR role and the company.

-- ---------------------------------------------------------------------------
-- Sidebar badges (RLS applies: invoker).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_badge_counts()
RETURNS json
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT json_build_object(
    'pending_updates', (
      SELECT count(*) FROM public.employee_update_requests r
      WHERE r.company_id = (SELECT public.auth_company_id()) AND r.status = 'pending'),
    'missing_documents', (
      SELECT count(*) FROM public.employees e
      WHERE e.company_id = (SELECT public.auth_company_id()) AND e.status = 'active'
        AND (SELECT count(DISTINCT d.document_type) FROM public.employee_documents d
             WHERE d.employee_id = e.id AND d.document_type IN ('id_copy', 'contract', 'certificate')) < 3),
    'overdue_checklists', (
      SELECT count(*) FROM public.employee_checklists c
      WHERE c.company_id = (SELECT public.auth_company_id()) AND c.status = 'open' AND c.due_date < current_date)
  )
$$;
REVOKE ALL ON FUNCTION public.people_badge_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_badge_counts() TO authenticated;

-- ---------------------------------------------------------------------------
-- Checklist auto steps
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._people_auto_state(p_employee uuid, p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.employees;
BEGIN
  SELECT * INTO e FROM public.employees x WHERE x.id = p_employee;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN CASE p_key
    WHEN 'doc_id_copy' THEN EXISTS (SELECT 1 FROM public.employee_documents d WHERE d.employee_id = e.id AND d.document_type = 'id_copy')
    WHEN 'doc_contract' THEN EXISTS (SELECT 1 FROM public.employee_documents d WHERE d.employee_id = e.id AND d.document_type = 'contract')
    WHEN 'doc_certificate' THEN EXISTS (SELECT 1 FROM public.employee_documents d WHERE d.employee_id = e.id AND d.document_type = 'certificate')
    WHEN 'employment_set' THEN COALESCE(btrim(e.rank), '') <> '' AND e.joining_date IS NOT NULL AND e.department_id IS NOT NULL
    -- HR learns only whether a salary exists, never the amount.
    WHEN 'salary_set' THEN EXISTS (SELECT 1 FROM public.salary_history s WHERE s.employee_id = e.id AND s.monthly_salary > 0)
    WHEN 'portal_access' THEN e.password_hash IS NOT NULL
    WHEN 'assets_issued' THEN EXISTS (SELECT 1 FROM public.assets a WHERE a.employee_id = e.id AND a.status = 'assigned')
    WHEN 'bank_details' THEN COALESCE(btrim(e.bank_name), '') <> '' AND COALESCE(btrim(e.bank_account_number), '') <> ''
    WHEN 'profile_complete' THEN COALESCE(btrim(e.name), '') <> '' AND COALESCE(btrim(e.cnic), '') <> ''
      AND COALESCE(btrim(e.father_name), '') <> '' AND COALESCE(btrim(e.phone), '') <> ''
      AND e.date_of_birth IS NOT NULL AND COALESCE(btrim(e.emergency_contact), '') <> ''
    WHEN 'assets_returned' THEN NOT EXISTS (SELECT 1 FROM public.assets a WHERE a.employee_id = e.id AND a.status = 'assigned')
    WHEN 'access_disabled' THEN e.status <> 'active'
    WHEN 'final_payslip' THEN e.separation_date IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.payslips p WHERE p.employee_id = e.id AND p.month = date_trunc('month', e.separation_date)::date)
    ELSE false
  END;
END;
$$;
REVOKE ALL ON FUNCTION public._people_auto_state(uuid, text) FROM PUBLIC, anon, authenticated;

-- Re-evaluate untouched auto steps of open checklists (one checklist, or the whole company).
CREATE OR REPLACE FUNCTION public.people_sync_checklists(p_checklist uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_count integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can view checklists.' USING ERRCODE = '42501';
  END IF;
  WITH state AS (
    SELECT i.id, public._people_auto_state(c.employee_id, i.auto_key) AS ok, i.done_at
    FROM public.employee_checklist_items i
    JOIN public.employee_checklists c ON c.id = i.checklist_id
    WHERE c.company_id = v_company
      AND c.status = 'open'
      AND (p_checklist IS NULL OR c.id = p_checklist)
      AND i.auto_key IS NOT NULL
      AND NOT i.touched
  )
  UPDATE public.employee_checklist_items i
  SET done_at = CASE WHEN s.ok THEN now() END,
      done_by = NULL
  FROM state s
  WHERE i.id = s.id AND (s.ok <> (s.done_at IS NOT NULL));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.people_sync_checklists(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_sync_checklists(uuid) TO authenticated;

-- Whether a salary exists for each given employee (no amounts). For onboarding hints.
CREATE OR REPLACE FUNCTION public.people_salary_set(p_employees uuid[])
RETURNS TABLE (employee_id uuid, salary_set boolean)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.id, EXISTS (SELECT 1 FROM public.salary_history s WHERE s.employee_id = e.id AND s.monthly_salary > 0)
  FROM public.employees e
  WHERE e.id = ANY (p_employees)
    AND e.company_id = public.auth_company_id()
    AND public.auth_is_staff()
$$;
REVOKE ALL ON FUNCTION public.people_salary_set(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_salary_set(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Validation of one employee payload. Returns the normalised record as jsonb.
-- p_employee = NULL for a new person. Department may be given by id or by name
-- (p_create_departments lets import create missing ones).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._people_validate_employee(
  p_company uuid, p_employee uuid, p_data jsonb, p_create_departments boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.employees;
  v_name text := regexp_replace(btrim(COALESCE(p_data ->> 'name', '')), '\s+', ' ', 'g');
  v_rank text := regexp_replace(btrim(COALESCE(p_data ->> 'rank', '')), '\s+', ' ', 'g');
  v_cnic text;
  v_email text;
  v_dept uuid;
  v_dept_name text := NULLIF(regexp_replace(btrim(COALESCE(p_data ->> 'department', '')), '\s+', ' ', 'g'), '');
  v_join date;
  v_shift text := lower(NULLIF(btrim(COALESCE(p_data ->> 'shift_type', '')), ''));
  v_sat text := lower(NULLIF(btrim(COALESCE(p_data ->> 'weekend_saturday', '')), ''));
  v_hours integer;
  v_notes text := NULLIF(btrim(COALESCE(p_data ->> 'notes', '')), '');
  v_code text := NULLIF(upper(btrim(COALESCE(p_data ->> 'employee_code', ''))), '');
  v_pw text := NULLIF(p_data ->> 'portal_password', '');
BEGIN
  IF p_employee IS NOT NULL THEN
    SELECT * INTO v_old FROM public.employees e WHERE e.id = p_employee AND e.company_id = p_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter the full name (2 to 120 characters).' USING ERRCODE = '22023';
  END IF;
  IF length(v_rank) < 2 OR length(v_rank) > 80 THEN
    RAISE EXCEPTION 'Enter the position (job title).' USING ERRCODE = '22023';
  END IF;

  v_cnic := public._people_clean_field('cnic', p_data ->> 'cnic');
  IF v_cnic IS NULL THEN
    RAISE EXCEPTION 'CNIC is required: employees sign in to the portal with it.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees e
             WHERE e.company_id = p_company AND e.id IS DISTINCT FROM p_employee
               AND regexp_replace(COALESCE(e.cnic, ''), '\D', '', 'g') = regexp_replace(v_cnic, '\D', '', 'g')) THEN
    RAISE EXCEPTION 'Another employee already has CNIC %.', v_cnic USING ERRCODE = '23505';
  END IF;

  v_email := public._people_clean_field('email', p_data ->> 'email');
  IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e
             WHERE e.company_id = p_company AND e.id IS DISTINCT FROM p_employee AND lower(e.email) = v_email) THEN
    RAISE EXCEPTION 'Another employee already uses %.', v_email USING ERRCODE = '23505';
  END IF;

  IF NULLIF(p_data ->> 'department_id', '') IS NOT NULL THEN
    BEGIN
      v_dept := (p_data ->> 'department_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Choose a department from the list.' USING ERRCODE = '22023';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = v_dept AND d.company_id = p_company) THEN
      RAISE EXCEPTION 'Choose a department from the list.' USING ERRCODE = '22023';
    END IF;
  ELSIF v_dept_name IS NOT NULL THEN
    IF length(v_dept_name) > 80 THEN
      RAISE EXCEPTION 'Department names are 80 characters at most.' USING ERRCODE = '22023';
    END IF;
    SELECT d.id INTO v_dept FROM public.departments d WHERE d.company_id = p_company AND lower(d.name) = lower(v_dept_name);
    IF v_dept IS NULL AND p_create_departments THEN
      INSERT INTO public.departments (company_id, name) VALUES (p_company, v_dept_name)
      ON CONFLICT DO NOTHING;
      SELECT d.id INTO v_dept FROM public.departments d WHERE d.company_id = p_company AND lower(d.name) = lower(v_dept_name);
    ELSIF v_dept IS NULL THEN
      RAISE EXCEPTION 'Department "%" does not exist.', v_dept_name USING ERRCODE = '22023';
    END IF;
  END IF;

  BEGIN
    v_join := NULLIF(btrim(COALESCE(p_data ->> 'joining_date', '')), '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Enter the joining date as YYYY-MM-DD.' USING ERRCODE = '22023';
  END;
  IF v_join IS NULL THEN
    RAISE EXCEPTION 'Joining date is required.' USING ERRCODE = '22023';
  END IF;
  IF v_join < date '1950-01-01' OR v_join > current_date + 365 THEN
    RAISE EXCEPTION 'The joining date looks wrong.' USING ERRCODE = '22023';
  END IF;
  IF v_old.separation_date IS NOT NULL AND v_join > v_old.separation_date THEN
    RAISE EXCEPTION 'The joining date cannot be after the last working day (%).', to_char(v_old.separation_date, 'DD Mon YYYY')
      USING ERRCODE = '22023';
  END IF;

  IF v_shift IS NOT NULL AND v_shift NOT IN ('morning', 'evening', 'night') THEN
    RAISE EXCEPTION 'Shift must be morning, evening or night.' USING ERRCODE = '22023';
  END IF;
  IF v_sat IS NOT NULL AND v_sat NOT IN ('company', 'off', 'working', 'true', 'false') THEN
    RAISE EXCEPTION 'Unknown Saturday rule.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_hours := NULLIF(btrim(COALESCE(p_data ->> 'working_hours_per_day', '')), '')::integer;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Working hours must be a whole number.' USING ERRCODE = '22023';
  END;
  IF v_hours IS NOT NULL AND (v_hours < 1 OR v_hours > 16) THEN
    RAISE EXCEPTION 'Working hours per day must be between 1 and 16.' USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'Notes are 2000 characters at most.' USING ERRCODE = '22023';
  END IF;
  IF v_code IS NOT NULL THEN
    IF v_code !~ '^[A-Z0-9][A-Z0-9-]{1,19}$' THEN
      RAISE EXCEPTION 'Employee codes use letters, digits and dashes (2 to 20 characters).' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = p_company AND e.id IS DISTINCT FROM p_employee AND upper(e.employee_code) = v_code) THEN
      RAISE EXCEPTION 'Code % is already in use.', v_code USING ERRCODE = '23505';
    END IF;
  END IF;
  IF v_pw IS NOT NULL AND (length(v_pw) < 8 OR length(v_pw) > 72 OR v_pw !~ '[A-Za-z]' OR v_pw !~ '[0-9]') THEN
    RAISE EXCEPTION 'The portal password needs at least 8 characters with letters and digits.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'name', v_name,
    'cnic', v_cnic,
    'email', v_email,
    'phone', public._people_clean_field('phone', p_data ->> 'phone'),
    'father_name', public._people_clean_field('father_name', p_data ->> 'father_name'),
    'date_of_birth', public._people_clean_field('date_of_birth', p_data ->> 'date_of_birth'),
    'gender', public._people_clean_field('gender', p_data ->> 'gender'),
    'emergency_contact', public._people_clean_field('emergency_contact', p_data ->> 'emergency_contact'),
    'address', public._people_clean_field('address', p_data ->> 'address'),
    'education', public._people_clean_field('education', p_data ->> 'education'),
    'bank_name', public._people_clean_field('bank_name', p_data ->> 'bank_name'),
    'bank_account_number', public._people_clean_field('bank_account_number', p_data ->> 'bank_account_number'),
    'rank', v_rank,
    'department_id', v_dept,
    'joining_date', v_join,
    'shift_type', COALESCE(v_shift, v_old.shift_type, 'morning'),
    'weekend_saturday', CASE WHEN v_sat IN ('off', 'true') THEN to_jsonb(true)
                             WHEN v_sat IN ('working', 'false') THEN to_jsonb(false)
                             WHEN v_sat = 'company' THEN 'null'::jsonb
                             WHEN p_employee IS NOT NULL AND v_sat IS NULL AND NOT (p_data ? 'weekend_saturday') THEN to_jsonb(v_old.weekend_saturday)
                             ELSE 'null'::jsonb END,
    'working_hours_per_day', COALESCE(v_hours, v_old.working_hours_per_day, 8),
    'notes', v_notes,
    'employee_code', COALESCE(v_code, v_old.employee_code),
    'portal_password', v_pw
  );
END;
$$;
REVOKE ALL ON FUNCTION public._people_validate_employee(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- Insert one validated record. Returns the new row.
CREATE OR REPLACE FUNCTION public._people_insert_employee(p_company uuid, v jsonb)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.employees;
BEGIN
  INSERT INTO public.employees (
    company_id, name, cnic, email, phone, father_name, date_of_birth, gender, emergency_contact, address, education,
    bank_name, bank_account_number, rank, department_id, joining_date, shift_type, weekend_saturday,
    working_hours_per_day, notes, employee_code, password, status
  ) VALUES (
    p_company, v ->> 'name', v ->> 'cnic', v ->> 'email', v ->> 'phone', v ->> 'father_name',
    (v ->> 'date_of_birth')::date, v ->> 'gender', v ->> 'emergency_contact', v ->> 'address', v ->> 'education',
    v ->> 'bank_name', v ->> 'bank_account_number', v ->> 'rank', (v ->> 'department_id')::uuid,
    (v ->> 'joining_date')::date, v ->> 'shift_type', (v ->> 'weekend_saturday')::boolean,
    (v ->> 'working_hours_per_day')::integer, v ->> 'notes', v ->> 'employee_code', v ->> 'portal_password', 'active'
  )
  RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public._people_insert_employee(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Start the default onboarding checklist when it has steps (no notification).
CREATE OR REPLACE FUNCTION public._people_auto_onboarding(p_employee uuid, p_start date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  PERFORM public._people_seed_templates(v_company);
  IF EXISTS (
    SELECT 1 FROM public.checklist_templates t
    JOIN public.checklist_template_steps s ON s.template_id = t.id
    WHERE t.company_id = v_company AND t.kind = 'onboarding' AND t.is_default
  ) AND NOT EXISTS (
    SELECT 1 FROM public.employee_checklists c WHERE c.employee_id = p_employee AND c.kind = 'onboarding' AND c.status = 'open'
  ) THEN
    RETURN public.people_start_checklist(p_employee, 'onboarding', NULL, p_start, NULL, NULL, false);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._people_auto_onboarding(uuid, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Add or edit one employee (HR). p_employee NULL = new.
-- p_data keys: name, cnic, father_name, date_of_birth, gender, email, phone,
-- emergency_contact, address, education, rank, department_id, joining_date,
-- shift_type, weekend_saturday ('company'|'off'|'working'), working_hours_per_day,
-- bank_name, bank_account_number, notes, employee_code, portal_password.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_save_employee(p_employee uuid, p_data jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v jsonb;
  v_old public.employees;
  v_new public.employees;
  v_changes jsonb;
  v_labels text;
  v_checklist uuid;
  v_fields text[] := ARRAY['name', 'cnic', 'email', 'phone', 'father_name', 'date_of_birth', 'gender', 'emergency_contact',
                           'address', 'education', 'bank_name', 'bank_account_number', 'rank', 'department_id', 'joining_date',
                           'shift_type', 'weekend_saturday', 'working_hours_per_day', 'notes', 'employee_code'];
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can add or edit employees.' USING ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;

  IF p_employee IS NOT NULL THEN
    SELECT * INTO v_old FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v := public._people_validate_employee(v_company, p_employee, p_data, false);

  IF p_employee IS NULL THEN
    v_new := public._people_insert_employee(v_company, v);
    v_checklist := public._people_auto_onboarding(v_new.id, v_new.joining_date);
    PERFORM public.log_activity('employee.created',
      format('Added %s (%s) as %s', v_new.name, v_new.employee_code, v_new.rank),
      jsonb_build_object('employee_code', v_new.employee_code, 'portal_password_set', v ->> 'portal_password' IS NOT NULL),
      v_new.id);
    RETURN json_build_object('id', v_new.id, 'employee_code', v_new.employee_code, 'checklist_id', v_checklist, 'changed', 1);
  END IF;

  UPDATE public.employees
  SET name = v ->> 'name',
      cnic = v ->> 'cnic',
      email = v ->> 'email',
      phone = v ->> 'phone',
      father_name = v ->> 'father_name',
      date_of_birth = (v ->> 'date_of_birth')::date,
      gender = v ->> 'gender',
      emergency_contact = v ->> 'emergency_contact',
      address = v ->> 'address',
      education = v ->> 'education',
      bank_name = v ->> 'bank_name',
      bank_account_number = v ->> 'bank_account_number',
      rank = v ->> 'rank',
      department_id = (v ->> 'department_id')::uuid,
      joining_date = (v ->> 'joining_date')::date,
      shift_type = v ->> 'shift_type',
      weekend_saturday = (v ->> 'weekend_saturday')::boolean,
      working_hours_per_day = (v ->> 'working_hours_per_day')::integer,
      notes = v ->> 'notes',
      employee_code = v ->> 'employee_code',
      password = COALESCE(v ->> 'portal_password', password)
  WHERE id = p_employee
  RETURNING * INTO v_new;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'field', f,
           'from', CASE WHEN f = 'bank_account_number' THEN NULL ELSE to_jsonb(v_old) -> f END,
           'to', CASE WHEN f = 'bank_account_number' THEN to_jsonb('changed'::text) ELSE to_jsonb(v_new) -> f END)), '[]'::jsonb),
         string_agg(replace(f, '_', ' '), ', ')
    INTO v_changes, v_labels
  FROM unnest(v_fields) AS f
  WHERE (to_jsonb(v_old) -> f) IS DISTINCT FROM (to_jsonb(v_new) -> f);

  IF jsonb_array_length(v_changes) > 0 THEN
    PERFORM public.log_activity('employee.updated', format('Updated %s: %s', v_new.name, v_labels),
      jsonb_build_object('changes', v_changes), v_new.id);
  END IF;
  IF v ->> 'portal_password' IS NOT NULL THEN
    PERFORM public.log_activity('employee.portal_password_set', format('Set a new portal password for %s', v_new.name), '{}'::jsonb, v_new.id);
    PERFORM public.notify_employee(v_company, v_new.id, 'people.account', 'Your portal password was reset',
      'HR set a new password for you. You will be asked to choose your own when you next sign in.', '/portal');
  END IF;

  RETURN json_build_object('id', v_new.id, 'employee_code', v_new.employee_code,
                           'changed', jsonb_array_length(v_changes) + CASE WHEN v ->> 'portal_password' IS NOT NULL THEN 1 ELSE 0 END);
END;
$$;
REVOKE ALL ON FUNCTION public.people_save_employee(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_save_employee(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bulk import (all or nothing). p_rows: array of objects with the same keys as
-- people_save_employee plus `department` (a name; missing ones are created).
-- Returns {errors:[{row, message}]} without saving anything, or {created:[...]}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_import_employees(p_rows jsonb, p_start_onboarding boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_row jsonb;
  v_idx integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_valid jsonb[] := ARRAY[]::jsonb[];
  v_clean jsonb;
  v_cnics text[] := ARRAY[]::text[];
  v_emails text[] := ARRAY[]::text[];
  v_codes text[] := ARRAY[]::text[];
  v_new public.employees;
  v_created jsonb := '[]'::jsonb;
  v_depts_before integer;
  v_depts_after integer;
  v_digits text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can import employees.' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'The file has no rows to import.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Import at most 500 people at a time.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_depts_before FROM public.departments d WHERE d.company_id = v_company;

  -- Pass 1: validate everything (departments are only looked up here).
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    BEGIN
      IF jsonb_typeof(v_row) <> 'object' THEN
        RAISE EXCEPTION 'Row is not a record.' USING ERRCODE = '22023';
      END IF;
      v_clean := public._people_validate_employee(v_company, NULL, v_row - 'department', false);
      v_digits := regexp_replace(v_clean ->> 'cnic', '\D', '', 'g');
      IF v_digits = ANY (v_cnics) THEN
        RAISE EXCEPTION 'CNIC % appears twice in the file.', v_clean ->> 'cnic' USING ERRCODE = '23505';
      END IF;
      IF v_clean ->> 'email' IS NOT NULL AND (v_clean ->> 'email') = ANY (v_emails) THEN
        RAISE EXCEPTION 'E-mail % appears twice in the file.', v_clean ->> 'email' USING ERRCODE = '23505';
      END IF;
      IF v_clean ->> 'employee_code' IS NOT NULL AND (v_clean ->> 'employee_code') = ANY (v_codes) THEN
        RAISE EXCEPTION 'Code % appears twice in the file.', v_clean ->> 'employee_code' USING ERRCODE = '23505';
      END IF;
      IF NULLIF(btrim(COALESCE(v_row ->> 'department', '')), '') IS NOT NULL AND length(btrim(v_row ->> 'department')) > 80 THEN
        RAISE EXCEPTION 'Department names are 80 characters at most.' USING ERRCODE = '22023';
      END IF;
      v_cnics := array_append(v_cnics, v_digits);
      IF v_clean ->> 'email' IS NOT NULL THEN v_emails := array_append(v_emails, v_clean ->> 'email'); END IF;
      IF v_clean ->> 'employee_code' IS NOT NULL THEN v_codes := array_append(v_codes, v_clean ->> 'employee_code'); END IF;
      v_valid := array_append(v_valid, v_row);
    EXCEPTION WHEN others THEN
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'name', v_row ->> 'name', 'message', SQLERRM);
    END;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN json_build_object('errors', v_errors, 'created', '[]'::json);
  END IF;

  -- Pass 2: create (one summary notification instead of one per person).
  PERFORM set_config('people.bulk', 'on', true);
  FOREACH v_row IN ARRAY v_valid
  LOOP
    v_clean := public._people_validate_employee(v_company, NULL, v_row, true);
    v_new := public._people_insert_employee(v_company, v_clean);
    IF p_start_onboarding AND v_new.joining_date >= current_date - 90 THEN
      PERFORM public._people_auto_onboarding(v_new.id, v_new.joining_date);
    END IF;
    v_created := v_created || jsonb_build_object('id', v_new.id, 'name', v_new.name, 'employee_code', v_new.employee_code);
  END LOOP;
  PERFORM set_config('people.bulk', '', true);

  SELECT count(*) INTO v_depts_after FROM public.departments d WHERE d.company_id = v_company;

  PERFORM public.notify_roles(v_company, ARRAY['finance'], 'payroll',
    format('%s new joiner%s imported', jsonb_array_length(v_created), CASE WHEN jsonb_array_length(v_created) = 1 THEN '' ELSE 's' END),
    'HR imported new employees. Set their salaries before the first payroll.', '/payroll');
  PERFORM public.log_activity('employee.bulk_created',
    format('Imported %s employees', jsonb_array_length(v_created)),
    jsonb_build_object('count', jsonb_array_length(v_created), 'departments_created', v_depts_after - v_depts_before));

  RETURN json_build_object('errors', '[]'::json, 'created', v_created, 'departments_created', v_depts_after - v_depts_before);
END;
$$;
REVOKE ALL ON FUNCTION public.people_import_employees(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_import_employees(jsonb, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Separation and rejoining
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_separate_employee(p_employee uuid, p_last_day date, p_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_emp public.employees;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_checklist uuid;
  v_assets integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can separate employees.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp.status = 'separated' THEN
    RAISE EXCEPTION '% is already separated.', v_emp.name USING ERRCODE = '22023';
  END IF;
  IF v_emp.user_id IS NOT NULL AND v_emp.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot separate your own record.' USING ERRCODE = '42501';
  END IF;
  IF p_last_day IS NULL THEN
    RAISE EXCEPTION 'Choose the last working day.' USING ERRCODE = '22023';
  END IF;
  IF v_emp.joining_date IS NOT NULL AND p_last_day < v_emp.joining_date THEN
    RAISE EXCEPTION 'The last day cannot be before the joining date (%).', to_char(v_emp.joining_date, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF p_last_day > current_date + 90 THEN
    RAISE EXCEPTION 'The last day can be at most 90 days ahead.' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the reason under 500 characters.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.employees SET status = 'separated', separation_date = p_last_day WHERE id = p_employee;

  UPDATE public.employee_checklists
  SET status = 'cancelled', closed_at = now(), closed_by = auth.uid()
  WHERE employee_id = p_employee AND kind = 'onboarding' AND status = 'open';

  PERFORM public._people_seed_templates(v_company);
  IF NOT EXISTS (SELECT 1 FROM public.employee_checklists c WHERE c.employee_id = p_employee AND c.kind = 'offboarding' AND c.status = 'open')
     AND EXISTS (SELECT 1 FROM public.checklist_templates t JOIN public.checklist_template_steps s ON s.template_id = t.id
                 WHERE t.company_id = v_company AND t.kind = 'offboarding' AND t.is_default) THEN
    v_checklist := public.people_start_checklist(p_employee, 'offboarding', NULL, p_last_day, NULL, NULL, false);
  END IF;

  SELECT count(*) INTO v_assets FROM public.assets a WHERE a.employee_id = p_employee AND a.status = 'assigned';

  PERFORM public.notify_roles(v_company, ARRAY['hr'], 'people.offboarding', 'Offboarding started',
    format('%s leaves on %s.%s', v_emp.name, to_char(p_last_day, 'DD Mon YYYY'),
           CASE WHEN v_assets > 0 THEN format(' %s asset%s still to return.', v_assets, CASE WHEN v_assets = 1 THEN '' ELSE 's' END) ELSE '' END),
    COALESCE('/checklists/' || v_checklist, '/employees/' || p_employee));
  PERFORM public.log_activity('employee.separated',
    format('Separated %s, last day %s', v_emp.name, to_char(p_last_day, 'DD Mon YYYY')),
    jsonb_build_object('last_day', p_last_day, 'reason', v_reason, 'checklist_id', v_checklist), p_employee);

  RETURN json_build_object('checklist_id', v_checklist, 'assets_out', v_assets);
END;
$$;
REVOKE ALL ON FUNCTION public.people_separate_employee(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_separate_employee(uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.people_rejoin_employee(p_employee uuid, p_date date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_emp public.employees;
  v_date date := COALESCE(p_date, current_date);
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can reactivate employees.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp.status = 'active' THEN
    RAISE EXCEPTION '% is already active.', v_emp.name USING ERRCODE = '22023';
  END IF;
  IF v_emp.separation_date IS NOT NULL AND v_date <= v_emp.separation_date THEN
    RAISE EXCEPTION 'The rejoining date must be after the last working day (%).', to_char(v_emp.separation_date, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF v_date > current_date + 90 THEN
    RAISE EXCEPTION 'The rejoining date can be at most 90 days ahead.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('people.rejoin_date', v_date::text, true);
  UPDATE public.employees SET status = 'active', separation_date = NULL WHERE id = p_employee;
  PERFORM set_config('people.rejoin_date', '', true);

  UPDATE public.employee_checklists
  SET status = 'cancelled', closed_at = now(), closed_by = auth.uid()
  WHERE employee_id = p_employee AND kind = 'offboarding' AND status = 'open';

  PERFORM public.log_activity('employee.rejoined',
    format('Reactivated %s from %s', v_emp.name, to_char(v_date, 'DD Mon YYYY')),
    jsonb_build_object('rejoin_date', v_date, 'previous_last_day', v_emp.separation_date), p_employee);
  RETURN json_build_object('status', 'active');
END;
$$;
REVOKE ALL ON FUNCTION public.people_rejoin_employee(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_rejoin_employee(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Codes and bulk department moves
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_assign_missing_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_count integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can assign employee codes.' USING ERRCODE = '42501';
  END IF;
  v_count := public._people_fill_codes(v_company);
  IF v_count > 0 THEN
    PERFORM public.log_activity('employee.codes_assigned', format('Assigned employee codes to %s people', v_count),
      jsonb_build_object('count', v_count));
  END IF;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.people_assign_missing_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_assign_missing_codes() TO authenticated;

CREATE OR REPLACE FUNCTION public.people_bulk_set_department(p_employees uuid[], p_department uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_name text;
  v_count integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can move employees.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_employees), 0) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_employees) > 500 THEN
    RAISE EXCEPTION 'Move at most 500 people at a time.' USING ERRCODE = '22023';
  END IF;
  IF p_department IS NOT NULL THEN
    SELECT d.name INTO v_name FROM public.departments d WHERE d.id = p_department AND d.company_id = v_company;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Department not found.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM set_config('people.bulk', 'on', true);
  UPDATE public.employees e
  SET department_id = p_department
  WHERE e.company_id = v_company AND e.id = ANY (p_employees) AND e.department_id IS DISTINCT FROM p_department;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('people.bulk', '', true);

  IF v_count > 0 THEN
    PERFORM public.notify_roles(v_company, ARRAY['finance'], 'payroll',
      format('%s employee%s moved department', v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END),
      format('HR moved %s people to %s. Review salaries if they change with the role.', v_count, COALESCE(v_name, 'no department')),
      '/payroll');
    PERFORM public.log_activity('employee.bulk_department',
      format('Moved %s people to %s', v_count, COALESCE(v_name, 'no department')),
      jsonb_build_object('count', v_count, 'department_id', p_department));
  END IF;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.people_bulk_set_department(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_bulk_set_department(uuid[], uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Field-by-field review of a portal profile-change request.
-- p_approved: the fields HR accepts; every other requested field is declined.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_review_update_request(p_request uuid, p_approved text[], p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_req public.employee_update_requests;
  v_changes jsonb;
  v_fields text[];
  v_ok text[];
  v_clean jsonb := '{}'::jsonb;
  v_decisions jsonb := '{}'::jsonb;
  v_status text;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_name text;
  f text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can review profile changes.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req FROM public.employee_update_requests r WHERE r.id = p_request AND r.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This request was already reviewed.' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN
    RAISE EXCEPTION 'Keep the note under 500 characters.' USING ERRCODE = '22023';
  END IF;

  v_changes := COALESCE(v_req.requested_changes, '{}'::jsonb);
  SELECT array_agg(k ORDER BY k) INTO v_fields FROM jsonb_object_keys(v_changes) AS k;
  v_fields := COALESCE(v_fields, ARRAY[]::text[]);
  SELECT COALESCE(array_agg(x), ARRAY[]::text[]) INTO v_ok
  FROM unnest(COALESCE(p_approved, ARRAY[]::text[])) AS x
  WHERE x = ANY (v_fields) AND x = ANY (public._people_request_fields());

  FOREACH f IN ARRAY v_fields
  LOOP
    v_decisions := v_decisions || jsonb_build_object(f, f = ANY (v_ok));
    IF f = ANY (v_ok) THEN
      BEGIN
        v_clean := v_clean || jsonb_build_object(f, public._people_clean_field(f, v_changes ->> f));
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION '%: %', initcap(replace(f, '_', ' ')), SQLERRM USING ERRCODE = '22023';
      END;
    END IF;
  END LOOP;

  IF v_clean ? 'email' AND v_clean ->> 'email' IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees e WHERE e.company_id = v_company AND e.id <> v_req.employee_id AND lower(e.email) = v_clean ->> 'email') THEN
    RAISE EXCEPTION 'Another employee already uses %.', v_clean ->> 'email' USING ERRCODE = '23505';
  END IF;

  IF cardinality(v_ok) > 0 THEN
    UPDATE public.employees e
    SET phone = CASE WHEN v_clean ? 'phone' THEN v_clean ->> 'phone' ELSE e.phone END,
        email = CASE WHEN v_clean ? 'email' THEN v_clean ->> 'email' ELSE e.email END,
        date_of_birth = CASE WHEN v_clean ? 'date_of_birth' THEN (v_clean ->> 'date_of_birth')::date ELSE e.date_of_birth END,
        father_name = CASE WHEN v_clean ? 'father_name' THEN v_clean ->> 'father_name' ELSE e.father_name END,
        emergency_contact = CASE WHEN v_clean ? 'emergency_contact' THEN v_clean ->> 'emergency_contact' ELSE e.emergency_contact END,
        address = CASE WHEN v_clean ? 'address' THEN v_clean ->> 'address' ELSE e.address END,
        gender = CASE WHEN v_clean ? 'gender' THEN v_clean ->> 'gender' ELSE e.gender END,
        education = CASE WHEN v_clean ? 'education' THEN v_clean ->> 'education' ELSE e.education END,
        bank_name = CASE WHEN v_clean ? 'bank_name' THEN v_clean ->> 'bank_name' ELSE e.bank_name END,
        bank_account_number = CASE WHEN v_clean ? 'bank_account_number' THEN v_clean ->> 'bank_account_number' ELSE e.bank_account_number END
    WHERE e.id = v_req.employee_id AND e.company_id = v_company;
  END IF;

  v_status := CASE
    WHEN cardinality(v_ok) = 0 THEN 'rejected'
    WHEN cardinality(v_ok) = cardinality(v_fields) THEN 'approved'
    ELSE 'partially_approved' END;

  UPDATE public.employee_update_requests
  SET status = v_status, reviewed_at = now(), reviewed_by = auth.uid(), decisions = v_decisions, review_note = v_note
  WHERE id = p_request;

  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = v_req.employee_id;
  PERFORM public.notify_employee(v_company, v_req.employee_id, 'people.update_request',
    CASE v_status WHEN 'approved' THEN 'Profile changes approved'
                  WHEN 'partially_approved' THEN 'Some profile changes approved'
                  ELSE 'Profile changes declined' END,
    CASE v_status WHEN 'approved' THEN 'HR approved the changes you asked for.'
                  WHEN 'partially_approved' THEN format('HR approved %s of %s changes.', cardinality(v_ok), cardinality(v_fields))
                  ELSE 'HR declined the changes you asked for.' END
      || COALESCE(' Note from HR: ' || v_note, ''),
    '/portal/profile');
  PERFORM public.log_activity('employee.update_request.' || v_status,
    format('%s profile changes for %s',
           CASE v_status WHEN 'approved' THEN 'Approved' WHEN 'partially_approved' THEN 'Partly approved' ELSE 'Declined' END, v_name),
    jsonb_build_object('request_id', p_request, 'approved', to_jsonb(v_ok), 'fields', to_jsonb(v_fields)),
    v_req.employee_id);

  RETURN json_build_object('status', v_status, 'applied', to_jsonb(v_ok));
END;
$$;
REVOKE ALL ON FUNCTION public.people_review_update_request(uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_review_update_request(uuid, text[], text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Delete a department, moving its people to another one (or to none) first,
-- with one summary notification for Finance instead of one per person.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_delete_department(p_department uuid, p_move_to uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_name text;
  v_target text;
  v_moved integer := 0;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage departments.' USING ERRCODE = '42501';
  END IF;
  SELECT d.name INTO v_name FROM public.departments d WHERE d.id = p_department AND d.company_id = v_company FOR UPDATE;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Department not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_move_to IS NOT NULL THEN
    IF p_move_to = p_department THEN
      RAISE EXCEPTION 'Choose a different department to move people to.' USING ERRCODE = '22023';
    END IF;
    SELECT d.name INTO v_target FROM public.departments d WHERE d.id = p_move_to AND d.company_id = v_company;
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'Target department not found.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM set_config('people.bulk', 'on', true);
  UPDATE public.employees SET department_id = p_move_to WHERE company_id = v_company AND department_id = p_department;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  PERFORM set_config('people.bulk', '', true);

  DELETE FROM public.departments WHERE id = p_department;

  IF v_moved > 0 THEN
    PERFORM public.notify_roles(v_company, ARRAY['finance'], 'payroll', 'Department removed',
      format('%s closed. %s %s moved to %s.', v_name, v_moved, CASE WHEN v_moved = 1 THEN 'person' ELSE 'people' END,
             COALESCE(v_target, 'no department')),
      '/payroll');
  END IF;
  PERFORM public.log_activity('department.deleted', format('Deleted department %s', v_name),
    jsonb_build_object('department', v_name, 'moved', v_moved, 'moved_to', v_target));
  RETURN v_moved;
END;
$$;
REVOKE ALL ON FUNCTION public.people_delete_department(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_delete_department(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Portal access facts for one employee (never the hash itself).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_portal_access(p_employee uuid)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees;
BEGIN
  IF public.auth_company_id() IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can view portal access.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = public.auth_company_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN json_build_object(
    'has_password', v_emp.password_hash IS NOT NULL,
    'must_change_password', COALESCE(v_emp.must_change_password, false),
    'can_sign_in', v_emp.password_hash IS NOT NULL AND v_emp.status = 'active' AND COALESCE(btrim(v_emp.cnic), '') <> '',
    'last_seen_at', (SELECT max(COALESCE(s.last_seen_at, s.created_at)) FROM public.employee_sessions s WHERE s.employee_id = v_emp.id),
    'active_sessions', (SELECT count(*) FROM public.employee_sessions s
                        WHERE s.employee_id = v_emp.id AND s.revoked_at IS NULL AND s.expires_at > now())
  );
END;
$$;
REVOKE ALL ON FUNCTION public.people_portal_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_portal_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.people_revoke_portal_sessions(p_employee uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_count integer;
BEGIN
  IF public.auth_company_id() IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can sign employees out.' USING ERRCODE = '42501';
  END IF;
  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = p_employee AND e.company_id = public.auth_company_id();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.employee_sessions SET revoked_at = now()
  WHERE employee_id = p_employee AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_activity('employee.portal_signed_out', format('Signed %s out of the portal on all devices', v_name),
    jsonb_build_object('sessions', v_count), p_employee);
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.people_revoke_portal_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_revoke_portal_sessions(uuid) TO authenticated;
