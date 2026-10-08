-- Time module 3/4: attendance register, marking, daily summary, hours tracking.

-- ---------------------------------------------------------------------------
-- Internal: punches folded into one row per employee and work date. Night-shift punches before
-- noon belong to the previous evening's shift. first_in = earliest non-out punch; last_out = latest
-- non-in punch when it is after first_in.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._time_day_punches(p_company uuid, p_from date, p_to date, p_employee uuid DEFAULT NULL)
RETURNS TABLE(employee_id uuid, work_date date, first_in timestamptz, last_out timestamptz, punches integer, corrected boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH z AS (SELECT public._time_tz(p_company) AS tz),
  p AS (
    SELECT tp.employee_id, tp.punch_at, tp.direction, tp.source,
           CASE WHEN e.shift_type = 'night'
                THEN ((tp.punch_at AT TIME ZONE z.tz) - interval '12 hours')::date
                ELSE (tp.punch_at AT TIME ZONE z.tz)::date END AS work_date
    FROM public.time_punches tp
    JOIN public.employees e ON e.id = tp.employee_id
    CROSS JOIN z
    WHERE tp.company_id = p_company
      AND tp.employee_id IS NOT NULL
      AND (p_employee IS NULL OR tp.employee_id = p_employee)
      AND tp.punch_date BETWEEN p_from - 1 AND p_to + 1
  ),
  a AS (
    SELECT p.employee_id, p.work_date,
           min(p.punch_at) FILTER (WHERE p.direction <> 'out') AS first_in,
           max(p.punch_at) FILTER (WHERE p.direction <> 'in') AS last_any,
           count(*)::integer AS punches,
           bool_or(p.source = 'correction') AS corrected
    FROM p
    WHERE p.work_date BETWEEN p_from AND p_to
    GROUP BY p.employee_id, p.work_date
  )
  SELECT a.employee_id, a.work_date, a.first_in,
         CASE WHEN a.first_in IS NOT NULL AND a.last_any > a.first_in THEN a.last_any END,
         a.punches, a.corrected
  FROM a;
$$;

-- Internal: auto-mark present from a punch. Never overwrites an existing row; only on working,
-- unlocked days inside employment, not in the future, and not on approved leave.
CREATE OR REPLACE FUNCTION public._time_auto_present(p_company uuid, p_employee uuid, p_date date, p_source text DEFAULT 'biometric')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_date IS NULL OR p_date > public._time_today(p_company)
     OR NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p_employee AND e.company_id = p_company AND e.status IN ('active', 'on_leave'))
     OR NOT EXISTS (SELECT 1 FROM public.working_dates(p_company, p_date, p_date, p_employee))
     OR public._time_locked(p_company, p_employee, p_date)
     OR public._time_on_leave(p_employee, p_date) THEN
    RETURN false;
  END IF;
  INSERT INTO public.attendance (employee_id, company_id, date, status, note, source)
  VALUES (p_employee, p_company, p_date, 'present',
          CASE WHEN p_source = 'correction' THEN 'Approved punch correction' ELSE 'Biometric punch' END,
          CASE WHEN p_source = 'correction' THEN 'correction' ELSE 'biometric' END)
  ON CONFLICT (employee_id, date) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public._time_day_punches(uuid, date, date, uuid), public._time_auto_present(uuid, uuid, date, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Month register: everything the grid needs in one round trip. Any staff role may read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_month_register(p_month date, p_department uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_m0 date := date_trunc('month', COALESCE(p_month, now()::date))::date;
  v_m1 date;
  v_cfg public.time_settings;
  v_days jsonb;
  v_people jsonb;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  v_m1 := (v_m0 + interval '1 month - 1 day')::date;
  v_cfg := public._time_cfg(v_company);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'date', d.d,
           'dow', extract(isodow FROM d.d)::int,
           'working', EXISTS (SELECT 1 FROM public.working_dates(v_company, d.d, d.d)),
           'events', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'type', e.type, 'affects', e.affects_attendance) ORDER BY e.type, e.title)
             FROM public.events e
             WHERE e.company_id = v_company AND d.d BETWEEN e.date AND COALESCE(e.end_date, e.date)
           ), '[]'::jsonb)
         ) ORDER BY d.d), '[]'::jsonb)
  INTO v_days
  FROM (SELECT gs::date AS d FROM generate_series(v_m0, v_m1, interval '1 day') gs) d;

  WITH emps AS (
    SELECT e.id, e.name, e.employee_code, e.rank, e.status, e.joining_date, e.separation_date, e.shift_type,
           e.department_id, dep.name AS department, e.avatar_url
    FROM public.employees e
    LEFT JOIN public.departments dep ON dep.id = e.department_id
    WHERE e.company_id = v_company
      AND (p_department IS NULL OR e.department_id = p_department)
      AND (e.joining_date IS NULL OR e.joining_date <= v_m1)
      AND (
        e.status IN ('active', 'on_leave')
        OR (e.separation_date IS NOT NULL AND e.separation_date >= v_m0)
        OR EXISTS (SELECT 1 FROM public.attendance a WHERE a.employee_id = e.id AND a.date BETWEEN v_m0 AND v_m1)
      )
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', em.id,
           'name', em.name,
           'code', em.employee_code,
           'rank', em.rank,
           'status', em.status,
           'department_id', em.department_id,
           'department', em.department,
           'avatar_url', em.avatar_url,
           'shift_type', em.shift_type,
           'joining_date', em.joining_date,
           'separation_date', em.separation_date,
           'payslip_locked', EXISTS (
             SELECT 1 FROM public.payslips p
             WHERE p.employee_id = em.id AND p.month >= v_m0 AND p.month <= v_m1
               AND COALESCE(to_jsonb(p) ->> 'status', 'final') IN ('final', 'paid', 'published', 'locked')),
           'working', COALESCE((SELECT jsonb_agg(w) FROM public.working_dates(v_company, v_m0, v_m1, em.id) w), '[]'::jsonb),
           'leave', COALESCE((
             SELECT jsonb_agg(DISTINCT gs::date)
             FROM public.leave_requests lr,
                  generate_series(GREATEST(lr.start_date, v_m0), LEAST(lr.end_date, v_m1), interval '1 day') gs
             WHERE lr.employee_id = em.id AND lr.status::text = 'approved'
               AND lr.start_date <= v_m1 AND lr.end_date >= v_m0
           ), '[]'::jsonb),
           'cells', COALESCE((
             SELECT jsonb_object_agg(a.date::text, jsonb_build_object('s', a.status, 'n', a.note, 'src', a.source))
             FROM public.attendance a
             WHERE a.employee_id = em.id AND a.date BETWEEN v_m0 AND v_m1
           ), '{}'::jsonb)
         ) ORDER BY em.name), '[]'::jsonb)
  INTO v_people
  FROM emps em;

  RETURN jsonb_build_object(
    'month', v_m0,
    'today', public._time_today(v_company),
    'locked_through', v_cfg.locked_through,
    'can_edit', public.auth_is_hr(),
    'days', v_days,
    'employees', v_people
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Save register changes (HR / owner). p_changes: [{employee_id, date, status|null, note?}], max 3000.
-- status null clears the day. Leave can only come from approved leave requests.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_mark_attendance(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_uid uuid := auth.uid();
  v_today date;
  r record;
  e public.employees;
  v_marked integer := 0;
  v_cleared integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_people uuid[] := '{}';
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can mark attendance' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'Changes must be a list' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_changes) > 3000 THEN
    RAISE EXCEPTION 'Save at most 3000 changes at a time' USING ERRCODE = '22023';
  END IF;
  v_today := public._time_today(v_company);

  FOR r IN
    SELECT (x ->> 'employee_id')::uuid AS employee_id,
           (x ->> 'date')::date AS d,
           NULLIF(x ->> 'status', '') AS status,
           x ? 'note' AS has_note,
           left(NULLIF(btrim(x ->> 'note'), ''), 200) AS note
    FROM jsonb_array_elements(p_changes) AS x
  LOOP
    v_reason := NULL;
    SELECT * INTO e FROM public.employees WHERE id = r.employee_id AND company_id = v_company;
    IF e.id IS NULL THEN
      v_reason := 'Employee not found';
    ELSIF r.d IS NULL THEN
      v_reason := 'Missing date';
    ELSIF r.status IS NOT NULL AND r.status NOT IN ('present', 'absent', 'half_day', 'short_leave') THEN
      v_reason := 'Leave can only be set through leave requests';
    ELSIF r.d > v_today THEN
      v_reason := 'Future days cannot be marked';
    ELSIF (e.joining_date IS NOT NULL AND r.d < e.joining_date) OR (e.separation_date IS NOT NULL AND r.d > e.separation_date) THEN
      v_reason := 'Outside employment';
    ELSIF NOT EXISTS (SELECT 1 FROM public.working_dates(v_company, r.d, r.d, e.id)) THEN
      v_reason := 'Not a working day';
    ELSIF public._time_on_leave(e.id, r.d) THEN
      v_reason := 'On approved leave';
    ELSIF public._time_locked(v_company, e.id, r.d) THEN
      v_reason := 'Month is locked';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object('employee_id', r.employee_id, 'date', r.d, 'reason', v_reason);
      CONTINUE;
    END IF;

    IF r.status IS NULL THEN
      DELETE FROM public.attendance WHERE employee_id = e.id AND date = r.d;
      IF FOUND THEN v_cleared := v_cleared + 1; END IF;
    ELSE
      INSERT INTO public.attendance AS att (employee_id, company_id, date, status, note, source, marked_by)
      VALUES (e.id, v_company, r.d, r.status, r.note, 'manual', v_uid)
      ON CONFLICT (employee_id, date) DO UPDATE
        SET status = EXCLUDED.status,
            note = CASE WHEN r.has_note THEN EXCLUDED.note ELSE att.note END,
            source = 'manual',
            marked_by = v_uid,
            updated_at = now();
      v_marked := v_marked + 1;
    END IF;
    IF NOT (e.id = ANY (v_people)) THEN v_people := v_people || e.id; END IF;
  END LOOP;

  IF v_marked + v_cleared > 0 THEN
    PERFORM public.log_activity(
      CASE WHEN cardinality(v_people) = 1 THEN 'attendance.mark' ELSE 'attendance.save' END,
      CASE WHEN cardinality(v_people) = 1
           THEN format('Updated %s day(s) of attendance for %s', v_marked + v_cleared, (SELECT name FROM public.employees WHERE id = v_people[1]))
           ELSE format('Saved attendance: %s marked, %s cleared for %s people', v_marked, v_cleared, cardinality(v_people)) END,
      jsonb_build_object('marked', v_marked, 'cleared', v_cleared, 'skipped', jsonb_array_length(v_skipped)),
      CASE WHEN cardinality(v_people) = 1 THEN v_people[1] END);
  END IF;

  RETURN jsonb_build_object('marked', v_marked, 'cleared', v_cleared, 'skipped', v_skipped);
END;
$$;

-- Mark everyone (or the listed people) present on a day, only where nothing is marked yet.
CREATE OR REPLACE FUNCTION public.time_mark_all_present(p_date date, p_employee_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_count integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can mark attendance' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL OR p_date > public._time_today(v_company) THEN
    RAISE EXCEPTION 'Future days cannot be marked' USING ERRCODE = '22023';
  END IF;

  WITH ins AS (
    INSERT INTO public.attendance (employee_id, company_id, date, status, source, marked_by)
    SELECT e.id, v_company, p_date, 'present', 'bulk', auth.uid()
    FROM public.employees e
    WHERE e.company_id = v_company
      AND e.status IN ('active', 'on_leave')
      AND (p_employee_ids IS NULL OR e.id = ANY (p_employee_ids))
      AND (e.joining_date IS NULL OR e.joining_date <= p_date)
      AND (e.separation_date IS NULL OR e.separation_date >= p_date)
      AND EXISTS (SELECT 1 FROM public.working_dates(v_company, p_date, p_date, e.id))
      AND NOT public._time_on_leave(e.id, p_date)
      AND NOT public._time_locked(v_company, e.id, p_date)
    ON CONFLICT (employee_id, date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM ins;

  IF v_count > 0 THEN
    PERFORM public.log_activity('attendance.mark_all', format('Marked %s people present on %s', v_count, to_char(p_date, 'FMDD Mon YYYY')),
      jsonb_build_object('date', p_date, 'marked', v_count));
  END IF;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal: one row per employee per day with expectations, punches and flags.
-- kind: leave | measured | no_out | unmeasured | absent | off_day (worked a day off) | pending
-- (today, not over yet). Late/early are not counted on half days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._time_days(p_company uuid, p_from date, p_to date, p_employee uuid DEFAULT NULL, p_department uuid DEFAULT NULL)
RETURNS TABLE(
  employee_id uuid, work_date date, working boolean, kind text, register text, register_source text,
  first_in timestamptz, last_out timestamptz, punches integer, corrected boolean,
  shift_start timestamptz, shift_end timestamptz, target_minutes integer, worked_minutes integer,
  late_minutes integer, early_minutes integer, half boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg public.time_settings := public._time_cfg(p_company);
  v_today date := public._time_today(p_company);
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'Pick a range of at most 400 days' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH emps AS (
    SELECT e.id, e.shift_type, e.joining_date, e.separation_date,
           COALESCE(NULLIF(e.working_hours_per_day, 0)::numeric, v_cfg.hours_per_day) AS hpd
    FROM public.employees e
    WHERE e.company_id = p_company
      AND (p_employee IS NULL OR e.id = p_employee)
      AND (p_department IS NULL OR e.department_id = p_department)
  ),
  span AS (
    SELECT em.id AS emp_id, gs::date AS d
    FROM emps em, generate_series(GREATEST(p_from, COALESCE(em.joining_date, p_from)),
                                  LEAST(p_to, COALESCE(em.separation_date, p_to)), interval '1 day') gs
  ),
  wd AS (
    SELECT em.id AS emp_id, w AS d FROM emps em, LATERAL public.working_dates(p_company, p_from, p_to, em.id) w
  ),
  dp AS (SELECT * FROM public._time_day_punches(p_company, p_from, p_to, p_employee)),
  base AS (
    SELECT sp.emp_id, sp.d, em.shift_type, em.hpd,
           (wd.d IS NOT NULL) AS is_working,
           public._time_on_leave(sp.emp_id, sp.d) AS on_leave,
           a.status AS reg, a.source AS reg_src,
           dp.first_in AS fi, dp.last_out AS lo, COALESCE(dp.punches, 0) AS np, COALESCE(dp.corrected, false) AS corr,
           ((sp.d + public._time_shift_start(v_cfg, em.shift_type)) AT TIME ZONE v_cfg.timezone) AS s_start
    FROM span sp
    JOIN emps em ON em.id = sp.emp_id
    LEFT JOIN wd ON wd.emp_id = sp.emp_id AND wd.d = sp.d
    LEFT JOIN public.attendance a ON a.employee_id = sp.emp_id AND a.date = sp.d
    LEFT JOIN dp ON dp.employee_id = sp.emp_id AND dp.work_date = sp.d
  ),
  k AS (
    SELECT b.*,
           b.s_start + make_interval(mins => (b.hpd * 60)::int) AS s_end,
           COALESCE(b.reg IN ('half_day', 'short_leave'), false) AS is_half
    FROM base b
  )
  SELECT k.emp_id, k.d, k.is_working,
         CASE
           WHEN NOT k.is_working THEN CASE WHEN k.fi IS NOT NULL AND k.lo IS NOT NULL THEN 'off_day' ELSE 'off' END
           WHEN k.on_leave OR k.reg = 'leave' THEN 'leave'
           WHEN k.fi IS NOT NULL AND k.lo IS NOT NULL THEN 'measured'
           WHEN now() < k.s_end + interval '60 minutes' THEN 'pending'
           WHEN k.np > 0 THEN 'no_out'
           WHEN k.reg IN ('present', 'half_day', 'short_leave', 'late') THEN 'unmeasured'
           ELSE 'absent'
         END,
         k.reg, k.reg_src, k.fi, k.lo, k.np, k.corr, k.s_start, k.s_end,
         CASE WHEN k.is_working THEN round(k.hpd * 60 * CASE WHEN k.is_half THEN 0.5 ELSE 1 END)::int ELSE 0 END,
         CASE WHEN k.fi IS NOT NULL AND k.lo IS NOT NULL THEN floor(extract(epoch FROM (k.lo - k.fi)) / 60)::int END,
         CASE WHEN k.is_working AND NOT k.is_half AND k.fi IS NOT NULL
              THEN GREATEST(0, floor(extract(epoch FROM (k.fi - (k.s_start + make_interval(mins => v_cfg.grace_minutes)))) / 60))::int END,
         CASE WHEN k.is_working AND NOT k.is_half AND k.lo IS NOT NULL
              THEN GREATEST(0, floor(extract(epoch FROM (k.s_end - k.lo)) / 60))::int END,
         k.is_half
  FROM k;
END;
$$;
REVOKE ALL ON FUNCTION public._time_days(uuid, date, date, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily summary (HR / owner): who is in, late, left early, missing an out-punch, not in, on leave.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_daily_summary(p_date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_cfg public.time_settings;
  v_today date;
  v_date date;
  v_people jsonb;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  v_cfg := public._time_cfg(v_company);
  v_today := public._time_today(v_company);
  v_date := COALESCE(p_date, v_today);

  SELECT COALESCE(jsonb_agg(s.person ORDER BY s.person ->> 'name'), '[]'::jsonb) INTO v_people
  FROM (
    SELECT jsonb_build_object(
      'id', e.id, 'name', e.name, 'code', e.employee_code, 'rank', e.rank, 'department', dep.name,
      'department_id', e.department_id, 'avatar_url', e.avatar_url, 'shift_type', COALESCE(e.shift_type, 'morning'),
      'working', d.working, 'kind', d.kind, 'register', d.register, 'register_source', d.register_source,
      'first_in', d.first_in, 'last_out', d.last_out, 'punches', d.punches, 'corrected', d.corrected,
      'shift_start', d.shift_start, 'shift_end', d.shift_end, 'worked_minutes', d.worked_minutes,
      'late_minutes', d.late_minutes, 'early_minutes', d.early_minutes,
      'late', COALESCE(d.late_minutes, 0) > 0,
      'left_early', COALESCE(d.early_minutes, 0) > v_cfg.grace_minutes,
      'no_out', d.kind = 'no_out',
      'on_leave', d.kind = 'leave',
      'not_due', d.working AND d.punches = 0 AND d.kind NOT IN ('leave', 'unmeasured')
                 AND v_date = v_today AND now() < d.shift_start + make_interval(mins => v_cfg.grace_minutes),
      'marked_by_hr', d.punches = 0 AND d.register IN ('present', 'half_day', 'short_leave', 'late'),
      'worked_day_off', NOT d.working AND d.punches > 0,
      'linked', EXISTS (SELECT 1 FROM public.time_terminal_links l WHERE l.employee_id = e.id),
      'pending_correction', EXISTS (SELECT 1 FROM public.punch_corrections pc WHERE pc.employee_id = e.id AND pc.date = v_date AND pc.status = 'pending')
    ) AS person
    FROM public._time_days(v_company, v_date, v_date) d
    JOIN public.employees e ON e.id = d.employee_id
    LEFT JOIN public.departments dep ON dep.id = e.department_id
    WHERE e.status IN ('active', 'on_leave') OR d.punches > 0 OR d.register IS NOT NULL
  ) s;

  RETURN jsonb_build_object(
    'date', v_date, 'today', v_today, 'is_today', v_date = v_today, 'is_future', v_date > v_today,
    'grace_minutes', v_cfg.grace_minutes, 'timezone', v_cfg.timezone,
    'pending_corrections', (SELECT count(*) FROM public.punch_corrections pc WHERE pc.company_id = v_company AND pc.status = 'pending'),
    'people', v_people
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Hours (staff): per person per month, up to yesterday for the running month. Only measured days
-- (in and out punch on a working day) count; leave, absent, no out-punch and HR marks without
-- punches are counted separately and never treated as zero hours.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._time_hours(p_company uuid, p_month date, p_employee uuid DEFAULT NULL, p_department uuid DEFAULT NULL)
RETURNS TABLE(
  employee_id uuid, working_days integer, measured_days integer, target_minutes integer, worked_minutes integer,
  short_minutes integer, pct numeric, late_days integer, late_minutes integer, early_days integer, early_minutes integer,
  no_out_days integer, absent_days integer, leave_days integer, unmeasured_days integer, offday_minutes integer,
  through date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg public.time_settings := public._time_cfg(p_company);
  v_m0 date := date_trunc('month', p_month)::date;
  v_m1 date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_hi date;
BEGIN
  v_hi := LEAST(v_m1, public._time_today(p_company) - 1);
  IF v_hi < v_m0 THEN
    RETURN QUERY
    SELECT e.id, 0, 0, 0, 0, 0, NULL::numeric, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL::date
    FROM public.employees e
    WHERE e.company_id = p_company AND (p_employee IS NULL OR e.id = p_employee)
      AND (p_department IS NULL OR e.department_id = p_department)
      AND e.status IN ('active', 'on_leave') AND (e.joining_date IS NULL OR e.joining_date <= v_m1);
    RETURN;
  END IF;
  RETURN QUERY
  SELECT d.employee_id,
         count(*) FILTER (WHERE d.working)::int,
         count(*) FILTER (WHERE d.kind = 'measured')::int,
         COALESCE(sum(d.target_minutes) FILTER (WHERE d.kind = 'measured'), 0)::int,
         COALESCE(sum(d.worked_minutes) FILTER (WHERE d.kind = 'measured'), 0)::int,
         GREATEST(0, COALESCE(sum(d.target_minutes) FILTER (WHERE d.kind = 'measured'), 0)
                   - COALESCE(sum(d.worked_minutes) FILTER (WHERE d.kind = 'measured'), 0))::int,
         CASE WHEN COALESCE(sum(d.target_minutes) FILTER (WHERE d.kind = 'measured'), 0) > 0
              THEN round(sum(d.worked_minutes) FILTER (WHERE d.kind = 'measured') * 100.0
                         / sum(d.target_minutes) FILTER (WHERE d.kind = 'measured'), 1) END,
         count(*) FILTER (WHERE d.kind = 'measured' AND d.late_minutes > 0)::int,
         COALESCE(sum(d.late_minutes) FILTER (WHERE d.kind = 'measured'), 0)::int,
         count(*) FILTER (WHERE d.kind = 'measured' AND d.early_minutes > v_cfg.grace_minutes)::int,
         COALESCE(sum(d.early_minutes) FILTER (WHERE d.kind = 'measured' AND d.early_minutes > v_cfg.grace_minutes), 0)::int,
         count(*) FILTER (WHERE d.kind = 'no_out')::int,
         count(*) FILTER (WHERE d.kind = 'absent')::int,
         count(*) FILTER (WHERE d.kind = 'leave')::int,
         count(*) FILTER (WHERE d.kind = 'unmeasured')::int,
         COALESCE(sum(d.worked_minutes) FILTER (WHERE d.kind = 'off_day'), 0)::int,
         v_hi
  FROM public._time_days(p_company, v_m0, v_hi, p_employee, p_department) d
  JOIN public.employees e ON e.id = d.employee_id
  WHERE e.status IN ('active', 'on_leave') OR d.punches > 0 OR d.register IS NOT NULL
  GROUP BY d.employee_id;
END;
$$;
REVOKE ALL ON FUNCTION public._time_hours(uuid, date, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.time_hours_report(p_month date, p_department uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_cfg public.time_settings;
  v_rows jsonb;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  v_cfg := public._time_cfg(v_company);
  SELECT COALESCE(jsonb_agg(to_jsonb(h) || jsonb_build_object(
           'name', e.name, 'code', e.employee_code, 'rank', e.rank, 'department', dep.name,
           'department_id', e.department_id, 'avatar_url', e.avatar_url, 'shift_type', COALESCE(e.shift_type, 'morning'))
         ORDER BY h.pct NULLS LAST, e.name), '[]'::jsonb)
  INTO v_rows
  FROM public._time_hours(v_company, COALESCE(p_month, now()::date), NULL, p_department) h
  JOIN public.employees e ON e.id = h.employee_id
  LEFT JOIN public.departments dep ON dep.id = e.department_id;

  RETURN jsonb_build_object(
    'month', date_trunc('month', COALESCE(p_month, now()::date))::date,
    'threshold', v_cfg.hours_threshold_pct,
    'grace_minutes', v_cfg.grace_minutes,
    'rows', v_rows
  );
END;
$$;

-- Day-by-day log for exports (HR / owner), at most 92 days.
CREATE OR REPLACE FUNCTION public.time_day_log(p_from date, p_to date, p_department uuid DEFAULT NULL, p_employee uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_rows jsonb;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 92 THEN
    RAISE EXCEPTION 'Pick a range of at most 93 days' USING ERRCODE = '22023';
  END IF;
  IF p_employee IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee AND company_id = v_company) THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(d) || jsonb_build_object(
           'name', e.name, 'code', e.employee_code, 'rank', e.rank, 'department', dep.name,
           'shift_type', COALESCE(e.shift_type, 'morning'), 'note', a.note)
         ORDER BY d.work_date, e.name), '[]'::jsonb)
  INTO v_rows
  FROM public._time_days(v_company, p_from, p_to, p_employee, p_department) d
  JOIN public.employees e ON e.id = d.employee_id
  LEFT JOIN public.departments dep ON dep.id = e.department_id
  LEFT JOIN public.attendance a ON a.employee_id = d.employee_id AND a.date = d.work_date
  WHERE d.working OR d.punches > 0 OR d.register IS NOT NULL;
  RETURN v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- One person's month (shared by the staff page and the portal).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._time_employee_month(p_company uuid, p_employee uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_m0 date := date_trunc('month', COALESCE(p_month, now()::date))::date;
  v_m1 date := (date_trunc('month', COALESCE(p_month, now()::date)) + interval '1 month - 1 day')::date;
  v_today date := public._time_today(p_company);
  v_cfg public.time_settings := public._time_cfg(p_company);
  e public.employees;
  v_days jsonb;
  v_summary jsonb;
BEGIN
  SELECT * INTO e FROM public.employees WHERE id = p_employee AND company_id = p_company;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'P0002';
  END IF;

  WITH cal AS (
    SELECT gs::date AS d FROM generate_series(v_m0, v_m1, interval '1 day') gs
  ),
  wd AS (SELECT w AS d FROM public.working_dates(p_company, v_m0, v_m1, p_employee) w),
  dp AS (SELECT * FROM public._time_day_punches(p_company, v_m0, v_m1, p_employee)),
  dayrows AS (
    SELECT c.d,
           (wd.d IS NOT NULL) AS working,
           (e.joining_date IS NOT NULL AND c.d < e.joining_date) OR (e.separation_date IS NOT NULL AND c.d > e.separation_date) AS outside,
           public._time_on_leave(p_employee, c.d) AS on_leave,
           a.status, a.note, a.source,
           dp.first_in, dp.last_out, dp.punches, dp.corrected,
           public._time_locked(p_company, p_employee, c.d) AS locked,
           (SELECT jsonb_agg(jsonb_build_object('title', ev.title, 'type', ev.type, 'affects', ev.affects_attendance))
              FROM public.events ev WHERE ev.company_id = p_company AND c.d BETWEEN ev.date AND COALESCE(ev.end_date, ev.date)) AS events
    FROM cal c
    LEFT JOIN wd ON wd.d = c.d
    LEFT JOIN public.attendance a ON a.employee_id = p_employee AND a.date = c.d
    LEFT JOIN dp ON dp.work_date = c.d
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'date', r.d, 'dow', extract(isodow FROM r.d)::int, 'working', r.working, 'outside', r.outside,
      'future', r.d > v_today, 'on_leave', r.on_leave, 'status', CASE WHEN r.on_leave THEN 'leave' ELSE r.status END,
      'note', r.note, 'source', r.source, 'first_in', r.first_in, 'last_out', r.last_out,
      'worked_minutes', CASE WHEN r.first_in IS NOT NULL AND r.last_out IS NOT NULL THEN floor(extract(epoch FROM (r.last_out - r.first_in)) / 60)::int END,
      'punches', COALESCE(r.punches, 0), 'corrected', COALESCE(r.corrected, false), 'locked', r.locked,
      'events', COALESCE(r.events, '[]'::jsonb)
    ) ORDER BY r.d), '[]'::jsonb),
    jsonb_build_object(
      'working_days', count(*) FILTER (WHERE r.working),
      'working_days_so_far', count(*) FILTER (WHERE r.working AND r.d <= v_today),
      'present', count(*) FILTER (WHERE r.working AND r.d <= v_today AND NOT r.on_leave AND r.status IN ('present', 'late')),
      'half_day', count(*) FILTER (WHERE r.working AND r.d <= v_today AND NOT r.on_leave AND r.status = 'half_day'),
      'short_leave', count(*) FILTER (WHERE r.working AND r.d <= v_today AND NOT r.on_leave AND r.status = 'short_leave'),
      'leave', count(*) FILTER (WHERE r.working AND (r.on_leave OR r.status = 'leave')),
      'absent', count(*) FILTER (WHERE r.working AND r.d <= v_today AND NOT r.on_leave AND r.status = 'absent'),
      'unmarked', count(*) FILTER (WHERE r.working AND r.d < v_today AND NOT r.on_leave AND r.status IS NULL),
      'locked', bool_or(r.locked)
    )
  INTO v_days, v_summary
  FROM dayrows r;

  RETURN jsonb_build_object(
    'month', v_m0, 'today', v_today, 'timezone', v_cfg.timezone,
    'employee', jsonb_build_object('id', e.id, 'name', e.name, 'code', e.employee_code, 'rank', e.rank,
       'status', e.status, 'shift_type', COALESCE(e.shift_type, 'morning'), 'joining_date', e.joining_date,
       'separation_date', e.separation_date, 'avatar_url', e.avatar_url,
       'department', (SELECT dep.name FROM public.departments dep WHERE dep.id = e.department_id),
       'shift_start', to_char(public._time_shift_start(v_cfg, e.shift_type), 'HH24:MI'),
       'hours_per_day', COALESCE(NULLIF(e.working_hours_per_day, 0)::numeric, v_cfg.hours_per_day)),
    'days', v_days,
    'summary', v_summary,
    'hours', (SELECT to_jsonb(h) FROM public._time_hours(p_company, v_m0, p_employee) h LIMIT 1),
    'threshold', v_cfg.hours_threshold_pct
  );
END;
$$;
REVOKE ALL ON FUNCTION public._time_employee_month(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.time_employee_month(p_employee uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN public._time_employee_month(v_company, p_employee, p_month)
    || jsonb_build_object('can_edit', public.auth_is_hr());
END;
$$;

REVOKE ALL ON FUNCTION public.time_month_register(date, uuid), public.time_mark_attendance(jsonb),
  public.time_mark_all_present(date, uuid[]), public.time_daily_summary(date), public.time_hours_report(date, uuid),
  public.time_day_log(date, date, uuid, uuid), public.time_employee_month(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.time_month_register(date, uuid), public.time_mark_attendance(jsonb),
  public.time_mark_all_present(date, uuid[]), public.time_daily_summary(date), public.time_hours_report(date, uuid),
  public.time_day_log(date, date, uuid, uuid), public.time_employee_month(uuid, date)
  TO authenticated;
