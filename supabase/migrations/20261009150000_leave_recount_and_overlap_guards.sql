-- Leave: approvals charge the working days as they stand at approval, and no request can end up
-- overlapping another live one.
--
-- 1. _leave_set_status: days_count was fixed when the request was filed. A holiday or weekend
--    change made afterwards meant attendance got fewer leave days than the balance was charged
--    (or an approval with nothing to mark). Approval now recounts the working days, stores that
--    count, refuses a request that no longer covers any working day, and refuses to approve on top
--    of another approved request for the same days (the attendance rows would be taken over).
-- 2. leave_request_undo: moving a rejected request back to pending skipped the overlap check that
--    filing does, so two live requests could cover the same days and both be approved (balances
--    charged twice). It now refuses while another pending or approved request overlaps.

CREATE OR REPLACE FUNCTION public._leave_set_status(p_id uuid, p_status leave_status, p_reviewer uuid, p_note text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  r public.leave_requests;
  v_locked date;
  v_name text;
  v_days integer := 0;
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
    INSERT INTO public.attendance (employee_id, company_id, date, status, leave_request_id, source, note, marked_by)
    SELECT r.employee_id, r.company_id, d, 'leave', r.id, 'leave', 'Approved leave', p_reviewer
    FROM unnest(v_dates) AS d
    ON CONFLICT (employee_id, date) DO UPDATE
      SET status = 'leave', leave_request_id = EXCLUDED.leave_request_id, source = 'leave',
          note = 'Approved leave', marked_by = EXCLUDED.marked_by;
    GET DIAGNOSTICS v_days = ROW_COUNT;
  ELSIF r.status = 'approved' THEN
    DELETE FROM public.attendance a
    WHERE a.employee_id = r.employee_id AND a.leave_request_id = r.id AND a.status = 'leave';
    GET DIAGNOSTICS v_days = ROW_COUNT;
  END IF;
  RETURN v_days;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_request_undo(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
  v_clash record;
  v_days integer;
BEGIN
  SELECT r.id, r.employee_id, r.status, r.start_date, r.end_date, e.name AS employee_name, t.name AS type_name, t.is_paid
  INTO v
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id AND r.company_id = v_company
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Only an approved or rejected request can be moved back to pending.' USING ERRCODE = 'P0001';
  END IF;

  -- A rejected request's days may have been requested again since: never let two live requests overlap.
  SELECT x.status, x.start_date, x.end_date, xt.name AS type_name INTO v_clash
  FROM public.leave_requests x
  JOIN public.leave_types xt ON xt.id = x.leave_type_id
  WHERE x.employee_id = v.employee_id AND x.id <> p_id AND x.status IN ('pending', 'approved')
    AND x.start_date <= v.end_date AND x.end_date >= v.start_date
  ORDER BY x.start_date
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% already has % % % request for %, which overlaps this one. Cancel or decide that one first.',
      v.employee_name, CASE WHEN v_clash.status = 'approved' THEN 'an' ELSE 'a' END, v_clash.status,
      lower(v_clash.type_name), public._leave_when(v_clash.start_date, v_clash.end_date)
      USING ERRCODE = 'P0001';
  END IF;

  v_days := public._leave_set_status(p_id, 'pending', NULL, NULL);

  IF v.status = 'approved' AND NOT v.is_paid THEN
    PERFORM public._leave_pay_event(
      v_company, v.employee_id, 'unpaid_leave_undone',
      format('Unpaid leave taken back: %s', v.employee_name),
      format('%s from %s is no longer approved, so those days are paid again.', v.type_name, to_char(v.start_date, 'FMDD Mon YYYY')),
      v.start_date
    );
  END IF;
  PERFORM public.log_activity(
    'leave.undone',
    format('%s moved %s''s %s leave (%s) back to pending', public._leave_actor_name(), v.employee_name, lower(v.type_name), to_char(v.start_date, 'FMDD Mon YYYY')),
    jsonb_build_object('id', p_id, 'from', v.status, 'attendance_days_removed', v_days),
    v.employee_id
  );
  PERFORM public.notify_employee(
    v_company, v.employee_id, 'leave', 'Your leave is back under review',
    format('%s, %s', v.type_name, public._leave_when(v.start_date, v.end_date)),
    '/portal/leave'
  );
  RETURN json_build_object('id', p_id, 'status', 'pending', 'attendance_days', v_days);
END;
$function$;
