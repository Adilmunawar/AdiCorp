-- ============================================================================
-- Performance fixes for 500 employees x 3 years.
--
-- Additive only: CREATE INDEX IF NOT EXISTS / CREATE OR REPLACE FUNCTION. Nothing is dropped,
-- no rows change, no policy is touched. Every rewritten function returns exactly what it
-- returned before (verified row-for-row against live data before this was applied).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------------

-- time_terminal_ids(): "last punch per terminal ID" becomes a one-row backward index probe
-- per link instead of a scan of every punch that ID ever made.
CREATE INDEX IF NOT EXISTS idx_time_punches_company_pin_at
  ON public.time_punches (company_id, device_user_id, punch_at DESC);

-- time_terminal_ids(): unmatched terminal IDs are the rows with no employee, a tiny slice of
-- the table that grows only while an ID stays unlinked.
CREATE INDEX IF NOT EXISTS idx_time_punches_company_pin_unmatched
  ON public.time_punches (company_id, device_user_id)
  WHERE employee_id IS NULL;

-- _time_days() / _time_on_leave(): approved leave looked up by employee and date range.
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_status_range
  ON public.leave_requests (employee_id, status, start_date, end_date);

-- platform_activity_feed(): description ILIKE '%term%' can use a trigram index.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm is not available (%); activity search stays a sequential scan.', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activity_logs_description_trgm ON public.activity_logs USING gin (description extensions.gin_trgm_ops)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. _time_days(): set-based.
--
-- Before: for every (employee, day) a correlated _time_on_leave() call (two EXISTS each) and,
-- per employee, a LATERAL working_dates() call that re-read company settings and events.
-- Now: the company calendar (events, weekend rules) is computed once per day, approved leave
-- is expanded once by range, attendance and punches are left-joined once, and the shift start
-- is precomputed per employee. The weekend logic is the same expression working_dates() uses,
-- with the employee's own weekend overrides applied in the join.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._time_days(p_company uuid, p_from date, p_to date, p_employee uuid DEFAULT NULL::uuid, p_department uuid DEFAULT NULL::uuid)
 RETURNS TABLE(employee_id uuid, work_date date, working boolean, kind text, register text, register_source text, first_in timestamp with time zone, last_out timestamp with time zone, punches integer, corrected boolean, shift_start timestamp with time zone, shift_end timestamp with time zone, target_minutes integer, worked_minutes integer, late_minutes integer, early_minutes integer, half boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cfg public.time_settings := public._time_cfg(p_company);
  v_today date := public._time_today(p_company);
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'Pick a range of at most 400 days' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH emps AS (
    SELECT e.id, e.shift_type, e.joining_date, e.separation_date, e.weekend_saturday, e.weekend_sunday,
           COALESCE(NULLIF(e.working_hours_per_day, 0)::numeric, v_cfg.hours_per_day) AS hpd,
           public._time_shift_start(v_cfg, e.shift_type) AS sstart
    FROM public.employees e
    WHERE e.company_id = p_company
      AND (p_employee IS NULL OR e.id = p_employee)
      AND (p_department IS NULL OR e.department_id = p_department)
  ),
  -- Company weekend rules, read exactly as public.working_dates() reads them.
  s AS (
    SELECT COALESCE(c.weekend_saturday, false) AS sat_off,
           COALESCE(c.weekend_sunday, true) AS sun_off,
           COALESCE(c.saturday_pattern, 'all') AS sat_pattern,
           c.saturday_off_from AS sat_from,
           c.saturday_off_until AS sat_until
    FROM (SELECT 1) AS one
    LEFT JOIN public.company_working_settings c ON c.company_id = p_company
  ),
  ev AS (
    SELECT e.date AS d0, COALESCE(e.end_date, e.date) AS d1, (e.type = 'working_day') AS extra
    FROM public.events e
    WHERE e.company_id = p_company
      AND e.date <= p_to AND COALESCE(e.end_date, e.date) >= p_from
      AND (e.type = 'working_day' OR (e.type IN ('holiday', 'off_day') AND e.affects_attendance))
  ),
  -- The company calendar once per day (not once per employee x day).
  cal AS (
    SELECT g.d,
           EXISTS (SELECT 1 FROM ev WHERE NOT ev.extra AND g.d BETWEEN ev.d0 AND ev.d1) AS blocked,
           EXISTS (SELECT 1 FROM ev WHERE ev.extra AND g.d BETWEEN ev.d0 AND ev.d1) AS extra,
           extract(isodow FROM g.d)::int AS dow,
           s.sun_off AS co_sun_off,
           (s.sat_off
             AND (s.sat_from IS NULL OR g.d >= s.sat_from)
             AND (s.sat_until IS NULL OR g.d <= s.sat_until)
             AND (s.sat_pattern = 'all'
                  OR (s.sat_pattern = 'alt_2_4' AND ((extract(day FROM g.d)::int - 1) / 7 + 1) IN (2, 4))
                  OR (s.sat_pattern = 'alt_1_3_5' AND ((extract(day FROM g.d)::int - 1) / 7 + 1) IN (1, 3, 5)))) AS co_sat_off
    FROM s, LATERAL (SELECT gs::date AS d FROM generate_series(p_from, p_to, interval '1 day') gs) g
  ),
  -- Approved leave expanded to (employee, day) once for the whole range.
  lv AS (
    SELECT DISTINCT lr.employee_id AS emp_id, gs::date AS d
    FROM public.leave_requests lr
    JOIN emps em ON em.id = lr.employee_id
    CROSS JOIN LATERAL generate_series(GREATEST(lr.start_date, p_from), LEAST(lr.end_date, p_to), interval '1 day') gs
    WHERE lr.status::text = 'approved' AND lr.start_date <= p_to AND lr.end_date >= p_from
  ),
  dp AS (SELECT * FROM public._time_day_punches(p_company, p_from, p_to, p_employee)),
  base AS (
    SELECT em.id AS emp_id, c.d, em.shift_type, em.hpd,
           (NOT c.blocked AND (c.extra OR NOT (
              (c.dow = 7 AND COALESCE(em.weekend_sunday, c.co_sun_off))
              OR (c.dow = 6 AND COALESCE(em.weekend_saturday, c.co_sat_off))))) AS is_working,
           (lv.d IS NOT NULL OR COALESCE(a.status = 'leave' AND a.source = 'leave', false)) AS on_leave,
           a.status AS reg, a.source AS reg_src,
           dp.first_in AS fi, dp.last_out AS lo, COALESCE(dp.punches, 0) AS np, COALESCE(dp.corrected, false) AS corr,
           ((c.d + em.sstart) AT TIME ZONE v_cfg.timezone) AS s_start
    FROM emps em
    JOIN cal c ON c.d >= GREATEST(p_from, COALESCE(em.joining_date, p_from))
              AND c.d <= LEAST(p_to, COALESCE(em.separation_date, p_to))
    LEFT JOIN lv ON lv.emp_id = em.id AND lv.d = c.d
    LEFT JOIN public.attendance a ON a.employee_id = em.id AND a.date = c.d
    LEFT JOIN dp ON dp.employee_id = em.id AND dp.work_date = c.d
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
$function$;

-- ---------------------------------------------------------------------------
-- 3. time_terminal_ids(): the last punch per linked terminal ID is one backward probe of
-- idx_time_punches_company_pin_at (LIMIT 1) per link, so the cost follows the number of
-- links, not the number of punches. The rest of the function is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_terminal_ids()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'linked', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'device_user_id', l.device_user_id, 'employee_id', l.employee_id, 'name', e.name, 'code', e.employee_code,
        'auto', l.auto, 'linked_at', l.created_at,
        'last_punch', lp.last_at
      ) ORDER BY e.name)
      FROM public.time_terminal_links l
      JOIN public.employees e ON e.id = l.employee_id
      LEFT JOIN LATERAL (
        SELECT max(tp.punch_at) AS last_at
        FROM public.time_punches tp
        WHERE tp.company_id = l.company_id AND tp.device_user_id = l.device_user_id
      ) lp ON true
      WHERE l.company_id = v_company
    ), '[]'::jsonb),
    'unmatched', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'device_user_id', u.pin, 'punches', u.n, 'last_punch', u.last_at,
        'suggestion', (
          SELECT jsonb_build_object('employee_id', e.id, 'name', e.name, 'code', e.employee_code)
          FROM public.employees e
          WHERE e.company_id = v_company AND e.status IN ('active', 'on_leave')
            AND (lower(e.employee_code) = lower(u.pin) OR regexp_replace(COALESCE(e.cnic, ''), '\D', '', 'g') = u.pin)
            AND NOT EXISTS (SELECT 1 FROM public.time_terminal_links l2 WHERE l2.employee_id = e.id)
          LIMIT 1)
      ) ORDER BY u.last_at DESC)
      FROM (
        SELECT tp.device_user_id AS pin, count(*)::int AS n, max(tp.punch_at) AS last_at
        FROM public.time_punches tp
        WHERE tp.company_id = v_company AND tp.employee_id IS NULL AND tp.source <> 'correction'
        GROUP BY tp.device_user_id
      ) u
    ), '[]'::jsonb),
    'not_linked', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('employee_id', e.id, 'name', e.name, 'code', e.employee_code) ORDER BY e.name)
      FROM public.employees e
      WHERE e.company_id = v_company AND e.status IN ('active', 'on_leave')
        AND NOT EXISTS (SELECT 1 FROM public.time_terminal_links l WHERE l.employee_id = e.id)
    ), '[]'::jsonb)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. time_correction_counts(): the Corrections page tab counts in one request (was: fetch up
-- to 5,000 status rows and count them in the browser).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_correction_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_hr() THEN
    RETURN jsonb_build_object('pending', 0, 'approved', 0, 'rejected', 0, 'withdrawn', 0, 'all', 0);
  END IF;
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE pc.status = 'pending'),
    'approved', count(*) FILTER (WHERE pc.status = 'approved'),
    'rejected', count(*) FILTER (WHERE pc.status = 'rejected'),
    'withdrawn', count(*) FILTER (WHERE pc.status = 'withdrawn'),
    'all', count(*)
  ) INTO v_out
  FROM public.punch_corrections pc
  WHERE pc.company_id = v_company;
  RETURN v_out;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. nav_badge_counts(): every sidebar badge in one request, keyed by nav item key.
--
-- Role-gated inside: HR-only counts are null for a finance user and finance-only counts are
-- null for HR; the owner sees both. Only counts leave this function, never amounts. Module
-- functions that already own a count (leave_badge_counts, people_badge_counts,
-- policies_unsigned_count, payroll_counts) are called rather than copied, so their rules stay
-- in one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nav_badge_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
  v_hr boolean := public.auth_is_hr();
  v_fin boolean := public.auth_is_finance();
  v_today date;
  v_leave json;
  v_people json;
  v_pay jsonb;
  v_out jsonb := jsonb_build_object(
    'careers.applicants', NULL, 'engagement.messages', NULL, 'engagement.complaints', NULL,
    'expenses.requests', NULL, 'leave.requests', NULL, 'leave.overtime', NULL,
    'people.updates', NULL, 'people.documents', NULL, 'people.onboarding', NULL,
    'policies.policies', NULL, 'policies.letters', NULL, 'time.corrections', NULL,
    'expenses.finance', NULL, 'payroll.updates', NULL, 'payroll.overtime', NULL
  );
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RETURN v_out;
  END IF;
  v_today := public.company_today(v_company);

  IF v_hr THEN
    v_leave := public.leave_badge_counts();
    v_people := public.people_badge_counts();
    v_out := v_out || jsonb_build_object(
      'careers.applicants', (SELECT count(*) FROM public.job_applications a WHERE a.company_id = v_company AND a.status = 'new'),
      'engagement.messages', (SELECT count(*) FROM public.messages m WHERE m.company_id = v_company AND m.sender_kind = 'employee' AND m.read_at IS NULL),
      'engagement.complaints', (SELECT count(*) FROM public.complaints c WHERE c.company_id = v_company AND c.status = 'pending'),
      'expenses.requests', (SELECT count(*) FROM public.expenses x WHERE x.company_id = v_company AND x.source = 'request' AND x.status = 'pending'),
      'leave.requests', COALESCE((v_leave ->> 'leave')::int, 0),
      'leave.overtime', COALESCE((v_leave ->> 'overtime')::int, 0),
      'people.updates', COALESCE((v_people ->> 'pending_updates')::int, 0),
      'people.documents', COALESCE((v_people ->> 'missing_documents')::int, 0),
      'people.onboarding', COALESCE((v_people ->> 'overdue_checklists')::int, 0),
      'policies.policies', COALESCE(public.policies_unsigned_count(), 0),
      'policies.letters', (SELECT count(*) FROM public.hr_letters h
                           WHERE h.company_id = v_company AND h.withdrawn_at IS NULL AND h.replied_at IS NULL AND h.reply_by < v_today),
      'time.corrections', (SELECT count(*) FROM public.punch_corrections pc WHERE pc.company_id = v_company AND pc.status = 'pending')
    );
  END IF;

  IF v_fin THEN
    v_pay := public.payroll_counts();
    v_out := v_out || jsonb_build_object(
      -- Same rule as the Finance "To pay" tab: approved items plus renewals due within 7 days.
      'expenses.finance', (SELECT count(*) FROM public.expenses x
                           WHERE x.company_id = v_company
                             AND (x.status = 'approved' OR (x.status = 'active' AND x.renews_on <= v_today + 7))),
      'payroll.updates', COALESCE((v_pay ->> 'open_events')::int, 0),
      'payroll.overtime', COALESCE((v_pay ->> 'overtime_waiting')::int, 0)
    );
  END IF;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.nav_badge_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.nav_badge_counts() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.time_correction_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.time_correction_counts() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Morning greetings: run hourly at minute 0 and act only for companies whose local hour
-- is 9 (was: every 15 minutes, looping every company whose local hour was 9 or later).
-- The ON CONFLICT dedupe inside the function is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.engagement_send_morning_greetings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company record;
  v_local timestamp;
  v_today date;
  v_occ record;
  v_first text;
  v_title text;
  v_body text;
  v_done integer := 0;
BEGIN
  FOR v_company IN SELECT c.id, c.name, c.timezone FROM public.companies c LOOP
    -- 9 am on the company's own clock; a company with an unusable time zone is skipped, not the run.
    BEGIN
      v_local := now() AT TIME ZONE COALESCE(NULLIF(btrim(v_company.timezone), ''), 'UTC');
    EXCEPTION WHEN invalid_parameter_value THEN
      CONTINUE;
    END;
    IF extract(hour FROM v_local) <> 9 THEN
      CONTINUE;
    END IF;
    v_today := v_local::date;
    FOR v_occ IN SELECT * FROM public._engagement_occasions(v_company.id, v_today, v_today) LOOP
      INSERT INTO public.celebration_greetings (company_id, employee_id, kind, occasion_date)
      VALUES (v_company.id, v_occ.employee_id, v_occ.kind, v_today)
      ON CONFLICT (employee_id, kind, occasion_date) DO NOTHING;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      v_first := split_part(btrim(v_occ.name), ' ', 1);
      IF v_occ.kind = 'birthday' THEN
        v_title := format('Happy birthday, %s! 🎂', v_first);
        v_body := format('Everyone at %s wishes you a wonderful year ahead.', v_company.name);
      ELSIF v_occ.kind = 'anniversary' THEN
        v_title := format('Happy work anniversary, %s! 🎉', v_first);
        v_body := format('%s %s at %s today. Thank you for all you do.', v_occ.years, CASE WHEN v_occ.years = 1 THEN 'year' ELSE 'years' END, v_company.name);
      ELSE
        v_title := format('Welcome to %s, %s! 👋', v_company.name, v_first);
        v_body := 'Today is your first day. We are glad you are here.';
      END IF;
      PERFORM public.notify_employee(v_company.id, v_occ.employee_id, 'celebration', v_title, v_body, '/portal/celebrations');
      v_done := v_done + 1;
    END LOOP;
  END LOOP;
  RETURN v_done;
END;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'engagement-morning-greetings') THEN
      PERFORM cron.unschedule('engagement-morning-greetings');
    END IF;
    PERFORM cron.schedule('engagement-morning-greetings', '0 * * * *', 'SELECT public.engagement_send_morning_greetings()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not reschedule the morning greetings (%).', SQLERRM;
END $$;
