-- Careers module RPCs.
--   Public (anon + authenticated): careers_public_company, careers_public_job
--   Edge Function only (service_role): careers_application_precheck, careers_submit_application
--   HR / owner (authenticated, checked inside): careers_save_job, careers_set_job_status, careers_delete_job,
--     careers_set_application_status, careers_rate_application, careers_add_note, careers_delete_note,
--     careers_delete_application, careers_hire_application
--   Owner: careers_set_company_slug

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients; used inside definer functions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._careers_require_hr()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage hiring' USING ERRCODE = '42501';
  END IF;
  RETURN v_company;
END;
$$;
REVOKE ALL ON FUNCTION public._careers_require_hr() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._careers_actor_name()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'HR')
  FROM public.profiles p WHERE p.id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public._careers_actor_name() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._careers_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_status
    WHEN 'new' THEN 'New' WHEN 'reviewed' THEN 'Reviewed' WHEN 'shortlisted' THEN 'Shortlisted'
    WHEN 'interview' THEN 'Interview' WHEN 'offered' THEN 'Offered' WHEN 'hired' THEN 'Hired'
    WHEN 'rejected' THEN 'Rejected' ELSE p_status END;
$$;
REVOKE ALL ON FUNCTION public._careers_status_label(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public careers page
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_public_company(p_slug text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT json_build_object(
    'name', c.name,
    'slug', c.slug,
    'logo', c.logo,
    'website', c.website,
    'industry', c.company_type,
    'jobs', COALESCE((
      SELECT json_agg(json_build_object(
               'id', j.id, 'slug', j.slug, 'title', j.title, 'department', d.name,
               'location', j.location, 'employment_type', j.employment_type, 'workplace', j.workplace,
               'openings', j.openings, 'summary', j.summary, 'closes_on', j.closes_on, 'created_at', j.created_at)
             ORDER BY j.created_at DESC)
      FROM public.job_postings j
      LEFT JOIN public.departments d ON d.id = j.department_id
      WHERE j.company_id = c.id
        AND j.status = 'open'
        AND (j.closes_on IS NULL OR j.closes_on >= current_date)
    ), '[]'::json)
  )
  FROM public.companies c
  WHERE c.slug = lower(btrim(COALESCE(p_slug, '')));
$$;
REVOKE ALL ON FUNCTION public.careers_public_company(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.careers_public_company(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.careers_public_job(p_company_slug text, p_job_slug text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT json_build_object(
    'company', json_build_object('name', c.name, 'slug', c.slug, 'logo', c.logo, 'website', c.website),
    'job', json_build_object(
      'id', j.id, 'slug', j.slug, 'title', j.title, 'department', d.name,
      'location', j.location, 'employment_type', j.employment_type, 'workplace', j.workplace,
      'openings', j.openings, 'summary', j.summary, 'description', j.description,
      'requirements', j.requirements, 'closes_on', j.closes_on, 'created_at', j.created_at,
      'is_open', (j.status = 'open' AND (j.closes_on IS NULL OR j.closes_on >= current_date)))
  )
  FROM public.companies c
  JOIN public.job_postings j ON j.company_id = c.id AND j.slug = lower(btrim(COALESCE(p_job_slug, '')))
  LEFT JOIN public.departments d ON d.id = j.department_id
  WHERE c.slug = lower(btrim(COALESCE(p_company_slug, '')));
$$;
REVOKE ALL ON FUNCTION public.careers_public_job(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.careers_public_job(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Application intake (called by the careers-apply Edge Function with the service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_application_precheck(p_job uuid, p_email text, p_ip_hash text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.job_postings%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.job_postings WHERE id = p_job;
  IF NOT FOUND OR v_job.status <> 'open' THEN
    RETURN json_build_object('error', 'This role is no longer open.', 'status', 410);
  END IF;
  IF v_job.closes_on IS NOT NULL AND v_job.closes_on < current_date THEN
    RETURN json_build_object('error', 'Applications for this role have closed.', 'status', 410);
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_applications a WHERE a.job_id = p_job AND lower(a.email) = lower(btrim(COALESCE(p_email, '')))) THEN
    RETURN json_build_object('error', 'You have already applied for this role with this e-mail address.', 'status', 409);
  END IF;
  IF p_ip_hash IS NOT NULL THEN
    IF (SELECT count(*) FROM public.job_applications a WHERE a.ip_hash = p_ip_hash AND a.created_at > now() - interval '1 hour') >= 10
       OR (SELECT count(*) FROM public.job_applications a WHERE a.ip_hash = p_ip_hash AND a.created_at > now() - interval '1 day') >= 40 THEN
      RETURN json_build_object('error', 'Too many applications from this connection. Try again later.', 'status', 429);
    END IF;
  END IF;
  RETURN json_build_object('ok', true, 'company_id', v_job.company_id, 'title', v_job.title);
END;
$$;
REVOKE ALL ON FUNCTION public.careers_application_precheck(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.careers_application_precheck(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.careers_submit_application(
  p_job uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_link text,
  p_cover_letter text,
  p_cv_path text,
  p_cv_name text,
  p_cv_size integer,
  p_ip_hash text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_check json;
  v_company uuid;
  v_title text;
  v_id uuid;
  v_name text := left(btrim(COALESCE(p_name, '')), 80);
  v_email text := lower(left(btrim(COALESCE(p_email, '')), 120));
BEGIN
  v_check := public.careers_application_precheck(p_job, v_email, p_ip_hash);
  IF v_check ->> 'error' IS NOT NULL THEN
    RETURN v_check;
  END IF;
  v_company := (v_check ->> 'company_id')::uuid;
  v_title := v_check ->> 'title';

  IF length(v_name) < 2 THEN
    RETURN json_build_object('error', 'Tell us your name.', 'status', 400);
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN
    RETURN json_build_object('error', 'That e-mail address does not look right.', 'status', 400);
  END IF;
  IF p_cv_path IS NULL OR p_cv_path NOT LIKE v_company::text || '/applications/%' OR p_cv_path LIKE '%..%' THEN
    RETURN json_build_object('error', 'Attach your CV as a PDF or Word file.', 'status', 400);
  END IF;

  BEGIN
    INSERT INTO public.job_applications (company_id, job_id, name, email, phone, link, cover_letter, cv_path, cv_name, cv_size, ip_hash)
    VALUES (v_company, p_job, v_name, v_email,
            left(btrim(COALESCE(p_phone, '')), 40),
            left(btrim(COALESCE(p_link, '')), 300),
            left(btrim(COALESCE(p_cover_letter, '')), 2000),
            p_cv_path, left(COALESCE(p_cv_name, 'cv'), 120), p_cv_size, p_ip_hash)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('error', 'You have already applied for this role with this e-mail address.', 'status', 409);
  END;

  PERFORM public.notify_roles(v_company, ARRAY['hr'], 'application',
    'New application: ' || v_title, v_name || ' · ' || v_email,
    '/hiring/applicants?application=' || v_id::text);

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.careers_submit_application(uuid, text, text, text, text, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.careers_submit_application(uuid, text, text, text, text, text, text, text, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Jobs (HR / owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_save_job(
  p_id uuid,
  p_title text,
  p_slug text,
  p_department uuid,
  p_location text,
  p_employment_type text,
  p_workplace text,
  p_openings integer,
  p_summary text,
  p_description text,
  p_requirements text,
  p_status text,
  p_closes_on date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_title text := btrim(COALESCE(p_title, ''));
  v_explicit text := public.careers_slugify(p_slug);
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
  v_old_status text;
BEGIN
  IF length(v_title) < 3 THEN
    RAISE EXCEPTION 'Give the role a title of at least 3 characters.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_status, '') NOT IN ('open', 'closed') THEN
    RAISE EXCEPTION 'Pick a status.' USING ERRCODE = '22023';
  END IF;
  IF p_department IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = p_department AND d.company_id = v_company) THEN
    RAISE EXCEPTION 'That department no longer exists.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT status INTO v_old_status FROM public.job_postings WHERE id = p_id AND company_id = v_company FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That role no longer exists.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_explicit <> '' THEN
    IF EXISTS (SELECT 1 FROM public.job_postings j WHERE j.company_id = v_company AND j.slug = v_explicit AND j.id IS DISTINCT FROM p_id) THEN
      RAISE EXCEPTION 'The address "%" is already used by another role. Change the web address.', v_explicit USING ERRCODE = '23505';
    END IF;
    v_slug := v_explicit;
  ELSE
    v_base := COALESCE(NULLIF(public.careers_slugify(v_title), ''), 'role');
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.job_postings j WHERE j.company_id = v_company AND j.slug = v_slug AND j.id IS DISTINCT FROM p_id) LOOP
      v_n := v_n + 1;
      v_slug := rtrim(left(v_base, 55), '-') || '-' || v_n;
    END LOOP;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.job_postings (company_id, slug, title, department_id, location, employment_type, workplace, openings,
                                     summary, description, requirements, status, closes_on, created_by)
    VALUES (v_company, v_slug, left(v_title, 120), p_department, left(btrim(COALESCE(p_location, '')), 80),
            COALESCE(p_employment_type, 'full_time'), COALESCE(p_workplace, 'onsite'), GREATEST(COALESCE(p_openings, 1), 1),
            left(btrim(COALESCE(p_summary, '')), 300), left(btrim(COALESCE(p_description, '')), 8000),
            left(btrim(COALESCE(p_requirements, '')), 4000), p_status, p_closes_on, auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.log_activity('careers.job_created', 'Posted the role ' || v_title,
      json_build_object('job_id', v_id, 'slug', v_slug, 'status', p_status)::jsonb, NULL);
  ELSE
    UPDATE public.job_postings
    SET slug = v_slug, title = left(v_title, 120), department_id = p_department,
        location = left(btrim(COALESCE(p_location, '')), 80),
        employment_type = COALESCE(p_employment_type, 'full_time'), workplace = COALESCE(p_workplace, 'onsite'),
        openings = GREATEST(COALESCE(p_openings, 1), 1),
        summary = left(btrim(COALESCE(p_summary, '')), 300), description = left(btrim(COALESCE(p_description, '')), 8000),
        requirements = left(btrim(COALESCE(p_requirements, '')), 4000), status = p_status, closes_on = p_closes_on
    WHERE id = p_id
    RETURNING id INTO v_id;
    PERFORM public.log_activity('careers.job_updated', 'Updated the role ' || v_title,
      json_build_object('job_id', v_id, 'slug', v_slug, 'status', p_status, 'previous_status', v_old_status)::jsonb, NULL);
  END IF;

  RETURN json_build_object('id', v_id, 'slug', v_slug);
END;
$$;
REVOKE ALL ON FUNCTION public.careers_save_job(uuid, text, text, uuid, text, text, text, integer, text, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_save_job(uuid, text, text, uuid, text, text, text, integer, text, text, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.careers_set_job_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_title text;
BEGIN
  IF COALESCE(p_status, '') NOT IN ('open', 'closed') THEN
    RAISE EXCEPTION 'Pick a status.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.job_postings SET status = p_status
  WHERE id = p_id AND company_id = v_company AND status <> p_status
  RETURNING title INTO v_title;
  IF v_title IS NOT NULL THEN
    PERFORM public.log_activity(CASE WHEN p_status = 'open' THEN 'careers.job_opened' ELSE 'careers.job_closed' END,
      CASE WHEN p_status = 'open' THEN 'Reopened the role ' ELSE 'Closed the role ' END || v_title,
      json_build_object('job_id', p_id)::jsonb, NULL);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_set_job_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_set_job_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.careers_delete_job(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_title text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.job_applications a WHERE a.job_id = p_id) THEN
    RAISE EXCEPTION 'This role has applications. Close it instead so the candidates stay on record.' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.job_postings WHERE id = p_id AND company_id = v_company RETURNING title INTO v_title;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'That role no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_activity('careers.job_deleted', 'Deleted the role ' || v_title, json_build_object('job_id', p_id)::jsonb, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.careers_delete_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_delete_job(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Applications pipeline (HR / owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_set_application_status(p_ids uuid[], p_status text, p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_actor text := public._careers_actor_name();
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 1500), '');
  v_row record;
  v_count integer := 0;
BEGIN
  IF COALESCE(p_status, '') NOT IN ('new', 'reviewed', 'shortlisted', 'interview', 'offered', 'rejected') THEN
    IF p_status = 'hired' THEN
      RAISE EXCEPTION 'Use Hire to move a candidate to Hired; it creates their employee record.' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'Pick a stage.' USING ERRCODE = '22023';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_ids) > 500 THEN
    RAISE EXCEPTION 'Update at most 500 applications at a time.' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN
    SELECT a.id, a.status, a.name, j.title
    FROM public.job_applications a
    JOIN public.job_postings j ON j.id = a.job_id
    WHERE a.id = ANY (p_ids) AND a.company_id = v_company
    FOR UPDATE OF a
  LOOP
    IF v_row.status = 'hired' THEN
      IF cardinality(p_ids) = 1 THEN
        RAISE EXCEPTION '% is already hired and now has an employee record.', v_row.name USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;
    IF v_row.status = p_status THEN
      CONTINUE;
    END IF;
    UPDATE public.job_applications SET status = p_status, status_changed_at = now() WHERE id = v_row.id;
    INSERT INTO public.job_application_notes (company_id, application_id, author_id, author_name, kind, body)
    VALUES (v_company, v_row.id, auth.uid(), v_actor, 'status',
            public._careers_status_label(v_row.status) || ' → ' || public._careers_status_label(p_status)
            || COALESCE(E'\n' || v_note, ''));
    PERFORM public.log_activity('careers.application_status',
      'Moved ' || v_row.name || ' (' || v_row.title || ') to ' || public._careers_status_label(p_status),
      json_build_object('application_id', v_row.id, 'from', v_row.status, 'to', p_status)::jsonb, NULL);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_set_application_status(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_set_application_status(uuid[], text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.careers_rate_application(p_id uuid, p_rating integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
BEGIN
  IF p_rating IS NOT NULL AND (p_rating < 0 OR p_rating > 5) THEN
    RAISE EXCEPTION 'Rate from 1 to 5 stars.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.job_applications SET rating = NULLIF(p_rating, 0)::smallint
  WHERE id = p_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That application no longer exists.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_rate_application(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_rate_application(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.careers_add_note(p_application uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_body text := left(btrim(COALESCE(p_body, '')), 2000);
  v_name text;
  v_id uuid;
BEGIN
  IF v_body = '' THEN
    RAISE EXCEPTION 'Write a note first.' USING ERRCODE = '22023';
  END IF;
  SELECT a.name INTO v_name FROM public.job_applications a WHERE a.id = p_application AND a.company_id = v_company;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'That application no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.job_application_notes (company_id, application_id, author_id, author_name, kind, body)
  VALUES (v_company, p_application, auth.uid(), public._careers_actor_name(), 'note', v_body)
  RETURNING id INTO v_id;
  PERFORM public.log_activity('careers.note_added', 'Added a hiring note on ' || v_name,
    json_build_object('application_id', p_application)::jsonb, NULL);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_add_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_add_note(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.careers_delete_note(p_note uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
BEGIN
  DELETE FROM public.job_application_notes n
  WHERE n.id = p_note AND n.company_id = v_company AND n.kind = 'note'
    AND (n.author_id = auth.uid() OR public.auth_is_owner());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can delete only your own notes.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_delete_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_delete_note(uuid) TO authenticated;

-- Returns the CV path so the client can remove the stored file (HR may delete in the cvs bucket).
CREATE OR REPLACE FUNCTION public.careers_delete_application(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_row record;
BEGIN
  DELETE FROM public.job_applications a
  WHERE a.id = p_id AND a.company_id = v_company
  RETURNING a.name, a.cv_path, a.job_id INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That application no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_activity('careers.application_deleted', 'Deleted the application from ' || v_row.name,
    json_build_object('application_id', p_id, 'job_id', v_row.job_id)::jsonb, NULL);
  RETURN v_row.cv_path;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_delete_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_delete_application(uuid) TO authenticated;

-- Hire: creates the employee (no pay: Finance sets the salary) and closes the loop on the application.
CREATE OR REPLACE FUNCTION public.careers_hire_application(
  p_id uuid,
  p_rank text,
  p_joining_date date,
  p_department uuid DEFAULT NULL,
  p_cnic text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_app record;
  v_rank text := left(btrim(COALESCE(p_rank, '')), 80);
  v_cnic text := regexp_replace(COALESCE(p_cnic, ''), '\D', '', 'g');
  v_employee uuid;
BEGIN
  SELECT a.*, j.title AS job_title, j.department_id AS job_department, j.openings
  INTO v_app
  FROM public.job_applications a
  JOIN public.job_postings j ON j.id = a.job_id
  WHERE a.id = p_id AND a.company_id = v_company
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That application no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status = 'hired' OR v_app.employee_id IS NOT NULL THEN
    RAISE EXCEPTION '% is already hired.', v_app.name USING ERRCODE = '22023';
  END IF;
  IF v_rank = '' THEN
    v_rank := left(v_app.job_title, 80);
  END IF;
  IF p_joining_date IS NULL THEN
    RAISE EXCEPTION 'Pick a joining date.' USING ERRCODE = '22023';
  END IF;
  IF p_joining_date < current_date - 365 OR p_joining_date > current_date + 365 THEN
    RAISE EXCEPTION 'The joining date must be within a year of today.' USING ERRCODE = '22023';
  END IF;
  IF v_cnic <> '' AND length(v_cnic) <> 13 THEN
    RAISE EXCEPTION 'A CNIC has 13 digits.' USING ERRCODE = '22023';
  END IF;
  IF v_cnic <> '' AND EXISTS (
    SELECT 1 FROM public.employees e WHERE e.company_id = v_company AND regexp_replace(COALESCE(e.cnic, ''), '\D', '', 'g') = v_cnic
  ) THEN
    RAISE EXCEPTION 'Another employee already has this CNIC.' USING ERRCODE = '23505';
  END IF;
  IF p_department IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = p_department AND d.company_id = v_company) THEN
    RAISE EXCEPTION 'That department no longer exists.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.employees (company_id, name, email, phone, rank, joining_date, department_id, status, cnic, notes)
  VALUES (v_company, v_app.name, v_app.email, NULLIF(v_app.phone, ''), v_rank, p_joining_date,
          COALESCE(p_department, v_app.job_department), 'active',
          CASE WHEN v_cnic = '' THEN NULL
               ELSE substr(v_cnic, 1, 5) || '-' || substr(v_cnic, 6, 7) || '-' || substr(v_cnic, 13, 1) END,
          'Hired through careers for ' || v_app.job_title || ' on ' || to_char(current_date, 'DD Mon YYYY') || '.')
  RETURNING id INTO v_employee;

  UPDATE public.job_applications
  SET status = 'hired', status_changed_at = now(), employee_id = v_employee
  WHERE id = p_id;

  INSERT INTO public.job_application_notes (company_id, application_id, author_id, author_name, kind, body)
  VALUES (v_company, p_id, auth.uid(), public._careers_actor_name(), 'hire',
          public._careers_status_label(v_app.status) || ' → Hired' || E'\n' ||
          'Employee record created as ' || v_rank || ', joining ' || to_char(p_joining_date, 'DD Mon YYYY') || '.');

  PERFORM public.log_activity('careers.hired', 'Hired ' || v_app.name || ' as ' || v_rank,
    json_build_object('application_id', p_id, 'job_id', v_app.job_id, 'joining_date', p_joining_date)::jsonb, v_employee);

  PERFORM public.notify_roles(v_company, ARRAY['finance'], 'onboarding',
    'New hire: ' || v_app.name,
    v_rank || ' joins on ' || to_char(p_joining_date, 'DD Mon YYYY') || '. Set up their salary before the next payroll.',
    '/employees/' || v_employee::text);

  RETURN v_employee;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_hire_application(uuid, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_hire_application(uuid, text, date, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Company careers address (owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_set_company_slug(p_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_slug text := public.careers_slugify(p_slug);
  v_old text;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_owner() THEN
    RAISE EXCEPTION 'Only the owner can change the careers address.' USING ERRCODE = '42501';
  END IF;
  IF length(v_slug) < 2 THEN
    RAISE EXCEPTION 'Use at least 2 letters or digits.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies c WHERE c.slug = v_slug AND c.id <> v_company) THEN
    RAISE EXCEPTION 'That address is taken. Try another one.' USING ERRCODE = '23505';
  END IF;
  SELECT slug INTO v_old FROM public.companies WHERE id = v_company;
  IF v_old IS DISTINCT FROM v_slug THEN
    UPDATE public.companies SET slug = v_slug WHERE id = v_company;
    PERFORM public.log_activity('careers.slug_changed', 'Changed the careers page address to /careers/' || v_slug,
      json_build_object('from', v_old, 'to', v_slug)::jsonb, NULL);
  END IF;
  RETURN v_slug;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_set_company_slug(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_set_company_slug(text) TO authenticated;
