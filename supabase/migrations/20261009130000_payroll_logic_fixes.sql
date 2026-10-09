-- Payroll logic fixes (audit of 20261007150100_payroll_engine.sql and 20261007150200_payroll_staff_rpcs.sql).
--
--  1. Unpaid leave removes CALENDAR days (pay is pro-rated on calendar days, so weekends and holidays
--     inside an unpaid spell were still paid: a whole month of unpaid leave in October still paid 4/31).
--  2. A paid payslip could go paid -> final -> draft -> deleted, handing its overtime back and paying the
--     salary again next month. payslips.ever_paid (set when marked paid, never reset) blocks the delete;
--     overtime_records.paid_in_month marks entries that sat on a paid slip so no later draft takes them.
--  3. Income tax on a part month is the full month's tax x paid_days/month_days (it was the tax a person
--     would owe if the part-month pay were their salary every month): 250,000 joining 15 Oct -> 10,968,
--     not 2,842. Same in portal_expected_pay and when Finance edits a part-month slip by hand.
--  4. 'finalise' refuses a stale draft (salary, unpaid leave or overtime changed since it was filled):
--     counted as 'stale' in the result with a message to refill first.
--  5. payroll_update_payslip keeps the stored value of any money field the input leaves out (it zeroed it).
--  6. Overtime dated before joining or after leaving is never paid.
--  7. A payment date is at most tomorrow (company time) and not before the payslip month began.
--  8. payroll_save_salaries refuses a change that a final payslip already covers, and accepts any 1st of a
--     month (not only this or next month) as long as no final payslip of that person is dated from it.
--  9. _payroll_working_dates delegates to public.working_dates so leave and payroll agree on working days
--     ('working_day' events and the same holiday rules).

-- ---------------------------------------------------------------------------
-- Columns (fix 2)
-- ---------------------------------------------------------------------------
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS ever_paid boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.payslips.ever_paid IS 'True once the slip was ever marked paid; never reset. Such a slip can be reopened but never deleted.';
UPDATE public.payslips SET ever_paid = true WHERE status = 'paid' AND NOT ever_paid;

ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS paid_in_month date;
COMMENT ON COLUMN public.overtime_records.paid_in_month IS 'The payslip month this entry was paid in. Set when its payslip is marked paid; never cleared, so no later draft pays it again.';
UPDATE public.overtime_records o
SET paid_in_month = p.month
FROM public.payslips p
WHERE p.id = o.payslip_id AND p.status = 'paid' AND o.paid_in_month IS NULL;

-- ---------------------------------------------------------------------------
-- Fix 9: one working-day calendar for the whole app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_working_dates(p_employee uuid, p_from date, p_to date)
RETURNS SETOF date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT w.d
  FROM public.employees e
  CROSS JOIN LATERAL public.working_dates(e.company_id, p_from, p_to, e.id) AS w(d)
  WHERE e.id = p_employee AND p_from IS NOT NULL AND p_to IS NOT NULL
  ORDER BY w.d
$$;

-- ---------------------------------------------------------------------------
-- Fix 1: the month's pay. Unpaid leave takes off every calendar day of the approved request that falls
-- inside the employment window; each day is 1/(days in the month), as for joining and leaving.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_month_pay(p_employee uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;
  v_n integer;
  v_join date;
  v_sep date;
  v_from date;
  v_to date;
  v_unpaid date[] := '{}';
  h_from date[];
  h_sal numeric[];
  h_oth numeric[];
  h_meth text[];
  v_count integer := 0;
  d date;
  i integer;
  k integer;
  p_sal numeric;
  p_oth numeric;
  v_salary numeric := 0;
  v_other numeric := 0;
  v_paid integer := 0;
  v_segments jsonb := '[]'::jsonb;
  c_from date;
  c_to date;
  c_days integer := 0;
  c_sal numeric;
  c_oth numeric;
  v_prorated boolean;
  v_force date;
  v_method text := 'bank';
  v_distinct integer;
BEGIN
  v_n := extract(day FROM v_end)::integer;
  SELECT e.joining_date, e.separation_date INTO v_join, v_sep FROM public.employees e WHERE e.id = p_employee;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_from := GREATEST(v_start, COALESCE(v_join, v_start));
  v_to := LEAST(v_end, COALESCE(v_sep, v_end));

  IF v_from <= v_to THEN
    -- Calendar days, not working days: pay is shared over calendar days, so a weekend inside an unpaid
    -- spell is unpaid too.
    SELECT COALESCE(array_agg(DISTINCT g.d), '{}')
    INTO v_unpaid
    FROM public.leave_requests r
    JOIN public.leave_types t ON t.id = r.leave_type_id
    CROSS JOIN LATERAL (
      SELECT gs::date AS d
      FROM generate_series(GREATEST(r.start_date, v_from)::timestamp, LEAST(r.end_date, v_to)::timestamp, interval '1 day') AS gs
    ) AS g
    WHERE r.employee_id = p_employee
      AND r.status = 'approved'
      AND NOT t.is_paid
      AND r.start_date <= v_to
      AND r.end_date >= v_from;
  END IF;

  SELECT array_agg(h.effective_from ORDER BY h.effective_from),
         array_agg(h.monthly_salary ORDER BY h.effective_from),
         array_agg(h.other_allowance ORDER BY h.effective_from),
         array_agg(h.pay_method ORDER BY h.effective_from)
  INTO h_from, h_sal, h_oth, h_meth
  FROM public.salary_history h
  WHERE h.employee_id = p_employee;
  v_count := COALESCE(array_length(h_from, 1), 0);

  d := v_start;
  WHILE d <= v_end LOOP
    IF d >= v_from AND d <= v_to AND NOT (d = ANY (v_unpaid)) THEN
      p_sal := 0;
      p_oth := 0;
      IF v_count > 0 THEN
        -- The latest change dated on or before the day; before the first one, the first salary.
        k := 1;
        FOR i IN 1..v_count LOOP
          IF h_from[i] <= d THEN k := i; END IF;
        END LOOP;
        p_sal := h_sal[k];
        p_oth := h_oth[k];
      END IF;
      v_salary := v_salary + p_sal / v_n;
      v_other := v_other + p_oth / v_n;
      v_paid := v_paid + 1;
      IF c_days > 0 AND c_sal = p_sal AND c_oth = p_oth AND c_to = d - 1 THEN
        c_to := d;
        c_days := c_days + 1;
      ELSE
        IF c_days > 0 THEN
          v_segments := v_segments || jsonb_build_object('from', c_from, 'to', c_to, 'days', c_days, 'monthly_salary', c_sal, 'other_allowance', c_oth);
        END IF;
        c_from := d;
        c_to := d;
        c_days := 1;
        c_sal := p_sal;
        c_oth := p_oth;
      END IF;
    END IF;
    d := d + 1;
  END LOOP;
  IF c_days > 0 THEN
    v_segments := v_segments || jsonb_build_object('from', c_from, 'to', c_to, 'days', c_days, 'monthly_salary', c_sal, 'other_allowance', c_oth);
  END IF;

  v_prorated := v_paid <> v_n OR jsonb_array_length(v_segments) > 1;
  v_force := CASE WHEN v_to >= v_start AND v_to <= v_end THEN v_to ELSE v_start END;
  IF v_count > 0 THEN
    k := 1;
    FOR i IN 1..v_count LOOP
      IF h_from[i] <= v_force THEN k := i; END IF;
    END LOOP;
    v_method := h_meth[k];
  END IF;
  SELECT count(DISTINCT (s ->> 'monthly_salary')::numeric) INTO v_distinct FROM jsonb_array_elements(v_segments) AS s;

  RETURN jsonb_build_object(
    'monthly_salary', CASE WHEN v_prorated THEN round(v_salary) ELSE round(COALESCE((v_segments -> 0 ->> 'monthly_salary')::numeric, 0), 2) END,
    'other_allowance', CASE WHEN v_prorated THEN round(v_other) ELSE round(COALESCE((v_segments -> 0 ->> 'other_allowance')::numeric, 0), 2) END,
    'pay_method', v_method,
    'prorated', v_prorated,
    'segments', v_segments,
    'salary_changed', COALESCE(v_distinct, 0) > 1,
    'month_days', v_n,
    'paid_days', v_paid,
    'unpaid_leave_days', COALESCE(array_length(v_unpaid, 1), 0),
    'joined', CASE WHEN v_join > v_start AND v_join <= v_end THEN v_join END,
    'left', CASE WHEN v_sep >= v_start AND v_sep < v_end THEN v_sep END,
    'has_salary', v_count > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Fix 3: structure and tax of a month's pay. Each salary segment of the month is broken down as a FULL
-- month (basic, medical exemption, tax from the yearly table) and that share of the month (days / days
-- in the month) is taken: 250,000 joining 15 October -> 17/31 of 20,000 = 10,968 tax. A whole month at
-- one salary is exactly _payroll_breakdown of that salary. Mirrored in src/modules/payroll/lib/calc.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_breakdown_pay(p_pay jsonb, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_n integer := COALESCE((p_pay ->> 'month_days')::integer, 0);
  v_gross numeric := round(GREATEST(COALESCE((p_pay ->> 'monthly_salary')::numeric, 0), 0), 2);
  s record;
  b jsonb;
  v_basic numeric := 0;
  v_medical numeric := 0;
  v_taxable numeric := 0;
  v_yearly numeric := 0;
  v_monthly numeric := 0;
BEGIN
  IF p_pay IS NULL OR NOT COALESCE((p_pay ->> 'prorated')::boolean, false) OR v_n <= 0 THEN
    RETURN public._payroll_breakdown(v_gross, p_rules);
  END IF;
  FOR s IN
    SELECT (x ->> 'monthly_salary')::numeric AS sal, (x ->> 'days')::integer AS days
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_pay -> 'segments') = 'array' THEN p_pay -> 'segments' ELSE '[]'::jsonb END) AS x
  LOOP
    b := public._payroll_breakdown(s.sal, p_rules);
    v_basic := v_basic + (b ->> 'basic')::numeric * s.days / v_n;
    v_medical := v_medical + (b ->> 'medical_exempt')::numeric * s.days / v_n;
    v_taxable := v_taxable + (b ->> 'taxable')::numeric * s.days / v_n;
    v_yearly := v_yearly + (b ->> 'yearly_tax')::numeric * s.days / v_n;
    v_monthly := v_monthly + (b ->> 'monthly_tax')::numeric * s.days / v_n;
  END LOOP;
  v_basic := LEAST(round(v_basic, 2), v_gross);
  RETURN jsonb_build_object(
    'gross', v_gross,
    'basic', v_basic,
    'allowances', round(v_gross - v_basic, 2),
    'medical_exempt', round(v_medical, 2),
    'taxable', round(v_taxable, 2),
    'yearly_tax', round(v_yearly, 2),
    'monthly_tax', round(v_monthly)
  );
END;
$$;

-- The same for a payslip's own basic and allowances typed by Finance on a part-month slip: the figures
-- are scaled up to a full month, taxed, and the month's share taken. A whole month (or unknown days) is
-- the plain _payroll_tax_from_split.
CREATE OR REPLACE FUNCTION public._payroll_tax_from_split(p_basic numeric, p_allowances numeric, p_rules jsonb, p_paid_days integer, p_month_days integer)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  b numeric := GREATEST(COALESCE(p_basic, 0), 0);
  a numeric := GREATEST(COALESCE(p_allowances, 0), 0);
  f numeric := 1;
  v_taxable numeric;
  v_full numeric;
  v_yearly numeric;
  v_month_full numeric;
BEGIN
  IF COALESCE(p_month_days, 0) > 0 AND COALESCE(p_paid_days, 0) > 0 AND p_paid_days < p_month_days THEN
    f := p_paid_days::numeric / p_month_days;
  END IF;
  IF f = 1 THEN
    RETURN public._payroll_tax_from_split(p_basic, p_allowances, p_rules);
  END IF;
  v_taxable := round(GREATEST(b + a - b * (p_rules ->> 'medical_exempt_percent')::numeric / 100, 0), 2);
  v_full := round(v_taxable / f, 2);
  v_yearly := public._payroll_yearly_tax(v_full * 12, p_rules -> 'slabs');
  v_month_full := round(v_yearly / 12);
  RETURN jsonb_build_object('taxable', v_taxable, 'yearly_tax', round(v_yearly * f, 2), 'monthly_tax', round(v_month_full * f));
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixes 2 and 6: overtime a draft may take. Only entries worked while employed (joining to separation),
-- never one that sat on a payslip that was paid (paid_in_month), except the ones already on this slip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_ot_payable(p_employee uuid, p_end date, p_payslip uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'hours', COALESCE(round(sum(o.hours), 2), 0),
    'amount', COALESCE(round(sum(o.total_amount), 2), 0),
    'entries', count(*))
  FROM public.overtime_records o
  JOIN public.employees e ON e.id = o.employee_id
  WHERE o.employee_id = p_employee
    AND o.status = 'approved'
    AND o.pay_status = 'priced'
    AND o.date <= p_end
    AND (
      (o.payslip_id IS NULL AND o.paid_in_month IS NULL
        AND o.date >= COALESCE(e.joining_date, o.date) AND o.date <= COALESCE(e.separation_date, o.date))
      OR (p_payslip IS NOT NULL AND o.payslip_id = p_payslip
        AND (o.paid_in_month IS NOT NULL
             OR (o.date >= COALESCE(e.joining_date, o.date) AND o.date <= COALESCE(e.separation_date, o.date))))
    )
$$;

CREATE OR REPLACE FUNCTION public._payroll_ot_claim(p_payslip uuid, p_employee uuid, p_end date)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  -- Entries paid on this slip stay on it; the rest are handed back and taken again.
  UPDATE public.overtime_records SET payslip_id = NULL WHERE payslip_id = p_payslip AND paid_in_month IS NULL;
  UPDATE public.overtime_records o
  SET payslip_id = p_payslip
  FROM public.employees e
  WHERE e.id = o.employee_id
    AND o.employee_id = p_employee
    AND o.status = 'approved'
    AND o.pay_status = 'priced'
    AND o.date <= p_end
    AND o.date >= COALESCE(e.joining_date, o.date)
    AND o.date <= COALESCE(e.separation_date, o.date)
    AND o.payslip_id IS NULL
    AND o.paid_in_month IS NULL;
$$;

CREATE OR REPLACE FUNCTION public._payroll_stale(p_payslip uuid, p_pay jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  p public.payslips;
  v_end date;
  v_salary boolean := false;
  v_ot boolean := false;
BEGIN
  SELECT * INTO p FROM public.payslips WHERE id = p_payslip;
  IF NOT FOUND OR p.status <> 'draft' THEN
    RETURN jsonb_build_object('salary', false, 'overtime', false);
  END IF;
  v_end := (date_trunc('month', p.month::timestamp) + interval '1 month - 1 day')::date;
  v_salary := round(p.salary_basis, 2) <> round(COALESCE((p_pay ->> 'monthly_salary')::numeric, 0), 2)
           OR round(p.other_basis, 2) <> round(COALESCE((p_pay ->> 'other_allowance')::numeric, 0), 2);
  v_ot := EXISTS (
            SELECT 1 FROM public.overtime_records o
            JOIN public.employees e ON e.id = o.employee_id
            WHERE o.employee_id = p.employee_id AND o.status = 'approved' AND o.pay_status = 'priced'
              AND o.date <= v_end AND o.payslip_id IS NULL AND o.paid_in_month IS NULL
              AND o.date >= COALESCE(e.joining_date, o.date) AND o.date <= COALESCE(e.separation_date, o.date))
          OR round((public._payroll_ot_on_slip(p.id) ->> 'amount')::numeric, 2) <> round(p.overtime_basis, 2);
  RETURN jsonb_build_object('salary', v_salary, 'overtime', v_ot);
END;
$$;

-- ---------------------------------------------------------------------------
-- Prepare and refill use the part-month structure (fix 3).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_prepare(p_employee uuid, p_month date, p_rules jsonb, p_currency text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;
  v_id uuid;
  v_company uuid;
  v_pay jsonb;
  v_att jsonb;
  v_ot jsonb;
  v_b jsonb;
  v_t jsonb;
  v_note text;
BEGIN
  SELECT id INTO v_id FROM public.payslips WHERE employee_id = p_employee AND month = v_start;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_id, 'created', false);
  END IF;
  SELECT company_id INTO v_company FROM public.employees WHERE id = p_employee;
  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;

  v_pay := public._payroll_month_pay(p_employee, v_start);
  v_att := public._payroll_attendance(p_employee, v_start);
  v_ot := public._payroll_ot_payable(p_employee, v_end, NULL);
  v_b := public._payroll_breakdown_pay(v_pay, p_rules);
  v_t := public._payroll_totals((v_b ->> 'basic')::numeric, (v_b ->> 'allowances')::numeric,
                                round((v_pay ->> 'other_allowance')::numeric, 2), (v_ot ->> 'amount')::numeric,
                                (v_b ->> 'monthly_tax')::numeric, 0, '[]'::jsonb);
  IF (v_t ->> 'net_salary')::numeric < 0 THEN
    RETURN jsonb_build_object('negative', true);
  END IF;
  v_note := public._payroll_prorated_note(v_pay, p_currency);

  INSERT INTO public.payslips (
    employee_id, company_id, month, basic_salary, allowances, other_allowances, overtime_earnings, overtime_hours,
    overtime_basis, income_tax, taxable_income, tax_manual, other_deductions, lines, salary_basis, other_basis,
    pay_method, total_deductions, gross_salary, net_salary, daily_rate, days_worked, present_days, short_leave_days,
    paid_leave_days, absent_days, paid_days, month_days, notes, notes_auto, status, generated_by, legacy
  ) VALUES (
    p_employee, v_company, v_start, (v_b ->> 'basic')::numeric, (v_b ->> 'allowances')::numeric,
    round((v_pay ->> 'other_allowance')::numeric, 2), (v_ot ->> 'amount')::numeric, (v_ot ->> 'hours')::numeric,
    (v_ot ->> 'amount')::numeric, (v_b ->> 'monthly_tax')::numeric, (v_b ->> 'taxable')::numeric, false, 0, '[]'::jsonb,
    round((v_pay ->> 'monthly_salary')::numeric, 2), round((v_pay ->> 'other_allowance')::numeric, 2),
    v_pay ->> 'pay_method', (v_t ->> 'total_deductions')::numeric, (v_t ->> 'gross_salary')::numeric,
    (v_t ->> 'net_salary')::numeric, 0, (v_att ->> 'days_worked')::numeric, (v_att ->> 'present')::integer,
    (v_att ->> 'half')::integer, (v_att ->> 'leave')::numeric, (v_att ->> 'absent')::numeric,
    (v_pay ->> 'paid_days')::integer, (v_pay ->> 'month_days')::integer, NULLIF(v_note, ''), v_note <> '', 'draft',
    auth.uid(), false
  )
  ON CONFLICT (employee_id, month) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Prepared at the same moment by someone else: theirs wins.
    SELECT id INTO v_id FROM public.payslips WHERE employee_id = p_employee AND month = v_start;
    RETURN jsonb_build_object('id', v_id, 'created', false);
  END IF;
  PERFORM public._payroll_ot_claim(v_id, p_employee, v_end);
  RETURN jsonb_build_object('id', v_id, 'created', true);
END;
$$;

CREATE OR REPLACE FUNCTION public._payroll_refill(p_payslip uuid, p_rules jsonb, p_currency text)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  p public.payslips;
  v_end date;
  v_pay jsonb;
  v_att jsonb;
  v_ot jsonb;
  v_b jsonb;
  v_t jsonb;
  v_note text;
BEGIN
  SELECT * INTO p FROM public.payslips WHERE id = p_payslip FOR UPDATE;
  IF NOT FOUND OR p.status <> 'draft' THEN
    RETURN 'missing';
  END IF;
  v_end := (date_trunc('month', p.month::timestamp) + interval '1 month - 1 day')::date;
  v_pay := public._payroll_month_pay(p.employee_id, p.month);
  v_att := public._payroll_attendance(p.employee_id, p.month);
  v_ot := public._payroll_ot_payable(p.employee_id, v_end, p.id);
  v_b := public._payroll_breakdown_pay(v_pay, p_rules);
  v_t := public._payroll_totals((v_b ->> 'basic')::numeric, (v_b ->> 'allowances')::numeric,
                                round((v_pay ->> 'other_allowance')::numeric, 2), (v_ot ->> 'amount')::numeric,
                                (v_b ->> 'monthly_tax')::numeric, p.other_deductions, p.lines);
  IF (v_t ->> 'net_salary')::numeric < 0 THEN
    RETURN 'negative';
  END IF;
  v_note := CASE WHEN p.notes_auto OR COALESCE(btrim(p.notes), '') = '' THEN public._payroll_prorated_note(v_pay, p_currency) ELSE p.notes END;

  UPDATE public.payslips SET
    basic_salary = (v_b ->> 'basic')::numeric,
    allowances = (v_b ->> 'allowances')::numeric,
    other_allowances = round((v_pay ->> 'other_allowance')::numeric, 2),
    overtime_earnings = (v_ot ->> 'amount')::numeric,
    overtime_hours = (v_ot ->> 'hours')::numeric,
    overtime_basis = (v_ot ->> 'amount')::numeric,
    income_tax = (v_b ->> 'monthly_tax')::numeric,
    taxable_income = (v_b ->> 'taxable')::numeric,
    tax_manual = false,
    salary_basis = round((v_pay ->> 'monthly_salary')::numeric, 2),
    other_basis = round((v_pay ->> 'other_allowance')::numeric, 2),
    pay_method = v_pay ->> 'pay_method',
    gross_salary = (v_t ->> 'gross_salary')::numeric,
    total_deductions = (v_t ->> 'total_deductions')::numeric,
    net_salary = (v_t ->> 'net_salary')::numeric,
    days_worked = (v_att ->> 'days_worked')::numeric,
    present_days = (v_att ->> 'present')::integer,
    short_leave_days = (v_att ->> 'half')::integer,
    paid_leave_days = (v_att ->> 'leave')::numeric,
    absent_days = (v_att ->> 'absent')::numeric,
    paid_days = (v_pay ->> 'paid_days')::integer,
    month_days = (v_pay ->> 'month_days')::integer,
    notes = NULLIF(v_note, ''),
    notes_auto = CASE WHEN p.notes_auto OR COALESCE(btrim(p.notes), '') = '' THEN v_note <> '' ELSE false END
  WHERE id = p.id;
  PERFORM public._payroll_ot_claim(p.id, p.employee_id, v_end);
  RETURN 'ok';
END;
$$;

-- ---------------------------------------------------------------------------
-- Fix 2: marking a slip paid records ever_paid and stamps its overtime with the month it was paid in.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_set_status(p_payslip uuid, p_status text, p_paid_on date)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
    UPDATE public.payslips SET status = 'paid', paid_on = v_paid, seen_at = NULL, ever_paid = true WHERE id = p.id;
    -- Overtime paid on this slip is paid for good: no later draft may take it.
    UPDATE public.overtime_records SET paid_in_month = p.month WHERE payslip_id = p.id AND paid_in_month IS NULL;
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
    -- paid -> final (ever_paid stays)
    UPDATE public.payslips SET status = 'final', paid_on = NULL WHERE id = p.id;
  END IF;
  RETURN p.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixes 2, 4, 7: the sheet steps.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_apply(p_month date, p_op text, p_employee_ids uuid[] DEFAULT NULL::uuid[], p_paid_on date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
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
  v_stale_n integer := 0;
  v_locked integer := 0;
  v_paid date := COALESCE(p_paid_on, v_today);
  v_net numeric;
  v_count integer;
  v_names text;
  v_words text[];
  v_message text;
BEGIN
  IF p_op IS NULL OR NOT (p_op = ANY (ARRAY['prepare', 'refill', 'refill_stale', 'finalise', 'reopen', 'paid', 'unpaid', 'delete'])) THEN
    RETURN jsonb_build_object('error', 'That step is not known.');
  END IF;
  IF p_month IS NULL THEN
    RETURN jsonb_build_object('error', 'Choose a month.');
  END IF;
  v_start := date_trunc('month', p_month::timestamp)::date;
  IF p_op = 'paid' AND p_paid_on IS NOT NULL THEN
    IF p_paid_on > v_today + 1 THEN
      RETURN jsonb_build_object('error', 'The payment date cannot be later than tomorrow. Use the day the money was sent.');
    END IF;
    IF p_paid_on < v_start THEN
      RETURN jsonb_build_object('error', format('The payment date is before %s began. Use the day the money was sent.', public._payroll_month_label(v_start)));
    END IF;
  END IF;
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
      -- A draft filled before the salary, unpaid leave or priced overtime changed is not locked as it is.
      v_stale := public._payroll_stale(p.id, public._payroll_month_pay(v_id, v_start));
      IF (v_stale ->> 'salary')::boolean OR (v_stale ->> 'overtime')::boolean THEN
        v_stale_n := v_stale_n + 1;
        CONTINUE;
      END IF;
      v_after := public._payroll_set_status(p.id, 'final', NULL);
    ELSIF p_op = 'reopen' AND p.status = 'final' THEN
      v_after := public._payroll_set_status(p.id, 'draft', NULL);
    ELSIF p_op = 'paid' AND p.status = 'final' THEN
      v_after := public._payroll_set_status(p.id, 'paid', v_paid);
    ELSIF p_op = 'unpaid' AND p.status = 'paid' THEN
      v_after := public._payroll_set_status(p.id, 'final', NULL);
    ELSIF p_op = 'delete' AND p.status = 'draft' THEN
      IF p.ever_paid THEN
        -- Money went out on this slip: it can be corrected, never removed.
        v_locked := v_locked + 1;
        CONTINUE;
      END IF;
      -- Overtime it carried goes back for the next draft (overtime_records.payslip_id ON DELETE SET NULL).
      DELETE FROM public.payslips WHERE id = p.id AND status = 'draft' AND NOT ever_paid;
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
                         'done', v_done, 'skipped', v_skipped, 'negative', v_negative, 'stale', v_stale_n, 'locked', v_locked),
      CASE WHEN v_count = 1 THEN (v_done -> 0 ->> 'employee_id')::uuid END);
  END IF;

  v_message := concat_ws(' ',
    CASE WHEN v_stale_n > 0 THEN format('%s %s not finalised: the salary, unpaid leave or priced overtime behind %s changed after %s filled. Refill %s first, check the figures, then finalise.',
      v_stale_n, CASE WHEN v_stale_n = 1 THEN 'draft was' ELSE 'drafts were' END,
      CASE WHEN v_stale_n = 1 THEN 'it' ELSE 'them' END, CASE WHEN v_stale_n = 1 THEN 'it was' ELSE 'they were' END,
      CASE WHEN v_stale_n = 1 THEN 'it' ELSE 'them' END) END,
    CASE WHEN v_locked > 0 THEN format('%s %s not deleted: %s already paid once. Correct the figures and finalise again instead.',
      v_locked, CASE WHEN v_locked = 1 THEN 'draft was' ELSE 'drafts were' END,
      CASE WHEN v_locked = 1 THEN 'it was' ELSE 'they were' END) END);

  RETURN jsonb_build_object('op', p_op, 'done', v_done, 'skipped', v_skipped, 'negative', v_negative,
                            'stale', v_stale_n, 'locked', v_locked, 'message', NULLIF(v_message, ''));
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixes 3 and 5: Finance's edits. A field left out keeps its stored value; tax follows the part-month share.
-- ---------------------------------------------------------------------------
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
      -- Not sent: the figure on the slip stays.
      v := COALESCE((to_jsonb(p) ->> f.key)::numeric, 0);
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
  ELSIF NOT (i ? 'lines') THEN
    v_lines := COALESCE(p.lines, '[]'::jsonb);
  END IF;

  IF i ? 'notes' THEN
    v_notes := btrim(COALESCE(i ->> 'notes', ''));
  ELSE
    v_notes := COALESCE(p.notes, '');
  END IF;
  IF char_length(v_notes) > 500 THEN
    RETURN jsonb_build_object('error', 'Keep notes to 500 characters.');
  END IF;
  v_manual := CASE WHEN i ? 'tax_manual' THEN COALESCE(i -> 'tax_manual' = 'true'::jsonb, false) ELSE p.tax_manual END;

  v_rules := public._payroll_rules(v_company);
  v_tax := public._payroll_tax_from_split((vals ->> 'basic_salary')::numeric, (vals ->> 'allowances')::numeric, v_rules,
                                          p.paid_days, p.month_days);
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

-- ---------------------------------------------------------------------------
-- Fix 8: salaries. Any 1st of a month may be chosen (up to a year ahead). Nothing is written until every
-- row is checked; a row whose person has a final or paid payslip dated from that month or later is refused
-- outright, with the month named, so a final payslip never silently disagrees with the salary on file.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_save_salaries(p_rows jsonb, p_effective_month date, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._payroll_assert_finance();
  v_this date := date_trunc('month', public.company_today(v_company)::timestamp)::date;
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
  v_final date;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_changed jsonb := '[]'::jsonb;
BEGIN
  IF v_eff IS NULL THEN
    RETURN jsonb_build_object('error', 'Choose the month the new salaries apply from.');
  END IF;
  IF v_eff > (v_this + interval '12 months')::date THEN
    RETURN jsonb_build_object('error', 'Choose a month within the next year.');
  END IF;
  IF v_eff < DATE '2000-01-01' THEN
    RETURN jsonb_build_object('error', 'That month is too far back.');
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('error', 'Nothing to save.');
  END IF;
  IF jsonb_array_length(p_rows) > 2000 THEN
    RETURN jsonb_build_object('error', 'Save at most 2,000 people at once.');
  END IF;
  SELECT COALESCE(NULLIF(upper(c.currency), ''), 'PKR') INTO v_currency FROM public.companies c WHERE c.id = v_company;

  -- Pass 1: check every row before anything is written.
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

    -- A final or paid payslip from that month on already uses the salary on file.
    SELECT min(ps.month) INTO v_final
    FROM public.payslips ps
    WHERE ps.employee_id = v_emp AND ps.status IN ('final', 'paid')
      AND ps.month >= date_trunc('month', v_date::timestamp)::date;
    IF v_final IS NOT NULL THEN
      RETURN jsonb_build_object('error', format('%s''s %s payslip is already final, so a salary from %s cannot change. Reopen that payslip first, or choose a later month.',
        e.name, public._payroll_month_label(v_final), public._payroll_month_label(v_date)));
    END IF;

    v_rows := v_rows || jsonb_build_object(
      'employee_id', v_emp, 'name', e.name, 'date', v_date, 'monthly_salary', v_sal, 'other_allowance', v_oth, 'pay_method', v_meth,
      'from', CASE WHEN b_found THEN jsonb_build_object('monthly_salary', b_sal, 'other_allowance', b_oth, 'pay_method', b_meth) END);
  END LOOP;

  -- Pass 2: write.
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    v_emp := (v_row ->> 'employee_id')::uuid;
    v_date := (v_row ->> 'date')::date;
    v_sal := (v_row ->> 'monthly_salary')::numeric;
    v_oth := (v_row ->> 'other_allowance')::numeric;
    v_meth := v_row ->> 'pay_method';

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
      format('Set %s''s salary to %s%s, paid by %s, from %s%s', v_row ->> 'name', public._payroll_fmt(v_sal, v_currency),
             CASE WHEN v_oth > 0 THEN format(' plus %s other allowance', public._payroll_fmt(v_oth, v_currency)) ELSE '' END,
             v_meth, public._payroll_day_label(v_date), CASE WHEN v_reason <> '' THEN format(' (%s)', v_reason) ELSE '' END),
      jsonb_build_object(
        'from', v_row -> 'from',
        'to', jsonb_build_object('monthly_salary', v_sal, 'other_allowance', v_oth, 'pay_method', v_meth),
        'effective_from', v_date, 'reason', v_reason),
      v_emp);

    v_changed := v_changed || jsonb_build_object('employee_id', v_emp, 'name', v_row ->> 'name', 'effective_from', v_date,
                                                 'monthly_salary', v_sal, 'other_allowance', v_oth, 'pay_method', v_meth);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'changed', v_changed, 'kept', '[]'::jsonb, 'effective_from', v_eff);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fix 3 in the portal's "what to expect" figures.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_expected_pay(p_token text, p_month date DEFAULT NULL::date)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
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
      AND o.date >= COALESCE(v_emp.joining_date, o.date)
      AND o.date <= COALESCE(v_emp.separation_date, o.date)
      AND ((o.payslip_id IS NULL AND o.paid_in_month IS NULL AND (v_carry OR o.date >= v_start))
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

  v_b := public._payroll_breakdown_pay(v_pay, v_rules);
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

-- ---------------------------------------------------------------------------
-- Fix 1 wording: Finance is told how many calendar days come off the pay, the way payroll counts them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_payroll_leave_pay_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_was boolean := TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'approved';
  v_now boolean := TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'approved';
  v_row public.leave_requests;
  v_kind text;
  v_unpaid boolean;
  v_type text;
  v_name text;
  v_days integer;
  v_when text;
  v_title text;
  v_detail text;
BEGIN
  IF v_was = v_now THEN
    RETURN NULL;
  END IF;
  IF v_now THEN
    v_row := NEW;
    v_kind := 'unpaid_leave';
  ELSE
    v_row := OLD;
    v_kind := 'unpaid_leave_undone';
  END IF;

  BEGIN
    SELECT NOT t.is_paid, t.name INTO v_unpaid, v_type FROM public.leave_types t WHERE t.id = v_row.leave_type_id;
    IF NOT COALESCE(v_unpaid, false) THEN
      RETURN NULL;
    END IF;
    SELECT e.name INTO v_name FROM public.employees e WHERE e.id = v_row.employee_id;
    IF v_name IS NULL THEN
      RETURN NULL;
    END IF;
    -- Recorded once per change, even when an RPC records the same event in this transaction.
    IF EXISTS (SELECT 1 FROM public.pay_events v
               WHERE v.employee_id = v_row.employee_id AND v.kind = v_kind
                 AND v.effective_date IS NOT DISTINCT FROM v_row.start_date AND v.created_at >= now()) THEN
      RETURN NULL;
    END IF;

    -- Calendar days: pay is shared over the days of the month, so each day of the spell comes off.
    v_days := GREATEST(COALESCE(v_row.end_date, v_row.start_date) - v_row.start_date + 1, 1);
    v_when := CASE WHEN v_row.end_date IS NULL OR v_row.end_date = v_row.start_date
                   THEN public._payroll_day_label(v_row.start_date)
                   ELSE format('%s to %s', to_char(v_row.start_date, 'FMDD Mon'), public._payroll_day_label(v_row.end_date)) END;
    IF v_kind = 'unpaid_leave' THEN
      v_title := format('Unpaid leave: %s', v_name);
      v_detail := format('%s, %s: %s %s of pay come off the month (weekends and holidays in the spell included).',
                         v_type, v_when, v_days, CASE WHEN v_days = 1 THEN 'day' ELSE 'days' END);
    ELSE
      v_title := format('Unpaid leave taken back: %s', v_name);
      v_detail := format('%s from %s is no longer approved, so those days are paid again.', v_type, public._payroll_day_label(v_row.start_date));
    END IF;

    INSERT INTO public.pay_events (company_id, employee_id, kind, title, detail, effective_date, created_by)
    VALUES (v_row.company_id, v_row.employee_id, v_kind, left(v_title, 200), left(v_detail, 500), v_row.start_date, auth.uid());
    PERFORM public.notify_roles(v_row.company_id, ARRAY['finance'], 'payroll', v_title, v_detail, '/payroll/updates');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pay event not recorded: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._leave_after_approval(p_id uuid, p_days integer, p_automatic boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v record;
  v_when text;
  v_cal integer;
BEGIN
  SELECT r.id, r.company_id, r.employee_id, r.start_date, r.end_date, r.days_count, r.review_notes,
         e.name AS employee_name, t.name AS type_name, t.is_paid
  INTO v
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id;
  v_when := public._leave_when(v.start_date, v.end_date);

  IF p_automatic THEN
    -- Auto-approval only happens on a portal request: the employee is the actor.
    PERFORM public._leave_log_portal(
      v.company_id, v.employee_id, 'leave.approved',
      format('%s leave for %s, %s, was approved automatically', v.type_name, v.employee_name, v_when),
      jsonb_build_object('id', v.id, 'start', v.start_date, 'end', v.end_date, 'days', v.days_count, 'attendance_days', p_days, 'automatic', true)
    );
  ELSE
    PERFORM public.log_activity(
      'leave.approved',
      format('%s approved %s leave for %s, %s', public._leave_actor_name(), lower(v.type_name), v.employee_name, v_when),
      jsonb_build_object('id', v.id, 'start', v.start_date, 'end', v.end_date, 'days', v.days_count, 'attendance_days', p_days, 'automatic', false),
      v.employee_id
    );
  END IF;
  -- Unpaid leave comes off the month's pay, every calendar day of it: Finance is told.
  IF NOT v.is_paid THEN
    v_cal := GREATEST(COALESCE(v.end_date, v.start_date) - v.start_date + 1, 1);
    PERFORM public._leave_pay_event(
      v.company_id, v.employee_id, 'unpaid_leave',
      format('Unpaid leave: %s', v.employee_name),
      format('%s, %s: %s %s of pay come off the month (weekends and holidays in the spell included).',
             v.type_name, v_when, v_cal, CASE WHEN v_cal = 1 THEN 'day' ELSE 'days' END),
      v.start_date
    );
  END IF;
  IF NOT p_automatic THEN
    PERFORM public.notify_employee(
      v.company_id, v.employee_id, 'leave', 'Your leave was approved',
      format('%s, %s%s', v.type_name, v_when, CASE WHEN v.review_notes IS NOT NULL THEN format(' · HR: "%s"', left(v.review_notes, 100)) ELSE '' END),
      '/portal/leave'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the new helpers are internal like the rest of the engine.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._payroll_breakdown_pay(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._payroll_tax_from_split(numeric, numeric, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
