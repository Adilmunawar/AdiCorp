-- Expenses, careers and engagement: confirmed bug fixes.
--
--  1. _expense_pay accepted a payment on a once item that was already paid, and
--     never compared what has been paid with the quoted amount. Both now stop
--     with a "confirm" error (SQLSTATE P0C01) unless p_force is true, so the UI
--     can ask "Record it anyway?" and resend with p_force.
--  2. Payments are in the company currency while an item may be quoted in USD, so
--     the portal said "PKR 55,600 in all" under a "USD 99" item. A payment can now
--     carry quoted_amount / quoted_currency (what it equals in the item's currency,
--     only when the currencies differ). The portal JSON adds paid_quoted_total (in
--     the item's currency, when every payment carries a quoted amount) next to the
--     unchanged company-currency paid_total.
--  3. A subscription's renewal advanced one cycle per payment ROW: two half
--     payments moved it two months. Cycles covered are now floor(total paid /
--     amount) in the item's currency (quoted amounts when present, the amounts
--     themselves when the currencies match); when the currencies differ and no
--     quoted amount exists the rows are counted as before, so no live date moves.
--  4. Reimbursements and new Finance entries could be recorded for people who have
--     left. Both now stop with the confirm error unless p_force is true.
--  5. careers_hire_application always inserted a new employee, duplicating
--     returning people. With a match on email or CNIC digits it now raises
--     'existing_employee' (SQLSTATE P0E01, DETAIL = JSON with the id, name and
--     status) and a new overload takes p_employee_id to link the application to
--     that person instead (reactivating them through people_rejoin_employee).
--  6. The 5-a-day complaint limit skipped anonymous complaints. A private counter
--     (engagement_private.complaint_rate, never joined to complaints) now counts
--     named and anonymous complaints alike.
--  7. careers_set_company_slug checked with EXISTS then UPDATEd; a race hit the
--     unique index with a raw error. unique_violation now returns the friendly
--     message.
--
-- Overloads instead of changed signatures (nothing is dropped): the new
-- functions take every parameter without defaults, so a call that names the new
-- parameter reaches only the new function and an old call reaches only the old
-- one, which now delegates (PostgREST and Postgres both resolve unambiguously).

-- ---------------------------------------------------------------------------
-- 2. Payment columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.expense_payments ADD COLUMN IF NOT EXISTS quoted_amount numeric(14, 2);
ALTER TABLE public.expense_payments ADD COLUMN IF NOT EXISTS quoted_currency text;
COMMENT ON COLUMN public.expense_payments.quoted_amount IS 'What this payment equals in the item''s own currency, when that differs from the company currency.';
COMMENT ON COLUMN public.expense_payments.quoted_currency IS 'The item''s currency at payment time (with quoted_amount).';

-- The company currency an expense's payments are recorded in.
CREATE OR REPLACE FUNCTION public._expense_company_currency(p_company uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT upper(COALESCE(NULLIF(btrim(c.currency), ''), 'USD')) FROM public.companies c WHERE c.id = p_company;
$$;
REVOKE ALL ON FUNCTION public._expense_company_currency(uuid) FROM PUBLIC, anon, authenticated;

-- Total paid in the item's currency: the amounts when the currencies match, the
-- quoted amounts when every payment carries one, otherwise NULL (not known).
CREATE OR REPLACE FUNCTION public._expense_paid_quoted(p_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN x.currency = public._expense_company_currency(x.company_id) THEN s.total
           WHEN s.n > 0 AND s.n = s.quoted_n THEN s.quoted_total
           ELSE NULL
         END
  FROM public.expenses x
  CROSS JOIN LATERAL (
    SELECT count(*) AS n, count(p.quoted_amount) AS quoted_n,
           COALESCE(sum(p.amount), 0) AS total, COALESCE(sum(p.quoted_amount), 0) AS quoted_total
    FROM public.expense_payments p WHERE p.expense_id = x.id
  ) s
  WHERE x.id = p_id;
$$;
REVOKE ALL ON FUNCTION public._expense_paid_quoted(uuid) FROM PUBLIC, anon, authenticated;

-- Same signature: also carries an optional quoted_amount (validated when present).
CREATE OR REPLACE FUNCTION public._expense_payment_clean(p jsonb, p_has_employee boolean, p_currency text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_amount_raw text := regexp_replace(COALESCE(p->>'amount', ''), '[, ]', '', 'g');
  v_amount numeric;
  v_quoted_raw text := regexp_replace(COALESCE(p->>'quoted_amount', ''), '[, ]', '', 'g');
  v_quoted numeric;
  v_paid_raw text := btrim(COALESCE(p->>'paid_on', ''));
  v_paid date;
  v_method text := lower(btrim(COALESCE(p->>'method', '')));
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Enter the payment.' USING ERRCODE = '22023';
  END IF;
  IF v_amount_raw ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_amount := round(v_amount_raw::numeric, 2);
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount >= 100000000 THEN
    RAISE EXCEPTION 'Enter the amount paid in %: a number more than 0.', COALESCE(p_currency, 'the company currency') USING ERRCODE = '22023';
  END IF;
  IF v_quoted_raw <> '' THEN
    IF v_quoted_raw ~ '^[0-9]+(\.[0-9]+)?$' THEN
      v_quoted := round(v_quoted_raw::numeric, 2);
    END IF;
    IF v_quoted IS NULL OR v_quoted <= 0 OR v_quoted >= 100000000 THEN
      RAISE EXCEPTION 'Enter what the payment equals in the item''s currency: a number more than 0, or leave it empty.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_paid_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_paid := v_paid_raw::date;
    EXCEPTION WHEN others THEN
      v_paid := NULL;
    END;
  END IF;
  IF v_paid IS NULL OR v_paid < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'Enter the date it was paid.' USING ERRCODE = '22023';
  END IF;
  -- "Today" anywhere on earth (UTC+14 at most), so a payment made today is never refused.
  IF v_paid > (now() + interval '14 hours')::date THEN
    RAISE EXCEPTION 'The payment date is in the future. Record it once it is paid.' USING ERRCODE = '22023';
  END IF;
  IF v_method NOT IN ('bank', 'card', 'cash', 'reimbursed') THEN
    RAISE EXCEPTION 'Choose how it was paid.' USING ERRCODE = '22023';
  END IF;
  IF v_method = 'reimbursed' AND NOT p_has_employee THEN
    RAISE EXCEPTION 'There is no employee to pay back on a company-wide item.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'amount', v_amount, 'quoted_amount', v_quoted, 'paid_on', v_paid, 'method', v_method,
    'reference', left(btrim(COALESCE(p->>'reference', '')), 80),
    'note', left(btrim(COALESCE(p->>'note', '')), 500));
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Renewal: cycles covered by the money paid, not by the number of rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._expense_renewal(p_id uuid)
RETURNS date
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_billing text;
  v_start date;
  v_amount numeric;
  v_count integer;
  v_first date;
  v_quoted numeric;
  v_cycles integer;
  v_anchor date;
  v_cycle integer;
  v_months integer;
  v_skip integer := 0;
BEGIN
  SELECT x.billing, x.start_date, x.amount INTO v_billing, v_start, v_amount FROM public.expenses x WHERE x.id = p_id;
  IF v_billing IS NULL OR v_billing = 'once' THEN
    RETURN NULL;
  END IF;
  SELECT count(*)::integer, min(p.paid_on) INTO v_count, v_first FROM public.expense_payments p WHERE p.expense_id = p_id;
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;
  -- Whole cycles the money covers (1% tolerance for rounding and small fees); the
  -- first payment always starts a cycle. Unknown in the item's currency: one per row.
  v_quoted := public._expense_paid_quoted(p_id);
  IF v_quoted IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
    v_cycles := v_count;
  ELSE
    v_cycles := GREATEST(1, floor(v_quoted / v_amount + 0.01)::integer);
  END IF;
  v_cycle := CASE v_billing WHEN 'yearly' THEN 12 ELSE 1 END;
  v_anchor := COALESCE(v_start, v_first);
  IF v_first > v_anchor THEN
    -- Whole months from the start to the first paid day (start + n months <= first paid day).
    v_months := (extract(year FROM v_first)::integer - extract(year FROM v_anchor)::integer) * 12
              + (extract(month FROM v_first)::integer - extract(month FROM v_anchor)::integer);
    IF (v_anchor + make_interval(months => v_months))::date > v_first THEN
      v_months := v_months - 1;
    END IF;
    v_skip := GREATEST(v_months, 0) / v_cycle;
  END IF;
  RETURN (v_anchor + make_interval(months => v_cycle * (v_skip + v_cycles)))::date;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1, 2, 4. Paying: refuse a second payment on a paid once item, an overpayment,
-- or a reimbursement to someone who has left, unless p_force.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._expense_pay(p_id uuid, p_pay jsonb, p_notify boolean, p_force boolean)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_x public.expenses;
  v_payment uuid;
  v_status text;
  v_uid uuid := auth.uid();
  v_name text := public._expense_actor_name();
  v_method text := p_pay->>'method';
  v_paid date := (p_pay->>'paid_on')::date;
  v_amount numeric := (p_pay->>'amount')::numeric;
  v_quoted numeric := NULLIF(p_pay->>'quoted_amount', '')::numeric;
  v_home text;
  v_same boolean;
  v_so_far numeric;
  v_this numeric;
  v_emp_name text;
  v_emp_status text;
  v_last date;
BEGIN
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.status NOT IN ('approved', 'paid', 'active') THEN
    RAISE EXCEPTION 'Only approved items can be paid.' USING ERRCODE = '22023';
  END IF;
  IF v_method = 'reimbursed' AND v_x.employee_id IS NULL THEN
    RAISE EXCEPTION 'There is no employee to pay back on a company-wide item.' USING ERRCODE = '22023';
  END IF;

  v_home := public._expense_company_currency(v_x.company_id);
  v_same := (v_x.currency = v_home);
  -- A quoted amount only means something when the currencies differ.
  IF v_same THEN
    v_quoted := NULL;
  END IF;

  IF v_x.employee_id IS NOT NULL THEN
    SELECT e.name, e.status INTO v_emp_name, v_emp_status FROM public.employees e WHERE e.id = v_x.employee_id;
  END IF;

  IF NOT COALESCE(p_force, false) THEN
    -- 4. Paying back someone who has left.
    IF v_method = 'reimbursed' AND v_emp_status IN ('separated', 'terminated') THEN
      RAISE EXCEPTION '% has left the company. Pay them back anyway?', COALESCE(v_emp_name, 'This person')
        USING ERRCODE = 'P0C01', HINT = 'confirm';
    END IF;
    -- 1. A once item that is already paid.
    IF v_x.billing = 'once' AND v_x.status = 'paid' THEN
      SELECT max(p.paid_on) INTO v_last FROM public.expense_payments p WHERE p.expense_id = p_id;
      RAISE EXCEPTION '"%" is already paid (% so far, last on %). Record another payment anyway?',
        v_x.title,
        public._expense_money(COALESCE((SELECT sum(p.amount) FROM public.expense_payments p WHERE p.expense_id = p_id), 0), v_home),
        public._expense_day(v_last)
        USING ERRCODE = 'P0C01', HINT = 'confirm';
    END IF;
    -- 1 + 2. More than the item costs, in the item's currency (when that is known).
    IF v_x.billing = 'once' THEN
      v_so_far := CASE WHEN v_x.payments_count = 0 THEN 0 ELSE public._expense_paid_quoted(p_id) END;
      v_this := CASE WHEN v_same THEN v_amount ELSE v_quoted END;
      IF v_so_far IS NOT NULL AND v_this IS NOT NULL AND v_so_far + v_this > v_x.amount THEN
        RAISE EXCEPTION 'That brings the total paid to %, more than the % quoted. Record it anyway?',
          public._expense_money(v_so_far + v_this, v_x.currency), public._expense_money(v_x.amount, v_x.currency)
          USING ERRCODE = 'P0C01', HINT = 'confirm';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.expense_payments (company_id, expense_id, amount, quoted_amount, quoted_currency, paid_on, method, reference, note, created_by, created_by_name)
  VALUES (v_x.company_id, p_id, v_amount, v_quoted, CASE WHEN v_quoted IS NULL THEN NULL ELSE v_x.currency END, v_paid, v_method,
          COALESCE(p_pay->>'reference', ''), COALESCE(p_pay->>'note', ''), v_uid, v_name)
  RETURNING id INTO v_payment;

  v_status := CASE WHEN v_x.status = 'approved' THEN CASE WHEN v_x.billing = 'once' THEN 'paid' ELSE 'active' END ELSE v_x.status END;
  UPDATE public.expenses
  SET status = v_status,
      payments_count = (SELECT count(*) FROM public.expense_payments p WHERE p.expense_id = p_id),
      last_paid_on = (SELECT max(p.paid_on) FROM public.expense_payments p WHERE p.expense_id = p_id),
      renews_on = public._expense_renewal(p_id),
      finance_by = COALESCE(finance_by, v_uid),
      finance_by_name = COALESCE(finance_by_name, v_name),
      finance_at = COALESCE(finance_at, now()),
      updated_at = now()
  WHERE id = p_id;

  -- The employee hears about the first payment and about any money paid back to
  -- them; renewals are Finance's business.
  IF p_notify AND v_x.employee_id IS NOT NULL AND (v_x.status = 'approved' OR v_method = 'reimbursed') THEN
    PERFORM public.notify_employee(
      v_x.company_id, v_x.employee_id, 'expense',
      CASE WHEN v_method = 'reimbursed' THEN 'Paid back to you: ' || v_x.title
           WHEN v_x.billing <> 'once' THEN 'Your subscription is paid: ' || v_x.title
           ELSE 'Paid: ' || v_x.title END,
      'Recorded by Finance, paid on ' || public._expense_day(v_paid) || '.',
      '/portal/expenses/' || p_id);
  END IF;
  RETURN v_payment;
END;
$$;
REVOKE ALL ON FUNCTION public._expense_pay(uuid, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- The old shape keeps working, without force.
CREATE OR REPLACE FUNCTION public._expense_pay(p_id uuid, p_pay jsonb, p_notify boolean)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN public._expense_pay(p_id, p_pay, p_notify, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_record_payment(p_id uuid, p_payment jsonb, p_receipt jsonb, p_force boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
  v_currency text;
  v_pay jsonb;
  v_receipt jsonb;
  v_payment uuid;
  v_emp text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can record payments.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  v_currency := public._expense_company_currency(v_company);
  v_pay := public._expense_payment_clean(p_payment, v_x.employee_id IS NOT NULL, v_currency);
  v_receipt := public._expense_file_clean(p_receipt, v_company, 'receipt', COALESCE(v_x.employee_id::text, 'company'));
  v_payment := public._expense_pay(p_id, v_pay, true, COALESCE(p_force, false));
  PERFORM public._expense_add_file(v_company, p_id, v_payment, 'receipt', v_receipt, auth.uid(), public._expense_actor_name());
  v_emp := public._expense_employee_name(v_x.employee_id);
  PERFORM public.log_activity(
    'payroll.expense_pay',
    'Recorded ' || public._expense_money((v_pay->>'amount')::numeric, v_currency)
      || CASE WHEN v_x.currency <> v_currency AND NULLIF(v_pay->>'quoted_amount', '') IS NOT NULL
              THEN ' (' || public._expense_money((v_pay->>'quoted_amount')::numeric, v_x.currency) || ')' ELSE '' END
      || ' paid on ' || public._expense_day((v_pay->>'paid_on')::date)
      || ' for "' || v_x.title || '"' || COALESCE(' (' || v_emp || ')', '')
      || CASE WHEN v_x.status = 'active' THEN ', a renewal' ELSE '' END
      || CASE WHEN COALESCE(p_force, false) THEN ', confirmed' ELSE '' END,
    jsonb_build_object('expense_id', p_id, 'payment_id', v_payment, 'method', v_pay->>'method', 'reference', v_pay->>'reference',
                       'forced', COALESCE(p_force, false)),
    v_x.employee_id);
  RETURN v_payment;
END;
$$;
REVOKE ALL ON FUNCTION public.expense_record_payment(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_record_payment(uuid, jsonb, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.expense_record_payment(p_id uuid, p_payment jsonb, p_receipt jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.expense_record_payment(p_id, p_payment, p_receipt, false);
END;
$$;

-- 4. A Finance entry for someone who has left needs confirming.
CREATE OR REPLACE FUNCTION public.expense_finance_add(
  p_employee uuid,
  p_input jsonb,
  p_tell boolean,
  p_payment jsonb,
  p_quote jsonb,
  p_receipt jsonb,
  p_force boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_currency text;
  v_v jsonb;
  v_pay jsonb;
  v_quote jsonb;
  v_receipt jsonb;
  v_owner text;
  v_id uuid;
  v_payment uuid;
  v_uid uuid := auth.uid();
  v_name text := public._expense_actor_name();
  v_emp text;
  v_emp_status text;
  v_short text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can add expenses.' USING ERRCODE = '42501';
  END IF;
  IF p_employee IS NOT NULL THEN
    SELECT e.name, e.status INTO v_emp, v_emp_status FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That employee no longer exists.' USING ERRCODE = 'P0001';
    END IF;
    IF v_emp_status IN ('separated', 'terminated') AND NOT COALESCE(p_force, false) THEN
      RAISE EXCEPTION '% has left the company. Add this expense for them anyway?', v_emp USING ERRCODE = 'P0C01', HINT = 'confirm';
    END IF;
  END IF;
  v_currency := public._expense_company_currency(v_company);
  v_v := public._expense_clean(p_input, false);
  v_owner := COALESCE(p_employee::text, 'company');
  v_quote := public._expense_file_clean(p_quote, v_company, 'quote', v_owner);
  IF p_payment IS NOT NULL THEN
    v_pay := public._expense_payment_clean(p_payment, p_employee IS NOT NULL, v_currency);
    v_receipt := public._expense_file_clean(p_receipt, v_company, 'receipt', v_owner);
  END IF;

  INSERT INTO public.expenses (
    company_id, employee_id, category, title, provider, link, amount, currency, billing, purpose, benefit,
    start_date, end_date, reimburse, source, status, finance_by, finance_by_name, finance_at, requested_by, requested_by_name)
  VALUES (
    v_company, p_employee, v_v->>'category', v_v->>'title', v_v->>'provider', v_v->>'link', (v_v->>'amount')::numeric,
    v_v->>'currency', v_v->>'billing', v_v->>'purpose', v_v->>'benefit',
    (v_v->>'start_date')::date, (v_v->>'end_date')::date,
    p_employee IS NOT NULL AND (v_v->>'reimburse')::boolean,
    'finance', 'approved', v_uid, v_name, now(), v_uid, v_name)
  RETURNING id INTO v_id;

  PERFORM public._expense_add_file(v_company, v_id, NULL, 'quote', v_quote, v_uid, v_name);

  v_short := public._expense_category_label(v_v->>'category', true);
  IF p_employee IS NOT NULL AND COALESCE(p_tell, true) THEN
    PERFORM public.notify_employee(v_company, p_employee, 'expense',
      CASE WHEN v_v->>'category' = 'course' THEN 'A course has been arranged for you' ELSE 'Finance added ' || v_short || ' for you' END,
      v_v->>'title', '/portal/expenses/' || v_id);
  END IF;

  IF v_pay IS NOT NULL THEN
    -- A fresh item cannot be overpaid by mistake in the same breath; the confirmed
    -- "has left" answer covers the payment too.
    v_payment := public._expense_pay(v_id, v_pay, p_employee IS NOT NULL AND COALESCE(p_tell, true), COALESCE(p_force, false));
    PERFORM public._expense_add_file(v_company, v_id, v_payment, 'receipt', v_receipt, v_uid, v_name);
  END IF;

  PERFORM public.log_activity(
    'payroll.expense_add',
    'Added ' || v_short || ' "' || (v_v->>'title') || '" (' || public._expense_money((v_v->>'amount')::numeric, v_v->>'currency') || ') for '
      || COALESCE(v_emp, 'the company')
      || CASE WHEN v_pay IS NOT NULL THEN ' and recorded ' || public._expense_money((v_pay->>'amount')::numeric, v_currency)
              || ' paid on ' || public._expense_day((v_pay->>'paid_on')::date) ELSE '' END
      || CASE WHEN COALESCE(p_force, false) AND v_emp_status IN ('separated', 'terminated') THEN ' (they have left; confirmed)' ELSE '' END,
    jsonb_build_object('expense_id', v_id, 'forced', COALESCE(p_force, false)), p_employee);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.expense_finance_add(uuid, jsonb, boolean, jsonb, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_finance_add(uuid, jsonb, boolean, jsonb, jsonb, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.expense_finance_add(
  p_employee uuid,
  p_input jsonb,
  p_tell boolean DEFAULT true,
  p_payment jsonb DEFAULT NULL,
  p_quote jsonb DEFAULT NULL,
  p_receipt jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.expense_finance_add(p_employee, p_input, p_tell, p_payment, p_quote, p_receipt, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Portal JSON: the total in the item's currency when it is known
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._expense_portal_json(p_x public.expenses)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p_x.id, 'category', p_x.category, 'title', p_x.title, 'provider', p_x.provider, 'link', p_x.link,
    'amount', p_x.amount, 'currency', p_x.currency, 'billing', p_x.billing,
    'purpose', p_x.purpose, 'benefit', p_x.benefit, 'start_date', p_x.start_date, 'end_date', p_x.end_date,
    'reimburse', p_x.reimburse, 'source', p_x.source, 'status', p_x.status,
    'hr_by_name', p_x.hr_by_name, 'hr_at', p_x.hr_at, 'hr_note', p_x.hr_note,
    'finance_by_name', p_x.finance_by_name, 'finance_at', p_x.finance_at, 'finance_note', p_x.finance_note,
    'renews_on', p_x.renews_on, 'ended_on', p_x.ended_on, 'payments_count', p_x.payments_count, 'last_paid_on', p_x.last_paid_on,
    'completed_at', p_x.completed_at, 'outcome', p_x.outcome, 'requested_by_name', p_x.requested_by_name,
    'created_at', p_x.created_at, 'updated_at', p_x.updated_at,
    -- In the company currency (what left the bank), as before.
    'paid_total', COALESCE((SELECT sum(p.amount) FROM public.expense_payments p WHERE p.expense_id = p_x.id), 0),
    -- In the item's currency when every payment says what it equals there; null otherwise.
    'paid_quoted_total', CASE WHEN p_x.currency <> public._expense_company_currency(p_x.company_id) AND p_x.payments_count > 0
                              THEN public._expense_paid_quoted(p_x.id) END);
$$;

CREATE OR REPLACE FUNCTION public.portal_expense(p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_x public.expenses;
BEGIN
  SELECT * INTO v_x FROM public.expenses x WHERE x.id = p_id AND x.company_id = v_emp.company_id AND x.employee_id = v_emp.id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'That item is not yours or no longer exists.');
  END IF;
  RETURN jsonb_build_object(
    'expense', public._expense_portal_json(v_x),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'quoted_amount', p.quoted_amount, 'quoted_currency', p.quoted_currency,
                                          'paid_on', p.paid_on, 'method', p.method,
                                          'reference', p.reference, 'note', p.note, 'created_at', p.created_at)
                       ORDER BY p.paid_on DESC, p.created_at DESC)
      FROM public.expense_payments p WHERE p.expense_id = v_x.id), '[]'::jsonb),
    'files', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'payment_id', f.payment_id, 'kind', f.kind, 'storage_path', f.storage_path,
                                          'file_name', f.file_name, 'mime_type', f.mime_type, 'file_size', f.file_size,
                                          'created_at', f.created_at)
                       ORDER BY f.created_at)
      FROM public.expense_files f WHERE f.expense_id = v_x.id), '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Hiring a returning person links the application instead of duplicating them
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_hire_application(
  p_id uuid, p_rank text, p_joining_date date, p_department uuid, p_cnic text, p_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._careers_require_hr();
  v_today date := public.company_today(v_company);
  v_app record;
  v_rank text := left(btrim(COALESCE(p_rank, '')), 80);
  v_cnic text := regexp_replace(COALESCE(p_cnic, ''), '\D', '', 'g');
  v_cnic_fmt text;
  v_employee uuid;
  v_match public.employees;
  v_how text;
BEGIN
  SELECT a.*, j.title AS job_title, j.department_id AS job_department, j.openings
  INTO v_app
  FROM public.job_applications a
  JOIN public.job_postings j ON j.id = a.job_id
  WHERE a.id = p_id AND a.company_id = v_company
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That application no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status = 'hired' OR v_app.employee_id IS NOT NULL THEN
    RAISE EXCEPTION '% is already hired.', v_app.name USING ERRCODE = '22023';
  END IF;
  IF v_rank = '' THEN
    v_rank := left(v_app.job_title, 80);
  END IF;
  IF p_joining_date IS NULL THEN
    RAISE EXCEPTION 'Pick a joining date.' USING ERRCODE = '22023';
  END IF;
  IF p_joining_date < v_today - 365 OR p_joining_date > v_today + 365 THEN
    RAISE EXCEPTION 'The joining date must be within a year of today.' USING ERRCODE = '22023';
  END IF;
  IF v_cnic <> '' AND length(v_cnic) <> 13 THEN
    RAISE EXCEPTION 'A CNIC has 13 digits.' USING ERRCODE = '22023';
  END IF;
  v_cnic_fmt := CASE WHEN v_cnic = '' THEN NULL ELSE substr(v_cnic, 1, 5) || '-' || substr(v_cnic, 6, 7) || '-' || substr(v_cnic, 13, 1) END;
  IF p_department IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = p_department AND d.company_id = v_company) THEN
    RAISE EXCEPTION 'That department no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF p_employee_id IS NULL THEN
    -- Someone already on the books with this email or CNIC: let HR link them instead.
    SELECT e.* INTO v_match FROM public.employees e
    WHERE e.company_id = v_company
      AND (lower(btrim(e.email)) = lower(btrim(v_app.email))
           OR (v_cnic <> '' AND regexp_replace(COALESCE(e.cnic, ''), '\D', '', 'g') = v_cnic))
    ORDER BY (lower(btrim(e.email)) = lower(btrim(v_app.email))) DESC, e.created_at
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'existing_employee'
        USING ERRCODE = 'P0E01',
              DETAIL = jsonb_build_object('employee_id', v_match.id, 'name', v_match.name, 'status', v_match.status,
                                          'email', v_match.email, 'rank', v_match.rank, 'joining_date', v_match.joining_date,
                                          'separation_date', v_match.separation_date,
                                          'matched_on', CASE WHEN lower(btrim(v_match.email)) = lower(btrim(v_app.email)) THEN 'email' ELSE 'cnic' END)::text,
              HINT = v_match.name || ' is already on the books' || CASE WHEN v_match.status = 'active' THEN '' ELSE ' (' || v_match.status || ')' END || '.';
    END IF;

    -- p_department is the dialog's choice (pre-filled with the job's department); NULL means none.
    INSERT INTO public.employees (company_id, name, email, phone, rank, joining_date, department_id, status, cnic, notes)
    VALUES (v_company, v_app.name, v_app.email, NULLIF(v_app.phone, ''), v_rank, p_joining_date,
            p_department, 'active', v_cnic_fmt,
            'Hired through careers for ' || v_app.job_title || ' on ' || to_char(v_today, 'DD Mon YYYY') || '.')
    RETURNING id INTO v_employee;
    v_how := 'Employee record created as ' || v_rank || ', joining ' || to_char(p_joining_date, 'DD Mon YYYY') || '.';
  ELSE
    SELECT e.* INTO v_match FROM public.employees e WHERE e.id = p_employee_id AND e.company_id = v_company FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That employee no longer exists.' USING ERRCODE = 'P0002';
    END IF;
    IF v_cnic <> '' AND EXISTS (
      SELECT 1 FROM public.employees e WHERE e.company_id = v_company AND e.id <> v_match.id
        AND regexp_replace(COALESCE(e.cnic, ''), '\D', '', 'g') = v_cnic
    ) THEN
      RAISE EXCEPTION 'Another employee already has this CNIC.' USING ERRCODE = '23505';
    END IF;
    v_employee := v_match.id;
    -- The new role and details first, so the rejoin pay event names the new designation.
    UPDATE public.employees
    SET rank = v_rank,
        department_id = COALESCE(p_department, department_id),
        cnic = COALESCE(cnic, v_cnic_fmt),
        email = COALESCE(NULLIF(btrim(email), ''), v_app.email),
        phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(v_app.phone, '')),
        notes = CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE notes || E'\n' END
              || 'Hired again through careers for ' || v_app.job_title || ' on ' || to_char(v_today, 'DD Mon YYYY') || '.'
    WHERE id = v_match.id;
    IF v_match.status <> 'active' THEN
      -- Reactivates them from the joining date; the original joining date stays (pay history).
      PERFORM public.people_rejoin_employee(v_match.id, p_joining_date);
      v_how := 'Returning employee: ' || v_match.name || ' reactivated as ' || v_rank || ' from ' || to_char(p_joining_date, 'DD Mon YYYY') || '.';
    ELSE
      v_how := 'Linked to the existing employee record of ' || v_match.name || ', now ' || v_rank || '.';
    END IF;
  END IF;

  UPDATE public.job_applications
  SET status = 'hired', status_changed_at = now(), employee_id = v_employee
  WHERE id = p_id;

  INSERT INTO public.job_application_notes (company_id, application_id, author_id, author_name, kind, body)
  VALUES (v_company, p_id, auth.uid(), public._careers_actor_name(), 'hire',
          public._careers_status_label(v_app.status) || ' → Hired' || E'\n' || v_how);

  PERFORM public.log_activity('careers.hired',
    CASE WHEN p_employee_id IS NULL THEN 'Hired ' ELSE 'Hired (returning) ' END || v_app.name || ' as ' || v_rank,
    json_build_object('application_id', p_id, 'job_id', v_app.job_id, 'joining_date', p_joining_date, 'returning', p_employee_id IS NOT NULL)::jsonb, v_employee);

  PERFORM public.notify_roles(v_company, ARRAY['finance'], 'onboarding',
    CASE WHEN p_employee_id IS NULL THEN 'New hire: ' ELSE 'Returning: ' END || v_app.name,
    v_rank || ' joins on ' || to_char(p_joining_date, 'DD Mon YYYY') || '. ' ||
    CASE WHEN p_employee_id IS NULL THEN 'Set up their salary before the next payroll.' ELSE 'Check their salary before the next payroll.' END,
    '/employees/' || v_employee::text);

  RETURN v_employee;
END;
$$;
REVOKE ALL ON FUNCTION public.careers_hire_application(uuid, text, date, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_hire_application(uuid, text, date, uuid, text, uuid) TO authenticated;

-- The old shape: same checks, never links (raises existing_employee on a match).
CREATE OR REPLACE FUNCTION public.careers_hire_application(p_id uuid, p_rank text, p_joining_date date, p_department uuid DEFAULT NULL::uuid, p_cnic text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.careers_hire_application(p_id, p_rank, p_joining_date, p_department, p_cnic, NULL::uuid);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Slug: the unique index has the last word, with the same friendly message
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_set_company_slug(p_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_slug text := public.careers_slugify(p_slug);
  v_old text;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_owner() THEN
    RAISE EXCEPTION 'Only the owner can change the careers address.' USING ERRCODE = '42501';
  END IF;
  IF length(v_slug) < 2 THEN
    RAISE EXCEPTION 'Use at least 2 letters or digits.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies c WHERE lower(c.slug) = v_slug AND c.id <> v_company) THEN
    RAISE EXCEPTION 'That address is taken. Try another one.' USING ERRCODE = '23505';
  END IF;
  SELECT slug INTO v_old FROM public.companies WHERE id = v_company;
  IF v_old IS DISTINCT FROM v_slug THEN
    BEGIN
      UPDATE public.companies SET slug = v_slug WHERE id = v_company;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'That address is taken. Try another one.' USING ERRCODE = '23505';
    END;
    PERFORM public.log_activity('careers.slug_changed', 'Changed the careers page address to /careers/' || v_slug,
      json_build_object('from', v_old, 'to', v_slug)::jsonb, NULL);
  END IF;
  RETURN v_slug;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. One complaint counter for named and anonymous complaints alike
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_private.complaint_rate (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day date NOT NULL,
  n integer NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (employee_id, day)
);
COMMENT ON TABLE engagement_private.complaint_rate IS 'How many complaints each employee raised per company day (named and anonymous together). Never joined to complaints.';
ALTER TABLE engagement_private.complaint_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engagement_private.complaint_rate FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS complaint_rate_no_client_access ON engagement_private.complaint_rate;
CREATE POLICY complaint_rate_no_client_access ON engagement_private.complaint_rate FOR SELECT TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.portal_submit_complaint(p_token text, p_subject text, p_description text, p_anonymous boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_description text := btrim(COALESCE(p_description, ''));
  v_anonymous boolean := COALESCE(p_anonymous, false);
  v_today date := public.company_today(v_emp.company_id);
  v_day timestamptz;
  v_n integer;
  v_id uuid;
BEGIN
  IF char_length(v_subject) < 3 OR char_length(v_subject) > 120 THEN
    RETURN json_build_object('error', 'The subject must be 3 to 120 characters.');
  END IF;
  IF char_length(v_description) < 10 OR char_length(v_description) > 3000 THEN
    RETURN json_build_object('error', 'Describe what happened in 10 to 3000 characters.');
  END IF;

  -- Five a day, named or anonymous. The counter holds only a number per person and
  -- day; nothing in it says which complaints (or whether any was anonymous).
  INSERT INTO engagement_private.complaint_rate (employee_id, day, n)
  VALUES (v_emp.id, v_today, 1)
  ON CONFLICT (employee_id, day) DO UPDATE SET n = engagement_private.complaint_rate.n + 1
  RETURNING n INTO v_n;
  IF v_n > 5 THEN
    RETURN json_build_object('error', 'You have raised several complaints today. HR will look at them first.');
  END IF;

  IF v_anonymous THEN
    -- Nothing in the row points back at the person: no employee, and only the company's date is
    -- kept (in created_at and updated_at alike), so it cannot be matched to a sign-in time.
    -- No timeline entry and no notification either.
    v_day := v_today::timestamp AT TIME ZONE 'UTC';
    INSERT INTO public.complaints (company_id, employee_id, subject, description, is_anonymous, status, created_at, updated_at)
    VALUES (v_emp.company_id, NULL, v_subject, v_description, true, 'pending', v_day, v_day)
    RETURNING id INTO v_id;
    RETURN json_build_object('ok', true, 'anonymous', true);
  END IF;

  INSERT INTO public.complaints (company_id, employee_id, subject, description, is_anonymous, status)
  VALUES (v_emp.company_id, v_emp.id, v_subject, v_description, false, 'pending')
  RETURNING id INTO v_id;

  PERFORM public.notify_roles(v_emp.company_id, ARRAY['hr'], 'complaint', format('New complaint from %s', v_emp.name), v_subject, '/complaints?id=' || v_id);
  PERFORM public._engagement_portal_log(v_emp, 'complaint.submitted', format('%s raised the complaint "%s"', v_emp.name, v_subject),
    jsonb_build_object('complaint_id', v_id));
  RETURN json_build_object('ok', true, 'anonymous', false, 'id', v_id);
END;
$$;
