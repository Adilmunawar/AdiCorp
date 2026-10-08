-- Careers in the employee portal: internal openings, so employees can see roles and refer people.
CREATE OR REPLACE FUNCTION public.portal_careers_openings(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
        AND (j.closes_on IS NULL OR j.closes_on >= current_date)
    ), '[]'::json)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.portal_careers_openings(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_careers_openings(text) TO anon, authenticated;
