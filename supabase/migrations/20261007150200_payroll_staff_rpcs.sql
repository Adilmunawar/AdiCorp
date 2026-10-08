-- Payroll 3/5: Finance/owner RPCs. Every function checks the caller is Finance or the owner of the
-- company it acts on (_payroll_assert_finance) and resolves rows by company; nothing trusts a company id
-- from the client. Every step that changes something writes a 'payroll.*' activity entry (hidden from HR).
-- Validation errors come back as {"error": "..."}; permission problems raise 42501.

-- ---------------------------------------------------------------------------
-- Pay rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_rules()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'rules', public._payroll_rules(v_company),
      'defaults', public._payroll_default_rules(v_company),
      'saved', s.company_id IS NOT NULL,
      'updated_at', s.updated_at,
      'updated_by_name', NULLIF(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
      'currency', COALESCE(NULLIF(upper(c.currency), ''), 'PKR')
    )
    FROM public.companies c
    LEFT JOIN public.payroll_settings s ON s.company_id = c.id
    LEFT JOIN public.profiles pr ON pr.id = s.updated_by
    WHERE c.id = v_company
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_save_rules(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  r jsonb := COALESCE(p_rules, '{}'::jsonb);
  o jsonb;
  v numeric;
  v_slabs jsonb := '[]'::jsonb;
  s record;
  v_from numeric;
  v_fixed numeric;
  v_rate numeric;
  v_froms numeric[] := '{}';
  v_clean jsonb;
  f record;
BEGIN
  IF jsonb_typeof(r) <> 'object' THEN
    RETURN jsonb_build_object('error', 'Send the rules as an object.');
  END IF;
  v := public._payroll_num(r -> 'basic_percent');
  IF v IS NULL THEN RETURN jsonb_build_object('error', 'Basic share must be a number.'); END IF;
  IF v <= 0 THEN RETURN jsonb_build_object('error', 'Basic share must be more than 0%.'); END IF;
  IF v > 100 THEN RETURN jsonb_build_object('error', 'Basic share is a percentage, 100 at most.'); END IF;
  v := public._payroll_num(r -> 'medical_exempt_percent');
  IF v IS NULL THEN RETURN jsonb_build_object('error', 'Medical exemption must be a number.'); END IF;
  IF v < 0 THEN RETURN jsonb_build_object('error', 'Medical exemption cannot be negative.'); END IF;
  IF v > 100 THEN RETURN jsonb_build_object('error', 'Medical exemption is a percentage, 100 at most.'); END IF;
  IF jsonb_typeof(r -> 'label') = 'string' AND char_length(r ->> 'label') > 80 THEN
    RETURN jsonb_build_object('error', 'Keep the table name to 80 characters.');
  END IF;

  IF jsonb_typeof(r -> 'slabs') IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('error', 'The table needs at least one row.');
  END IF;
  IF jsonb_array_length(r -> 'slabs') = 0 THEN
    RETURN jsonb_build_object('error', 'The table needs at least one row.');
  END IF;
  IF jsonb_array_length(r -> 'slabs') > 12 THEN
    RETURN jsonb_build_object('error', 'The table can have at most 12 rows.');
  END IF;
  FOR s IN SELECT x.value AS v, x.ord FROM jsonb_array_elements(r -> 'slabs') WITH ORDINALITY AS x(value, ord) LOOP
    v_from := public._payroll_num(s.v -> 'from');
    v_fixed := public._payroll_num(s.v -> 'fixed');
    v_rate := public._payroll_num(s.v -> 'rate');
    IF v_from IS NULL OR v_from < 0 OR v_from >= 10000000000 THEN
      RETURN jsonb_build_object('error', format('Row %s: the yearly income must be 0 or more.', s.ord));
    END IF;
    IF v_fixed IS NULL OR v_fixed < 0 OR v_fixed >= 10000000000 THEN
      RETURN jsonb_build_object('error', format('Row %s: the fixed tax must be 0 or more.', s.ord));
    END IF;
    IF v_rate IS NULL OR v_rate < 0 OR v_rate > 100 THEN
      RETURN jsonb_build_object('error', format('Row %s: the rate is a percentage between 0 and 100.', s.ord));
    END IF;
    IF round(v_from, 2) = ANY (v_froms) THEN
      RETURN jsonb_build_object('error', 'Two rows start at the same income. Each row needs its own starting amount.');
    END IF;
    v_froms := v_froms || round(v_from, 2);
  END LOOP;

  o := CASE WHEN jsonb_typeof(r -> 'overtime') = 'object' THEN r -> 'overtime' ELSE '{}'::jsonb END;
  FOR f IN SELECT * FROM (VALUES
      ('days_per_month', 'Days a month', 31::numeric, o -> 'days_per_month'),
      ('hours_per_day', 'Hours a day', 24::numeric, o -> 'hours_per_day'),
      ('regular', 'The working-day multiplier', 10::numeric, o -> 'multipliers' -> 'regular'),
      ('weekend', 'The weekend multiplier', 10::numeric, o -> 'multipliers' -> 'weekend'),
      ('holiday', 'The holiday multiplier', 10::numeric, o -> 'multipliers' -> 'holiday')
    ) AS t(key, label, hi, val)
  LOOP
    v := public._payroll_num(f.val);
    IF v IS NULL OR v <= 0 OR v > f.hi THEN
      RETURN jsonb_build_object('error', format('%s must be more than 0 and at most %s.', f.label, f.hi));
    END IF;
  END LOOP;

  v_clean := public._payroll_clean_rules(r, public._payroll_default_rules(v_company));
  INSERT INTO public.payroll_settings (company_id, rules, updated_by, updated_at)
  VALUES (v_company, v_clean, auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE SET rules = EXCLUDED.rules, updated_by = EXCLUDED.updated_by, updated_at = now();

  PERFORM public.log_activity('payroll.rules',
    format('Updated the salary structure, tax table (%s rows) and overtime rates', jsonb_array_length(v_clean -> 'slabs')),
    jsonb_build_object('rules', v_clean));
  RETURN jsonb_build_object('ok', true, 'rules', v_clean);
END;
$$;

-- ---------------------------------------------------------------------------
-- The payroll sheet for a month
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_sheet(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_start date;
  v_end date;
  v_rows jsonb := '[]'::jsonb;
  e record;
  p public.payslips;
  v_has boolean;
  v_pay jsonb;
  v_ot jsonb;
  v_stale jsonb;
  v_wait integer;
BEGIN
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'Choose a month' USING ERRCODE = '22023';
  END IF;
  v_start := date_trunc('month', p_month::timestamp)::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  FOR e IN
    SELECT emp.id, emp.employee_code, emp.name, emp.rank, emp.status, emp.joining_date, emp.separation_date,
           emp.department_id, d.name AS department,
           COALESCE(btrim(emp.bank_account_number), '') <> '' AS has_bank
    FROM public._payroll_sheet_employees(v_company, v_start) AS s(id)
    JOIN public.employees emp ON emp.id = s.id
    LEFT JOIN public.departments d ON d.id = emp.department_id
    ORDER BY emp.name, emp.id
  LOOP
    v_pay := public._payroll_month_pay(e.id, v_start);
    SELECT * INTO p FROM public.payslips WHERE employee_id = e.id AND month = v_start;
    v_has := FOUND;
    IF v_has THEN
      v_ot := jsonb_build_object('hours', p.overtime_hours, 'amount', p.overtime_earnings,
                                 'entries', (public._payroll_ot_on_slip(p.id) ->> 'entries')::integer);
      v_stale := public._payroll_stale(p.id, v_pay);
    ELSE
      v_ot := public._payroll_ot_payable(e.id, v_end, NULL);
      v_stale := jsonb_build_object('salary', false, 'overtime', false);
    END IF;
    SELECT count(*) INTO v_wait
    FROM public.overtime_records o
    WHERE o.employee_id = e.id AND o.status = 'approved' AND o.pay_status = 'unpriced'
      AND o.payslip_id IS NULL AND o.date <= v_end;

    v_rows := v_rows || jsonb_build_object(
      'employee', jsonb_build_object(
        'id', e.id, 'code', e.employee_code, 'name', e.name, 'rank', e.rank, 'status', e.status,
        'joining_date', e.joining_date, 'separation_date', e.separation_date,
        'department_id', e.department_id, 'department', e.department, 'has_bank', e.has_bank),
      'pay', v_pay - 'segments',
      'attendance', public._payroll_attendance(e.id, v_start),
      'overtime', v_ot,
      'overtime_waiting', v_wait,
      'salary_stale', (v_stale ->> 'salary')::boolean,
      'overtime_stale', (v_stale ->> 'overtime')::boolean,
      'payslip', CASE WHEN v_has THEN jsonb_build_object(
        'id', p.id, 'status', p.status, 'legacy', p.legacy,
        'basic_salary', p.basic_salary, 'allowances', p.allowances, 'other_allowances', p.other_allowances,
        'overtime_earnings', p.overtime_earnings, 'overtime_hours', p.overtime_hours,
        'income_tax', p.income_tax, 'taxable_income', p.taxable_income, 'tax_manual', p.tax_manual,
        'other_deductions', p.other_deductions, 'salary_basis', p.salary_basis, 'other_basis', p.other_basis,
        'gross_salary', p.gross_salary, 'total_deductions', p.total_deductions, 'net_salary', p.net_salary,
        'paid_on', p.paid_on, 'published_at', p.published_at, 'seen_at', p.seen_at, 'pay_method', p.pay_method)
      END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'month', v_start,
    'rows', v_rows,
    'open_events', (SELECT count(*) FROM public.pay_events v WHERE v.company_id = v_company AND v.done_at IS NULL)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- One step for the people ticked on the month's sheet (NULL = everyone it applies to), or one row.
-- Each person is moved only if the step applies to where their payslip is now; the rest are counted
-- as skipped, never forced. Ops: prepare, refill, refill_stale, finalise, reopen, paid, unpaid, delete.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_apply(p_month date, p_op text, p_employee_ids uuid[] DEFAULT NULL, p_paid_on date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
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
  v_paid date := COALESCE(p_paid_on, current_date);
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
  IF p_op = 'paid' AND p_paid_on IS NOT NULL AND p_paid_on > current_date + 62 THEN
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
$$;

-- ---------------------------------------------------------------------------
-- One payslip, for the editor and the printed slip
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_payslip(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  p public.payslips;
  v_end date;
  v_pay jsonb;
  v_prev uuid;
  v_next uuid;
BEGIN
  SELECT * INTO p FROM public.payslips WHERE id = p_id AND company_id = v_company;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'That payslip no longer exists.');
  END IF;
  v_end := (p.month + interval '1 month - 1 day')::date;
  v_pay := public._payroll_month_pay(p.employee_id, p.month);

  WITH ordered AS (
    SELECT ps.id, lag(ps.id) OVER w AS prev_id, lead(ps.id) OVER w AS next_id
    FROM public.payslips ps JOIN public.employees e ON e.id = ps.employee_id
    WHERE ps.company_id = v_company AND ps.month = p.month
    WINDOW w AS (ORDER BY e.name, e.id)
  )
  SELECT o.prev_id, o.next_id INTO v_prev, v_next FROM ordered o WHERE o.id = p.id;

  RETURN jsonb_build_object(
    'payslip', to_jsonb(p) - 'deductions',
    'employee', (
      SELECT jsonb_build_object(
        'id', e.id, 'code', e.employee_code, 'name', e.name, 'father_name', e.father_name, 'rank', e.rank,
        'department', d.name, 'cnic', e.cnic, 'status', e.status, 'email', e.email,
        'bank_name', e.bank_name, 'bank_account_number', e.bank_account_number,
        'joining_date', e.joining_date, 'separation_date', e.separation_date)
      FROM public.employees e LEFT JOIN public.departments d ON d.id = e.department_id
      WHERE e.id = p.employee_id),
    'company', (
      SELECT jsonb_build_object('name', c.name, 'logo', c.logo, 'currency', COALESCE(NULLIF(upper(c.currency), ''), 'PKR'),
                                'address', c.address, 'phone', c.phone, 'website', c.website)
      FROM public.companies c WHERE c.id = v_company),
    'pay', v_pay,
    'stale', public._payroll_stale(p.id, v_pay),
    'attendance', public._payroll_attendance(p.employee_id, p.month),
    'rules', public._payroll_rules(v_company),
    'overtime', jsonb_build_object(
      'on_slip', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'date', o.date, 'hours', o.hours, 'overtime_type', o.overtime_type,
                      'reason', o.reason, 'hourly_rate', o.hourly_rate, 'multiplier', o.multiplier, 'amount', o.total_amount,
                      'pay_status', o.pay_status) ORDER BY o.date), '[]'::jsonb)
                  FROM public.overtime_records o WHERE o.payslip_id = p.id),
      'unclaimed', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'date', o.date, 'hours', o.hours, 'overtime_type', o.overtime_type,
                      'reason', o.reason, 'hourly_rate', o.hourly_rate, 'multiplier', o.multiplier, 'amount', o.total_amount,
                      'pay_status', o.pay_status) ORDER BY o.date), '[]'::jsonb)
                  FROM public.overtime_records o
                  WHERE o.employee_id = p.employee_id AND o.status = 'approved' AND o.pay_status = 'priced'
                    AND o.payslip_id IS NULL AND o.date <= v_end),
      'waiting', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'date', o.date, 'hours', o.hours, 'overtime_type', o.overtime_type,
                      'reason', o.reason, 'hourly_rate', o.hourly_rate, 'multiplier', o.multiplier, 'amount', o.total_amount,
                      'pay_status', o.pay_status) ORDER BY o.date), '[]'::jsonb)
                  FROM public.overtime_records o
                  WHERE o.employee_id = p.employee_id AND o.status = 'approved' AND o.pay_status = 'unpriced'
                    AND o.payslip_id IS NULL AND o.date <= v_end)
    ),
    'prev_id', v_prev,
    'next_id', v_next
  );
END;
$$;

-- Saves Finance's figures on a draft and recomputes the totals. Tax follows basic and allowances through
-- the tax table unless tax_manual; the taxable salary always does.
CREATE OR REPLACE FUNCTION public.payroll_update_payslip(p_id uuid, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  p public.payslips;
  i jsonb := COALESCE(p_input, '{}'::jsonb);
  f record;
  v numeric;
  vals jsonb := '{}'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  l record;
  v_label text;
  v_amount numeric;
  v_notes text;
  v_manual boolean;
  v_rules jsonb;
  v_tax jsonb;
  v_income_tax numeric;
  v_t jsonb;
  v_currency text;
  v_name text;
BEGIN
  SELECT * INTO p FROM public.payslips WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'That payslip no longer exists.');
  END IF;
  IF p.status <> 'draft' THEN
    RETURN jsonb_build_object('error', 'This payslip is final. Reopen it before changing the figures.');
  END IF;
  IF jsonb_typeof(i) <> 'object' THEN
    RETURN jsonb_build_object('error', 'Check the figures.');
  END IF;

  FOR f IN SELECT * FROM (VALUES
      ('basic_salary', 'Basic salary', 100000000::numeric),
      ('allowances', 'Allowances', 100000000::numeric),
      ('other_allowances', 'Other allowances', 100000000::numeric),
      ('overtime_earnings', 'Overtime earnings', 100000000::numeric),
      ('overtime_hours', 'Overtime hours', 1000::numeric),
      ('income_tax', 'Income tax', 100000000::numeric),
      ('other_deductions', 'Other deductions', 100000000::numeric)
    ) AS t(key, label, lim)
  LOOP
    IF i ? f.key AND jsonb_typeof(i -> f.key) <> 'null' THEN
      v := public._payroll_num(i -> f.key);
      IF v IS NULL THEN RETURN jsonb_build_object('error', format('%s must be a number.', f.label)); END IF;
    ELSE
      v := 0;
    END IF;
    IF v < 0 THEN RETURN jsonb_build_object('error', format('%s cannot be negative.', f.label)); END IF;
    IF v >= f.lim THEN RETURN jsonb_build_object('error', format('%s is too large.', f.label)); END IF;
    vals := vals || jsonb_build_object(f.key, round(v, 2));
  END LOOP;

  IF i ? 'lines' AND jsonb_typeof(i -> 'lines') NOT IN ('array', 'null') THEN
    RETURN jsonb_build_object('error', 'Extra lines must be a list.');
  END IF;
  IF jsonb_typeof(i -> 'lines') = 'array' THEN
    IF jsonb_array_length(i -> 'lines') > 6 THEN
      RETURN jsonb_build_object('error', 'A payslip can have at most 6 extra lines.');
    END IF;
    FOR l IN SELECT x.value AS v, x.ord FROM jsonb_array_elements(i -> 'lines') WITH ORDINALITY AS x(value, ord) LOOP
      v_label := btrim(COALESCE(l.v ->> 'label', ''));
      v_amount := public._payroll_num(l.v -> 'amount');
      IF v_label = '' AND COALESCE(v_amount, 0) = 0 THEN CONTINUE; END IF;
      IF char_length(v_label) > 40 THEN
        RETURN jsonb_build_object('error', format('Line %s: keep the label to 40 characters.', l.ord));
      END IF;
      IF v_amount IS NULL THEN
        RETURN jsonb_build_object('error', format('Line %s amount must be a number.', l.ord));
      END IF;
      IF v_label = '' THEN
        RETURN jsonb_build_object('error', format('Line %s needs a label.', l.ord));
      END IF;
      IF v_amount = 0 THEN
        RETURN jsonb_build_object('error', format('Line %s (%s) needs an amount. Use a minus sign for a deduction.', l.ord, v_label));
      END IF;
      IF abs(v_amount) >= 100000000 THEN
        RETURN jsonb_build_object('error', format('Line %s amount is too large.', l.ord));
      END IF;
      v_lines := v_lines || jsonb_build_object('label', v_label, 'amount', round(v_amount, 2));
    END LOOP;
  END IF;

  v_notes := btrim(COALESCE(i ->> 'notes', ''));
  IF char_length(v_notes) > 500 THEN
    RETURN jsonb_build_object('error', 'Keep notes to 500 characters.');
  END IF;
  v_manual := COALESCE(i -> 'tax_manual' = 'true'::jsonb, false);

  v_rules := public._payroll_rules(v_company);
  v_tax := public._payroll_tax_from_split((vals ->> 'basic_salary')::numeric, (vals ->> 'allowances')::numeric, v_rules);
  v_income_tax := CASE WHEN v_manual THEN (vals ->> 'income_tax')::numeric ELSE (v_tax ->> 'monthly_tax')::numeric END;
  v_t := public._payroll_totals((vals ->> 'basic_salary')::numeric, (vals ->> 'allowances')::numeric,
                                (vals ->> 'other_allowances')::numeric, (vals ->> 'overtime_earnings')::numeric,
                                v_income_tax, (vals ->> 'other_deductions')::numeric, v_lines);
  SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') INTO v_currency FROM public.companies c WHERE c.id = v_company;
  IF (v_t ->> 'net_salary')::numeric < 0 THEN
    RETURN jsonb_build_object('error', format('Deductions (%s) are more than earnings (%s). Check the figures.',
      public._payroll_fmt((v_t ->> 'total_deductions')::numeric, v_currency), public._payroll_fmt((v_t ->> 'gross_salary')::numeric, v_currency)));
  END IF;

  UPDATE public.payslips SET
    basic_salary = (vals ->> 'basic_salary')::numeric,
    allowances = (vals ->> 'allowances')::numeric,
    other_allowances = (vals ->> 'other_allowances')::numeric,
    overtime_earnings = (vals ->> 'overtime_earnings')::numeric,
    overtime_hours = (vals ->> 'overtime_hours')::numeric,
    income_tax = v_income_tax,
    taxable_income = (v_tax ->> 'taxable')::numeric,
    tax_manual = v_manual,
    other_deductions = (vals ->> 'other_deductions')::numeric,
    lines = v_lines,
    gross_salary = (v_t ->> 'gross_salary')::numeric,
    total_deductions = (v_t ->> 'total_deductions')::numeric,
    net_salary = (v_t ->> 'net_salary')::numeric,
    notes = NULLIF(v_notes, ''),
    notes_auto = p.notes_auto AND v_notes = COALESCE(p.notes, '')
  WHERE id = p.id;

  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = p.employee_id;
  PERFORM public.log_activity('payroll.update',
    format('Updated the %s payslip for %s: net %s', public._payroll_month_label(p.month), v_name,
           public._payroll_fmt((v_t ->> 'net_salary')::numeric, v_currency)),
    jsonb_build_object('payslip_id', p.id, 'gross', v_t -> 'gross_salary', 'tax', v_income_tax,
                       'deductions', v_t -> 'total_deductions', 'net', v_t -> 'net_salary', 'lines', jsonb_array_length(v_lines)),
    p.employee_id);
  RETURN jsonb_build_object('ok', true, 'payslip_id', p.id, 'totals', v_t, 'income_tax', v_income_tax, 'taxable_income', v_tax -> 'taxable');
END;
$$;

-- One payslip's own buttons: refill, finalise, reopen, paid, unpaid, delete.
CREATE OR REPLACE FUNCTION public.payroll_payslip_action(p_id uuid, p_op text, p_paid_on date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_employee uuid;
  v_month date;
BEGIN
  IF p_op IS NULL OR NOT (p_op = ANY (ARRAY['refill', 'finalise', 'reopen', 'paid', 'unpaid', 'delete'])) THEN
    RETURN jsonb_build_object('error', 'That step is not known.');
  END IF;
  SELECT employee_id, month INTO v_employee, v_month FROM public.payslips WHERE id = p_id AND company_id = v_company;
  IF v_employee IS NULL THEN
    RETURN jsonb_build_object('error', 'That payslip no longer exists.');
  END IF;
  RETURN public.payroll_apply(v_month, p_op, ARRAY[v_employee], p_paid_on);
END;
$$;

-- ---------------------------------------------------------------------------
-- Salaries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_salary_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_today date := current_date;
  v_this date := date_trunc('month', current_date::timestamp)::date;
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
$$;

-- Saves the rows that differ from the salary in force on the chosen month's first day, as history from
-- that day. A raise applies to a whole month: this month or next, never part of one. Saving again for
-- the same day corrects that change rather than adding a second one. Someone's first salary is their
-- salary from joining.
CREATE OR REPLACE FUNCTION public.payroll_save_salaries(p_rows jsonb, p_effective_month date, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_this date := date_trunc('month', current_date::timestamp)::date;
  v_next date := (date_trunc('month', current_date::timestamp) + interval '1 month')::date;
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
$$;

-- Takes back a salary change no final payslip has used yet (a typing mistake, a cancelled raise).
CREATE OR REPLACE FUNCTION public.payroll_take_back_salary(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  h public.salary_history;
  v_currency text;
  v_name text;
BEGIN
  SELECT * INTO h FROM public.salary_history WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'That salary change no longer exists.');
  END IF;
  IF h.effective_from <= (SELECT min(x.effective_from) FROM public.salary_history x WHERE x.employee_id = h.employee_id) THEN
    RETURN jsonb_build_object('error', 'This is the first salary on file, so there is nothing to go back to. Save a new salary instead.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payslips ps WHERE ps.employee_id = h.employee_id AND ps.status IN ('final', 'paid')
             AND ps.month >= date_trunc('month', h.effective_from::timestamp)::date) THEN
    RETURN jsonb_build_object('error', 'A final payslip already uses this salary. Reopen that payslip first, or save a new salary instead.');
  END IF;
  DELETE FROM public.salary_history WHERE id = h.id;

  SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') INTO v_currency FROM public.companies c WHERE c.id = v_company;
  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = h.employee_id;
  PERFORM public.log_activity('payroll.salary_undo',
    format('Took back %s''s salary change to %s from %s%s', v_name, public._payroll_fmt(h.monthly_salary, v_currency),
           public._payroll_day_label(h.effective_from), CASE WHEN COALESCE(h.reason, '') <> '' THEN format(' (%s)', h.reason) ELSE '' END),
    to_jsonb(h), h.employee_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Overtime pay: Finance prices what HR approved.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_overtime(p_scope text DEFAULT 'waiting', p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_rules jsonb := public._payroll_rules(v_company);
  v_start date := date_trunc('month', COALESCE(p_month, current_date)::timestamp)::date;
  v_end date := (date_trunc('month', COALESCE(p_month, current_date)::timestamp) + interval '1 month - 1 day')::date;
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
$$;

-- Prices one approved entry: a rate gives hours x rate x multiplier to the whole unit; a fixed amount
-- is stored as it is; no pay stores 0 and takes the entry off any draft; 'unpriced' sends it back to
-- waiting. Changing the price of an entry already on a draft leaves it there; the draft then needs a refill.
CREATE OR REPLACE FUNCTION public.payroll_price_overtime(
  p_id uuid, p_kind text, p_rate numeric DEFAULT NULL, p_multiplier numeric DEFAULT NULL, p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  o public.overtime_records;
  v_slip_status text;
  v_rate numeric := 0;
  v_mult numeric := 1;
  v_amount numeric := 0;
  v_status text;
  v_currency text;
  v_name text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('rate', 'fixed', 'no_pay', 'unpriced') THEN
    RETURN jsonb_build_object('error', 'Choose a rate, a fixed amount or no pay.');
  END IF;
  SELECT * INTO o FROM public.overtime_records WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'That overtime entry no longer exists.');
  END IF;
  IF o.status <> 'approved' THEN
    RETURN jsonb_build_object('error', 'Only overtime HR has approved can be priced.');
  END IF;
  SELECT ps.status INTO v_slip_status FROM public.payslips ps WHERE ps.id = o.payslip_id;
  IF v_slip_status IN ('final', 'paid') THEN
    RETURN jsonb_build_object('error', 'This overtime is on a final payslip, so its pay cannot change. Reopen that payslip first.');
  END IF;

  IF p_kind = 'rate' THEN
    v_rate := round(COALESCE(p_rate, 0), 2);
    v_mult := round(COALESCE(p_multiplier, 0), 2);
    IF NOT (v_rate > 0 AND v_rate < 1000000) THEN
      RETURN jsonb_build_object('error', 'The hourly rate must be more than 0 and below 1,000,000.');
    END IF;
    IF NOT (v_mult > 0 AND v_mult <= 10) THEN
      RETURN jsonb_build_object('error', 'The multiplier must be more than 0 and at most 10.');
    END IF;
    v_amount := public._payroll_ot_amount(o.hours, v_rate, v_mult);
    IF v_amount <= 0 THEN
      RETURN jsonb_build_object('error', 'That rate gives less than one whole unit. Use a higher rate, a fixed amount, or no pay.');
    END IF;
    v_status := 'priced';
  ELSIF p_kind = 'fixed' THEN
    v_amount := round(COALESCE(p_amount, 0));
    IF NOT (v_amount >= 1 AND v_amount < 10000000) THEN
      RETURN jsonb_build_object('error', 'The amount must be a whole number, at least 1 and below 10,000,000.');
    END IF;
    v_status := 'priced';
  ELSE
    v_status := p_kind;
  END IF;

  UPDATE public.overtime_records SET
    pay_status = v_status,
    hourly_rate = v_rate,
    multiplier = v_mult,
    total_amount = v_amount,
    priced_by = CASE WHEN v_status = 'unpriced' THEN NULL ELSE auth.uid() END,
    priced_at = CASE WHEN v_status = 'unpriced' THEN NULL ELSE now() END,
    payslip_id = CASE WHEN v_status IN ('no_pay', 'unpriced') THEN NULL ELSE payslip_id END
  WHERE id = o.id;

  SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') INTO v_currency FROM public.companies c WHERE c.id = v_company;
  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = o.employee_id;
  PERFORM public.log_activity('payroll.overtime_price',
    CASE v_status
      WHEN 'priced' THEN format('Priced %s''s %s h of overtime on %s at %s', v_name, round(o.hours, 2), public._payroll_day_label(o.date), public._payroll_fmt(v_amount, v_currency))
      WHEN 'no_pay' THEN format('Marked %s''s %s h of overtime on %s as not paid', v_name, round(o.hours, 2), public._payroll_day_label(o.date))
      ELSE format('Cleared the price of %s''s %s h of overtime on %s', v_name, round(o.hours, 2), public._payroll_day_label(o.date)) END,
    jsonb_build_object('overtime_id', o.id, 'kind', p_kind, 'rate', v_rate, 'multiplier', v_mult, 'amount', v_amount,
                       'before', jsonb_build_object('pay_status', o.pay_status, 'amount', o.total_amount)),
    o.employee_id);
  RETURN jsonb_build_object('ok', true, 'pay_status', v_status, 'amount', v_amount, 'on_draft', o.payslip_id IS NOT NULL AND v_status = 'priced');
END;
$$;

-- Prices every waiting entry at the suggested rate and multiplier. Entries of people with no salary on
-- file are left for Finance to price by hand.
CREATE OR REPLACE FUNCTION public.payroll_price_waiting()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_rules jsonb := public._payroll_rules(v_company);
  r record;
  v_rate numeric;
  v_mult numeric;
  v_amount numeric;
  v_priced integer := 0;
  v_skipped integer := 0;
  v_total numeric := 0;
  v_currency text;
BEGIN
  FOR r IN
    SELECT o.id, o.hours, o.overtime_type,
           (SELECT h.monthly_salary FROM public.salary_history h
             WHERE h.employee_id = o.employee_id
             ORDER BY (h.effective_from <= o.date) DESC,
                      CASE WHEN h.effective_from <= o.date THEN h.effective_from END DESC NULLS LAST,
                      h.effective_from
             LIMIT 1) AS salary
    FROM public.overtime_records o
    WHERE o.company_id = v_company AND o.status = 'approved' AND o.pay_status = 'unpriced' AND o.payslip_id IS NULL
    ORDER BY o.date
    FOR UPDATE OF o
  LOOP
    v_rate := public._payroll_suggested_rate(r.salary, v_rules);
    v_mult := round(public._payroll_multiplier(r.overtime_type, v_rules), 2);
    v_amount := public._payroll_ot_amount(r.hours, v_rate, v_mult);
    IF NOT (v_rate > 0 AND v_rate < 1000000) OR v_amount <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    UPDATE public.overtime_records SET pay_status = 'priced', hourly_rate = v_rate, multiplier = v_mult,
      total_amount = v_amount, priced_by = auth.uid(), priced_at = now()
    WHERE id = r.id;
    v_priced := v_priced + 1;
    v_total := v_total + v_amount;
  END LOOP;

  IF v_priced > 0 THEN
    SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') INTO v_currency FROM public.companies c WHERE c.id = v_company;
    PERFORM public.log_activity('payroll.overtime_price_all',
      format('Priced %s overtime %s at the suggested rates, %s in all', v_priced, CASE WHEN v_priced = 1 THEN 'entry' ELSE 'entries' END,
             public._payroll_fmt(v_total, v_currency)),
      jsonb_build_object('priced', v_priced, 'skipped', v_skipped, 'amount', v_total));
  END IF;
  RETURN jsonb_build_object('ok', true, 'priced', v_priced, 'skipped', v_skipped, 'amount', v_total);
END;
$$;

-- ---------------------------------------------------------------------------
-- HR updates: what HR changed that affects pay, with its effect on that month's pay and payslip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_pay_events(p_open boolean DEFAULT true, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_month date;
  v_pay jsonb;
  p public.payslips;
  v_has boolean;
  v_effect jsonb;
BEGIN
  FOR r IN
    SELECT v.*, e.name AS employee_name, e.employee_code, e.status AS employee_status,
           NULLIF(btrim(concat_ws(' ', cu.first_name, cu.last_name)), '') AS created_by_name,
           NULLIF(btrim(concat_ws(' ', du.first_name, du.last_name)), '') AS done_by_name
    FROM public.pay_events v
    JOIN public.employees e ON e.id = v.employee_id
    LEFT JOIN public.profiles cu ON cu.id = v.created_by
    LEFT JOIN public.profiles du ON du.id = v.done_by
    WHERE v.company_id = v_company
      AND CASE WHEN p_open IS NULL THEN true WHEN p_open THEN v.done_at IS NULL ELSE v.done_at IS NOT NULL END
    ORDER BY CASE WHEN p_open IS DISTINCT FROM false THEN v.created_at END ASC,
             CASE WHEN p_open = false THEN v.done_at END DESC,
             v.id
    LIMIT v_limit
  LOOP
    v_effect := NULL;
    IF r.done_at IS NULL THEN
      v_month := date_trunc('month', COALESCE(r.effective_date, r.created_at::date)::timestamp)::date;
      v_pay := public._payroll_month_pay(r.employee_id, v_month);
      SELECT * INTO p FROM public.payslips WHERE employee_id = r.employee_id AND month = v_month;
      v_has := FOUND;
      v_effect := jsonb_build_object(
        'month', v_month,
        'pay', v_pay - 'segments',
        'payslip_id', CASE WHEN v_has THEN p.id END,
        'payslip_status', CASE WHEN v_has THEN p.status END,
        'stale', CASE WHEN v_has THEN public._payroll_stale(p.id, v_pay) END,
        'later_finals', (SELECT count(*) FROM public.payslips ps
                          WHERE ps.employee_id = r.employee_id AND ps.month > v_month AND ps.status IN ('final', 'paid')));
    END IF;
    v_rows := v_rows || jsonb_build_object(
      'id', r.id, 'employee_id', r.employee_id, 'employee_name', r.employee_name, 'employee_code', r.employee_code,
      'employee_status', r.employee_status, 'kind', r.kind, 'title', r.title, 'detail', r.detail,
      'effective_date', r.effective_date, 'created_at', r.created_at, 'created_by_name', r.created_by_name,
      'done_at', r.done_at, 'done_by_name', r.done_by_name, 'effect', v_effect);
  END LOOP;
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_set_pay_events_done(p_ids uuid[] DEFAULT NULL, p_done boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_count integer;
BEGIN
  IF COALESCE(p_done, true) THEN
    UPDATE public.pay_events SET done_at = now(), done_by = auth.uid()
    WHERE company_id = v_company AND done_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids));
  ELSE
    IF p_ids IS NULL THEN
      RETURN 0;
    END IF;
    UPDATE public.pay_events SET done_at = NULL, done_by = NULL
    WHERE company_id = v_company AND done_at IS NOT NULL AND id = ANY (p_ids);
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    PERFORM public.log_activity(CASE WHEN COALESCE(p_done, true) THEN 'payroll.updates_done' ELSE 'payroll.updates_reopened' END,
      format('%s %s HR %s', CASE WHEN COALESCE(p_done, true) THEN 'Dealt with' ELSE 'Reopened' END, v_count,
             CASE WHEN v_count = 1 THEN 'update' ELSE 'updates' END),
      jsonb_build_object('count', v_count, 'ids', to_jsonb(p_ids)));
  END IF;
  RETURN v_count;
END;
$$;

-- Badge and banner counts. Anyone who is not Finance gets zeros (the nav never asks for them).
CREATE OR REPLACE FUNCTION public.payroll_counts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RETURN jsonb_build_object('open_events', 0, 'overtime_waiting', 0, 'no_salary', 0);
  END IF;
  RETURN jsonb_build_object(
    'open_events', (SELECT count(*) FROM public.pay_events v WHERE v.company_id = v_company AND v.done_at IS NULL),
    'overtime_waiting', (SELECT count(*) FROM public.overtime_records o
                          WHERE o.company_id = v_company AND o.status = 'approved' AND o.pay_status = 'unpriced'),
    'no_salary', (SELECT count(*) FROM public.employees e
                   WHERE e.company_id = v_company AND e.status = 'active'
                     AND NOT EXISTS (SELECT 1 FROM public.salary_history h WHERE h.employee_id = e.id AND h.monthly_salary > 0))
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Finance reports: monthly cost, tax withheld, by department.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_report(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_from date := date_trunc('month', COALESCE(p_from, current_date - interval '11 months')::timestamp)::date;
  v_to date := date_trunc('month', COALESCE(p_to, current_date)::timestamp)::date;
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
$$;

-- ---------------------------------------------------------------------------
-- Grants: Finance/owner checks happen inside each function.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.payroll_rules()',
    'public.payroll_save_rules(jsonb)',
    'public.payroll_sheet(date)',
    'public.payroll_apply(date, text, uuid[], date)',
    'public.payroll_payslip(uuid)',
    'public.payroll_update_payslip(uuid, jsonb)',
    'public.payroll_payslip_action(uuid, text, date)',
    'public.payroll_salary_overview()',
    'public.payroll_save_salaries(jsonb, date, text)',
    'public.payroll_take_back_salary(uuid)',
    'public.payroll_overtime(text, date)',
    'public.payroll_price_overtime(uuid, text, numeric, numeric, numeric)',
    'public.payroll_price_waiting()',
    'public.payroll_pay_events(boolean, integer)',
    'public.payroll_set_pay_events_done(uuid[], boolean)',
    'public.payroll_counts()',
    'public.payroll_report(date, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
