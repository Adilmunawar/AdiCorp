-- Time: approved corrections win over the clock, night-shift arrivals after midnight land on the
-- right day, and the attendance timezone is the company timezone.
--
-- 1. _time_day_punches took min(in) / max(out) over every punch of the day, so an approved
--    "wrong time recorded" correction that moved the arrival later (or the departure earlier) was
--    silently ignored: the wrong clock punch stayed first in / last out. An approved correction
--    punch now replaces the clock in its direction. (Identical results on all existing history.)
-- 2. time_review_correction put a night-shift arrival before noon on the request day itself, which
--    belongs to the previous work date; it now lands on the next calendar day, like departures.
-- 3. time_save_settings changed time_settings.timezone only, so company_today() (portal, reports)
--    and the attendance "today" could disagree; the company timezone now follows.

CREATE OR REPLACE FUNCTION public._time_day_punches(p_company uuid, p_from date, p_to date, p_employee uuid DEFAULT NULL::uuid)
 RETURNS TABLE(employee_id uuid, work_date date, first_in timestamp with time zone, last_out timestamp with time zone, punches integer, corrected boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           -- An approved correction is the agreed time: it replaces what the clock recorded in that direction.
           COALESCE(min(p.punch_at) FILTER (WHERE p.source = 'correction' AND p.direction = 'in'),
                    min(p.punch_at) FILTER (WHERE p.direction <> 'out')) AS first_in,
           COALESCE(max(p.punch_at) FILTER (WHERE p.source = 'correction' AND p.direction = 'out'),
                    max(p.punch_at) FILTER (WHERE p.direction <> 'in')) AS last_any,
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
$function$;

CREATE OR REPLACE FUNCTION public.time_review_correction(p_id uuid, p_decision text, p_time_in text DEFAULT NULL::text, p_time_out text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
  c public.punch_corrections;
  e public.employees;
  v_in time;
  v_out time;
  v_note text := left(NULLIF(btrim(p_note), ''), 300);
  v_tz text;
  v_pin text;
  v_at timestamptz;
  v_marked boolean := false;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can review punch corrections' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decide approve or reject' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.punch_corrections WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already %', c.status USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM public.employees WHERE id = c.employee_id;

  IF p_decision = 'reject' THEN
    UPDATE public.punch_corrections SET status = 'rejected', review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = c.id;
    PERFORM public.notify_employee(v_company, e.id, 'time.correction', 'Punch correction not approved',
      format('%s on %s%s', public._time_kind_label(c.kind), to_char(c.date, 'FMDD Mon YYYY'), COALESCE(': ' || v_note, '')),
      '/portal/attendance');
    PERFORM public.log_activity('correction.rejected', format('Rejected the punch correction of %s for %s', e.name, to_char(c.date, 'FMDD Mon YYYY')),
      jsonb_build_object('correction_id', c.id, 'note', v_note), e.id);
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF public._time_locked(v_company, e.id, c.date) THEN
    RAISE EXCEPTION 'That month is locked; unlock it before approving' USING ERRCODE = '22023';
  END IF;
  SELECT x.v_in, x.v_out INTO v_in, v_out
  FROM public._time_check_correction(c.kind,
         COALESCE(NULLIF(p_time_in, ''), to_char(c.time_in, 'HH24:MI')),
         COALESCE(NULLIF(p_time_out, ''), to_char(c.time_out, 'HH24:MI'))) x;

  v_tz := public._time_tz(v_company);
  SELECT l.device_user_id INTO v_pin FROM public.time_terminal_links l WHERE l.employee_id = e.id;
  v_pin := COALESCE(v_pin, 'EMP-' || left(replace(e.id::text, '-', ''), 12));

  IF v_in IS NOT NULL THEN
    -- A night shift belongs to the evening it starts on: an arrival before noon is after midnight.
    v_at := (((c.date + CASE WHEN e.shift_type = 'night' AND v_in < '12:00'::time THEN 1 ELSE 0 END) + v_in) AT TIME ZONE v_tz);
    INSERT INTO public.time_punches (company_id, employee_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source, correction_id)
    VALUES (v_company, e.id, 'CORRECTION', v_pin, v_at, (v_at AT TIME ZONE v_tz)::date, 'in', 'correction', 'correction', c.id)
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_out IS NOT NULL THEN
    v_at := ((c.date + v_out) AT TIME ZONE v_tz);
    IF e.shift_type = 'night' AND v_out < '12:00'::time THEN
      v_at := v_at + interval '1 day';
    END IF;
    INSERT INTO public.time_punches (company_id, employee_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source, correction_id)
    VALUES (v_company, e.id, 'CORRECTION', v_pin, v_at, (v_at AT TIME ZONE v_tz)::date, 'out', 'correction', 'correction', c.id)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.punch_corrections SET status = 'approved', time_in = v_in, time_out = v_out, review_note = v_note,
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = c.id;

  IF (public._time_cfg(v_company)).auto_present THEN
    v_marked := public._time_auto_present(v_company, e.id, c.date, 'correction');
  END IF;

  PERFORM public.notify_employee(v_company, e.id, 'time.correction', 'Punch correction approved',
    format('%s on %s%s', public._time_kind_label(c.kind), to_char(c.date, 'FMDD Mon YYYY'), COALESCE(': ' || v_note, '')),
    '/portal/attendance');
  PERFORM public.log_activity('correction.approved', format('Approved the punch correction of %s for %s', e.name, to_char(c.date, 'FMDD Mon YYYY')),
    jsonb_build_object('correction_id', c.id, 'time_in', v_in, 'time_out', v_out, 'marked_present', v_marked), e.id);
  RETURN jsonb_build_object('status', 'approved', 'marked_present', v_marked);
END;
$function$;

CREATE OR REPLACE FUNCTION public.time_save_settings(p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- One company clock: company_today() (portal, reports, letters) reads the company timezone.
  UPDATE public.companies SET timezone = t.timezone
  WHERE id = v_company AND timezone IS DISTINCT FROM t.timezone;

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
$function$;
