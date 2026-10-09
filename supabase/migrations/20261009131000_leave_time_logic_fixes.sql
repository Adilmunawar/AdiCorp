-- Leave and time: approvals keep the day's original mark, balances are enforced, cross-year leave
-- is charged to each year, night-shift corrections lock-check the work date, and one punch on two
-- clocks counts once.
--
-- 1. Approving leave over a day that already had an attendance row (present from the clock, late,
--    half day...) overwrote it, and moving the request back to pending deleted the row, so the
--    original mark was lost. attendance.prev_status / prev_source / prev_note now keep what the day
--    looked like before the approval, and the undo restores it instead of deleting.
-- 2. The leave balance was never enforced: an employee with 14 Annual days could file 20 and, with
--    auto-approval on, go to -6. Filing and approving a request of a limited type (days_per_year > 0,
--    or a custom allocation) is refused when the year's remaining days would go below zero; the
--    message states what remains. HR can approve anyway with p_force on leave_request_review and
--    leave_request_create. Existing signatures keep working: an extra overload with the p_force
--    parameter is added and the old one delegates with p_force = false (a DEFAULT on the new
--    overload would make the old calls ambiguous without dropping the old function).
-- 3. A request spanning New Year was charged entirely to the start year. Balance rows now count each
--    request's working days per calendar year. There is NO carry-over: days left in one year do not
--    move into the next, and a request's days in the next year come out of that year's allowance.
-- 4. time_review_correction lock-checked and auto-marked c.date even though the punch it writes may
--    land on the next calendar day (night shift). It now derives the work date from the punch it
--    writes, with the same rule _time_day_punches uses, and lock-checks and marks that date.
-- 5. _time_day_punches deduped per device only (the unique index is per device_ref), so the same
--    person on two clocks within one second counted as two punches. It now dedupes on
--    (employee_id, punch_at to the second); a correction punch wins over a clock punch at the same time.

-- ---------------------------------------------------------------------------
-- 1. Keep the day's original mark under an approved leave
-- ---------------------------------------------------------------------------

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS prev_status text,
  ADD COLUMN IF NOT EXISTS prev_source text,
  ADD COLUMN IF NOT EXISTS prev_note text;

COMMENT ON COLUMN public.attendance.prev_status IS 'What the day was marked before an approved leave took it over; restored when that approval is undone. NULL when the leave created the row.';
COMMENT ON COLUMN public.attendance.prev_source IS 'Source of the mark kept in prev_status.';
COMMENT ON COLUMN public.attendance.prev_note IS 'Note of the mark kept in prev_status.';

-- ---------------------------------------------------------------------------
-- 2 + 3. Balance helpers
-- ---------------------------------------------------------------------------

-- Working days of a range split by calendar year, as the balance charges them.
CREATE OR REPLACE FUNCTION public._leave_year_days(p_employee uuid, p_start date, p_end date)
RETURNS TABLE(year integer, days integer)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT extract(year FROM d)::integer, count(*)::integer
  FROM unnest(public._leave_working_dates(p_employee, p_start, p_end)) AS d
  GROUP BY 1
  ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public._leave_year_days(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- Balance rows: one per active employee (or the given one) and active leave type for a year.
-- Each request is charged to the calendar year(s) its working days fall in: a request from
-- 28 Dec to 5 Jan uses the December days from the old year and the January days from the new one.
-- There is no carry-over between years: unused days do not roll forward.
-- A request inside one year is charged its stored days_count (the count fixed at approval);
-- a request spanning years is split by recounting its working days per year.
CREATE OR REPLACE FUNCTION public._leave_balance_rows(p_company uuid, p_year integer, p_employee uuid)
RETURNS TABLE(
  employee_id uuid, employee_name text, employee_code text, department text, avatar_url text,
  leave_type_id uuid, type_name text, type_kind text, is_paid boolean,
  default_days numeric, allowed numeric, custom boolean, unlimited boolean,
  used numeric, pending numeric, remaining numeric
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT e.id, e.name, e.employee_code, d.name, e.avatar_url,
         t.id, t.name, t.type::text, t.is_paid,
         t.days_per_year::numeric,
         COALESCE(b.total_days, t.days_per_year::numeric),
         b.id IS NOT NULL,
         b.id IS NULL AND t.days_per_year = 0,
         COALESCE(u.used, 0), COALESCE(u.pending, 0),
         CASE WHEN b.id IS NULL AND t.days_per_year = 0 THEN NULL
              ELSE COALESCE(b.total_days, t.days_per_year::numeric) - COALESCE(u.used, 0) END
  FROM public.employees e
  JOIN public.leave_types t ON t.company_id = e.company_id AND t.is_active
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.leave_balances b ON b.employee_id = e.id AND b.leave_type_id = t.id AND b.year = p_year
  LEFT JOIN LATERAL (
    SELECT sum(y.days) FILTER (WHERE r.status = 'approved') AS used,
           sum(y.days) FILTER (WHERE r.status = 'pending') AS pending
    FROM public.leave_requests r
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN r.start_date >= make_date(p_year, 1, 1) AND r.end_date < make_date(p_year + 1, 1, 1) THEN r.days_count
               ELSE COALESCE((SELECT yd.days::numeric FROM public._leave_year_days(r.employee_id, r.start_date, r.end_date) yd WHERE yd.year = p_year), 0)
             END AS days
    ) y
    WHERE r.employee_id = e.id AND r.leave_type_id = t.id
      AND r.start_date < make_date(p_year + 1, 1, 1) AND r.end_date >= make_date(p_year, 1, 1)
  ) u ON true
  WHERE e.company_id = p_company
    AND (CASE WHEN p_employee IS NULL THEN e.status = 'active' ELSE e.id = p_employee END)
  ORDER BY e.name, t.days_per_year = 0, t.name
$$;

-- Refuses a request of a limited type whose working days would take any year's remaining balance
-- below zero. Unlimited types (days_per_year = 0 with no custom allocation) are never checked.
-- Pending requests are not charged: only approved days count as used.
CREATE OR REPLACE FUNCTION public._leave_balance_check(p_company uuid, p_employee uuid, p_leave_type uuid, p_start date, p_end date)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  y record;
  v_remaining numeric;
  v_type text;
BEGIN
  FOR y IN SELECT * FROM public._leave_year_days(p_employee, p_start, p_end) LOOP
    SELECT b.remaining, b.type_name INTO v_remaining, v_type
    FROM public._leave_balance_rows(p_company, y.year, p_employee) b
    WHERE b.leave_type_id = p_leave_type;
    IF v_remaining IS NOT NULL AND v_remaining - y.days < 0 THEN
      RAISE EXCEPTION 'Not enough % leave for %: % and this request needs % in %.',
        v_type, y.year,
        CASE WHEN v_remaining > 0 THEN public._leave_day_word(v_remaining) || ' remain'
             WHEN v_remaining = 0 THEN 'none remain'
             ELSE 'none remain (' || public._leave_day_word(-v_remaining) || ' over)' END,
        public._leave_day_word(y.days), y.year
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._leave_balance_check(uuid, uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1 + 2. _leave_set_status: balance check on approval, keep and restore the original mark
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._leave_set_status(p_id uuid, p_status public.leave_status, p_reviewer uuid, p_note text, p_force boolean)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r public.leave_requests;
  v_locked date;
  v_name text;
  v_days integer := 0;
  v_restored integer := 0;
  v_dates date[];
  v_clash record;
BEGIN
  SELECT * INTO r FROM public.leave_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'approved' OR r.status = 'approved' THEN
    v_locked := public._leave_locked_month(r.employee_id, r.start_date, r.end_date);
    IF v_locked IS NOT NULL THEN
      SELECT e.name INTO v_name FROM public.employees e WHERE e.id = r.employee_id;
      RAISE EXCEPTION '% is closed for %: a final payslip exists, so attendance cannot change.',
        to_char(v_locked, 'FMMonth YYYY'), v_name USING ERRCODE = 'P0001';
    END IF;
    -- Attendance months the company locked (time module), when that module is installed.
    IF to_regprocedure('public._time_locked(uuid,uuid,date)') IS NOT NULL THEN
      EXECUTE 'SELECT min(d) FROM unnest($1) AS d WHERE public._time_locked($2, $3, d)'
        INTO v_locked USING public._leave_working_dates(r.employee_id, r.start_date, r.end_date), r.company_id, r.employee_id;
      IF v_locked IS NOT NULL THEN
        RAISE EXCEPTION 'Attendance for % is locked, so this leave cannot change. Ask the owner to unlock the month first.',
          to_char(v_locked, 'FMMonth YYYY') USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF p_status = 'approved' THEN
    -- Count the working days as they are now: holidays or weekends changed since filing are not charged.
    v_dates := public._leave_working_dates(r.employee_id, r.start_date, r.end_date);
    IF cardinality(v_dates) < 1 THEN
      RAISE EXCEPTION 'Every day in this request is now a weekend or holiday, so there is no leave to approve. Reject or cancel it instead.'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT x.start_date, x.end_date INTO v_clash
    FROM public.leave_requests x
    WHERE x.employee_id = r.employee_id AND x.id <> r.id AND x.status = 'approved'
      AND x.start_date <= r.end_date AND x.end_date >= r.start_date
    ORDER BY x.start_date
    LIMIT 1;
    IF FOUND THEN
      SELECT e.name INTO v_name FROM public.employees e WHERE e.id = r.employee_id;
      RAISE EXCEPTION '% already has approved leave for %. Move that request back to pending first.',
        v_name, public._leave_when(v_clash.start_date, v_clash.end_date) USING ERRCODE = 'P0001';
    END IF;
    -- The year's balance must cover it, unless HR approves anyway.
    IF NOT COALESCE(p_force, false) THEN
      PERFORM public._leave_balance_check(r.company_id, r.employee_id, r.leave_type_id, r.start_date, r.end_date);
    END IF;
  END IF;

  IF p_status = 'pending' THEN
    UPDATE public.leave_requests
    SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.leave_requests
    SET status = p_status, reviewed_by = p_reviewer, reviewed_at = now(),
        review_notes = NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''),
        days_count = CASE WHEN p_status = 'approved' THEN cardinality(v_dates) ELSE days_count END,
        updated_at = now()
    WHERE id = p_id;
  END IF;

  IF p_status = 'approved' THEN
    -- A day already marked (present from the clock, late, half day...) keeps that mark in prev_*
    -- so an undo can put it back. A stale leave row is not "remembered" as the original mark.
    INSERT INTO public.attendance (employee_id, company_id, date, status, leave_request_id, source, note, marked_by)
    SELECT r.employee_id, r.company_id, d, 'leave', r.id, 'leave', 'Approved leave', p_reviewer
    FROM unnest(v_dates) AS d
    ON CONFLICT (employee_id, date) DO UPDATE
      SET prev_status = CASE WHEN attendance.status = 'leave' AND attendance.source = 'leave' THEN attendance.prev_status ELSE attendance.status END,
          prev_source = CASE WHEN attendance.status = 'leave' AND attendance.source = 'leave' THEN attendance.prev_source ELSE attendance.source END,
          prev_note   = CASE WHEN attendance.status = 'leave' AND attendance.source = 'leave' THEN attendance.prev_note   ELSE attendance.note   END,
          status = 'leave', leave_request_id = EXCLUDED.leave_request_id, source = 'leave',
          note = 'Approved leave', marked_by = EXCLUDED.marked_by, updated_at = now();
    GET DIAGNOSTICS v_days = ROW_COUNT;
  ELSIF r.status = 'approved' THEN
    -- Give back the mark the day had before the approval; delete only rows the approval created.
    UPDATE public.attendance a
    SET status = a.prev_status, source = a.prev_source, note = a.prev_note,
        leave_request_id = NULL, prev_status = NULL, prev_source = NULL, prev_note = NULL, updated_at = now()
    WHERE a.employee_id = r.employee_id AND a.leave_request_id = r.id AND a.status = 'leave'
      AND a.prev_status IS NOT NULL;
    GET DIAGNOSTICS v_restored = ROW_COUNT;
    DELETE FROM public.attendance a
    WHERE a.employee_id = r.employee_id AND a.leave_request_id = r.id AND a.status = 'leave';
    GET DIAGNOSTICS v_days = ROW_COUNT;
    v_days := v_days + v_restored;
  END IF;
  RETURN v_days;
END;
$$;
REVOKE ALL ON FUNCTION public._leave_set_status(uuid, public.leave_status, uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- Existing callers (portal, cancel, undo): never forced.
CREATE OR REPLACE FUNCTION public._leave_set_status(p_id uuid, p_status public.leave_status, p_reviewer uuid, p_note text)
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT public._leave_set_status(p_id, p_status, p_reviewer, p_note, false)
$$;

-- ---------------------------------------------------------------------------
-- 2. _leave_create: refuse a request the balance cannot cover
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._leave_create(
  p_company uuid, p_employee uuid, p_leave_type uuid, p_start date, p_end date, p_reason text, p_requested_by uuid, p_force boolean
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_emp record;
  v_type record;
  v_clash record;
  v_days integer;
  v_today date := public._leave_today(p_company);
  v_row public.leave_requests;
BEGIN
  SELECT e.id, e.name, e.status INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = p_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick an employee.' USING ERRCODE = 'P0001';
  END IF;
  IF v_emp.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION '% is no longer an active employee.', v_emp.name USING ERRCODE = 'P0001';
  END IF;
  SELECT t.id, t.name, t.is_active INTO v_type FROM public.leave_types t WHERE t.id = p_leave_type AND t.company_id = p_company;
  IF NOT FOUND OR NOT v_type.is_active THEN
    RAISE EXCEPTION 'Pick a leave type.' USING ERRCODE = 'P0001';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Pick a start and an end date.' USING ERRCODE = 'P0001';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'The end date is before the start date.' USING ERRCODE = 'P0001';
  END IF;
  IF p_start < v_today - 30 THEN
    RAISE EXCEPTION 'Leave can start at most 30 days back. For older dates ask HR to correct attendance directly.' USING ERRCODE = 'P0001';
  END IF;
  IF p_end - p_start >= 200 THEN
    RAISE EXCEPTION 'One request can cover at most 200 days. Split it up.' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.status, r.start_date, r.end_date, t.name AS type_name INTO v_clash
  FROM public.leave_requests r
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.employee_id = p_employee AND r.status IN ('pending', 'approved')
    AND r.start_date <= p_end AND r.end_date >= p_start
  ORDER BY r.start_date
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% already has % % % request for %. Cancel or decide that one first.',
      v_emp.name, CASE WHEN v_clash.status = 'approved' THEN 'an' ELSE 'a' END, v_clash.status,
      lower(v_clash.type_name), public._leave_when(v_clash.start_date, v_clash.end_date)
      USING ERRCODE = 'P0001';
  END IF;

  v_days := cardinality(public._leave_working_dates(p_employee, p_start, p_end));
  IF v_days < 1 THEN
    RAISE EXCEPTION 'Every day in that range is a weekend or holiday for this employee, so there is no leave to take.' USING ERRCODE = 'P0001';
  END IF;
  -- A limited type cannot be requested beyond what remains for the year, unless HR forces it.
  IF NOT COALESCE(p_force, false) THEN
    PERFORM public._leave_balance_check(p_company, p_employee, p_leave_type, p_start, p_end);
  END IF;

  INSERT INTO public.leave_requests (employee_id, company_id, leave_type_id, start_date, end_date, days_count, reason, status, requested_by)
  VALUES (p_employee, p_company, p_leave_type, p_start, p_end, v_days, NULLIF(left(btrim(COALESCE(p_reason, '')), 500), ''), 'pending', p_requested_by)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public._leave_create(uuid, uuid, uuid, date, date, text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Existing callers (portal_leave_request): never forced.
CREATE OR REPLACE FUNCTION public._leave_create(
  p_company uuid, p_employee uuid, p_leave_type uuid, p_start date, p_end date, p_reason text, p_requested_by uuid
)
RETURNS public.leave_requests
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT public._leave_create(p_company, p_employee, p_leave_type, p_start, p_end, p_reason, p_requested_by, false)
$$;

-- ---------------------------------------------------------------------------
-- 2. Staff RPCs: p_force lets HR go over the balance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_request_review(p_id uuid, p_decision text, p_note text, p_force boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
  v_days integer;
  v_when text;
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 300), '');
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Choose approve or reject.' USING ERRCODE = '22023';
  END IF;
  SELECT r.id, r.employee_id, r.status, r.start_date, r.end_date, r.days_count, e.name AS employee_name, t.name AS type_name
  INTO v
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id AND r.company_id = v_company
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been decided. Refresh to see its status.' USING ERRCODE = 'P0001';
  END IF;

  v_days := public._leave_set_status(p_id, p_decision::public.leave_status, auth.uid(), v_note, COALESCE(p_force, false) AND p_decision = 'approved');
  v_when := public._leave_when(v.start_date, v.end_date);

  IF p_decision = 'approved' THEN
    PERFORM public._leave_after_approval(p_id, v_days, false);
    IF COALESCE(p_force, false) THEN
      PERFORM public.log_activity(
        'leave.approved_over_balance',
        format('%s approved %s leave for %s, %s, beyond the year''s balance', public._leave_actor_name(), lower(v.type_name), v.employee_name, v_when),
        jsonb_build_object('id', p_id, 'start', v.start_date, 'end', v.end_date, 'forced', true),
        v.employee_id
      );
    END IF;
  ELSE
    PERFORM public.log_activity(
      'leave.rejected',
      format('%s rejected %s leave for %s, %s', public._leave_actor_name(), lower(v.type_name), v.employee_name, v_when),
      jsonb_build_object('id', p_id, 'start', v.start_date, 'end', v.end_date, 'days', v.days_count, 'note', v_note),
      v.employee_id
    );
    PERFORM public.notify_employee(
      v_company, v.employee_id, 'leave', 'Your leave was not approved',
      format('%s, %s%s', v.type_name, v_when, CASE WHEN v_note IS NOT NULL THEN format(' · HR: "%s"', left(v_note, 100)) ELSE '' END),
      '/portal/leave'
    );
  END IF;
  RETURN json_build_object('id', p_id, 'status', p_decision, 'attendance_days', v_days, 'forced', COALESCE(p_force, false) AND p_decision = 'approved');
END;
$$;
REVOKE ALL ON FUNCTION public.leave_request_review(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_request_review(uuid, text, text, boolean) TO authenticated;

-- Existing signature: same as p_force = false.
CREATE OR REPLACE FUNCTION public.leave_request_review(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.leave_request_review(p_id, p_decision, p_note, false)
$$;

CREATE OR REPLACE FUNCTION public.leave_request_create(
  p_employee uuid, p_leave_type uuid, p_start date, p_end date, p_reason text, p_approve_now boolean, p_force boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v_row public.leave_requests;
  v_emp_name text;
  v_type_name text;
  v_when text;
  v_days integer;
  v_status text := 'pending';
  v_message text;
BEGIN
  v_row := public._leave_create(v_company, p_employee, p_leave_type, p_start, p_end, p_reason, auth.uid(), COALESCE(p_force, false));
  SELECT e.name INTO v_emp_name FROM public.employees e WHERE e.id = v_row.employee_id;
  SELECT t.name INTO v_type_name FROM public.leave_types t WHERE t.id = v_row.leave_type_id;
  v_when := public._leave_when(v_row.start_date, v_row.end_date);

  PERFORM public.log_activity(
    'leave.requested',
    format('%s filed %s leave for %s, %s (%s)%s', public._leave_actor_name(), lower(v_type_name), v_emp_name, v_when, public._leave_day_word(v_row.days_count),
           CASE WHEN COALESCE(p_force, false) THEN ', beyond the year''s balance' ELSE '' END),
    jsonb_build_object('id', v_row.id, 'start', v_row.start_date, 'end', v_row.end_date, 'days', v_row.days_count, 'type', v_type_name, 'reason', v_row.reason, 'forced', COALESCE(p_force, false)),
    v_row.employee_id
  );
  v_message := format('Request filed for %s, %s. It is pending until you approve it.', public._leave_day_word(v_row.days_count), v_when);

  IF COALESCE(p_approve_now, false) THEN
    BEGIN
      v_days := public._leave_set_status(v_row.id, 'approved', auth.uid(), NULL, COALESCE(p_force, false));
      PERFORM public._leave_after_approval(v_row.id, v_days, false);
      v_status := 'approved';
      v_message := format('Leave approved for %s: %s, %s, marked in attendance.', v_emp_name, public._leave_day_word(v_row.days_count), v_when);
    EXCEPTION WHEN raise_exception THEN
      v_message := format('Request filed but left pending: %s', SQLERRM);
    END;
  END IF;

  RETURN json_build_object('id', v_row.id, 'days', v_row.days_count, 'status', v_status, 'message', v_message);
END;
$$;
REVOKE ALL ON FUNCTION public.leave_request_create(uuid, uuid, date, date, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_request_create(uuid, uuid, date, date, text, boolean, boolean) TO authenticated;

-- Existing signature: same as p_force = false.
CREATE OR REPLACE FUNCTION public.leave_request_create(
  p_employee uuid, p_leave_type uuid, p_start date, p_end date, p_reason text DEFAULT NULL, p_approve_now boolean DEFAULT false
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.leave_request_create(p_employee, p_leave_type, p_start, p_end, p_reason, p_approve_now, false)
$$;

-- ---------------------------------------------------------------------------
-- 4. time_review_correction: lock-check and mark the work date the punch lands on
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.time_review_correction(p_id uuid, p_decision text, p_time_in text DEFAULT NULL::text, p_time_out text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  c public.punch_corrections;
  e public.employees;
  v_in time;
  v_out time;
  v_note text := left(NULLIF(btrim(p_note), ''), 300);
  v_tz text;
  v_pin text;
  v_at_in timestamptz;
  v_at_out timestamptz;
  v_work date;
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

  SELECT x.v_in, x.v_out INTO v_in, v_out
  FROM public._time_check_correction(c.kind,
         COALESCE(NULLIF(p_time_in, ''), to_char(c.time_in, 'HH24:MI')),
         COALESCE(NULLIF(p_time_out, ''), to_char(c.time_out, 'HH24:MI'))) x;

  v_tz := public._time_tz(v_company);
  -- A night shift belongs to the evening it starts on: a time before noon is after midnight, so the
  -- punch lands on the next calendar day. The work date is derived from the punch with the same rule
  -- _time_day_punches uses, so the lock check and the attendance mark follow the punch.
  IF v_in IS NOT NULL THEN
    v_at_in := (((c.date + CASE WHEN e.shift_type = 'night' AND v_in < '12:00'::time THEN 1 ELSE 0 END) + v_in) AT TIME ZONE v_tz);
  END IF;
  IF v_out IS NOT NULL THEN
    v_at_out := ((c.date + v_out) AT TIME ZONE v_tz);
    IF e.shift_type = 'night' AND v_out < '12:00'::time THEN
      v_at_out := v_at_out + interval '1 day';
    END IF;
  END IF;
  v_work := CASE WHEN e.shift_type = 'night'
                 THEN ((COALESCE(v_at_in, v_at_out) AT TIME ZONE v_tz) - interval '12 hours')::date
                 ELSE (COALESCE(v_at_in, v_at_out) AT TIME ZONE v_tz)::date END;
  v_work := COALESCE(v_work, c.date);

  IF public._time_locked(v_company, e.id, v_work) OR (v_work <> c.date AND public._time_locked(v_company, e.id, c.date)) THEN
    RAISE EXCEPTION 'That month is locked; unlock it before approving' USING ERRCODE = '22023';
  END IF;

  SELECT l.device_user_id INTO v_pin FROM public.time_terminal_links l WHERE l.employee_id = e.id;
  v_pin := COALESCE(v_pin, 'EMP-' || left(replace(e.id::text, '-', ''), 12));

  IF v_at_in IS NOT NULL THEN
    INSERT INTO public.time_punches (company_id, employee_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source, correction_id)
    VALUES (v_company, e.id, 'CORRECTION', v_pin, v_at_in, (v_at_in AT TIME ZONE v_tz)::date, 'in', 'correction', 'correction', c.id)
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_at_out IS NOT NULL THEN
    INSERT INTO public.time_punches (company_id, employee_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source, correction_id)
    VALUES (v_company, e.id, 'CORRECTION', v_pin, v_at_out, (v_at_out AT TIME ZONE v_tz)::date, 'out', 'correction', 'correction', c.id)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.punch_corrections SET status = 'approved', time_in = v_in, time_out = v_out, review_note = v_note,
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = c.id;

  IF (public._time_cfg(v_company)).auto_present THEN
    v_marked := public._time_auto_present(v_company, e.id, v_work, 'correction');
  END IF;

  PERFORM public.notify_employee(v_company, e.id, 'time.correction', 'Punch correction approved',
    format('%s on %s%s', public._time_kind_label(c.kind), to_char(c.date, 'FMDD Mon YYYY'), COALESCE(': ' || v_note, '')),
    '/portal/attendance');
  PERFORM public.log_activity('correction.approved', format('Approved the punch correction of %s for %s', e.name, to_char(c.date, 'FMDD Mon YYYY')),
    jsonb_build_object('correction_id', c.id, 'time_in', v_in, 'time_out', v_out, 'work_date', v_work, 'marked_present', v_marked), e.id);
  RETURN jsonb_build_object('status', 'approved', 'marked_present', v_marked, 'work_date', v_work);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. _time_day_punches: one person, one second, one punch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._time_day_punches(p_company uuid, p_from date, p_to date, p_employee uuid DEFAULT NULL::uuid)
RETURNS TABLE(employee_id uuid, work_date date, first_in timestamp with time zone, last_out timestamp with time zone, punches integer, corrected boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH z AS (SELECT public._time_tz(p_company) AS tz),
  p AS (
    -- The same person on two clocks within the same second is one punch (the unique index only
    -- dedupes per device). A correction punch at that second wins over the clock.
    SELECT DISTINCT ON (tp.employee_id, date_trunc('second', tp.punch_at))
           tp.employee_id, tp.punch_at, tp.direction, tp.source,
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
    ORDER BY tp.employee_id, date_trunc('second', tp.punch_at), (tp.source = 'correction') DESC, tp.direction, tp.id
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
$$;
