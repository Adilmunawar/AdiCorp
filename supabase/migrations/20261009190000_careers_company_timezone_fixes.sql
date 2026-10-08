-- Careers: company-timezone dates, accent-aware slugs, and two small correctness fixes.
--
-- 1. "Today" for closing dates and joining dates is the company's date (company_today), not the
--    database's UTC date. Between 00:00 and 05:00 in Asia/Karachi the UTC date is still yesterday,
--    so a role that closed yesterday stayed on the careers page, still took applications, and the
--    hire note was stamped with yesterday's date.
-- 2. careers_slugify folds accents (Développeur -> developpeur) instead of dropping the letter
--    (d-veloppeur). It matches slugify() in src/modules/careers/lib/model.ts, so the address shown
--    in the job editor is the address that gets saved. Existing slugs are untouched.
-- 3. careers_hire_application honours the department picked in the hire dialog. "No department"
--    used to fall back to the job's department; the dialog already pre-selects the job's one.
-- 4. careers_delete_job checks the role belongs to the caller's company before looking at its
--    applications, so another company's role id no longer gets a different answer.

CREATE OR REPLACE FUNCTION public.careers_slugify(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT btrim(left(btrim(regexp_replace(
    translate(
      replace(replace(replace(replace(replace(lower(COALESCE(p_text, '')),
        'ß', 'ss'), 'æ', 'ae'), 'þ', 'th'), 'ĳ', 'ij'), 'œ', 'oe'),
      'àáâãäåçèéêëìíîïðñòóôõöøùúûüýÿāăąćĉċčďđēĕėęěĝğġģĥħĩīĭįıĵķĸĺļľŀłńņňŉōŏőŕŗřśŝşšţťŧũūŭůűųŵŷźżžſ',
      'aaaaaaceeeeiiiidnoooooouuuuyyaaaccccddeeeeegggghhiiiiijkklllllnnnnooorrrsssstttuuuuuuwyzzzs'),
    '[^a-z0-9]+', '-', 'g'), '-'), 60), '-');
$function$;

CREATE OR REPLACE FUNCTION public.careers_public_company(p_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        AND (j.closes_on IS NULL OR j.closes_on >= public.company_today(c.id))
    ), '[]'::json)
  )
  FROM public.companies c
  WHERE c.slug = lower(btrim(COALESCE(p_slug, '')));
$function$;

CREATE OR REPLACE FUNCTION public.careers_public_job(p_company_slug text, p_job_slug text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT json_build_object(
    'company', json_build_object('name', c.name, 'slug', c.slug, 'logo', c.logo, 'website', c.website),
    'job', json_build_object(
      'id', j.id, 'slug', j.slug, 'title', j.title, 'department', d.name,
      'location', j.location, 'employment_type', j.employment_type, 'workplace', j.workplace,
      'openings', j.openings, 'summary', j.summary, 'description', j.description,
      'requirements', j.requirements, 'closes_on', j.closes_on, 'created_at', j.created_at,
      'is_open', (j.status = 'open' AND (j.closes_on IS NULL OR j.closes_on >= public.company_today(c.id))))
  )
  FROM public.companies c
  JOIN public.job_postings j ON j.company_id = c.id AND j.slug = lower(btrim(COALESCE(p_job_slug, '')))
  LEFT JOIN public.departments d ON d.id = j.department_id
  WHERE c.slug = lower(btrim(COALESCE(p_company_slug, '')));
$function$;

CREATE OR REPLACE FUNCTION public.portal_careers_openings(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN json_build_object(
    'company_slug', (SELECT c.slug FROM public.companies c WHERE c.id = v_emp.company_id),
    'jobs', COALESCE((
      SELECT json_agg(json_build_object(
               'id', j.id, 'slug', j.slug, 'title', j.title, 'department', d.name,
               'location', j.location, 'employment_type', j.employment_type, 'workplace', j.workplace,
               'openings', j.openings, 'summary', j.summary, 'closes_on', j.closes_on, 'created_at', j.created_at)
             ORDER BY j.created_at DESC)
      FROM public.job_postings j
      LEFT JOIN public.departments d ON d.id = j.department_id
      WHERE j.company_id = v_emp.company_id
        AND j.status = 'open'
        AND (j.closes_on IS NULL OR j.closes_on >= public.company_today(v_emp.company_id))
    ), '[]'::json)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.careers_application_precheck(p_job uuid, p_email text, p_ip_hash text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_job public.job_postings%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.job_postings WHERE id = p_job;
  IF NOT FOUND OR v_job.status <> 'open' THEN
    RETURN json_build_object('error', 'This role is no longer open.', 'status', 410);
  END IF;
  IF v_job.closes_on IS NOT NULL AND v_job.closes_on < public.company_today(v_job.company_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.careers_delete_job(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_title text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.job_postings j WHERE j.id = p_id AND j.company_id = v_company) THEN
    RAISE EXCEPTION 'That role no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_applications a WHERE a.job_id = p_id AND a.company_id = v_company) THEN
    RAISE EXCEPTION 'This role has applications. Close it instead so the candidates stay on record.' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.job_postings WHERE id = p_id AND company_id = v_company RETURNING title INTO v_title;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'That role no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_activity('careers.job_deleted', 'Deleted the role ' || v_title, json_build_object('job_id', p_id)::jsonb, NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.careers_hire_application(p_id uuid, p_rank text, p_joining_date date, p_department uuid DEFAULT NULL::uuid, p_cnic text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_today date := public.company_today(v_company);
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
  IF p_joining_date < v_today - 365 OR p_joining_date > v_today + 365 THEN
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

  -- p_department is the dialog's choice (pre-filled with the job's department); NULL means none.
  INSERT INTO public.employees (company_id, name, email, phone, rank, joining_date, department_id, status, cnic, notes)
  VALUES (v_company, v_app.name, v_app.email, NULLIF(v_app.phone, ''), v_rank, p_joining_date,
          p_department, 'active',
          CASE WHEN v_cnic = '' THEN NULL
               ELSE substr(v_cnic, 1, 5) || '-' || substr(v_cnic, 6, 7) || '-' || substr(v_cnic, 13, 1) END,
          'Hired through careers for ' || v_app.job_title || ' on ' || to_char(v_today, 'DD Mon YYYY') || '.')
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
$function$;
