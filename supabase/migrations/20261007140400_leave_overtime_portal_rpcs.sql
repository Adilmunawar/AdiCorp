-- Leave & overtime module (5/5): employee portal RPCs.
-- Every function takes the portal token first, resolves the employee and company from it alone
-- (never from client ids) and returns explicit fields. Overtime replies carry hours only, never money.

-- My leave: balances for the year, active types, my requests (that year plus anything still pending).
CREATE OR REPLACE FUNCTION public.portal_leave_overview(p_token text, p_year integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public._leave_today(v_emp.company_id);
  v_year integer := COALESCE(p_year, extract(year FROM v_today)::integer);
BEGIN
  IF v_year < 2000 OR v_year > 2100 THEN
    v_year := extract(year FROM v_today)::integer;
  END IF;
  RETURN json_build_object(
    'year', v_year,
    'today', v_today,
    'requires_approval', COALESCE((SELECT s.requires_approval FROM public.leave_settings s WHERE s.company_id = v_emp.company_id), true),
    'types', COALESCE((
      SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'type', t.type, 'is_paid', t.is_paid, 'days_per_year', t.days_per_year)
                      ORDER BY t.days_per_year = 0, t.name)
      FROM public.leave_types t
      WHERE t.company_id = v_emp.company_id AND t.is_active
    ), '[]'::json),
    'balances', COALESCE((
      SELECT json_agg(json_build_object(
               'leave_type_id', b.leave_type_id, 'type_name', b.type_name, 'type_kind', b.type_kind, 'is_paid', b.is_paid,
               'allowed', b.allowed, 'custom', b.custom, 'unlimited', b.unlimited,
               'used', b.used, 'pending', b.pending, 'remaining', b.remaining))
      FROM public._leave_balance_rows(v_emp.company_id, v_year, v_emp.id) b
    ), '[]'::json),
    'requests', COALESCE((
      SELECT json_agg(json_build_object(
               'id', r.id, 'leave_type_id', r.leave_type_id, 'type_name', t.name, 'type_kind', t.type, 'is_paid', t.is_paid,
               'start_date', r.start_date, 'end_date', r.end_date, 'days_count', r.days_count, 'reason', r.reason,
               'status', r.status, 'review_notes', r.review_notes, 'reviewed_at', r.reviewed_at, 'created_at', r.created_at,
               'filed_by_hr', r.requested_by IS NOT NULL)
             ORDER BY (r.status = 'pending') DESC, r.start_date DESC, r.created_at DESC)
      FROM public.leave_requests r
      JOIN public.leave_types t ON t.id = r.leave_type_id
      WHERE r.employee_id = v_emp.id AND r.company_id = v_emp.company_id
        AND ((r.start_date >= make_date(v_year, 1, 1) AND r.start_date < make_date(v_year + 1, 1, 1)) OR r.status = 'pending')
    ), '[]'::json)
  );
END;
$$;

-- Working days a range would count for me (live preview in the request form).
CREATE OR REPLACE FUNCTION public.portal_leave_count_days(p_token text, p_start date, p_end date)
RETURNS integer
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end - p_start >= 200 THEN
    RETURN 0;
  END IF;
  RETURN cardinality(public._leave_working_dates(v_emp.id, p_start, p_end));
END;
$$;

-- I request leave. Approved at once when the company does not require HR approval.
CREATE OR REPLACE FUNCTION public.portal_leave_request(
  p_token text, p_leave_type uuid, p_start date, p_end date, p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_row public.leave_requests;
  v_type_name text;
  v_when text;
  v_days integer;
  v_status text := 'pending';
  v_message text;
  v_requires boolean;
BEGIN
  v_row := public._leave_create(v_emp.company_id, v_emp.id, p_leave_type, p_start, p_end, p_reason, NULL);
  SELECT t.name INTO v_type_name FROM public.leave_types t WHERE t.id = v_row.leave_type_id;
  v_when := public._leave_when(v_row.start_date, v_row.end_date);

  PERFORM public._leave_log_portal(
    v_emp.company_id, v_emp.id, 'leave.requested',
    format('%s requested %s leave, %s (%s)', v_emp.name, lower(v_type_name), v_when, public._leave_day_word(v_row.days_count)),
    jsonb_build_object('id', v_row.id, 'start', v_row.start_date, 'end', v_row.end_date, 'days', v_row.days_count, 'type', v_type_name, 'reason', v_row.reason)
  );
  PERFORM public.notify_roles(
    v_emp.company_id, ARRAY['hr'], 'leave',
    format('%s requested leave', v_emp.name),
    format('%s, %s (%s)%s', v_type_name, v_when, public._leave_day_word(v_row.days_count),
           CASE WHEN v_row.reason IS NOT NULL THEN format(' · "%s"', left(v_row.reason, 80)) ELSE '' END),
    '/leave?status=pending'
  );
  v_message := format('Request filed for %s, %s. HR will review it.', public._leave_day_word(v_row.days_count), v_when);

  v_requires := COALESCE((SELECT s.requires_approval FROM public.leave_settings s WHERE s.company_id = v_emp.company_id), true);
  IF NOT v_requires THEN
    BEGIN
      v_days := public._leave_set_status(v_row.id, 'approved', NULL, 'Approved automatically: leave does not need HR approval.');
      PERFORM public._leave_after_approval(v_row.id, v_days, true);
      v_status := 'approved';
      v_message := format('Leave recorded: %s, %s. No approval is needed, so it is already marked in attendance.',
                          public._leave_day_word(v_row.days_count), v_when);
    EXCEPTION WHEN raise_exception THEN
      v_message := format('Request filed but left pending: %s', SQLERRM);
    END;
  END IF;

  RETURN json_build_object('id', v_row.id, 'days', v_row.days_count, 'status', v_status, 'message', v_message);
END;
$$;

-- I withdraw my own pending request.
CREATE OR REPLACE FUNCTION public.portal_leave_cancel(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v record;
BEGIN
  SELECT r.id, r.status, r.start_date, t.name AS type_name
  INTO v
  FROM public.leave_requests r
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id AND r.employee_id = v_emp.id AND r.company_id = v_emp.company_id
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'That request no longer exists.');
  END IF;
  IF v.status <> 'pending' THEN
    RETURN json_build_object('error', 'Only a pending request can be cancelled. Ask HR to change a decided one.');
  END IF;
  PERFORM public._leave_set_status(p_id, 'cancelled', NULL, 'Cancelled by employee');
  PERFORM public._leave_log_portal(
    v_emp.company_id, v_emp.id, 'leave.cancelled',
    format('%s cancelled their %s leave request (%s)', v_emp.name, lower(v.type_name), to_char(v.start_date, 'FMDD Mon YYYY')),
    jsonb_build_object('id', p_id)
  );
  RETURN json_build_object('id', p_id, 'status', 'cancelled');
END;
$$;

-- My overtime for a month (hours and pay stage only) with headline numbers.
CREATE OR REPLACE FUNCTION public.portal_overtime_overview(p_token text, p_month date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public._leave_today(v_emp.company_id);
  v_from date := date_trunc('month', COALESCE(p_month, v_today)::timestamp)::date;
  v_to date := (date_trunc('month', COALESCE(p_month, v_today)::timestamp) + interval '1 month - 1 day')::date;
BEGIN
  RETURN (
    WITH rows AS (
      SELECT o.id, o.date, o.hours, o.claimed_hours, o.overtime_type, o.reason, o.status, o.review_notes,
             o.reviewed_at, o.created_at, o.requested_by IS NOT NULL AS filed_by_hr,
             CASE
               WHEN o.status <> 'approved' THEN NULL
               WHEN o.pay_status = 'no_pay' THEN 'no_pay'
               WHEN (to_jsonb(ps) ->> 'status') IN ('final', 'finalized', 'paid', 'locked') THEN 'paid'
               WHEN o.pay_status = 'unpriced' THEN 'with_finance'
               ELSE 'ready'
             END AS pay_stage,
             ps.month AS payslip_month,
             COALESCE((to_jsonb(ps) ->> 'status') IN ('final', 'finalized', 'paid', 'locked'), false) AS locked
      FROM public.overtime_records o
      LEFT JOIN public.payslips ps ON ps.id = o.payslip_id
      WHERE o.employee_id = v_emp.id AND o.company_id = v_emp.company_id
        AND o.date BETWEEN v_from AND v_to
    )
    SELECT json_build_object(
      'month', v_from,
      'today', v_today,
      'summary', json_build_object(
        'approved_hours', COALESCE(sum(r.hours) FILTER (WHERE r.status = 'approved'), 0),
        'approved_count', count(*) FILTER (WHERE r.status = 'approved'),
        'pending_hours', COALESCE(sum(r.hours) FILTER (WHERE r.status = 'pending'), 0),
        'pending_count', count(*) FILTER (WHERE r.status = 'pending'),
        'rejected_count', count(*) FILTER (WHERE r.status = 'rejected'),
        'paid_count', count(*) FILTER (WHERE r.pay_stage = 'paid'),
        'total', count(*)
      ),
      'records', COALESCE(json_agg(json_build_object(
        'id', r.id, 'date', r.date, 'hours', r.hours, 'claimed_hours', r.claimed_hours, 'overtime_type', r.overtime_type,
        'reason', r.reason, 'status', r.status, 'review_notes', r.review_notes, 'reviewed_at', r.reviewed_at,
        'created_at', r.created_at, 'filed_by_hr', r.filed_by_hr, 'pay_stage', r.pay_stage,
        'payslip_month', r.payslip_month, 'locked', r.locked)
        ORDER BY (r.status = 'pending') DESC, r.date DESC, r.created_at DESC) FILTER (WHERE r.id IS NOT NULL), '[]'::json)
    )
    FROM rows r
  );
END;
$$;

-- I claim overtime hours; HR approves them and Finance prices them.
CREATE OR REPLACE FUNCTION public.portal_overtime_claim(
  p_token text, p_date date, p_hours numeric, p_type text, p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
  v_id uuid;
BEGIN
  PERFORM public._ot_check(v_emp.company_id, p_date, p_hours, p_type);
  INSERT INTO public.overtime_records (
    employee_id, company_id, date, hours, overtime_type, reason, status, requested_by,
    hourly_rate, multiplier, total_amount, pay_status
  )
  VALUES (v_emp.id, v_emp.company_id, p_date, p_hours, p_type, v_reason, 'pending', NULL, 0, 1, 0, 'unpriced')
  RETURNING id INTO v_id;

  PERFORM public._leave_log_portal(
    v_emp.company_id, v_emp.id, 'overtime.claimed',
    format('%s claimed %s %s overtime on %s', v_emp.name, public._ot_hours_label(p_hours), p_type, to_char(p_date, 'FMDD Mon YYYY')),
    jsonb_build_object('id', v_id, 'date', p_date, 'hours', p_hours, 'type', p_type, 'reason', v_reason)
  );
  PERFORM public.notify_roles(
    v_emp.company_id, ARRAY['hr'], 'overtime',
    format('%s claimed overtime', v_emp.name),
    format('%s %s on %s%s', public._ot_hours_label(p_hours), p_type, to_char(p_date, 'FMDD Mon YYYY'),
           CASE WHEN v_reason IS NOT NULL THEN format(' · "%s"', left(v_reason, 80)) ELSE '' END),
    format('/overtime-hours?month=%s&status=pending', to_char(p_date, 'YYYY-MM'))
  );
  RETURN json_build_object(
    'id', v_id,
    'status', 'pending',
    'message', format('Claim sent: %s on %s. HR approves the hours; approved overtime is paid with your salary.',
                      public._ot_hours_label(p_hours), to_char(p_date, 'FMDD Mon YYYY'))
  );
END;
$$;

-- I withdraw my own pending claim.
CREATE OR REPLACE FUNCTION public.portal_overtime_withdraw(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v record;
BEGIN
  SELECT o.id, o.date, o.hours, o.status, o.payslip_id
  INTO v
  FROM public.overtime_records o
  WHERE o.id = p_id AND o.employee_id = v_emp.id AND o.company_id = v_emp.company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'That claim no longer exists.');
  END IF;
  IF v.status <> 'pending' OR public._ot_locked(v.payslip_id) THEN
    RETURN json_build_object('error', 'Only a pending claim can be withdrawn.');
  END IF;
  DELETE FROM public.overtime_records WHERE id = p_id;
  PERFORM public._leave_log_portal(
    v_emp.company_id, v_emp.id, 'overtime.removed',
    format('%s withdrew their %s overtime claim on %s', v_emp.name, public._ot_hours_label(v.hours), to_char(v.date, 'FMDD Mon YYYY')),
    jsonb_build_object('id', p_id, 'date', v.date, 'hours', v.hours)
  );
  RETURN json_build_object('id', p_id, 'status', 'withdrawn');
END;
$$;

REVOKE ALL ON FUNCTION public.portal_leave_overview(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_leave_count_days(text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_leave_request(text, uuid, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_leave_cancel(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_overtime_overview(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_overtime_claim(text, date, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_overtime_withdraw(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_leave_overview(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_leave_count_days(text, date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_leave_request(text, uuid, date, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_leave_cancel(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_overtime_overview(text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_overtime_claim(text, date, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_overtime_withdraw(text, uuid) TO anon, authenticated;
