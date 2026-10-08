-- Payroll 5/5: the employee's own pay in the portal (anon key + portal token). Every function resolves
-- the employee and company from the token only, returns explicit columns, and shows only final or paid
-- payslips; drafts stay with Finance.

-- Final and paid payslips, newest month first.
CREATE OR REPLACE FUNCTION public.portal_payslips(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', p.id, 'month', p.month, 'status', p.status,
      'gross_salary', p.gross_salary, 'total_deductions', p.total_deductions, 'income_tax', p.income_tax,
      'net_salary', p.net_salary, 'paid_on', p.paid_on, 'pay_method', p.pay_method,
      'published_at', p.published_at, 'is_new', p.seen_at IS NULL
    ) ORDER BY p.month DESC)
    FROM public.payslips p
    WHERE p.employee_id = v_emp.id AND p.company_id = v_emp.company_id AND p.status IN ('final', 'paid')
  ), '[]'::json);
END;
$$;

-- One payslip, and it is no longer new to them.
CREATE OR REPLACE FUNCTION public.portal_payslip(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_result json;
BEGIN
  SELECT json_build_object(
    'payslip', json_build_object(
      'id', p.id, 'month', p.month, 'status', p.status, 'legacy', p.legacy,
      'basic_salary', p.basic_salary, 'allowances', p.allowances, 'other_allowances', p.other_allowances,
      'overtime_earnings', p.overtime_earnings, 'overtime_hours', p.overtime_hours,
      'income_tax', p.income_tax, 'taxable_income', p.taxable_income, 'other_deductions', p.other_deductions,
      'lines', p.lines, 'gross_salary', p.gross_salary, 'total_deductions', p.total_deductions, 'net_salary', p.net_salary,
      'daily_rate', p.daily_rate, 'days_worked', p.days_worked, 'present_days', p.present_days,
      'short_leave_days', p.short_leave_days, 'paid_leave_days', p.paid_leave_days, 'absent_days', p.absent_days,
      'paid_days', p.paid_days, 'month_days', p.month_days, 'notes', p.notes, 'paid_on', p.paid_on,
      'pay_method', p.pay_method, 'published_at', p.published_at),
    'employee', json_build_object(
      'name', e.name, 'code', e.employee_code, 'father_name', e.father_name, 'rank', e.rank, 'department', d.name,
      'cnic', e.cnic, 'bank_name', e.bank_name, 'bank_account_number', e.bank_account_number, 'joining_date', e.joining_date),
    'company', json_build_object(
      'name', c.name, 'logo', c.logo, 'currency', COALESCE(NULLIF(upper(c.currency), ''), 'PKR'),
      'address', c.address, 'phone', c.phone, 'website', c.website)
  )
  INTO v_result
  FROM public.payslips p
  JOIN public.employees e ON e.id = p.employee_id
  JOIN public.companies c ON c.id = p.company_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  WHERE p.id = p_id AND p.employee_id = v_emp.id AND p.company_id = v_emp.company_id AND p.status IN ('final', 'paid');

  IF v_result IS NULL THEN
    RETURN json_build_object('error', 'That payslip is not available.');
  END IF;
  UPDATE public.payslips SET seen_at = now()
  WHERE id = p_id AND employee_id = v_emp.id AND status IN ('final', 'paid') AND seen_at IS NULL;
  RETURN v_result;
END;
$$;

-- Final or paid payslips the employee has not opened since they changed: the badge on My payslips.
CREATE OR REPLACE FUNCTION public.portal_unseen_payslips(p_token text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN (SELECT count(*)::integer FROM public.payslips p
          WHERE p.employee_id = v_emp.id AND p.company_id = v_emp.company_id
            AND p.status IN ('final', 'paid') AND p.seen_at IS NULL);
END;
$$;

-- What the person can expect for a month before Finance finalises it: worked out exactly as a fresh
-- draft would be (the same days, salary, split and tax, and the priced overtime the payslip would take),
-- so the estimate and the payslip differ only by what Finance adds by hand or what changes later.
-- Overtime from an earlier month counts here only once that month's payslip is closed.
CREATE OR REPLACE FUNCTION public.portal_expected_pay(p_token text, p_month date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_start date := date_trunc('month', COALESCE(p_month, current_date)::timestamp)::date;
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
  IF v_start > date_trunc('month', current_date::timestamp)::date THEN
    RETURN json_build_object('error', 'Choose this month or an earlier one.');
  END IF;
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_rules := public._payroll_rules(v_emp.company_id);
  v_pay := public._payroll_month_pay(v_emp.id, v_start);

  -- The salary in force today (or on the last day of a past month). A raise dated later never shows early.
  v_on := LEAST(v_end, current_date);
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
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.portal_payslips(text)',
    'public.portal_payslip(text, uuid)',
    'public.portal_unseen_payslips(text)',
    'public.portal_expected_pay(text, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f);
  END LOOP;
END $$;
