-- Platform 3/4: people reports (no pay data) and the activity timeline.
-- Reports: any staff role. Timeline: any staff role; payroll.* entries only for owner/finance,
-- and money-like keys are stripped from entry details for HR.

-- ---------------------------------------------------------------------------
-- Attendance (month): per person working days so far, present, half day, leave, absent, unmarked.
-- Approved leave on an unmarked working day counts as leave.
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
        FROM wd
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

-- ---------------------------------------------------------------------------
-- Leave (year): approved used / pending / remaining per active person per active type.
-- Allowance is the person's leave_balances row for the year, else the type's days_per_year.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_report_leave(p_year integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_year integer;
BEGIN
  v_year := COALESCE(p_year, extract(year FROM public.company_today(v_company))::integer);
  IF v_year < 2000 OR v_year > 2100 THEN
    RAISE EXCEPTION 'Choose a year between 2000 and 2100' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH types AS (
      SELECT lt.id, lt.name, lt.days_per_year, lt.is_paid
      FROM public.leave_types lt
      WHERE lt.company_id = v_company AND lt.is_active
    ), emp AS (
      SELECT e.id, e.name, dep.name AS department
      FROM public.employees e
      LEFT JOIN public.departments dep ON dep.id = e.department_id
      WHERE e.company_id = v_company AND e.status = 'active'
    ), req AS (
      SELECT lr.employee_id, lr.leave_type_id,
             COALESCE(sum(lr.days_count) FILTER (WHERE lr.status = 'approved'), 0) AS used,
             COALESCE(sum(lr.days_count) FILTER (WHERE lr.status = 'pending'), 0) AS pending
      FROM public.leave_requests lr
      WHERE lr.company_id = v_company
        AND lr.start_date >= make_date(v_year, 1, 1) AND lr.start_date < make_date(v_year + 1, 1, 1)
      GROUP BY 1, 2
    ), bal AS (
      SELECT lb.employee_id, lb.leave_type_id, lb.total_days
      FROM public.leave_balances lb
      WHERE lb.company_id = v_company AND lb.year = v_year
    )
    SELECT jsonb_build_object(
      'year', v_year,
      'types', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'days_per_year', t.days_per_year, 'is_paid', t.is_paid) ORDER BY t.name)
        FROM types t
      ), '[]'::jsonb),
      'rows', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'employee_id', emp.id,
          'name', emp.name,
          'department', emp.department,
          'used', COALESCE((SELECT sum(r.used) FROM req r WHERE r.employee_id = emp.id), 0),
          'pending', COALESCE((SELECT sum(r.pending) FROM req r WHERE r.employee_id = emp.id), 0),
          'by_type', COALESCE((
            SELECT jsonb_object_agg(t.id::text, jsonb_build_object(
              'allowance', COALESCE(b.total_days, t.days_per_year),
              'used', COALESCE(r.used, 0),
              'pending', COALESCE(r.pending, 0),
              'remaining', COALESCE(b.total_days, t.days_per_year) - COALESCE(r.used, 0)
            ))
            FROM types t
            LEFT JOIN req r ON r.employee_id = emp.id AND r.leave_type_id = t.id
            LEFT JOIN bal b ON b.employee_id = emp.id AND b.leave_type_id = t.id
          ), '{}'::jsonb)
        ) ORDER BY emp.name)
        FROM emp
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Overtime (month): hours only (no rates or amounts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_report_overtime(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_start date;
  v_next date;
BEGIN
  v_start := date_trunc('month', COALESCE(p_month, public.company_today(v_company)))::date;
  v_next := (v_start + interval '1 month')::date;

  RETURN jsonb_build_object(
    'month', v_start,
    'rows', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.approved DESC, x.name)
      FROM (
        SELECT e.id AS employee_id, e.name, dep.name AS department,
               count(*) AS entries,
               COALESCE(sum(o.hours) FILTER (WHERE o.status = 'approved'), 0) AS approved,
               COALESCE(sum(o.hours) FILTER (WHERE o.status = 'pending'), 0) AS pending,
               COALESCE(sum(o.hours) FILTER (WHERE o.status = 'rejected'), 0) AS rejected,
               COALESCE(sum(o.hours) FILTER (WHERE o.status = 'approved' AND o.overtime_type = 'regular'), 0) AS regular,
               COALESCE(sum(o.hours) FILTER (WHERE o.status = 'approved' AND o.overtime_type = 'weekend'), 0) AS weekend,
               COALESCE(sum(o.hours) FILTER (WHERE o.status = 'approved' AND o.overtime_type = 'holiday'), 0) AS holiday
        FROM public.overtime_records o
        JOIN public.employees e ON e.id = o.employee_id
        LEFT JOIN public.departments dep ON dep.id = e.department_id
        WHERE o.company_id = v_company AND o.date >= v_start AND o.date < v_next
        GROUP BY e.id, e.name, dep.name
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Headcount (month): active, departments, ranks, gender, tenure, joiners, leavers, 12-month trend.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_report_headcount(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_today date;
  v_start date;
  v_end date;
  v_asof date;
BEGIN
  v_today := public.company_today(v_company);
  v_start := date_trunc('month', COALESCE(p_month, v_today))::date;
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_asof := LEAST(v_end, v_today);

  RETURN (
    WITH base AS (
      SELECT e.id, e.name, e.rank, e.gender, e.joining_date, e.separation_date, e.status, e.created_at,
             e.cnic, e.phone, e.date_of_birth, e.department_id, e.password_hash IS NOT NULL AS has_portal,
             COALESCE(dep.name, 'Unassigned') AS department
      FROM public.employees e
      LEFT JOIN public.departments dep ON dep.id = e.department_id
      WHERE e.company_id = v_company
    ), act AS (
      SELECT * FROM base b
      WHERE COALESCE(b.joining_date, b.created_at::date) <= v_asof
        AND (b.separation_date IS NULL OR b.separation_date > v_asof)
        AND (b.status = 'active' OR b.separation_date IS NOT NULL)
    )
    SELECT jsonb_build_object(
      'month', v_start,
      'as_of', v_asof,
      'active', (SELECT count(*) FROM act),
      'separated_total', (SELECT count(*) FROM base WHERE status <> 'active'),
      'incomplete_profiles', (
        SELECT count(*) FROM base
        WHERE status = 'active' AND (cnic IS NULL OR phone IS NULL OR joining_date IS NULL OR date_of_birth IS NULL OR department_id IS NULL)
      ),
      'no_portal_access', (SELECT count(*) FROM base WHERE status = 'active' AND NOT has_portal),
      'by_department', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', x.k, 'count', x.n) ORDER BY x.n DESC, x.k)
        FROM (SELECT department AS k, count(*) AS n FROM act GROUP BY 1) x
      ), '[]'::jsonb),
      'by_rank', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', x.k, 'count', x.n) ORDER BY x.n DESC, x.k)
        FROM (SELECT COALESCE(NULLIF(btrim(rank), ''), 'No rank') AS k, count(*) AS n FROM act GROUP BY 1) x
      ), '[]'::jsonb),
      'by_gender', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', x.k, 'count', x.n) ORDER BY x.n DESC, x.k)
        FROM (SELECT COALESCE(NULLIF(initcap(btrim(gender)), ''), 'Not recorded') AS k, count(*) AS n FROM act GROUP BY 1) x
      ), '[]'::jsonb),
      'tenure', jsonb_build_object(
        'under_1', (SELECT count(*) FROM act WHERE joining_date IS NOT NULL AND joining_date > (v_asof - interval '1 year')::date),
        'one_to_3', (SELECT count(*) FROM act WHERE joining_date <= (v_asof - interval '1 year')::date AND joining_date > (v_asof - interval '3 years')::date),
        'three_to_5', (SELECT count(*) FROM act WHERE joining_date <= (v_asof - interval '3 years')::date AND joining_date > (v_asof - interval '5 years')::date),
        'over_5', (SELECT count(*) FROM act WHERE joining_date <= (v_asof - interval '5 years')::date),
        'unknown', (SELECT count(*) FROM act WHERE joining_date IS NULL)
      ),
      'joiners', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('employee_id', b.id, 'name', b.name, 'department', b.department, 'rank', b.rank, 'date', b.joining_date) ORDER BY b.joining_date, b.name)
        FROM base b WHERE b.joining_date BETWEEN v_start AND v_end
      ), '[]'::jsonb),
      'leavers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('employee_id', b.id, 'name', b.name, 'department', b.department, 'rank', b.rank, 'date', b.separation_date) ORDER BY b.separation_date, b.name)
        FROM base b WHERE b.separation_date BETWEEN v_start AND v_end
      ), '[]'::jsonb),
      'trend', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'month', m.mon,
          'active', (
            SELECT count(*) FROM base b
            WHERE COALESCE(b.joining_date, b.created_at::date) <= m.last_day
              AND (b.separation_date IS NULL OR b.separation_date > m.last_day)
              AND (b.status = 'active' OR b.separation_date IS NOT NULL)
          ),
          'joiners', (SELECT count(*) FROM base b WHERE b.joining_date BETWEEN m.mon AND m.last_day),
          'leavers', (SELECT count(*) FROM base b WHERE b.separation_date BETWEEN m.mon AND m.last_day)
        ) ORDER BY m.mon)
        FROM (
          SELECT g::date AS mon, LEAST((g + interval '1 month - 1 day')::date, v_today) AS last_day
          FROM generate_series(v_start - interval '11 months', v_start::timestamp, interval '1 month') AS g
        ) m
      ), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_report_attendance(date), public.platform_report_leave(integer),
  public.platform_report_overtime(date), public.platform_report_headcount(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_report_attendance(date), public.platform_report_leave(integer),
  public.platform_report_overtime(date), public.platform_report_headcount(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Timeline
-- ---------------------------------------------------------------------------

-- Remove money-like keys at any depth (HR must never see pay through the timeline).
CREATE OR REPLACE FUNCTION public._platform_strip_money(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p) = 'array' THEN
    RETURN (SELECT COALESCE(jsonb_agg(public._platform_strip_money(x)), '[]'::jsonb) FROM jsonb_array_elements(p) AS x);
  END IF;
  IF jsonb_typeof(p) <> 'object' THEN
    RETURN p;
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p) LOOP
    IF v_key !~* '(salary|wage|amount|hourly_rate|multiplier|allowance|deduction|gross|net_pay|net_salary|bonus|tax|earning|pay_rate|price|cost)' THEN
      v_out := v_out || jsonb_build_object(v_key, public._platform_strip_money(v_val));
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public._platform_strip_money(jsonb) FROM PUBLIC, anon, authenticated;

-- Area of an action: the prefix before the first '.' (legacy names use '_').
CREATE OR REPLACE FUNCTION public.activity_area(p_action text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT split_part(translate(lower(COALESCE(p_action, '')), '_', '.'), '.', 1)
$$;
REVOKE ALL ON FUNCTION public.activity_area(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_area(text) TO authenticated, service_role;

-- Page of the timeline, newest first. Cursor: pass the previous page's next_before.
CREATE OR REPLACE FUNCTION public.platform_activity_feed(
  p_before timestamptz DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_employee uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_fin boolean := public.auth_is_finance();
  v_tz text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_area text := NULLIF(lower(btrim(COALESCE(p_area, ''))), '');
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_items jsonb;
  v_count integer;
BEGIN
  IF v_area = 'payroll' AND NOT v_fin THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'next_before', NULL);
  END IF;
  SELECT COALESCE(c.timezone, 'UTC') INTO v_tz FROM public.companies c WHERE c.id = v_company;
  IF v_search IS NOT NULL THEN
    v_search := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH page AS (
    SELECT l.id, l.action_type, l.description, l.details, l.created_at, l.user_id, l.employee_id
    FROM public.activity_logs l
    WHERE l.company_id = v_company
      AND (v_fin OR l.action_type NOT LIKE 'payroll.%')
      AND (p_before IS NULL OR l.created_at < p_before)
      AND (v_area IS NULL OR public.activity_area(l.action_type) = v_area)
      AND (p_employee IS NULL OR l.employee_id = p_employee OR (l.details ->> 'employee_id') = p_employee::text)
      AND (p_actor IS NULL OR l.user_id = p_actor)
      AND (p_from IS NULL OR l.created_at >= (p_from::timestamp AT TIME ZONE v_tz))
      AND (p_to IS NULL OR l.created_at < ((p_to + 1)::timestamp AT TIME ZONE v_tz))
      AND (v_search IS NULL OR l.description ILIKE v_search)
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'action', p.action_type,
      'area', public.activity_area(p.action_type),
      'description', p.description,
      'details', CASE WHEN v_fin THEN COALESCE(p.details, '{}'::jsonb) ELSE public._platform_strip_money(COALESCE(p.details, '{}'::jsonb)) END,
      'created_at', p.created_at,
      'actor', CASE WHEN p.user_id IS NULL THEN NULL
                    ELSE jsonb_build_object('id', p.user_id, 'name', public._platform_person(p.user_id)) END,
      'employee', CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object('id', e.id, 'name', e.name) END
    ) ORDER BY p.created_at DESC, p.id DESC) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
    count(*)
  INTO v_items, v_count
  FROM (SELECT page.*, row_number() OVER (ORDER BY page.created_at DESC, page.id DESC) AS rn FROM page) p
  LEFT JOIN public.employees e ON e.id = p.employee_id AND e.company_id = v_company;

  RETURN jsonb_build_object(
    'items', v_items,
    'next_before', CASE WHEN v_count > v_limit THEN (v_items -> (v_limit - 1) ->> 'created_at') END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_activity_feed(timestamptz, text, uuid, uuid, date, date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_activity_feed(timestamptz, text, uuid, uuid, date, date, text, integer) TO authenticated;

-- Filter options: areas with counts and the people who acted.
CREATE OR REPLACE FUNCTION public.platform_activity_facets()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_fin boolean := public.auth_is_finance();
BEGIN
  RETURN jsonb_build_object(
    'areas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('area', x.area, 'count', x.n) ORDER BY x.n DESC, x.area)
      FROM (
        SELECT public.activity_area(l.action_type) AS area, count(*) AS n
        FROM public.activity_logs l
        WHERE l.company_id = v_company AND (v_fin OR l.action_type NOT LIKE 'payroll.%')
        GROUP BY 1
      ) x
      WHERE x.area <> ''
    ), '[]'::jsonb),
    'actors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', COALESCE(public._platform_person(p.id), 'Staff member'), 'role', p.role)
                       ORDER BY public._platform_person(p.id) NULLS LAST)
      FROM public.profiles p
      WHERE p.company_id = v_company
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_activity_facets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_activity_facets() TO authenticated;
