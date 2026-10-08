-- Time module 2/4: internal helpers, working_dates(), time settings, calendar events.

-- ---------------------------------------------------------------------------
-- Internal helpers (definer, not callable by clients)
-- ---------------------------------------------------------------------------

-- Company timezone: the saved one, else Asia/Karachi for PKR companies, else UTC.
CREATE OR REPLACE FUNCTION public._time_tz(p_company uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT ts.timezone FROM public.time_settings ts WHERE ts.company_id = p_company),
    (SELECT CASE WHEN upper(c.currency) = 'PKR' THEN 'Asia/Karachi' ELSE 'UTC' END FROM public.companies c WHERE c.id = p_company),
    'UTC'
  );
$$;

-- Today's date in the company timezone.
CREATE OR REPLACE FUNCTION public._time_today(p_company uuid)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE public._time_tz(p_company))::date;
$$;

-- Settings row with defaults; creates it on first use.
CREATE OR REPLACE FUNCTION public._time_settings(p_company uuid)
RETURNS public.time_settings
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.time_settings;
BEGIN
  SELECT * INTO v FROM public.time_settings WHERE company_id = p_company;
  IF NOT FOUND THEN
    INSERT INTO public.time_settings (company_id, timezone)
    VALUES (p_company, public._time_tz(p_company))
    ON CONFLICT (company_id) DO NOTHING;
    SELECT * INTO v FROM public.time_settings WHERE company_id = p_company;
  END IF;
  RETURN v;
END;
$$;

-- Read-only variant (never writes): defaults when the row does not exist yet.
CREATE OR REPLACE FUNCTION public._time_cfg(p_company uuid)
RETURNS public.time_settings
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.time_settings;
BEGIN
  SELECT * INTO v FROM public.time_settings WHERE company_id = p_company;
  IF NOT FOUND THEN
    v.company_id := p_company;
    v.timezone := public._time_tz(p_company);
    v.morning_start := '09:00';
    v.evening_start := '15:00';
    v.night_start := '21:00';
    v.hours_per_day := 8;
    v.grace_minutes := 15;
    v.auto_present := true;
    v.hours_threshold_pct := 90;
  END IF;
  RETURN v;
END;
$$;

-- Shift start for a shift type under the given settings.
CREATE OR REPLACE FUNCTION public._time_shift_start(p_cfg public.time_settings, p_shift text)
RETURNS time
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_shift WHEN 'evening' THEN p_cfg.evening_start WHEN 'night' THEN p_cfg.night_start ELSE p_cfg.morning_start END;
$$;

-- True when attendance for that employee/day may no longer change: the company locked the month,
-- or the person's payslip for the month is final/paid (payroll may add payslips.status later; a
-- payslip without a status column counts as issued).
CREATE OR REPLACE FUNCTION public._time_locked(p_company uuid, p_employee uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT p_date <= ts.locked_through FROM public.time_settings ts WHERE ts.company_id = p_company), false)
      OR EXISTS (
        SELECT 1 FROM public.payslips p
        WHERE p.employee_id = p_employee
          AND p.company_id = p_company
          AND p.month >= date_trunc('month', p_date)::date
          AND p.month < (date_trunc('month', p_date) + interval '1 month')::date
          AND COALESCE(to_jsonb(p) ->> 'status', 'final') IN ('final', 'paid', 'published', 'locked')
      );
$$;

-- Approved leave covering a day (from leave requests, or a leave row written by the leave module).
CREATE OR REPLACE FUNCTION public._time_on_leave(p_employee uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leave_requests lr
    WHERE lr.employee_id = p_employee AND lr.status::text = 'approved'
      AND p_date BETWEEN lr.start_date AND lr.end_date
  ) OR EXISTS (
    SELECT 1 FROM public.attendance a
    WHERE a.employee_id = p_employee AND a.date = p_date AND a.status = 'leave' AND a.source = 'leave'
  );
$$;

REVOKE ALL ON FUNCTION public._time_tz(uuid), public._time_today(uuid), public._time_settings(uuid),
  public._time_cfg(uuid), public._time_shift_start(public.time_settings, text),
  public._time_locked(uuid, uuid, date), public._time_on_leave(uuid, date)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- working_dates: the one definition of a working day, used by time, leave and payroll.
-- A date is a working date when it is inside employment (for an employee), is not a holiday or
-- company off day that affects attendance, and either an extra working day covers it or it is not
-- a weekend. Weekends: Sunday per employee override or company rule; Saturday per employee
-- override, else the company rule (pattern + optional window). SECURITY INVOKER: callers only see
-- their own company's calendar through RLS; definer RPCs call it with full visibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.working_dates(p_company uuid, p_from date, p_to date, p_employee uuid DEFAULT NULL)
RETURNS SETOF date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH s AS (
    SELECT COALESCE(c.weekend_saturday, false) AS sat_off,
           COALESCE(c.weekend_sunday, true) AS sun_off,
           COALESCE(c.saturday_pattern, 'all') AS sat_pattern,
           c.saturday_off_from AS sat_from,
           c.saturday_off_until AS sat_until
    FROM (SELECT 1) AS one
    LEFT JOIN public.company_working_settings c ON c.company_id = p_company
  ),
  emp AS (
    SELECT e.joining_date, e.separation_date, e.weekend_saturday, e.weekend_sunday
    FROM public.employees e
    WHERE p_employee IS NOT NULL AND e.id = p_employee AND e.company_id = p_company
  ),
  b AS (
    SELECT GREATEST(p_from, COALESCE((SELECT emp.joining_date FROM emp), p_from)) AS lo,
           LEAST(p_to, COALESCE((SELECT emp.separation_date FROM emp), p_to), p_from + 1830) AS hi
  ),
  ev AS (
    SELECT e.date AS d0, COALESCE(e.end_date, e.date) AS d1, (e.type = 'working_day') AS extra
    FROM public.events e
    WHERE e.company_id = p_company
      AND e.date <= p_to AND COALESCE(e.end_date, e.date) >= p_from
      AND (e.type = 'working_day' OR (e.type IN ('holiday', 'off_day') AND e.affects_attendance))
  )
  SELECT g.d
  FROM b, s,
       LATERAL (SELECT gs::date AS d FROM generate_series(b.lo, b.hi, interval '1 day') AS gs) AS g
  WHERE p_from IS NOT NULL AND p_to IS NOT NULL
    AND (p_employee IS NULL OR EXISTS (SELECT 1 FROM emp))
    AND NOT EXISTS (SELECT 1 FROM ev WHERE NOT ev.extra AND g.d BETWEEN ev.d0 AND ev.d1)
    AND (
      EXISTS (SELECT 1 FROM ev WHERE ev.extra AND g.d BETWEEN ev.d0 AND ev.d1)
      OR NOT (
        (extract(isodow FROM g.d) = 7 AND COALESCE((SELECT emp.weekend_sunday FROM emp), s.sun_off))
        OR (extract(isodow FROM g.d) = 6 AND COALESCE(
              (SELECT emp.weekend_saturday FROM emp),
              s.sat_off
                AND (s.sat_from IS NULL OR g.d >= s.sat_from)
                AND (s.sat_until IS NULL OR g.d <= s.sat_until)
                AND (s.sat_pattern = 'all'
                     OR (s.sat_pattern = 'alt_2_4' AND ((extract(day FROM g.d)::int - 1) / 7 + 1) IN (2, 4))
                     OR (s.sat_pattern = 'alt_1_3_5' AND ((extract(day FROM g.d)::int - 1) / 7 + 1) IN (1, 3, 5)))
            ))
      )
    )
  ORDER BY g.d;
$$;
REVOKE ALL ON FUNCTION public.working_dates(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.working_dates(uuid, date, date, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Settings: read (any staff) and save (HR / owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_get_settings()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v public.time_settings;
  w public.company_working_settings;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  v := public._time_settings(v_company);
  INSERT INTO public.company_working_settings (company_id) VALUES (v_company) ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO w FROM public.company_working_settings WHERE company_id = v_company;
  RETURN jsonb_build_object(
    'timezone', v.timezone,
    'morning_start', to_char(v.morning_start, 'HH24:MI'),
    'evening_start', to_char(v.evening_start, 'HH24:MI'),
    'night_start', to_char(v.night_start, 'HH24:MI'),
    'hours_per_day', v.hours_per_day,
    'grace_minutes', v.grace_minutes,
    'auto_present', v.auto_present,
    'hours_threshold_pct', v.hours_threshold_pct,
    'locked_through', v.locked_through,
    'weekend_sunday', COALESCE(w.weekend_sunday, true),
    'weekend_saturday', COALESCE(w.weekend_saturday, false),
    'saturday_pattern', COALESCE(w.saturday_pattern, 'all'),
    'saturday_off_from', w.saturday_off_from,
    'saturday_off_until', w.saturday_off_until,
    'today', public._time_today(v_company)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.time_save_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_before jsonb;
  v_after jsonb;
  v_changes jsonb := '{}'::jsonb;
  k text;
  t public.time_settings;
  w public.company_working_settings;
  v_today date;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can change time settings' USING ERRCODE = '42501';
  END IF;
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'Settings must be an object' USING ERRCODE = '22023';
  END IF;

  v_before := public.time_get_settings();
  t := public._time_settings(v_company);
  SELECT * INTO w FROM public.company_working_settings WHERE company_id = v_company;
  v_today := public._time_today(v_company);

  IF p_settings ? 'timezone' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_settings ->> 'timezone') THEN
      RAISE EXCEPTION 'Unknown timezone' USING ERRCODE = '22023';
    END IF;
    t.timezone := p_settings ->> 'timezone';
  END IF;
  IF p_settings ? 'morning_start' THEN t.morning_start := (p_settings ->> 'morning_start')::time; END IF;
  IF p_settings ? 'evening_start' THEN t.evening_start := (p_settings ->> 'evening_start')::time; END IF;
  IF p_settings ? 'night_start' THEN t.night_start := (p_settings ->> 'night_start')::time; END IF;
  IF p_settings ? 'hours_per_day' THEN
    t.hours_per_day := round((p_settings ->> 'hours_per_day')::numeric * 2) / 2;
    IF t.hours_per_day < 1 OR t.hours_per_day > 16 THEN
      RAISE EXCEPTION 'Hours per day must be between 1 and 16' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_settings ? 'grace_minutes' THEN
    t.grace_minutes := (p_settings ->> 'grace_minutes')::integer;
    IF t.grace_minutes < 0 OR t.grace_minutes > 180 THEN
      RAISE EXCEPTION 'Grace must be between 0 and 180 minutes' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_settings ? 'auto_present' THEN t.auto_present := (p_settings ->> 'auto_present')::boolean; END IF;
  IF p_settings ? 'hours_threshold_pct' THEN
    t.hours_threshold_pct := (p_settings ->> 'hours_threshold_pct')::integer;
    IF t.hours_threshold_pct < 50 OR t.hours_threshold_pct > 100 THEN
      RAISE EXCEPTION 'Threshold must be between 50 and 100 percent' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_settings ? 'weekend_sunday' THEN w.weekend_sunday := (p_settings ->> 'weekend_sunday')::boolean; END IF;
  IF p_settings ? 'saturday_pattern' THEN
    IF (p_settings ->> 'saturday_pattern') NOT IN ('all', 'alt_2_4', 'alt_1_3_5') THEN
      RAISE EXCEPTION 'Unknown Saturday pattern' USING ERRCODE = '22023';
    END IF;
    w.saturday_pattern := p_settings ->> 'saturday_pattern';
  END IF;
  IF p_settings ? 'saturday_off_from' THEN w.saturday_off_from := NULLIF(p_settings ->> 'saturday_off_from', '')::date; END IF;
  IF p_settings ? 'saturday_off_until' THEN w.saturday_off_until := NULLIF(p_settings ->> 'saturday_off_until', '')::date; END IF;
  IF p_settings ? 'weekend_saturday' THEN
    -- Switching Saturdays off with no start date starts the rule today, so Saturdays already worked stay working days.
    IF (p_settings ->> 'weekend_saturday')::boolean AND NOT COALESCE(w.weekend_saturday, false)
       AND w.saturday_off_from IS NULL THEN
      w.saturday_off_from := v_today;
    END IF;
    w.weekend_saturday := (p_settings ->> 'weekend_saturday')::boolean;
  END IF;
  IF w.saturday_off_from IS NOT NULL AND w.saturday_off_until IS NOT NULL AND w.saturday_off_until < w.saturday_off_from THEN
    RAISE EXCEPTION 'The last Saturday off must be after the first' USING ERRCODE = '22023';
  END IF;

  UPDATE public.time_settings SET
    timezone = t.timezone, morning_start = t.morning_start, evening_start = t.evening_start, night_start = t.night_start,
    hours_per_day = t.hours_per_day, grace_minutes = t.grace_minutes, auto_present = t.auto_present,
    hours_threshold_pct = t.hours_threshold_pct, updated_by = auth.uid(), updated_at = now()
  WHERE company_id = v_company;

  UPDATE public.company_working_settings SET
    weekend_sunday = COALESCE(w.weekend_sunday, true),
    weekend_saturday = COALESCE(w.weekend_saturday, false),
    saturday_pattern = COALESCE(w.saturday_pattern, 'all'),
    saturday_off_from = w.saturday_off_from,
    saturday_off_until = w.saturday_off_until,
    default_working_days_per_week = 7 - (CASE WHEN COALESCE(w.weekend_sunday, true) THEN 1 ELSE 0 END)
                                      - (CASE WHEN COALESCE(w.weekend_saturday, false) AND COALESCE(w.saturday_pattern, 'all') = 'all' THEN 1 ELSE 0 END),
    updated_at = now()
  WHERE company_id = v_company;

  v_after := public.time_get_settings();
  FOR k IN SELECT jsonb_object_keys(v_after) LOOP
    IF k <> 'today' AND (v_before -> k) IS DISTINCT FROM (v_after -> k) THEN
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_before -> k, 'to', v_after -> k));
    END IF;
  END LOOP;
  IF v_changes <> '{}'::jsonb THEN
    PERFORM public.log_activity('time.settings', 'Updated time and attendance settings', jsonb_build_object('changes', v_changes));
  END IF;
  RETURN v_after;
END;
$$;

-- Lock attendance through the end of a finished month (HR), or unlock (owner only).
CREATE OR REPLACE FUNCTION public.time_set_lock(p_month date)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_current date;
  v_new date;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can lock attendance' USING ERRCODE = '42501';
  END IF;
  v_current := (public._time_settings(v_company)).locked_through;
  v_new := CASE WHEN p_month IS NULL THEN NULL ELSE (date_trunc('month', p_month) + interval '1 month - 1 day')::date END;

  IF v_new IS NOT NULL AND v_new >= public._time_today(v_company) THEN
    RAISE EXCEPTION 'Only finished months can be locked' USING ERRCODE = '22023';
  END IF;
  IF (v_new IS NULL OR v_new < COALESCE(v_current, v_new)) AND v_current IS NOT NULL AND NOT public.auth_is_owner() THEN
    RAISE EXCEPTION 'Only the owner can unlock attendance' USING ERRCODE = '42501';
  END IF;

  UPDATE public.time_settings SET locked_through = v_new, updated_by = auth.uid(), updated_at = now()
  WHERE company_id = v_company;

  PERFORM public.log_activity(
    CASE WHEN v_new IS NULL OR v_new < COALESCE(v_current, v_new) THEN 'attendance.unlock' ELSE 'attendance.lock' END,
    CASE WHEN v_new IS NULL THEN 'Unlocked all attendance months'
         ELSE format('Attendance locked through %s', to_char(v_new, 'FMDD Mon YYYY')) END,
    jsonb_build_object('from', v_current, 'to', v_new));
  RETURN v_new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Calendar events (HR / owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_save_event(
  p_id uuid, p_title text, p_type text, p_date date, p_end_date date DEFAULT NULL,
  p_description text DEFAULT NULL, p_affects boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_title text := btrim(COALESCE(p_title, ''));
  v_end date := CASE WHEN p_end_date IS NULL OR p_end_date = p_date THEN NULL ELSE p_end_date END;
  v_affects boolean;
  v_id uuid;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage the calendar' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_title) < 2 OR char_length(v_title) > 160 THEN
    RAISE EXCEPTION 'Give the event a title (2 to 160 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('holiday', 'working_day', 'half_day', 'off_day', 'meeting', 'training') THEN
    RAISE EXCEPTION 'Unknown event type' USING ERRCODE = '22023';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Pick a date' USING ERRCODE = '22023';
  END IF;
  IF v_end IS NOT NULL AND (v_end < p_date OR v_end > p_date + 59) THEN
    RAISE EXCEPTION 'An event can last at most 60 days and must end after it starts' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NOT NULL AND char_length(p_description) > 1000 THEN
    RAISE EXCEPTION 'Keep the description under 1000 characters' USING ERRCODE = '22023';
  END IF;
  v_affects := COALESCE(p_affects, p_type IN ('holiday', 'off_day', 'half_day'));

  IF p_id IS NULL THEN
    INSERT INTO public.events (company_id, title, type, date, end_date, description, affects_attendance, created_by)
    VALUES (v_company, v_title, p_type, p_date, v_end, NULLIF(btrim(p_description), ''), v_affects, auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.log_activity('events.create', format('Added %s "%s" on %s', replace(p_type, '_', ' '), v_title, to_char(p_date, 'FMDD Mon YYYY')),
      jsonb_build_object('event_id', v_id, 'type', p_type, 'date', p_date, 'end_date', v_end));
  ELSE
    UPDATE public.events SET title = v_title, type = p_type, date = p_date, end_date = v_end,
      description = NULLIF(btrim(p_description), ''), affects_attendance = v_affects, updated_at = now()
    WHERE id = p_id AND company_id = v_company
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
    END IF;
    PERFORM public.log_activity('events.update', format('Updated "%s"', v_title),
      jsonb_build_object('event_id', v_id, 'type', p_type, 'date', p_date, 'end_date', v_end));
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.time_delete_event(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_ev public.events;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage the calendar' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.events WHERE id = p_id AND company_id = v_company RETURNING * INTO v_ev;
  IF v_ev.id IS NULL THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_activity('events.delete', format('Removed "%s" (%s)', v_ev.title, to_char(v_ev.date, 'FMDD Mon YYYY')),
    jsonb_build_object('event_id', v_ev.id, 'type', v_ev.type, 'date', v_ev.date));
END;
$$;

-- One-click fixed-date public holidays for a year, skipping dates that already have a holiday.
CREATE OR REPLACE FUNCTION public.time_add_standard_holidays(p_year integer, p_country text DEFAULT 'PK')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_count integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage the calendar' USING ERRCODE = '42501';
  END IF;
  IF p_year IS NULL OR p_year < 2020 OR p_year > 2040 THEN
    RAISE EXCEPTION 'Pick a year between 2020 and 2040' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_country, '') NOT IN ('PK', 'INTL') THEN
    RAISE EXCEPTION 'Unknown holiday list' USING ERRCODE = '22023';
  END IF;

  WITH list(md, title) AS (
    SELECT * FROM (VALUES
      ('02-05', 'Kashmir Solidarity Day'), ('03-23', 'Pakistan Day'), ('05-01', 'Labour Day'),
      ('08-14', 'Independence Day'), ('11-09', 'Iqbal Day'), ('12-25', 'Quaid-e-Azam Day')
    ) AS pk(md, title) WHERE p_country = 'PK'
    UNION ALL
    SELECT * FROM (VALUES
      ('01-01', 'New Year''s Day'), ('05-01', 'Labour Day'), ('12-25', 'Christmas Day')
    ) AS intl(md, title) WHERE p_country = 'INTL'
  ), ins AS (
    INSERT INTO public.events (company_id, title, type, date, affects_attendance, created_by, description)
    SELECT v_company, l.title, 'holiday', to_date(p_year::text || '-' || l.md, 'YYYY-MM-DD'), true, auth.uid(), 'Public holiday'
    FROM list l
    WHERE NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.company_id = v_company AND e.type = 'holiday'
        AND to_date(p_year::text || '-' || l.md, 'YYYY-MM-DD') BETWEEN e.date AND COALESCE(e.end_date, e.date)
    )
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM ins;

  PERFORM public.log_activity('events.holidays', format('Added %s standard holidays for %s', v_count, p_year),
    jsonb_build_object('year', p_year, 'list', p_country, 'added', v_count));
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.time_get_settings(), public.time_save_settings(jsonb), public.time_set_lock(date),
  public.time_save_event(uuid, text, text, date, date, text, boolean), public.time_delete_event(uuid),
  public.time_add_standard_holidays(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.time_get_settings(), public.time_save_settings(jsonb), public.time_set_lock(date),
  public.time_save_event(uuid, text, text, date, date, text, boolean), public.time_delete_event(uuid),
  public.time_add_standard_holidays(integer, text)
  TO authenticated;
