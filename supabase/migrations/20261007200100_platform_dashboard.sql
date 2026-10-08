-- Platform 2/4: role-aware home dashboard in one round trip.
-- Money sections are returned only to owner/finance; people and time sections only to owner/hr.
-- Hiring and spending figures are read from the careers / expenses tables when those modules
-- have created them (detected by name and columns), and are simply absent otherwise.

-- Internal: does public.<p_table> exist with all of p_cols?
CREATE OR REPLACE FUNCTION public._platform_has_cols(p_table text, p_cols text[])
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT to_regclass('public.' || quote_ident(p_table)) IS NOT NULL
     AND (
       SELECT count(*)
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = to_regclass('public.' || quote_ident(p_table))
         AND a.attname = ANY (p_cols) AND a.attnum > 0 AND NOT a.attisdropped
     ) = cardinality(p_cols)
$$;
REVOKE ALL ON FUNCTION public._platform_has_cols(text, text[]) FROM PUBLIC, anon, authenticated;

-- Internal: display name of a staff profile.
CREATE OR REPLACE FUNCTION public._platform_person(p_user uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') FROM public.profiles p WHERE p.id = p_user
$$;
REVOKE ALL ON FUNCTION public._platform_person(uuid) FROM PUBLIC, anon, authenticated;

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
    WITH act AS (
      SELECT e.id FROM public.employees e
      WHERE e.company_id = v_company AND e.status = 'active' AND (e.joining_date IS NULL OR e.joining_date <= v_today)
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
        SELECT ev.id, ev.title, ev.date, ev.type, ev.description
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
