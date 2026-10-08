-- Payroll: "today" is the company's day, not the database server's (UTC).
--
-- Between 00:00 and 05:00 in Asia/Karachi, current_date is still yesterday. During those hours:
--  * the sheet, payslip editor, HR updates and My pay left today's attendance out of "so far";
--  * a payment recorded without a date was dated yesterday, and the "too far ahead" check was a day short;
--  * on the 1st of a month, Salaries offered last month and this month instead of this month and next,
--    and My pay refused the new month ("Choose this month or an earlier one");
--  * Overtime pay and Pay reports defaulted to the wrong month when called without one.
-- Every function keeps its signature, attributes and grants; only current_date becomes public.company_today().

CREATE OR REPLACE FUNCTION public._payroll_attendance(p_employee uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;
  v_join date;
  v_sep date;
  v_company uuid;
  v_from date;
  v_to date;
  v_sofar date;
  v_month_days integer := 0;
  v_so_far integer := 0;
  v_unmarked integer := 0;
  v_present integer := 0;
  v_half integer := 0;
  v_leave integer := 0;
  v_absent integer := 0;
BEGIN
  SELECT e.joining_date, e.separation_date, e.company_id INTO v_join, v_sep, v_company FROM public.employees e WHERE e.id = p_employee;
  v_from := GREATEST(v_start, COALESCE(v_join, v_start));
  v_to := LEAST(v_end, COALESCE(v_sep, v_end));
  v_sofar := LEAST(v_to, public.company_today(v_company));

  IF v_from <= v_to THEN
    SELECT count(*) INTO v_month_days FROM public._payroll_working_dates(p_employee, v_from, v_to);
  END IF;
  IF v_from <= v_sofar THEN
    SELECT count(*), count(*) FILTER (WHERE a.id IS NULL)
    INTO v_so_far, v_unmarked
    FROM public._payroll_working_dates(p_employee, v_from, v_sofar) AS w(d)
    LEFT JOIN public.attendance a ON a.employee_id = p_employee AND a.date = w.d;

    SELECT count(*) FILTER (WHERE a.status IN ('present', 'late')),
           count(*) FILTER (WHERE a.status IN ('short_leave', 'half_day')),
           count(*) FILTER (WHERE a.status = 'leave' AND NOT EXISTS (
             SELECT 1 FROM public.leave_requests r
             JOIN public.leave_types t ON t.id = r.leave_type_id
             WHERE r.employee_id = p_employee AND r.status = 'approved' AND NOT t.is_paid
               AND a.date BETWEEN r.start_date AND r.end_date
           )),
           count(*) FILTER (WHERE a.status = 'absent')
    INTO v_present, v_half, v_leave, v_absent
    FROM public.attendance a
    WHERE a.employee_id = p_employee AND a.date BETWEEN v_from AND v_sofar;
  END IF;

  RETURN jsonb_build_object(
    'working_days', v_so_far,
    'working_days_month', v_month_days,
    'present', v_present,
    'half', v_half,
    'leave', v_leave,
    'absent', v_absent,
    'unmarked', v_unmarked,
    'days_worked', v_present + v_half * 0.5
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._payroll_set_status(p_payslip uuid, p_status text, p_paid_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  p public.payslips;
  v_att jsonb;
  v_month text;
  v_paid date;
BEGIN
  SELECT * INTO p FROM public.payslips WHERE id = p_payslip FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT ((p.status = 'draft' AND p_status = 'final')
       OR (p.status = 'final' AND p_status IN ('draft', 'paid'))
       OR (p.status = 'paid' AND p_status = 'final')) THEN
    RETURN NULL;
  END IF;
  v_month := public._payroll_month_label(p.month);

  IF p.status = 'draft' AND p_status = 'final' THEN
    -- Day counts are a snapshot: take a fresh one so the slip matches the register.
    v_att := public._payroll_attendance(p.employee_id, p.month);
    UPDATE public.payslips SET
      status = 'final', paid_on = NULL,
      days_worked = (v_att ->> 'days_worked')::numeric,
      present_days = (v_att ->> 'present')::integer,
      short_leave_days = (v_att ->> 'half')::integer,
      paid_leave_days = (v_att ->> 'leave')::numeric,
      absent_days = (v_att ->> 'absent')::numeric,
      published_at = COALESCE(published_at, now()),
      seen_at = NULL
    WHERE id = p.id;
    IF p.published_at IS NOT NULL THEN
      PERFORM public.notify_employee(p.company_id, p.employee_id, 'payroll',
        format('Your %s payslip was updated', v_month), 'Finance corrected it. Open it to see the figures.',
        '/portal/payslips/' || p.id);
    ELSE
      PERFORM public.notify_employee(p.company_id, p.employee_id, 'payroll',
        format('Your %s payslip is ready', v_month), 'Finance has finalised it. Payment follows.',
        '/portal/payslips/' || p.id);
    END IF;
  ELSIF p.status = 'final' AND p_status = 'paid' THEN
    v_paid := COALESCE(p_paid_on, public.company_today(p.company_id));
    UPDATE public.payslips SET status = 'paid', paid_on = v_paid, seen_at = NULL WHERE id = p.id;
    PERFORM public.notify_employee(p.company_id, p.employee_id, 'payroll',
      format('Your %s salary has been paid', v_month),
      format('Paid on %s%s.', public._payroll_day_label(v_paid), CASE WHEN p.pay_method = 'cash' THEN ', in cash' ELSE ' to your bank account' END),
      '/portal/payslips/' || p.id);
  ELSIF p.status = 'final' AND p_status = 'draft' THEN
    IF p.legacy THEN
      -- An earlier payroll's slip becomes an ordinary draft: what was paid stays as basic pay.
      UPDATE public.payslips SET
        status = 'draft', paid_on = NULL, legacy = false,
        salary_basis = basic_salary,
        basic_salary = round(gross_salary - COALESCE(overtime_earnings, 0), 2),
        allowances = 0, other_allowances = 0, other_basis = 0, income_tax = 0,
        taxable_income = round(gross_salary - COALESCE(overtime_earnings, 0), 2),
        tax_manual = true, other_deductions = total_deductions, lines = '[]'::jsonb,
        overtime_basis = 0, notes_auto = false
      WHERE id = p.id;
    ELSE
      UPDATE public.payslips SET status = 'draft', paid_on = NULL WHERE id = p.id;
    END IF;
    PERFORM public.notify_employee(p.company_id, p.employee_id, 'payroll',
      format('Your %s payslip is being corrected', v_month),
      'Finance reopened it. You will be told when it is ready again.', '/portal/pay');
  ELSE
    -- paid -> final
    UPDATE public.payslips SET status = 'final', paid_on = NULL WHERE id = p.id;
  END IF;
  RETURN p.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_apply(p_month date, p_op text, p_employee_ids uuid[] DEFAULT NULL::uuid[], p_paid_on date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_today date := public.company_today(v_company);
  v_start date;
  v_rules jsonb;
  v_currency text;
  v_sheet uuid[];
  v_ids uuid[];
  v_id uuid;
  v_name text;
  p public.payslips;
  v_has boolean;
  v_after uuid;
  v_r jsonb;
  v_res text;
  v_stale jsonb;
  v_done jsonb := '[]'::jsonb;
  v_skipped integer := 0;
  v_negative integer := 0;
  v_paid date := COALESCE(p_paid_on, v_today);
  v_net numeric;
  v_count integer;
  v_names text;
  v_words text[];
BEGIN
  IF p_op IS NULL OR NOT (p_op = ANY (ARRAY['prepare', 'refill', 'refill_stale', 'finalise', 'reopen', 'paid', 'unpaid', 'delete'])) THEN
    RETURN jsonb_build_object('error', 'That step is not known.');
  END IF;
  IF p_month IS NULL THEN
    RETURN jsonb_build_object('error', 'Choose a month.');
  END IF;
  IF p_op = 'paid' AND p_paid_on IS NOT NULL AND p_paid_on > v_today + 62 THEN
    RETURN jsonb_build_object('error', 'The payment date is too far ahead. Use the day the money was sent.');
  END IF;
  v_start := date_trunc('month', p_month::timestamp)::date;
  v_rules := public._payroll_rules(v_company);
  SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') INTO v_currency FROM public.companies c WHERE c.id = v_company;
  v_sheet := ARRAY(SELECT s.id FROM public._payroll_sheet_employees(v_company, v_start) AS s(id));

  IF p_employee_ids IS NULL THEN
    IF p_op = 'prepare' THEN
      v_ids := v_sheet;
    ELSE
      v_ids := ARRAY(SELECT p2.employee_id FROM public.payslips p2 WHERE p2.company_id = v_company AND p2.month = v_start);
    END IF;
  ELSE
    v_ids := ARRAY(SELECT DISTINCT e.id FROM public.employees e WHERE e.id = ANY (p_employee_ids) AND e.company_id = v_company);
    v_skipped := (SELECT count(DISTINCT x) FROM unnest(p_employee_ids) AS x) - COALESCE(cardinality(v_ids), 0);
  END IF;

  FOREACH v_id IN ARRAY COALESCE(v_ids, '{}'::uuid[]) LOOP
    SELECT e.name INTO v_name FROM public.employees e WHERE e.id = v_id;
    SELECT * INTO p FROM public.payslips WHERE employee_id = v_id AND month = v_start FOR UPDATE;
    v_has := FOUND;
    v_after := NULL;
    v_net := NULL;

    IF p_op = 'prepare' THEN
      IF v_has OR NOT (v_id = ANY (v_sheet)) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      v_r := public._payroll_prepare(v_id, v_start, v_rules, v_currency);
      IF v_r IS NULL THEN
        v_skipped := v_skipped + 1;
      ELSIF v_r ? 'negative' THEN
        v_negative := v_negative + 1;
      ELSIF (v_r ->> 'created')::boolean THEN
        v_after := (v_r ->> 'id')::uuid;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    ELSIF NOT v_has THEN
      v_skipped := v_skipped + 1;
    ELSIF p_op IN ('refill', 'refill_stale') AND p.status = 'draft' THEN
      IF p_op = 'refill_stale' THEN
        v_stale := public._payroll_stale(p.id, public._payroll_month_pay(v_id, v_start));
        IF NOT ((v_stale ->> 'salary')::boolean OR (v_stale ->> 'overtime')::boolean) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
      END IF;
      v_res := public._payroll_refill(p.id, v_rules, v_currency);
      IF v_res = 'ok' THEN
        v_after := p.id;
      ELSIF v_res = 'negative' THEN
        v_negative := v_negative + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    ELSIF p_op = 'finalise' AND p.status = 'draft' THEN
      v_after := public._payroll_set_status(p.id, 'final', NULL);
    ELSIF p_op = 'reopen' AND p.status = 'final' THEN
      v_after := public._payroll_set_status(p.id, 'draft', NULL);
    ELSIF p_op = 'paid' AND p.status = 'final' THEN
      v_after := public._payroll_set_status(p.id, 'paid', v_paid);
    ELSIF p_op = 'unpaid' AND p.status = 'paid' THEN
      v_after := public._payroll_set_status(p.id, 'final', NULL);
    ELSIF p_op = 'delete' AND p.status = 'draft' THEN
      -- Overtime it carried goes back for the next draft (overtime_records.payslip_id ON DELETE SET NULL).
      DELETE FROM public.payslips WHERE id = p.id AND status = 'draft';
      v_after := p.id;
      v_net := p.net_salary;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;

    IF v_after IS NOT NULL THEN
      IF v_net IS NULL THEN
        SELECT p3.net_salary INTO v_net FROM public.payslips p3 WHERE p3.id = v_after;
      END IF;
      v_done := v_done || jsonb_build_object(
        'employee_id', v_id, 'name', v_name,
        'payslip_id', CASE WHEN p_op = 'delete' THEN NULL ELSE v_after END,
        'net', v_net);
    END IF;
  END LOOP;

  v_count := jsonb_array_length(v_done);
  IF v_count > 0 THEN
    v_words := CASE p_op
      WHEN 'prepare' THEN ARRAY['Prepared', 'draft payslip']
      WHEN 'refill' THEN ARRAY['Refilled', 'draft']
      WHEN 'refill_stale' THEN ARRAY['Refilled', 'draft']
      WHEN 'finalise' THEN ARRAY['Finalised', 'payslip']
      WHEN 'reopen' THEN ARRAY['Reopened', 'payslip']
      WHEN 'paid' THEN ARRAY['Marked as paid', 'payslip']
      WHEN 'unpaid' THEN ARRAY['Undid the payment mark on', 'payslip']
      ELSE ARRAY['Deleted', 'draft'] END;
    SELECT string_agg(x ->> 'name', ', ') INTO v_names FROM (SELECT x FROM jsonb_array_elements(v_done) AS x LIMIT 6) t;
    PERFORM public.log_activity(
      'payroll.' || CASE WHEN p_op = 'refill_stale' THEN 'refill' ELSE p_op END,
      format('%s %s %s%s for %s%s: %s%s', v_words[1], v_count, v_words[2], CASE WHEN v_count = 1 THEN '' ELSE 's' END,
             public._payroll_month_label(v_start),
             CASE WHEN p_op = 'paid' THEN format(' (paid on %s)', public._payroll_day_label(v_paid)) ELSE '' END,
             v_names, CASE WHEN v_count > 6 THEN format(' and %s more', v_count - 6) ELSE '' END),
      jsonb_build_object('month', v_start, 'op', p_op, 'paid_on', CASE WHEN p_op = 'paid' THEN v_paid END,
                         'done', v_done, 'skipped', v_skipped, 'negative', v_negative),
      CASE WHEN v_count = 1 THEN (v_done -> 0 ->> 'employee_id')::uuid END);
  END IF;

  RETURN jsonb_build_object('op', p_op, 'done', v_done, 'skipped', v_skipped, 'negative', v_negative);
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_salary_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_today date := public.company_today(v_company);
  v_this date := date_trunc('month', v_today::timestamp)::date;
BEGIN
  RETURN jsonb_build_object(
    'this_month', v_this,
    'next_month', (v_this + interval '1 month')::date,
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id, 'code', e.employee_code, 'name', e.name, 'rank', e.rank, 'status', e.status,
        'department_id', e.department_id, 'department', d.name,
        'joining_date', e.joining_date, 'separation_date', e.separation_date,
        'has_bank', COALESCE(btrim(e.bank_account_number), '') <> '',
        'current', cur.j,
        'upcoming', up.j
      ) ORDER BY (e.status = 'active') DESC, e.name), '[]'::jsonb)
      FROM public.employees e
      LEFT JOIN public.departments d ON d.id = e.department_id
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('id', h.id, 'monthly_salary', h.monthly_salary, 'other_allowance', h.other_allowance,
                                  'pay_method', h.pay_method, 'effective_from', h.effective_from, 'reason', h.reason) AS j
        FROM public.salary_history h
        WHERE h.employee_id = e.id
        ORDER BY (h.effective_from <= v_today) DESC,
                 CASE WHEN h.effective_from <= v_today THEN h.effective_from END DESC NULLS LAST,
                 h.effective_from
        LIMIT 1
      ) cur ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('id', h.id, 'monthly_salary', h.monthly_salary, 'other_allowance', h.other_allowance,
                                  'pay_method', h.pay_method, 'effective_from', h.effective_from, 'reason', h.reason) AS j
        FROM public.salary_history h
        WHERE h.employee_id = e.id AND h.effective_from > v_today
          AND EXISTS (SELECT 1 FROM public.salary_history h0 WHERE h0.employee_id = e.id AND h0.effective_from <= v_today)
        ORDER BY h.effective_from
        LIMIT 1
      ) up ON true
      WHERE e.company_id = v_company
    ),
    'changes', (
      SELECT COALESCE(jsonb_agg(c.j ORDER BY c.created_at DESC, c.id DESC), '[]'::jsonb)
      FROM (
        SELECT h.id, h.created_at, jsonb_build_object(
          'id', h.id, 'employee_id', h.employee_id, 'employee_name', e.name,
          'effective_from', h.effective_from, 'monthly_salary', h.monthly_salary, 'other_allowance', h.other_allowance,
          'pay_method', h.pay_method, 'reason', h.reason, 'created_at', h.created_at,
          'created_by_name', NULLIF(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
          'previous_salary', (
            SELECT h2.monthly_salary FROM public.salary_history h2
            WHERE h2.employee_id = h.employee_id AND h2.effective_from < h.effective_from
            ORDER BY h2.effective_from DESC LIMIT 1),
          'upcoming', h.effective_from > v_today,
          'can_undo', NOT EXISTS (
            SELECT 1 FROM public.payslips ps
            WHERE ps.employee_id = h.employee_id AND ps.status IN ('final', 'paid')
              AND ps.month >= date_trunc('month', h.effective_from::timestamp)::date)
        ) AS j
        FROM public.salary_history h
        JOIN public.employees e ON e.id = h.employee_id
        LEFT JOIN public.profiles pr ON pr.id = h.created_by
        WHERE h.company_id = v_company
          AND h.effective_from > (SELECT min(h3.effective_from) FROM public.salary_history h3 WHERE h3.employee_id = h.employee_id)
        ORDER BY h.created_at DESC, h.id DESC
        LIMIT 40
      ) c
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_save_salaries(p_rows jsonb, p_effective_month date, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_this date := date_trunc('month', public.company_today(v_company)::timestamp)::date;
  v_next date := (v_this + interval '1 month')::date;
  v_eff date := date_trunc('month', p_effective_month::timestamp)::date;
  v_reason text := left(btrim(COALESCE(p_reason, '')), 120);
  v_currency text;
  r record;
  v_emp uuid;
  e record;
  v_sal numeric;
  v_oth numeric;
  v_meth text;
  v_first boolean;
  v_date date;
  b_found boolean;
  b_sal numeric;
  b_oth numeric;
  b_meth text;
  v_changed jsonb := '[]'::jsonb;
  v_kept text[] := '{}';
  v_status text;
BEGIN
  IF v_eff IS NULL OR v_eff NOT IN (v_this, v_next) THEN
    RETURN jsonb_build_object('error', format('Choose whether the new salaries apply from %s or %s.',
      public._payroll_month_label(v_this), public._payroll_month_label(v_next)));
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('error', 'Nothing to save.');
  END IF;
  IF jsonb_array_length(p_rows) > 2000 THEN
    RETURN jsonb_build_object('error', 'Save at most 2,000 people at once.');
  END IF;
  SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') INTO v_currency FROM public.companies c WHERE c.id = v_company;

  FOR r IN SELECT x AS v FROM jsonb_array_elements(p_rows) AS x LOOP
    IF jsonb_typeof(r.v) <> 'object' OR COALESCE(r.v ->> 'employee_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      CONTINUE;
    END IF;
    v_emp := (r.v ->> 'employee_id')::uuid;
    SELECT em.id, em.name, em.joining_date INTO e FROM public.employees em WHERE em.id = v_emp AND em.company_id = v_company;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_sal := public._payroll_num(r.v -> 'monthly_salary');
    IF v_sal IS NULL THEN RETURN jsonb_build_object('error', format('%s''s salary must be a number.', e.name)); END IF;
    IF v_sal < 0 THEN RETURN jsonb_build_object('error', format('%s''s salary cannot be negative.', e.name)); END IF;
    IF v_sal >= 100000000 THEN RETURN jsonb_build_object('error', format('%s''s salary is too large.', e.name)); END IF;
    v_oth := COALESCE(public._payroll_num(r.v -> 'other_allowance'), CASE WHEN jsonb_typeof(r.v -> 'other_allowance') IN ('number', 'string') THEN NULL ELSE 0 END);
    IF v_oth IS NULL THEN RETURN jsonb_build_object('error', format('%s''s other allowance must be a number.', e.name)); END IF;
    IF v_oth < 0 THEN RETURN jsonb_build_object('error', format('%s''s other allowance cannot be negative.', e.name)); END IF;
    IF v_oth >= 100000000 THEN RETURN jsonb_build_object('error', format('%s''s other allowance is too large.', e.name)); END IF;
    v_sal := round(v_sal, 2);
    v_oth := round(v_oth, 2);
    v_meth := CASE WHEN r.v ->> 'pay_method' = 'cash' THEN 'cash' ELSE 'bank' END;

    v_first := NOT EXISTS (SELECT 1 FROM public.salary_history h WHERE h.employee_id = v_emp);
    v_date := CASE WHEN v_first THEN LEAST(v_eff, COALESCE(e.joining_date, v_eff)) ELSE v_eff END;

    SELECT h.monthly_salary, h.other_allowance, h.pay_method INTO b_sal, b_oth, b_meth
    FROM public.salary_history h
    WHERE h.employee_id = v_emp
    ORDER BY (h.effective_from <= v_date) DESC,
             CASE WHEN h.effective_from <= v_date THEN h.effective_from END DESC NULLS LAST,
             h.effective_from
    LIMIT 1;
    b_found := FOUND;
    IF b_found AND b_sal = v_sal AND b_oth = v_oth AND b_meth = v_meth THEN
      CONTINUE;
    END IF;

    INSERT INTO public.salary_history AS sh (company_id, employee_id, effective_from, monthly_salary, other_allowance, pay_method, reason, created_by)
    VALUES (v_company, v_emp, v_date, v_sal, v_oth, v_meth, NULLIF(v_reason, ''), auth.uid())
    ON CONFLICT (employee_id, effective_from) DO UPDATE SET
      monthly_salary = EXCLUDED.monthly_salary,
      other_allowance = EXCLUDED.other_allowance,
      pay_method = EXCLUDED.pay_method,
      reason = COALESCE(EXCLUDED.reason, sh.reason),
      created_by = EXCLUDED.created_by,
      created_at = now();

    PERFORM public.log_activity('payroll.salary',
      format('Set %s''s salary to %s%s, paid by %s, from %s%s', e.name, public._payroll_fmt(v_sal, v_currency),
             CASE WHEN v_oth > 0 THEN format(' plus %s other allowance', public._payroll_fmt(v_oth, v_currency)) ELSE '' END,
             v_meth, public._payroll_day_label(v_date), CASE WHEN v_reason <> '' THEN format(' (%s)', v_reason) ELSE '' END),
      jsonb_build_object(
        'from', CASE WHEN b_found THEN jsonb_build_object('monthly_salary', b_sal, 'other_allowance', b_oth, 'pay_method', b_meth) END,
        'to', jsonb_build_object('monthly_salary', v_sal, 'other_allowance', v_oth, 'pay_method', v_meth),
        'effective_from', v_date, 'reason', v_reason),
      v_emp);

    v_changed := v_changed || jsonb_build_object('employee_id', v_emp, 'name', e.name, 'effective_from', v_date,
                                                 'monthly_salary', v_sal, 'other_allowance', v_oth, 'pay_method', v_meth);
    SELECT ps.status INTO v_status FROM public.payslips ps WHERE ps.employee_id = v_emp AND ps.month = v_eff;
    IF v_status IN ('final', 'paid') THEN
      v_kept := v_kept || e.name;
    END IF;
    v_status := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'changed', v_changed, 'kept', to_jsonb(v_kept), 'effective_from', v_eff);
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_overtime(p_scope text DEFAULT 'waiting'::text, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_rules jsonb := public._payroll_rules(v_company);
  v_start date := date_trunc('month', COALESCE(p_month, public.company_today(v_company))::timestamp)::date;
  v_end date := (v_start + interval '1 month - 1 day')::date;
  v_scope text := CASE WHEN p_scope IN ('waiting', 'month', 'ready') THEN p_scope ELSE 'waiting' END;
BEGIN
  RETURN jsonb_build_object(
    'scope', v_scope,
    'month', v_start,
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', x.id, 'employee_id', x.employee_id, 'employee_name', x.employee_name, 'employee_code', x.employee_code,
        'rank', x.rank, 'department', x.department, 'date', x.date, 'hours', x.hours, 'overtime_type', x.overtime_type,
        'reason', x.reason, 'reviewed_at', x.reviewed_at, 'reviewer_name', x.reviewer_name,
        'pay_status', x.pay_status, 'hourly_rate', x.hourly_rate, 'multiplier', x.multiplier, 'amount', x.total_amount,
        'priced_at', x.priced_at, 'pricer_name', x.pricer_name,
        'payslip_id', x.payslip_id, 'payslip_month', x.payslip_month, 'payslip_status', x.payslip_status,
        'locked', COALESCE(x.payslip_status IN ('final', 'paid'), false),
        'monthly_salary', COALESCE(x.monthly_salary, 0),
        'suggested_rate', public._payroll_suggested_rate(x.monthly_salary, v_rules),
        'suggested_multiplier', public._payroll_multiplier(x.overtime_type, v_rules),
        'suggested_amount', public._payroll_ot_amount(x.hours, public._payroll_suggested_rate(x.monthly_salary, v_rules),
                                                      public._payroll_multiplier(x.overtime_type, v_rules))
      ) ORDER BY x.date, x.employee_name, x.id), '[]'::jsonb)
      FROM (
        SELECT o.id, o.employee_id, e.name AS employee_name, e.employee_code, e.rank, d.name AS department,
               o.date, o.hours, o.overtime_type, o.reason, o.reviewed_at, o.pay_status, o.hourly_rate, o.multiplier,
               o.total_amount, o.priced_at, o.payslip_id, ps.month AS payslip_month, ps.status AS payslip_status,
               NULLIF(btrim(concat_ws(' ', rv.first_name, rv.last_name)), '') AS reviewer_name,
               NULLIF(btrim(concat_ws(' ', pc.first_name, pc.last_name)), '') AS pricer_name,
               (SELECT h.monthly_salary FROM public.salary_history h
                 WHERE h.employee_id = o.employee_id
                 ORDER BY (h.effective_from <= o.date) DESC,
                          CASE WHEN h.effective_from <= o.date THEN h.effective_from END DESC NULLS LAST,
                          h.effective_from
                 LIMIT 1) AS monthly_salary
        FROM public.overtime_records o
        JOIN public.employees e ON e.id = o.employee_id
        LEFT JOIN public.departments d ON d.id = e.department_id
        LEFT JOIN public.payslips ps ON ps.id = o.payslip_id
        LEFT JOIN public.profiles rv ON rv.id = o.reviewed_by
        LEFT JOIN public.profiles pc ON pc.id = o.priced_by
        WHERE o.company_id = v_company
          AND o.status = 'approved'
          AND CASE v_scope
                WHEN 'waiting' THEN o.pay_status = 'unpriced'
                WHEN 'ready' THEN o.pay_status = 'priced' AND COALESCE(ps.status, 'draft') = 'draft'
                ELSE o.date BETWEEN v_start AND v_end
              END
        LIMIT 1000
      ) x
    ),
    'counts', (
      SELECT jsonb_build_object(
        'waiting', count(*) FILTER (WHERE o.status = 'approved' AND o.pay_status = 'unpriced'),
        'waiting_hours', COALESCE(round(sum(o.hours) FILTER (WHERE o.status = 'approved' AND o.pay_status = 'unpriced'), 2), 0),
        'ready', count(*) FILTER (WHERE o.status = 'approved' AND o.pay_status = 'priced' AND COALESCE(ps.status, 'draft') = 'draft'),
        'ready_amount', COALESCE(round(sum(o.total_amount) FILTER (WHERE o.status = 'approved' AND o.pay_status = 'priced' AND COALESCE(ps.status, 'draft') = 'draft'), 2), 0),
        'pending_with_hr', count(*) FILTER (WHERE o.status = 'pending'))
      FROM public.overtime_records o
      LEFT JOIN public.payslips ps ON ps.id = o.payslip_id
      WHERE o.company_id = v_company
    ),
    'rules', v_rules -> 'overtime'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_today date := public.company_today(v_company);
  v_from date := date_trunc('month', COALESCE(p_from, v_today - interval '11 months')::timestamp)::date;
  v_to date := date_trunc('month', COALESCE(p_to, v_today)::timestamp)::date;
BEGIN
  IF v_to < v_from THEN
    RETURN jsonb_build_object('error', 'The end month is before the start month.');
  END IF;
  IF v_to > (v_from + interval '35 months')::date THEN
    v_from := (v_to - interval '35 months')::date;
  END IF;
  RETURN jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'months', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', m.month, 'payslips', COALESCE(s.payslips, 0), 'drafts', COALESCE(s.drafts, 0), 'finals', COALESCE(s.finals, 0),
        'paid', COALESCE(s.paid, 0), 'basic', COALESCE(s.basic, 0), 'allowances', COALESCE(s.allowances, 0),
        'other_allowances', COALESCE(s.other, 0), 'overtime', COALESCE(s.overtime, 0), 'gross', COALESCE(s.gross, 0),
        'tax', COALESCE(s.tax, 0), 'deductions', COALESCE(s.deductions, 0), 'net', COALESCE(s.net, 0),
        'paid_net', COALESCE(s.paid_net, 0)
      ) ORDER BY m.month), '[]'::jsonb)
      FROM (SELECT g::date AS month FROM generate_series(v_from::timestamp, v_to::timestamp, interval '1 month') AS g) m
      LEFT JOIN (
        SELECT ps.month, count(*) AS payslips,
               count(*) FILTER (WHERE ps.status = 'draft') AS drafts,
               count(*) FILTER (WHERE ps.status = 'final') AS finals,
               count(*) FILTER (WHERE ps.status = 'paid') AS paid,
               COALESCE(sum(ps.basic_salary) FILTER (WHERE NOT ps.legacy), 0)
                 + COALESCE(sum(ps.gross_salary - COALESCE(ps.overtime_earnings, 0)) FILTER (WHERE ps.legacy), 0) AS basic,
               sum(ps.allowances) AS allowances, sum(ps.other_allowances) AS other,
               sum(COALESCE(ps.overtime_earnings, 0)) AS overtime, sum(ps.gross_salary) AS gross,
               sum(ps.income_tax) AS tax, sum(ps.total_deductions) AS deductions, sum(ps.net_salary) AS net,
               sum(ps.net_salary) FILTER (WHERE ps.status = 'paid') AS paid_net
        FROM public.payslips ps
        WHERE ps.company_id = v_company AND ps.month BETWEEN v_from AND v_to
        GROUP BY ps.month
      ) s ON s.month = m.month
    ),
    'departments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'department', t.department, 'people', t.people, 'payslips', t.payslips, 'gross', t.gross, 'tax', t.tax,
        'overtime', t.overtime, 'net', t.net) ORDER BY t.gross DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(d.name, 'No department') AS department, count(DISTINCT ps.employee_id) AS people, count(*) AS payslips,
               sum(ps.gross_salary) AS gross, sum(ps.income_tax) AS tax, sum(COALESCE(ps.overtime_earnings, 0)) AS overtime,
               sum(ps.net_salary) AS net
        FROM public.payslips ps
        JOIN public.employees e ON e.id = ps.employee_id
        LEFT JOIN public.departments d ON d.id = e.department_id
        WHERE ps.company_id = v_company AND ps.month BETWEEN v_from AND v_to
        GROUP BY COALESCE(d.name, 'No department')
      ) t
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_expected_pay(p_token text, p_month date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public.company_today(v_emp.company_id);
  v_start date := date_trunc('month', COALESCE(p_month, v_today)::timestamp)::date;
  v_end date;
  v_rules jsonb;
  v_pay jsonb;
  v_salary numeric := 0;
  v_on date;
  p public.payslips;
  v_has boolean;
  v_prev text;
  v_carry boolean;
  v_draft uuid;
  v_rate numeric;
  r record;
  c_entries integer := 0;
  c_hours numeric := 0;
  c_amount numeric := 0;
  u_entries integer := 0;
  u_hours numeric := 0;
  u_estimate numeric := 0;
  w_entries integer := 0;
  w_hours numeric := 0;
  v_b jsonb;
  v_other numeric;
  v_t jsonb;
BEGIN
  IF v_start > date_trunc('month', v_today::timestamp)::date THEN
    RETURN json_build_object('error', 'Choose this month or an earlier one.');
  END IF;
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_rules := public._payroll_rules(v_emp.company_id);
  v_pay := public._payroll_month_pay(v_emp.id, v_start);

  -- The salary in force today (or on the last day of a past month). A raise dated later never shows early.
  v_on := LEAST(v_end, v_today);
  SELECT h.monthly_salary INTO v_salary
  FROM public.salary_history h
  WHERE h.employee_id = v_emp.id
  ORDER BY (h.effective_from <= v_on) DESC,
           CASE WHEN h.effective_from <= v_on THEN h.effective_from END DESC NULLS LAST,
           h.effective_from
  LIMIT 1;
  v_salary := COALESCE(v_salary, 0);

  SELECT * INTO p FROM public.payslips WHERE employee_id = v_emp.id AND month = v_start;
  v_has := FOUND;
  v_draft := CASE WHEN v_has AND p.status = 'draft' THEN p.id END;
  SELECT ps.status INTO v_prev FROM public.payslips ps
  WHERE ps.employee_id = v_emp.id AND ps.month = (v_start - interval '1 month')::date;
  v_carry := v_prev IS NOT NULL AND v_prev <> 'draft';
  v_rate := public._payroll_suggested_rate(v_salary, v_rules);

  FOR r IN
    SELECT o.hours, o.total_amount, o.status, o.pay_status, o.overtime_type
    FROM public.overtime_records o
    WHERE o.employee_id = v_emp.id
      AND o.date <= v_end
      AND ((o.payslip_id IS NULL AND (v_carry OR o.date >= v_start))
           OR (v_draft IS NOT NULL AND o.payslip_id = v_draft))
  LOOP
    IF r.status = 'approved' AND r.pay_status = 'priced' THEN
      c_entries := c_entries + 1;
      c_hours := c_hours + r.hours;
      c_amount := c_amount + r.total_amount;
    ELSIF r.status = 'approved' AND r.pay_status = 'unpriced' THEN
      u_entries := u_entries + 1;
      u_hours := u_hours + r.hours;
      u_estimate := u_estimate + public._payroll_ot_amount(r.hours, v_rate, public._payroll_multiplier(r.overtime_type, v_rules));
    ELSIF r.status = 'pending' THEN
      w_entries := w_entries + 1;
      w_hours := w_hours + r.hours;
    END IF;
  END LOOP;

  v_b := public._payroll_breakdown((v_pay ->> 'monthly_salary')::numeric, v_rules);
  v_other := round((v_pay ->> 'other_allowance')::numeric, 2);
  v_t := public._payroll_totals((v_b ->> 'basic')::numeric, (v_b ->> 'allowances')::numeric, v_other,
                                round(c_amount, 2), (v_b ->> 'monthly_tax')::numeric, 0, '[]'::jsonb);

  RETURN json_build_object(
    'month', v_start,
    'currency', (SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') FROM public.companies c WHERE c.id = v_emp.company_id),
    'salary_on_file', v_salary,
    'pay', v_pay - 'segments',
    'figures', json_build_object(
      'basic_salary', v_b -> 'basic', 'allowances', v_b -> 'allowances', 'other_allowances', v_other,
      'overtime_earnings', round(c_amount, 2), 'income_tax', v_b -> 'monthly_tax', 'taxable_income', v_b -> 'taxable'),
    'totals', v_t,
    'overtime', json_build_object(
      'counted', json_build_object('entries', c_entries, 'hours', round(c_hours, 2), 'amount', round(c_amount, 2)),
      'unpriced', json_build_object('entries', u_entries, 'hours', round(u_hours, 2), 'estimate', round(u_estimate, 2)),
      'pending', json_build_object('entries', w_entries, 'hours', round(w_hours, 2))),
    'attendance', public._payroll_attendance(v_emp.id, v_start),
    'payslip', CASE WHEN v_has AND p.status <> 'draft' THEN json_build_object(
      'id', p.id, 'status', p.status, 'gross_salary', p.gross_salary, 'net_salary', p.net_salary, 'paid_on', p.paid_on) END,
    'preparing', v_draft IS NOT NULL
  );
END;
$function$;
