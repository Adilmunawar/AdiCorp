-- Payroll 2/5: the calculation engine (internal helpers; no client may call them).
--
-- Pay rules (per company, payroll_settings.rules), for a gross monthly salary S:
--   basic          = S x basic %                (default 60%)
--   allowances     = S - basic
--   medical exempt = basic x medical %          (default 10% of basic)
--   taxable        = S - medical exempt
--   tax (year)     = slab table on taxable x 12 (income exactly on a boundary stays in the lower slab)
--   tax (month)    = tax (year) / 12, rounded to the whole unit
-- Checked by hand with the default PKR table: S 250,000 -> basic 150,000, exempt 15,000, taxable 235,000,
-- yearly 240,000 (116,000 + 20% of 620,000), 20,000 a month. S 95,000 -> taxable 89,300, yearly 4,716.
--
-- The month's pay, day by day: a day is paid when the person was employed (joining_date to
-- separation_date, both included) and not on approved UNPAID leave (working days only), at the salary in
-- force that day (salary_history); each paid day is 1/(days in the month). A whole month at one salary is
-- that salary exactly; anything shared by days is rounded to the whole unit.
-- Checked by hand: 120,000 a month, joined 15 October (31 days) -> 17 days -> 65,806; with 2 working days
-- of unpaid leave as well -> 15 days -> 58,065.
--
-- Totals, the one place pay is added up:
--   gross = basic + allowances + other allowances + overtime + positive extra lines
--   total deductions = income tax + other deductions + |negative extra lines|
--   net = gross - total deductions

-- ---------------------------------------------------------------------------
-- Small pure helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_num(p jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::numeric
    WHEN jsonb_typeof(p) = 'string' AND btrim(p #>> '{}') ~ '^-?[0-9]{1,15}(\.[0-9]{1,6})?$' THEN btrim(p #>> '{}')::numeric
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public._payroll_within(p jsonb, p_lo numeric, p_hi numeric, p_fallback numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN v > p_lo AND v <= p_hi THEN round(v, 2) ELSE p_fallback END
  FROM (SELECT public._payroll_num(p) AS v) x
$$;

CREATE OR REPLACE FUNCTION public._payroll_fmt(p_amount numeric, p_currency text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(upper(btrim(p_currency)), ''), 'PKR') || ' ' || to_char(round(COALESCE(p_amount, 0)), 'FM999,999,999,999,990')
$$;

CREATE OR REPLACE FUNCTION public._payroll_month_label(p_month date)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT to_char(p_month, 'FMMonth YYYY')
$$;

CREATE OR REPLACE FUNCTION public._payroll_day_label(p_day date)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT to_char(p_day, 'FMDD Mon YYYY')
$$;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_default_rules(p_company uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'basic_percent', 60,
    'medical_exempt_percent', 10,
    'slabs', CASE WHEN upper(COALESCE(c.currency, '')) = 'PKR'
      THEN '[{"from":0,"fixed":0,"rate":0},{"from":600000,"fixed":0,"rate":1},{"from":1200000,"fixed":6000,"rate":11},{"from":2200000,"fixed":116000,"rate":20},{"from":3200000,"fixed":316000,"rate":25},{"from":4100000,"fixed":541000,"rate":29},{"from":5600000,"fixed":976000,"rate":32},{"from":7000000,"fixed":1424000,"rate":35}]'::jsonb
      ELSE '[{"from":0,"fixed":0,"rate":0}]'::jsonb END,
    'label', CASE WHEN upper(COALESCE(c.currency, '')) = 'PKR'
      THEN 'Salaried individuals, yearly slabs'
      ELSE 'No income tax until slabs are added' END,
    'overtime', jsonb_build_object(
      'basis', 'gross',
      'days_per_month', 30,
      'hours_per_day', 8,
      'multipliers', jsonb_build_object(
        'regular', CASE WHEN oc.regular_multiplier > 0 AND oc.regular_multiplier <= 10 THEN oc.regular_multiplier ELSE 1.5 END,
        'weekend', CASE WHEN oc.weekend_multiplier > 0 AND oc.weekend_multiplier <= 10 THEN oc.weekend_multiplier ELSE 2 END,
        'holiday', CASE WHEN oc.holiday_multiplier > 0 AND oc.holiday_multiplier <= 10 THEN oc.holiday_multiplier ELSE 2.5 END
      )
    )
  )
  FROM (SELECT 1) AS one
  LEFT JOIN public.companies c ON c.id = p_company
  LEFT JOIN public.overtime_config oc ON oc.company_id = p_company
$$;

-- Anything odd in stored or typed rules falls back to the company default.
CREATE OR REPLACE FUNCTION public._payroll_clean_rules(p_raw jsonb, p_default jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  r jsonb := CASE WHEN jsonb_typeof(p_raw) = 'object' THEN p_raw ELSE '{}'::jsonb END;
  o jsonb;
  m jsonb;
  d_ot jsonb := p_default -> 'overtime';
  d_m jsonb := p_default -> 'overtime' -> 'multipliers';
  v_basic numeric;
  v_medical numeric;
  v_slabs jsonb;
BEGIN
  o := CASE WHEN jsonb_typeof(r -> 'overtime') = 'object' THEN r -> 'overtime' ELSE '{}'::jsonb END;
  m := CASE WHEN jsonb_typeof(o -> 'multipliers') = 'object' THEN o -> 'multipliers' ELSE '{}'::jsonb END;

  v_basic := public._payroll_num(r -> 'basic_percent');
  IF v_basic IS NULL OR v_basic <= 0 OR v_basic > 100 THEN v_basic := (p_default ->> 'basic_percent')::numeric; END IF;
  v_medical := public._payroll_num(r -> 'medical_exempt_percent');
  IF v_medical IS NULL OR v_medical < 0 OR v_medical > 100 THEN v_medical := (p_default ->> 'medical_exempt_percent')::numeric; END IF;

  SELECT jsonb_agg(jsonb_build_object('from', t.f, 'fixed', t.fx, 'rate', t.rt) ORDER BY t.f)
  INTO v_slabs
  FROM (
    SELECT DISTINCT ON (s.f) s.f, s.fx, s.rt
    FROM (
      SELECT round(public._payroll_num(x -> 'from'), 2) AS f,
             round(public._payroll_num(x -> 'fixed'), 2) AS fx,
             round(public._payroll_num(x -> 'rate'), 4) AS rt
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r -> 'slabs') = 'array' THEN r -> 'slabs' ELSE '[]'::jsonb END) AS x
      WHERE jsonb_typeof(x) = 'object'
    ) s
    WHERE s.f IS NOT NULL AND s.f >= 0 AND s.f < 10000000000
      AND s.fx IS NOT NULL AND s.fx >= 0 AND s.fx < 10000000000
      AND s.rt IS NOT NULL AND s.rt >= 0 AND s.rt <= 100
    ORDER BY s.f
    LIMIT 12
  ) t;

  RETURN jsonb_build_object(
    'basic_percent', v_basic,
    'medical_exempt_percent', v_medical,
    'slabs', COALESCE(v_slabs, p_default -> 'slabs'),
    'label', CASE WHEN jsonb_typeof(r -> 'label') = 'string' THEN left(btrim(r ->> 'label'), 80) ELSE p_default ->> 'label' END,
    'overtime', jsonb_build_object(
      'basis', CASE WHEN o ->> 'basis' = 'basic' THEN 'basic' WHEN o ->> 'basis' = 'gross' THEN 'gross' ELSE COALESCE(d_ot ->> 'basis', 'gross') END,
      'days_per_month', public._payroll_within(o -> 'days_per_month', 0, 31, (d_ot ->> 'days_per_month')::numeric),
      'hours_per_day', public._payroll_within(o -> 'hours_per_day', 0, 24, (d_ot ->> 'hours_per_day')::numeric),
      'multipliers', jsonb_build_object(
        'regular', public._payroll_within(m -> 'regular', 0, 10, (d_m ->> 'regular')::numeric),
        'weekend', public._payroll_within(m -> 'weekend', 0, 10, (d_m ->> 'weekend')::numeric),
        'holiday', public._payroll_within(m -> 'holiday', 0, 10, (d_m ->> 'holiday')::numeric)
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._payroll_rules(p_company uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT public._payroll_clean_rules(
    (SELECT s.rules FROM public.payroll_settings s WHERE s.company_id = p_company),
    public._payroll_default_rules(p_company)
  )
$$;

-- ---------------------------------------------------------------------------
-- Tax and structure
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_yearly_tax(p_income numeric, p_slabs jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN COALESCE(p_income, 0) <= 0 THEN 0 ELSE COALESCE((
    SELECT round(s.fx + (p_income - s.f) * s.rt / 100, 2)
    FROM (
      SELECT (x ->> 'from')::numeric AS f, (x ->> 'fixed')::numeric AS fx, (x ->> 'rate')::numeric AS rt
      FROM jsonb_array_elements(COALESCE(p_slabs, '[]'::jsonb)) AS x
    ) s
    WHERE p_income > s.f
    ORDER BY s.f DESC
    LIMIT 1
  ), 0) END
$$;

CREATE OR REPLACE FUNCTION public._payroll_breakdown(p_salary numeric, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_gross numeric := round(GREATEST(COALESCE(p_salary, 0), 0), 2);
  v_basic numeric;
  v_medical numeric;
  v_taxable numeric;
  v_yearly numeric;
BEGIN
  v_basic := round(v_gross * (p_rules ->> 'basic_percent')::numeric / 100, 2);
  v_medical := round(v_basic * (p_rules ->> 'medical_exempt_percent')::numeric / 100, 2);
  v_taxable := round(GREATEST(v_gross - v_medical, 0), 2);
  v_yearly := public._payroll_yearly_tax(v_taxable * 12, p_rules -> 'slabs');
  RETURN jsonb_build_object(
    'gross', v_gross,
    'basic', v_basic,
    'allowances', round(v_gross - v_basic, 2),
    'medical_exempt', v_medical,
    'taxable', v_taxable,
    'yearly_tax', v_yearly,
    'monthly_tax', round(v_yearly / 12)
  );
END;
$$;

-- The same tax worked from a payslip's own basic and allowances (after Finance changed them by hand).
CREATE OR REPLACE FUNCTION public._payroll_tax_from_split(p_basic numeric, p_allowances numeric, p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  b numeric := GREATEST(COALESCE(p_basic, 0), 0);
  a numeric := GREATEST(COALESCE(p_allowances, 0), 0);
  v_taxable numeric;
  v_yearly numeric;
BEGIN
  v_taxable := round(GREATEST(b + a - b * (p_rules ->> 'medical_exempt_percent')::numeric / 100, 0), 2);
  v_yearly := public._payroll_yearly_tax(v_taxable * 12, p_rules -> 'slabs');
  RETURN jsonb_build_object('taxable', v_taxable, 'yearly_tax', v_yearly, 'monthly_tax', round(v_yearly / 12));
END;
$$;

-- hourly rate = (gross salary, or its basic part) / days a month / hours a day
CREATE OR REPLACE FUNCTION public._payroll_suggested_rate(p_salary numeric, p_rules jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT round(
    (CASE WHEN p_rules -> 'overtime' ->> 'basis' = 'basic'
          THEN GREATEST(COALESCE(p_salary, 0), 0) * (p_rules ->> 'basic_percent')::numeric / 100
          ELSE GREATEST(COALESCE(p_salary, 0), 0) END)
    / (p_rules -> 'overtime' ->> 'days_per_month')::numeric
    / (p_rules -> 'overtime' ->> 'hours_per_day')::numeric, 2)
$$;

CREATE OR REPLACE FUNCTION public._payroll_multiplier(p_type text, p_rules jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE((p_rules -> 'overtime' -> 'multipliers' ->> COALESCE(p_type, 'regular'))::numeric,
                  (p_rules -> 'overtime' -> 'multipliers' ->> 'regular')::numeric, 1)
$$;

-- Hours x rate x multiplier, to the whole unit: the one place an overtime amount is worked out.
CREATE OR REPLACE FUNCTION public._payroll_ot_amount(p_hours numeric, p_rate numeric, p_multiplier numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT round(COALESCE(p_hours, 0) * COALESCE(p_rate, 0) * COALESCE(p_multiplier, 0))
$$;

-- Extra lines: at most 6, label 1..40 characters, a non-zero amount; anything else is dropped.
CREATE OR REPLACE FUNCTION public._payroll_clean_lines(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('label', l.label, 'amount', l.amount) ORDER BY l.ord), '[]'::jsonb)
  FROM (
    SELECT left(btrim(x.value ->> 'label'), 40) AS label, round(public._payroll_num(x.value -> 'amount'), 2) AS amount, x.ord
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) WITH ORDINALITY AS x(value, ord)
    WHERE jsonb_typeof(x.value) = 'object'
  ) l
  WHERE COALESCE(l.label, '') <> '' AND COALESCE(l.amount, 0) <> 0 AND abs(l.amount) < 100000000 AND l.ord <= 6
$$;

CREATE OR REPLACE FUNCTION public._payroll_totals(
  p_basic numeric, p_allowances numeric, p_other numeric, p_overtime numeric,
  p_tax numeric, p_other_deductions numeric, p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_earn numeric := 0;
  v_ded numeric := 0;
  v_gross numeric;
  v_total numeric;
BEGIN
  SELECT COALESCE(sum(a) FILTER (WHERE a > 0), 0), COALESCE(-sum(a) FILTER (WHERE a < 0), 0)
  INTO v_earn, v_ded
  FROM (SELECT (x ->> 'amount')::numeric AS a FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS x) s;
  v_gross := round(COALESCE(p_basic, 0) + COALESCE(p_allowances, 0) + COALESCE(p_other, 0) + COALESCE(p_overtime, 0) + v_earn, 2);
  v_total := round(COALESCE(p_tax, 0) + COALESCE(p_other_deductions, 0) + v_ded, 2);
  RETURN jsonb_build_object(
    'gross_salary', v_gross,
    'total_deductions', v_total,
    'net_salary', round(v_gross - v_total, 2),
    'extra_earnings', round(v_earn, 2),
    'extra_deductions', round(v_ded, 2)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Working days of one person: own weekend flags, else the company week (including the Time module's
-- alternate-Saturday pattern and window when present), minus company holidays and off days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_working_dates(p_employee uuid, p_from date, p_to date)
RETURNS SETOF date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH cfg AS (
    SELECT emp.company_id,
           emp.weekend_saturday AS emp_sat,
           COALESCE(emp.weekend_saturday, (to_jsonb(s) ->> 'weekend_saturday')::boolean, false) AS sat_off,
           COALESCE(emp.weekend_sunday, (to_jsonb(s) ->> 'weekend_sunday')::boolean, true) AS sun_off,
           COALESCE(to_jsonb(s) ->> 'saturday_pattern', 'all') AS pattern,
           (to_jsonb(s) ->> 'saturday_off_from')::date AS sat_from,
           (to_jsonb(s) ->> 'saturday_off_until')::date AS sat_until
    FROM public.employees emp
    LEFT JOIN public.company_working_settings s ON s.company_id = emp.company_id
    WHERE emp.id = p_employee
  ),
  days AS (
    SELECT g::date AS d FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS g
    WHERE p_from IS NOT NULL AND p_to IS NOT NULL
  )
  SELECT days.d
  FROM days, cfg
  WHERE NOT (extract(isodow FROM days.d) = 7 AND cfg.sun_off)
    AND NOT (extract(isodow FROM days.d) = 6 AND cfg.sat_off AND (
          cfg.emp_sat IS NOT NULL
          OR ((cfg.sat_from IS NULL OR days.d >= cfg.sat_from)
              AND (cfg.sat_until IS NULL OR days.d <= cfg.sat_until)
              AND (cfg.pattern NOT IN ('alt_2_4', 'alt_1_3_5')
                   OR (cfg.pattern = 'alt_2_4' AND ((extract(day FROM days.d)::int - 1) / 7 + 1) IN (2, 4))
                   OR (cfg.pattern = 'alt_1_3_5' AND ((extract(day FROM days.d)::int - 1) / 7 + 1) IN (1, 3, 5))))))
    AND NOT EXISTS (
      SELECT 1 FROM public.events ev
      WHERE ev.company_id = cfg.company_id
        AND ev.affects_attendance
        AND ev.type IN ('holiday', 'off_day')
        AND ev.date <= days.d
        AND ev.date >= days.d - 60
        AND COALESCE((to_jsonb(ev) ->> 'end_date')::date, ev.date) >= days.d)
  ORDER BY days.d
$$;

-- ---------------------------------------------------------------------------
-- The month's pay (see the header). p_month is any day of the month.
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
    SELECT COALESCE(array_agg(DISTINCT w.d), '{}')
    INTO v_unpaid
    FROM public.leave_requests r
    JOIN public.leave_types t ON t.id = r.leave_type_id
    CROSS JOIN LATERAL public._payroll_working_dates(p_employee, GREATEST(r.start_date, v_from), LEAST(r.end_date, v_to)) AS w(d)
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

-- The payslip note that explains a part month: why, and how many days were paid.
CREATE OR REPLACE FUNCTION public._payroll_prorated_note(p_pay jsonb, p_currency text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  parts text[] := '{}';
  v_unpaid integer := COALESCE((p_pay ->> 'unpaid_leave_days')::integer, 0);
  v_segs text;
BEGIN
  IF p_pay IS NULL OR NOT COALESCE((p_pay ->> 'prorated')::boolean, false) THEN
    RETURN '';
  END IF;
  IF p_pay ->> 'joined' IS NOT NULL THEN
    parts := parts || format('Joined on %s.', public._payroll_day_label((p_pay ->> 'joined')::date));
  END IF;
  IF p_pay ->> 'left' IS NOT NULL THEN
    parts := parts || format('Last day %s.', public._payroll_day_label((p_pay ->> 'left')::date));
  END IF;
  IF v_unpaid > 0 THEN
    parts := parts || format('%s %s of unpaid leave.', v_unpaid, CASE WHEN v_unpaid = 1 THEN 'day' ELSE 'days' END);
  END IF;
  IF COALESCE((p_pay ->> 'salary_changed')::boolean, false) THEN
    SELECT string_agg(format('%s for %s %s', public._payroll_fmt((s ->> 'monthly_salary')::numeric, p_currency), s ->> 'days',
                             CASE WHEN (s ->> 'days')::integer = 1 THEN 'day' ELSE 'days' END), ', ' ORDER BY s ->> 'from')
    INTO v_segs
    FROM jsonb_array_elements(p_pay -> 'segments') AS s;
    parts := parts || format('Salary changed during the month: %s.', v_segs);
  END IF;
  parts := parts || format('Paid for %s of %s days.', p_pay ->> 'paid_days', p_pay ->> 'month_days');
  RETURN left(array_to_string(parts, ' '), 500);
END;
$$;

-- ---------------------------------------------------------------------------
-- Attendance for reference (nothing is paid from it).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_attendance(p_employee uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;
  v_join date;
  v_sep date;
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
  SELECT e.joining_date, e.separation_date INTO v_join, v_sep FROM public.employees e WHERE e.id = p_employee;
  v_from := GREATEST(v_start, COALESCE(v_join, v_start));
  v_to := LEAST(v_end, COALESCE(v_sep, v_end));
  v_sofar := LEAST(v_to, current_date);

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
$$;

-- ---------------------------------------------------------------------------
-- Overtime reaches a payslip once HR approved the hours and Finance priced them. Each entry is paid
-- once: a draft takes every priced entry worked by its month end that no other payslip has taken
-- (overtime_records.payslip_id). A refill hands its entries back and takes them again; deleting a
-- draft hands them back (FK on delete set null). Entries on a final or paid payslip are frozen.
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
  WHERE o.employee_id = p_employee
    AND o.status = 'approved'
    AND o.pay_status = 'priced'
    AND o.date <= p_end
    AND (o.payslip_id IS NULL OR o.payslip_id = p_payslip)
$$;

CREATE OR REPLACE FUNCTION public._payroll_ot_on_slip(p_payslip uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'hours', COALESCE(round(sum(o.hours), 2), 0),
    'amount', COALESCE(round(sum(o.total_amount), 2), 0),
    'entries', count(*))
  FROM public.overtime_records o
  WHERE o.payslip_id = p_payslip AND o.status = 'approved' AND o.pay_status = 'priced'
$$;

CREATE OR REPLACE FUNCTION public._payroll_ot_claim(p_payslip uuid, p_employee uuid, p_end date)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.overtime_records SET payslip_id = NULL WHERE payslip_id = p_payslip;
  UPDATE public.overtime_records o
  SET payslip_id = p_payslip
  WHERE o.employee_id = p_employee
    AND o.status = 'approved'
    AND o.pay_status = 'priced'
    AND o.date <= p_end
    AND o.payslip_id IS NULL;
$$;

-- A draft filled from a salary or overtime that has changed since.
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
            WHERE o.employee_id = p.employee_id AND o.status = 'approved' AND o.pay_status = 'priced'
              AND o.date <= v_end AND o.payslip_id IS NULL)
          OR round((public._payroll_ot_on_slip(p.id) ->> 'amount')::numeric, 2) <> round(p.overtime_basis, 2);
  RETURN jsonb_build_object('salary', v_salary, 'overtime', v_ot);
END;
$$;

-- ---------------------------------------------------------------------------
-- Life cycle (internal; callers check Finance and the company first)
-- ---------------------------------------------------------------------------

-- Creates the month's draft for one person. {id, created} or {negative: true}; never a second one.
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
  v_b := public._payroll_breakdown((v_pay ->> 'monthly_salary')::numeric, p_rules);
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

-- Puts a draft's salary figures back to what the salary on file and the tax table give now, and its
-- overtime back to the priced entries it may take. Extra lines, other deductions and typed notes stay.
-- Returns 'ok', 'missing' or 'negative'.
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
  v_b := public._payroll_breakdown((v_pay ->> 'monthly_salary')::numeric, p_rules);
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

-- draft -> final locks it and shows it to the employee; final -> draft reopens; final -> paid records
-- the date; paid -> final undoes that. The employee is told (never amounts: a lock screen is seen by
-- whoever is near it). Undoing a payment mark is a Finance correction and says nothing.
-- Returns the payslip id, or NULL when the step does not apply.
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
    v_paid := COALESCE(p_paid_on, current_date);
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
$$;

-- ---------------------------------------------------------------------------
-- Who belongs on a month's sheet: people on the books who had joined by month end and had not left
-- before it began, and anyone else who already has a payslip for it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._payroll_sheet_employees(p_company uuid, p_month date)
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.company_id = p_company
    AND (
      ((e.joining_date IS NULL OR e.joining_date <= (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date)
        AND ((e.status = 'active' AND (e.separation_date IS NULL OR e.separation_date >= date_trunc('month', p_month::timestamp)::date))
             OR (e.status <> 'active' AND e.separation_date IS NOT NULL AND e.separation_date >= date_trunc('month', p_month::timestamp)::date)))
      OR EXISTS (SELECT 1 FROM public.payslips p WHERE p.employee_id = e.id AND p.month = date_trunc('month', p_month::timestamp)::date)
    )
$$;

-- Finance/owner of the caller's company, or an error.
CREATE OR REPLACE FUNCTION public._payroll_assert_finance()
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can do this' USING ERRCODE = '42501';
  END IF;
  RETURN v_company;
END;
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._payroll_num(jsonb)',
    'public._payroll_within(jsonb, numeric, numeric, numeric)',
    'public._payroll_fmt(numeric, text)',
    'public._payroll_month_label(date)',
    'public._payroll_day_label(date)',
    'public._payroll_default_rules(uuid)',
    'public._payroll_clean_rules(jsonb, jsonb)',
    'public._payroll_rules(uuid)',
    'public._payroll_yearly_tax(numeric, jsonb)',
    'public._payroll_breakdown(numeric, jsonb)',
    'public._payroll_tax_from_split(numeric, numeric, jsonb)',
    'public._payroll_suggested_rate(numeric, jsonb)',
    'public._payroll_multiplier(text, jsonb)',
    'public._payroll_ot_amount(numeric, numeric, numeric)',
    'public._payroll_clean_lines(jsonb)',
    'public._payroll_totals(numeric, numeric, numeric, numeric, numeric, numeric, jsonb)',
    'public._payroll_working_dates(uuid, date, date)',
    'public._payroll_month_pay(uuid, date)',
    'public._payroll_prorated_note(jsonb, text)',
    'public._payroll_attendance(uuid, date)',
    'public._payroll_ot_payable(uuid, date, uuid)',
    'public._payroll_ot_on_slip(uuid)',
    'public._payroll_ot_claim(uuid, uuid, date)',
    'public._payroll_stale(uuid, jsonb)',
    'public._payroll_prepare(uuid, date, jsonb, text)',
    'public._payroll_refill(uuid, jsonb, text)',
    'public._payroll_set_status(uuid, text, date)',
    'public._payroll_sheet_employees(uuid, date)',
    'public._payroll_assert_finance()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
