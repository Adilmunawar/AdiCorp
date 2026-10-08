-- Leave & overtime module (4/5): overtime hours RPCs for staff.
-- HR records, corrects and approves HOURS; it never reads or writes what they are worth. Finance prices
-- approved hours in the payroll module (directly on overtime_records, which only Finance/owner can read).

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._ot_hours_label(p_hours numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT trim_scale(p_hours)::text || ' h'
$$;

-- Shared field rules for a claim or an HR entry. Raises a friendly message.
CREATE OR REPLACE FUNCTION public._ot_check(p_company uuid, p_date date, p_hours numeric, p_type text)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Pick the date the overtime was worked.' USING ERRCODE = 'P0001';
  END IF;
  IF p_date > public._leave_today(p_company) THEN
    RAISE EXCEPTION 'Overtime is recorded after it is worked; the date cannot be in the future.' USING ERRCODE = 'P0001';
  END IF;
  IF p_date < DATE '2015-01-01' THEN
    RAISE EXCEPTION 'That date is too far back.' USING ERRCODE = 'P0001';
  END IF;
  IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 16 OR p_hours * 2 <> round(p_hours * 2) THEN
    RAISE EXCEPTION 'Hours go in halves, from 0.5 to 16.' USING ERRCODE = 'P0001';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('regular', 'weekend', 'holiday') THEN
    RAISE EXCEPTION 'Pick the overtime type.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- True when a final or paid payslip carries the entry (it is paid and can no longer change).
CREATE OR REPLACE FUNCTION public._ot_locked(p_payslip uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT p_payslip IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payslips p
    WHERE p.id = p_payslip AND (to_jsonb(p) ->> 'status') IN ('final', 'finalized', 'paid', 'locked')
  )
$$;

-- Finance hears about every approval: those hours now wait for a rate.
CREATE OR REPLACE FUNCTION public._ot_tell_finance(p_company uuid, p_employee_name text, p_hours numeric, p_date date)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.notify_roles(
    p_company, ARRAY['finance'], 'overtime',
    format('Overtime approved for %s', p_employee_name),
    format('%s on %s · waiting for a rate', public._ot_hours_label(p_hours), to_char(p_date, 'FMDD Mon YYYY')),
    '/payroll/overtime'
  );
END;
$$;

REVOKE ALL ON FUNCTION public._ot_hours_label(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ot_check(uuid, date, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ot_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ot_tell_finance(uuid, text, numeric, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read: hours only (any staff role). No rate, multiplier or amount ever leaves this function.
-- pay_stage: null unless approved; 'no_pay' | 'paid' | 'with_finance' | 'ready'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.overtime_hours_list(
  p_from date, p_to date, p_employee uuid DEFAULT NULL, p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, employee_code text, department text, avatar_url text,
  date date, hours numeric, claimed_hours numeric, overtime_type text, reason text, status text, review_notes text,
  requested_via text, requester_name text, reviewer_name text, reviewed_at timestamptz, created_at timestamptz,
  pay_stage text, payslip_month date, locked boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'Pick a date range of at most a year.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT o.id, o.employee_id, e.name, e.employee_code, d.name, e.avatar_url,
         o.date, o.hours, o.claimed_hours, o.overtime_type, o.reason, o.status, o.review_notes,
         CASE WHEN o.requested_by IS NULL THEN 'portal' ELSE 'staff' END,
         NULLIF(btrim(concat_ws(' ', rq.first_name, rq.last_name)), ''),
         NULLIF(btrim(concat_ws(' ', rv.first_name, rv.last_name)), ''),
         o.reviewed_at, o.created_at,
         CASE
           WHEN o.status <> 'approved' THEN NULL
           WHEN o.pay_status = 'no_pay' THEN 'no_pay'
           WHEN (to_jsonb(ps) ->> 'status') IN ('final', 'finalized', 'paid', 'locked') THEN 'paid'
           WHEN o.pay_status = 'unpriced' THEN 'with_finance'
           ELSE 'ready'
         END,
         ps.month,
         COALESCE((to_jsonb(ps) ->> 'status') IN ('final', 'finalized', 'paid', 'locked'), false)
  FROM public.overtime_records o
  JOIN public.employees e ON e.id = o.employee_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.profiles rq ON rq.id = o.requested_by
  LEFT JOIN public.profiles rv ON rv.id = o.reviewed_by
  LEFT JOIN public.payslips ps ON ps.id = o.payslip_id
  WHERE o.company_id = v_company
    AND o.date BETWEEN p_from AND p_to
    AND (p_employee IS NULL OR o.employee_id = p_employee)
    AND (p_status IS NULL OR o.status = p_status)
  ORDER BY (o.status = 'pending') DESC, o.date DESC, o.created_at DESC
  LIMIT 2000;
END;
$$;

-- ---------------------------------------------------------------------------
-- Writes (owner / HR)
-- ---------------------------------------------------------------------------

-- HR records hours, approved at once (default) or left pending for a second look.
CREATE OR REPLACE FUNCTION public.overtime_add(
  p_employee uuid, p_date date, p_hours numeric, p_type text, p_reason text DEFAULT NULL, p_approve_now boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v_emp record;
  v_id uuid;
  v_approve boolean := COALESCE(p_approve_now, true);
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
BEGIN
  SELECT e.id, e.name, e.status INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company;
  IF NOT FOUND OR v_emp.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Pick an employee.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._ot_check(v_company, p_date, p_hours, p_type);

  INSERT INTO public.overtime_records (
    employee_id, company_id, date, hours, overtime_type, reason, status, requested_by, reviewed_by, reviewed_at,
    hourly_rate, multiplier, total_amount, pay_status
  )
  VALUES (
    v_emp.id, v_company, p_date, p_hours, p_type, v_reason,
    CASE WHEN v_approve THEN 'approved' ELSE 'pending' END, auth.uid(),
    CASE WHEN v_approve THEN auth.uid() END, CASE WHEN v_approve THEN now() END,
    0, 1, 0, 'unpriced'
  )
  RETURNING id INTO v_id;

  PERFORM public.log_activity(
    'overtime.added',
    format('%s added %s %s overtime for %s on %s%s', public._leave_actor_name(), public._ot_hours_label(p_hours), p_type,
           v_emp.name, to_char(p_date, 'FMDD Mon YYYY'), CASE WHEN v_approve THEN ', approved' ELSE '' END),
    jsonb_build_object('id', v_id, 'date', p_date, 'hours', p_hours, 'type', p_type, 'status', CASE WHEN v_approve THEN 'approved' ELSE 'pending' END),
    v_emp.id
  );
  IF v_approve THEN
    PERFORM public._ot_tell_finance(v_company, v_emp.name, p_hours, p_date);
    PERFORM public.notify_employee(
      v_company, v_emp.id, 'overtime', 'Overtime recorded for you',
      format('%s on %s · paid with your salary once Finance sets the rate', public._ot_hours_label(p_hours), to_char(p_date, 'FMDD Mon YYYY')),
      '/portal/overtime'
    );
  END IF;

  RETURN json_build_object(
    'id', v_id,
    'status', CASE WHEN v_approve THEN 'approved' ELSE 'pending' END,
    'message', format('%s on %s recorded for %s%s', public._ot_hours_label(p_hours), to_char(p_date, 'FMDD Mon YYYY'), v_emp.name,
                      CASE WHEN v_approve THEN ' and approved. Finance sets the pay.' ELSE ', pending approval.' END)
  );
END;
$$;

-- Approve or reject a pending entry, or move a decided one back to pending ('pending' = undo).
-- Leaving 'approved' (or rejecting) clears Finance's pricing and takes the entry off any draft payslip,
-- so a re-approved entry is priced afresh. Entries on a final or paid payslip are frozen.
CREATE OR REPLACE FUNCTION public.overtime_review(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 300), '');
  v_verb text;
BEGIN
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Choose approve, reject or undo.' USING ERRCODE = '22023';
  END IF;
  SELECT o.id, o.employee_id, o.date, o.hours, o.status, o.payslip_id, e.name AS employee_name
  INTO v
  FROM public.overtime_records o
  JOIN public.employees e ON e.id = o.employee_id
  WHERE o.id = p_id AND o.company_id = v_company
  FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That overtime entry no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF public._ot_locked(v.payslip_id) THEN
    RAISE EXCEPTION 'This overtime is on a final payslip, so it is paid and locked.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'pending' AND v.status = 'pending' THEN
    RAISE EXCEPTION 'This entry is already pending.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status <> 'pending' AND v.status <> 'pending' THEN
    RAISE EXCEPTION 'This entry has already been decided. Refresh to see its status.' USING ERRCODE = 'P0001';
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.overtime_records
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = v_note, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.overtime_records
    SET status = p_status,
        reviewed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
        reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
        review_notes = CASE WHEN p_status = 'pending' THEN NULL ELSE v_note END,
        pay_status = 'unpriced', hourly_rate = 0, multiplier = 1, total_amount = 0,
        payslip_id = NULL, priced_by = NULL, priced_at = NULL, updated_at = now()
    WHERE id = p_id;
  END IF;

  v_verb := CASE WHEN p_status = 'pending' THEN 'undone' ELSE p_status END;
  PERFORM public.log_activity(
    'overtime.' || v_verb,
    CASE WHEN p_status = 'pending'
      THEN format('%s moved %s''s overtime on %s back to pending', public._leave_actor_name(), v.employee_name, to_char(v.date, 'FMDD Mon YYYY'))
      ELSE format('%s %s %s overtime for %s on %s', public._leave_actor_name(), p_status, public._ot_hours_label(v.hours), v.employee_name, to_char(v.date, 'FMDD Mon YYYY')) END,
    jsonb_build_object('id', p_id, 'date', v.date, 'hours', v.hours, 'from', v.status, 'to', p_status, 'note', v_note),
    v.employee_id
  );

  IF p_status <> 'pending' THEN
    PERFORM public.notify_employee(
      v_company, v.employee_id, 'overtime',
      CASE WHEN p_status = 'approved' THEN 'Your overtime was approved' ELSE 'Your overtime was not approved' END,
      format('%s on %s%s%s', public._ot_hours_label(v.hours), to_char(v.date, 'FMDD Mon YYYY'),
             CASE WHEN p_status = 'approved' THEN ' · paid with your salary once Finance sets the rate' ELSE '' END,
             CASE WHEN v_note IS NOT NULL THEN format(' · HR: "%s"', left(v_note, 100)) ELSE '' END),
      '/portal/overtime'
    );
  END IF;
  IF p_status = 'approved' THEN
    PERFORM public._ot_tell_finance(v_company, v.employee_name, v.hours, v.date);
  END IF;
  RETURN json_build_object('id', p_id, 'status', p_status);
END;
$$;

-- HR corrects the hours on a pending entry before deciding; the first figure is kept as what was claimed.
CREATE OR REPLACE FUNCTION public.overtime_set_hours(p_id uuid, p_hours numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
BEGIN
  SELECT o.id, o.employee_id, o.date, o.hours, o.claimed_hours, o.status, e.name AS employee_name
  INTO v
  FROM public.overtime_records o
  JOIN public.employees e ON e.id = o.employee_id
  WHERE o.id = p_id AND o.company_id = v_company
  FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That overtime entry no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending overtime can be corrected. Undo the decision first.' USING ERRCODE = 'P0001';
  END IF;
  IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 16 OR p_hours * 2 <> round(p_hours * 2) THEN
    RAISE EXCEPTION 'Hours go in halves, from 0.5 to 16.' USING ERRCODE = 'P0001';
  END IF;
  IF p_hours = v.hours THEN
    RETURN json_build_object('id', p_id, 'hours', v.hours, 'claimed_hours', v.claimed_hours);
  END IF;

  UPDATE public.overtime_records
  SET claimed_hours = COALESCE(claimed_hours, hours), hours = p_hours, updated_at = now()
  WHERE id = p_id;

  PERFORM public.log_activity(
    'overtime.hours',
    format('%s changed %s''s overtime on %s from %s to %s', public._leave_actor_name(), v.employee_name,
           to_char(v.date, 'FMDD Mon YYYY'), public._ot_hours_label(v.hours), public._ot_hours_label(p_hours)),
    jsonb_build_object('id', p_id, 'from', v.hours, 'to', p_hours, 'claimed', COALESCE(v.claimed_hours, v.hours)),
    v.employee_id
  );
  RETURN json_build_object('id', p_id, 'hours', p_hours, 'claimed_hours', COALESCE(v.claimed_hours, v.hours));
END;
$$;

-- HR removes an entry that is not approved (and not on a final payslip).
CREATE OR REPLACE FUNCTION public.overtime_remove(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
BEGIN
  SELECT o.id, o.employee_id, o.date, o.hours, o.status, o.payslip_id, e.name AS employee_name
  INTO v
  FROM public.overtime_records o
  JOIN public.employees e ON e.id = o.employee_id
  WHERE o.id = p_id AND o.company_id = v_company
  FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That overtime entry no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF public._ot_locked(v.payslip_id) THEN
    RAISE EXCEPTION 'This overtime is on a final payslip, so it is paid and locked.' USING ERRCODE = 'P0001';
  END IF;
  IF v.status = 'approved' THEN
    RAISE EXCEPTION 'Approved overtime cannot be removed. Undo the approval first.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.overtime_records WHERE id = p_id;
  PERFORM public.log_activity(
    'overtime.removed',
    format('%s removed %s''s %s overtime on %s', public._leave_actor_name(), v.employee_name, public._ot_hours_label(v.hours), to_char(v.date, 'FMDD Mon YYYY')),
    jsonb_build_object('id', p_id, 'date', v.date, 'hours', v.hours, 'status', v.status),
    v.employee_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.overtime_hours_list(date, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.overtime_add(uuid, date, numeric, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.overtime_review(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.overtime_set_hours(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.overtime_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.overtime_hours_list(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_add(uuid, date, numeric, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_set_hours(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overtime_remove(uuid) TO authenticated;
