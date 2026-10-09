-- ---------------------------------------------------------------------------
-- Expenses: the "more than quoted" confirmation never showed for a further
-- instalment. A once item is 'paid' from its first payment, so the "already
-- paid, record another payment anyway?" check fired before the over-quote
-- check could, and Finance was never told the total would exceed the quote.
-- The over-quote check now runs first; everything else is unchanged.
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
    -- 1 + 2. More than the item costs, in the item's currency (when that is known).
    -- Checked before "already paid": a further instalment that overshoots the quote
    -- should say so, not just that something was paid before.
    IF v_x.billing = 'once' THEN
      v_so_far := CASE WHEN v_x.payments_count = 0 THEN 0 ELSE public._expense_paid_quoted(p_id) END;
      v_this := CASE WHEN v_same THEN v_amount ELSE v_quoted END;
      IF v_so_far IS NOT NULL AND v_this IS NOT NULL AND v_so_far + v_this > v_x.amount THEN
        RAISE EXCEPTION 'That brings the total paid to %, more than the % quoted. Record it anyway?',
          public._expense_money(v_so_far + v_this, v_x.currency), public._expense_money(v_x.amount, v_x.currency)
          USING ERRCODE = 'P0C01', HINT = 'confirm';
      END IF;
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
