-- Courses & expenses 2/3: internal helpers and the staff (HR / Finance) RPCs.
-- Every change is guarded by the status it expects (row locked FOR UPDATE), so
-- two people clicking at once cannot both win. HR steps log as expense.*;
-- Finance steps log as payroll.expense_* (hidden from HR by activity_logs RLS).

-- ---------------------------------------------------------------------------
-- Internal helpers (no EXECUTE for clients; called from the definer RPCs)
-- ---------------------------------------------------------------------------

-- "PKR 15,000" / "USD 99.50".
CREATE OR REPLACE FUNCTION public._expense_money(p_amount numeric, p_currency text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_currency, '') || ' ' ||
         CASE WHEN p_amount = trunc(p_amount) THEN to_char(p_amount, 'FM999,999,999,990')
              ELSE to_char(p_amount, 'FM999,999,999,990.00') END;
$$;

CREATE OR REPLACE FUNCTION public._expense_day(p_date date)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT to_char(p_date, 'FMDD Mon YYYY');
$$;

CREATE OR REPLACE FUNCTION public._expense_category_label(p_category text, p_short boolean DEFAULT false)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_short THEN
           CASE p_category WHEN 'course' THEN 'course' WHEN 'subscription' THEN 'a subscription'
                           WHEN 'equipment' THEN 'equipment' WHEN 'travel' THEN 'travel' ELSE 'an expense' END
         ELSE
           CASE p_category WHEN 'course' THEN 'Course or training' WHEN 'subscription' THEN 'Subscription or software'
                           WHEN 'equipment' THEN 'Equipment or books' WHEN 'travel' THEN 'Travel or event' ELSE 'Other' END
         END;
$$;

-- Display name of the signed-in staff member.
CREATE OR REPLACE FUNCTION public._expense_actor_name()
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') FROM public.profiles p WHERE p.id = auth.uid()),
    'A staff member');
$$;

-- Checks and normalises what someone typed. Employees must explain the why and
-- the benefit (that is what HR decides on); Finance recording a known cost need not.
CREATE OR REPLACE FUNCTION public._expense_clean(p jsonb, p_explain boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_category text := lower(btrim(COALESCE(p->>'category', '')));
  v_title text := left(regexp_replace(btrim(COALESCE(p->>'title', '')), '\s+', ' ', 'g'), 120);
  v_provider text := left(regexp_replace(btrim(COALESCE(p->>'provider', '')), '\s+', ' ', 'g'), 80);
  v_link text := left(btrim(COALESCE(p->>'link', '')), 300);
  v_amount_raw text := regexp_replace(COALESCE(p->>'amount', ''), '[, ]', '', 'g');
  v_amount numeric;
  v_currency text := upper(btrim(COALESCE(p->>'currency', '')));
  v_billing text;
  v_purpose text := left(btrim(COALESCE(p->>'purpose', '')), 1500);
  v_benefit text := left(btrim(COALESCE(p->>'benefit', '')), 1500);
  v_start_raw text := btrim(COALESCE(p->>'start_date', ''));
  v_end_raw text := btrim(COALESCE(p->>'end_date', ''));
  v_start date;
  v_end date;
  v_reimburse boolean := lower(COALESCE(p->>'reimburse', 'false')) IN ('true', 't', '1', 'on', 'yes');
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Fill in the form.' USING ERRCODE = '22023';
  END IF;
  IF v_category NOT IN ('course', 'subscription', 'equipment', 'travel', 'other') THEN
    RAISE EXCEPTION 'Choose what it is for.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_title) < 3 THEN
    RAISE EXCEPTION 'Give it a name, e.g. the course or the tool.' USING ERRCODE = '22023';
  END IF;
  IF v_amount_raw ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_amount := v_amount_raw::numeric;
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount >= 100000000 THEN
    RAISE EXCEPTION 'Enter the cost: a number more than 0.' USING ERRCODE = '22023';
  END IF;
  v_amount := round(v_amount, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the cost: a number more than 0.' USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Choose a currency.' USING ERRCODE = '22023';
  END IF;
  v_billing := CASE WHEN v_category = 'subscription' THEN lower(btrim(COALESCE(p->>'billing', ''))) ELSE 'once' END;
  IF v_billing NOT IN ('once', 'monthly', 'yearly') THEN
    RAISE EXCEPTION 'Choose how often it is paid.' USING ERRCODE = '22023';
  END IF;
  IF v_category = 'subscription' AND v_billing = 'once' THEN
    RAISE EXCEPTION 'A subscription is paid every month or every year. For a one-off purchase pick another kind.' USING ERRCODE = '22023';
  END IF;
  IF v_link <> '' AND v_link !~* '^https?://[^[:space:]]+\.[^[:space:]]+' THEN
    RAISE EXCEPTION 'The link must start with http:// or https://.' USING ERRCODE = '22023';
  END IF;
  IF v_start_raw <> '' THEN
    IF v_start_raw !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'The start date is not a date.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_start := v_start_raw::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'The start date is not a date.' USING ERRCODE = '22023';
    END;
  END IF;
  IF v_end_raw <> '' THEN
    IF v_end_raw !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'The end date is not a date.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_end := v_end_raw::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'The end date is not a date.' USING ERRCODE = '22023';
    END;
  END IF;
  IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end < v_start THEN
    RAISE EXCEPTION 'The end date is before the start date.' USING ERRCODE = '22023';
  END IF;
  IF p_explain THEN
    IF char_length(v_purpose) < 20 THEN
      RAISE EXCEPTION 'Say what you will do with it, in a sentence or two.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_benefit) < 20 THEN
      RAISE EXCEPTION 'Say how it helps your work or the company: what you can improve or do better after it.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'category', v_category, 'title', v_title, 'provider', v_provider, 'link', v_link,
    'amount', v_amount, 'currency', v_currency, 'billing', v_billing,
    'purpose', v_purpose, 'benefit', v_benefit,
    'start_date', v_start, 'end_date', v_end, 'reimburse', v_reimburse);
END;
$$;

-- Checks a payment before anything is saved.
CREATE OR REPLACE FUNCTION public._expense_payment_clean(p jsonb, p_has_employee boolean, p_currency text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_amount_raw text := regexp_replace(COALESCE(p->>'amount', ''), '[, ]', '', 'g');
  v_amount numeric;
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
    'amount', v_amount, 'paid_on', v_paid, 'method', v_method,
    'reference', left(btrim(COALESCE(p->>'reference', '')), 80),
    'note', left(btrim(COALESCE(p->>'note', '')), 500));
END;
$$;

-- Validates an uploaded file's metadata: it must sit in this company's folder for
-- this kind and owner (<company>/<kind>/<employee id | company>/<file>) and exist.
CREATE OR REPLACE FUNCTION public._expense_file_clean(p_file jsonb, p_company uuid, p_kind text, p_owner text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_path text;
  v_name text;
  v_mime text;
  v_size bigint := 0;
BEGIN
  IF p_file IS NULL OR jsonb_typeof(p_file) <> 'object' THEN
    RETURN NULL;
  END IF;
  v_path := btrim(COALESCE(p_file->>'path', ''));
  IF v_path = '' THEN
    RETURN NULL;
  END IF;
  IF v_path !~ '^[0-9a-f-]{36}/(quote|receipt|certificate)/[0-9a-z-]+/[A-Za-z0-9._-]+$'
     OR position('..' IN v_path) > 0
     OR split_part(v_path, '/', 1) <> p_company::text
     OR split_part(v_path, '/', 2) <> p_kind
     OR split_part(v_path, '/', 3) <> p_owner THEN
    RAISE EXCEPTION 'That file is not in the right place. Upload it again.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_file->>'file_size', '') ~ '^[0-9]{1,12}$' THEN
    v_size := (p_file->>'file_size')::bigint;
  END IF;
  IF v_size > 8388608 THEN
    RAISE EXCEPTION 'Files can be 8 MB at most.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'expense-files' AND o.name = v_path) THEN
    RAISE EXCEPTION 'The file did not finish uploading. Try again.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.expense_files f WHERE f.storage_path = v_path) THEN
    RAISE EXCEPTION 'That file is already attached.' USING ERRCODE = '22023';
  END IF;
  v_name := left(btrim(regexp_replace(COALESCE(p_file->>'file_name', ''), '[[:cntrl:]/\\]', '', 'g')), 200);
  IF v_name = '' THEN
    v_name := split_part(v_path, '/', 4);
  END IF;
  v_mime := left(lower(btrim(COALESCE(p_file->>'mime_type', ''))), 120);
  RETURN jsonb_build_object('path', v_path, 'file_name', v_name, 'mime_type', v_mime, 'file_size', v_size);
END;
$$;

CREATE OR REPLACE FUNCTION public._expense_add_file(
  p_company uuid, p_expense uuid, p_payment uuid, p_kind text, p_file jsonb, p_by uuid, p_by_name text
)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.expense_files (company_id, expense_id, payment_id, kind, storage_path, file_name, mime_type, file_size, uploaded_by, uploaded_by_name)
  SELECT p_company, p_expense, p_payment, p_kind, p_file->>'path', p_file->>'file_name', COALESCE(p_file->>'mime_type', ''),
         COALESCE((p_file->>'file_size')::bigint, 0), p_by, p_by_name
  WHERE p_file IS NOT NULL;
$$;

-- A subscription's next renewal: the start date (or the first payment's date)
-- moved on one cycle per payment. Counted from the start every time, so one that
-- began on the 31st renews on the last day of short months and on the 31st again
-- after them, never drifting (Postgres clamps date + n months to the month end).
CREATE OR REPLACE FUNCTION public._expense_renewal(p_id uuid)
RETURNS date
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_billing text;
  v_start date;
  v_count integer;
  v_first date;
BEGIN
  SELECT x.billing, x.start_date INTO v_billing, v_start FROM public.expenses x WHERE x.id = p_id;
  IF v_billing IS NULL OR v_billing = 'once' THEN
    RETURN NULL;
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.expense_payments p WHERE p.expense_id = p_id;
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;
  SELECT p.paid_on INTO v_first FROM public.expense_payments p WHERE p.expense_id = p_id ORDER BY p.created_at, p.id LIMIT 1;
  RETURN (COALESCE(v_start, v_first) + make_interval(months => (CASE v_billing WHEN 'yearly' THEN 12 ELSE 1 END) * v_count))::date;
END;
$$;

-- Records money paid (already checked). The first payment makes a one-time item
-- paid and a subscription active; each later one on a subscription is a renewal.
CREATE OR REPLACE FUNCTION public._expense_pay(p_id uuid, p_pay jsonb, p_notify boolean)
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

  INSERT INTO public.expense_payments (company_id, expense_id, amount, paid_on, method, reference, note, created_by, created_by_name)
  VALUES (v_x.company_id, p_id, (p_pay->>'amount')::numeric, v_paid, v_method,
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

CREATE OR REPLACE FUNCTION public._expense_employee_name(p_employee uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT e.name FROM public.employees e WHERE e.id = p_employee;
$$;

REVOKE ALL ON FUNCTION public._expense_money(numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_day(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_category_label(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_actor_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_clean(jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_payment_clean(jsonb, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_file_clean(jsonb, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_add_file(uuid, uuid, uuid, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_renewal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_pay(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expense_employee_name(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- HR (owner or hr)
-- ---------------------------------------------------------------------------

-- Approve (note optional) or reject (reason needed; the employee reads it).
-- Nobody decides on their own request.
CREATE OR REPLACE FUNCTION public.expense_hr_decide(p_id uuid, p_decision text, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
  v_note text := left(btrim(COALESCE(p_note, '')), 500);
  v_emp text;
  v_approve boolean := p_decision = 'approve';
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can decide on requests.' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Choose to approve or not.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company AND source = 'request' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees e WHERE e.id = v_x.employee_id AND e.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This is your own request: another HR administrator has to decide on it.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_approve AND char_length(v_note) < 5 THEN
    RAISE EXCEPTION 'Say why it is not approved; the employee is told.' USING ERRCODE = '22023';
  END IF;
  IF v_x.status <> 'pending' THEN
    RAISE EXCEPTION 'It has already been decided.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.expenses
  SET status = CASE WHEN v_approve THEN 'approved' ELSE 'rejected' END,
      hr_by = auth.uid(), hr_by_name = public._expense_actor_name(), hr_at = now(), hr_note = v_note, updated_at = now()
  WHERE id = p_id;

  v_emp := public._expense_employee_name(v_x.employee_id);
  IF v_approve THEN
    PERFORM public.notify_employee(v_company, v_x.employee_id, 'expense', 'HR approved your request: ' || v_x.title,
      'It is with Finance now for payment.', '/portal/expenses/' || p_id);
    PERFORM public.notify_roles(v_company, ARRAY['finance'], 'expense', 'To pay: ' || v_x.title,
      COALESCE(v_emp, 'An employee') || ', approved by HR.', '/expenses/' || p_id);
  ELSE
    PERFORM public.notify_employee(v_company, v_x.employee_id, 'expense', 'Your request was not approved: ' || v_x.title,
      v_note, '/portal/expenses/' || p_id);
  END IF;
  PERFORM public.log_activity(
    'expense.' || p_decision,
    CASE WHEN v_approve THEN 'Approved ' ELSE 'Did not approve ' END || COALESCE(v_emp, 'an employee') || '''s request: ' || v_x.title,
    jsonb_build_object('expense_id', p_id, 'note', v_note), v_x.employee_id);
END;
$$;

-- HR takes an approval back while Finance has not paid anything yet.
CREATE OR REPLACE FUNCTION public.expense_hr_undo(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can take an approval back.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company AND source = 'request' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.payments_count > 0 THEN
    RAISE EXCEPTION 'Finance has already paid towards it, so the approval stays. Talk to Finance.' USING ERRCODE = '22023';
  END IF;
  IF v_x.status <> 'approved' THEN
    RAISE EXCEPTION 'It is no longer waiting for Finance.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.expenses
  SET status = 'pending', hr_by = NULL, hr_by_name = NULL, hr_at = NULL, hr_note = '', updated_at = now()
  WHERE id = p_id;
  PERFORM public.log_activity('expense.undo', 'Took back the approval of: ' || v_x.title,
    jsonb_build_object('expense_id', p_id), v_x.employee_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Finance (owner or finance)
-- ---------------------------------------------------------------------------

-- Finance records a cost itself: for one employee (told unless p_tell is false)
-- or for the whole company (p_employee NULL). It starts under "To pay"; with
-- p_payment it is paid at once. Everything is checked before anything is saved.
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
  v_short text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can add expenses.' USING ERRCODE = '42501';
  END IF;
  IF p_employee IS NOT NULL THEN
    SELECT e.name INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That employee no longer exists.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT upper(COALESCE(NULLIF(btrim(c.currency), ''), 'USD')) INTO v_currency FROM public.companies c WHERE c.id = v_company;
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
    v_payment := public._expense_pay(v_id, v_pay, p_employee IS NOT NULL AND COALESCE(p_tell, true));
    PERFORM public._expense_add_file(v_company, v_id, v_payment, 'receipt', v_receipt, v_uid, v_name);
  END IF;

  PERFORM public.log_activity(
    'payroll.expense_add',
    'Added ' || v_short || ' "' || (v_v->>'title') || '" (' || public._expense_money((v_v->>'amount')::numeric, v_v->>'currency') || ') for '
      || COALESCE(v_emp, 'the company')
      || CASE WHEN v_pay IS NOT NULL THEN ' and recorded ' || public._expense_money((v_pay->>'amount')::numeric, v_currency)
              || ' paid on ' || public._expense_day((v_pay->>'paid_on')::date) ELSE '' END,
    jsonb_build_object('expense_id', v_id), p_employee);
  RETURN v_id;
END;
$$;

-- Money paid (first time, another instalment, or a subscription renewal), in the company currency.
CREATE OR REPLACE FUNCTION public.expense_record_payment(p_id uuid, p_payment jsonb, p_receipt jsonb DEFAULT NULL)
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
  SELECT upper(COALESCE(NULLIF(btrim(c.currency), ''), 'USD')) INTO v_currency FROM public.companies c WHERE c.id = v_company;
  v_pay := public._expense_payment_clean(p_payment, v_x.employee_id IS NOT NULL, v_currency);
  v_receipt := public._expense_file_clean(p_receipt, v_company, 'receipt', COALESCE(v_x.employee_id::text, 'company'));
  v_payment := public._expense_pay(p_id, v_pay, true);
  PERFORM public._expense_add_file(v_company, p_id, v_payment, 'receipt', v_receipt, auth.uid(), public._expense_actor_name());
  v_emp := public._expense_employee_name(v_x.employee_id);
  PERFORM public.log_activity(
    'payroll.expense_pay',
    'Recorded ' || public._expense_money((v_pay->>'amount')::numeric, v_currency) || ' paid on ' || public._expense_day((v_pay->>'paid_on')::date)
      || ' for "' || v_x.title || '"' || COALESCE(' (' || v_emp || ')', '')
      || CASE WHEN v_x.status = 'active' THEN ', a renewal' ELSE '' END,
    jsonb_build_object('expense_id', p_id, 'payment_id', v_payment, 'method', v_pay->>'method', 'reference', v_pay->>'reference'),
    v_x.employee_id);
  RETURN v_payment;
END;
$$;

-- Takes back the newest payment (a typing mistake): the status and the renewal
-- date step back with it. Returns the storage paths of its receipts so the
-- client removes the objects.
CREATE OR REPLACE FUNCTION public.expense_undo_payment(p_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
  v_last public.expense_payments;
  v_paths text[];
  v_left integer;
  v_currency text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can undo payments.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_last FROM public.expense_payments p WHERE p.expense_id = p_id ORDER BY p.created_at DESC, p.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no payment to undo.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(f.storage_path), '{}') INTO v_paths FROM public.expense_files f WHERE f.payment_id = v_last.id;
  DELETE FROM public.expense_files WHERE payment_id = v_last.id;
  DELETE FROM public.expense_payments WHERE id = v_last.id;
  SELECT count(*)::integer INTO v_left FROM public.expense_payments p WHERE p.expense_id = p_id;
  UPDATE public.expenses
  SET status = CASE WHEN v_left > 0 THEN v_x.status WHEN v_x.status = 'ended' THEN 'ended' ELSE 'approved' END,
      payments_count = v_left,
      last_paid_on = (SELECT max(p.paid_on) FROM public.expense_payments p WHERE p.expense_id = p_id),
      renews_on = CASE WHEN v_x.status = 'ended' THEN NULL ELSE public._expense_renewal(p_id) END,
      updated_at = now()
  WHERE id = p_id;
  SELECT upper(COALESCE(NULLIF(btrim(c.currency), ''), 'USD')) INTO v_currency FROM public.companies c WHERE c.id = v_company;
  PERFORM public.log_activity(
    'payroll.expense_unpay',
    'Undid the payment of ' || public._expense_money(v_last.amount, v_currency) || ' on ' || public._expense_day(v_last.paid_on) || ' for "' || v_x.title || '"',
    jsonb_build_object('expense_id', p_id), v_x.employee_id);
  RETURN v_paths;
END;
$$;

-- Finance says no (budget, timing). The employee, and HR for a request, are told why.
CREATE OR REPLACE FUNCTION public.expense_finance_decline(p_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
  v_note text := left(btrim(COALESCE(p_note, '')), 500);
  v_emp text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can decline.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_note) < 5 THEN
    RAISE EXCEPTION 'Say why; the employee is told.' USING ERRCODE = '22023';
  END IF;
  IF v_x.payments_count > 0 THEN
    RAISE EXCEPTION 'Payments are recorded against it. Undo them first.' USING ERRCODE = '22023';
  END IF;
  IF v_x.status <> 'approved' THEN
    RAISE EXCEPTION 'Only items waiting to be paid can be declined.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.expenses
  SET status = 'declined', finance_by = auth.uid(), finance_by_name = public._expense_actor_name(), finance_at = now(),
      finance_note = v_note, updated_at = now()
  WHERE id = p_id;
  v_emp := public._expense_employee_name(v_x.employee_id);
  IF v_x.employee_id IS NOT NULL THEN
    PERFORM public.notify_employee(v_company, v_x.employee_id, 'expense', 'Finance could not pay for: ' || v_x.title, v_note,
      '/portal/expenses/' || p_id);
  END IF;
  IF v_x.source = 'request' THEN
    PERFORM public.notify_roles(v_company, ARRAY['hr'], 'expense', 'Finance declined: ' || v_x.title,
      COALESCE(v_emp, 'An employee') || ': ' || v_note, '/expenses/' || p_id);
  END IF;
  PERFORM public.log_activity('payroll.expense_decline',
    'Declined "' || v_x.title || '"' || COALESCE(' for ' || v_emp, '') || ': ' || v_note,
    jsonb_build_object('expense_id', p_id), v_x.employee_id);
END;
$$;

-- Finance changes its mind about a decline: back under "To pay".
CREATE OR REPLACE FUNCTION public.expense_finance_reconsider(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can reconsider.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.status <> 'declined' THEN
    RAISE EXCEPTION 'Only declined items can be reconsidered.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.expenses
  SET status = 'approved', finance_by = auth.uid(), finance_by_name = public._expense_actor_name(), finance_at = now(),
      finance_note = '', updated_at = now()
  WHERE id = p_id;
  PERFORM public.log_activity('payroll.expense_reconsider', 'Reconsidered "' || v_x.title || '"',
    jsonb_build_object('expense_id', p_id), v_x.employee_id);
END;
$$;

-- A subscription is cancelled from a date: no more renewals.
CREATE OR REPLACE FUNCTION public.expense_end_subscription(p_id uuid, p_on date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can end a subscription.' USING ERRCODE = '42501';
  END IF;
  IF p_on IS NULL OR p_on < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'Enter the date it ends.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.status <> 'active' THEN
    RAISE EXCEPTION 'Only a running subscription can be ended.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.expenses
  SET status = 'ended', ended_on = p_on, renews_on = NULL, finance_by = auth.uid(), finance_by_name = public._expense_actor_name(),
      updated_at = now()
  WHERE id = p_id;
  IF v_x.employee_id IS NOT NULL THEN
    PERFORM public.notify_employee(v_company, v_x.employee_id, 'expense', 'Subscription ended: ' || v_x.title,
      'Finance has cancelled it from ' || public._expense_day(p_on) || '.', '/portal/expenses/' || p_id);
  END IF;
  PERFORM public.log_activity('payroll.expense_end',
    'Ended the subscription "' || v_x.title || '" from ' || public._expense_day(p_on),
    jsonb_build_object('expense_id', p_id), v_x.employee_id);
END;
$$;

-- Finance marks a course complete for the employee (the employee does it from the portal).
CREATE OR REPLACE FUNCTION public.expense_complete_course(p_id uuid, p_outcome text, p_certificate jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
  v_outcome text := left(btrim(COALESCE(p_outcome, '')), 1500);
  v_cert jsonb;
  v_emp text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance or the employee can mark a course complete.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND OR v_x.category <> 'course' THEN
    RAISE EXCEPTION 'That course no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.status NOT IN ('paid', 'active', 'ended') THEN
    RAISE EXCEPTION 'A course can be marked complete once it has been paid for.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_outcome) < 20 THEN
    RAISE EXCEPTION 'Say what was learned and how it will be used at work, in a sentence or two.' USING ERRCODE = '22023';
  END IF;
  v_cert := public._expense_file_clean(p_certificate, v_company, 'certificate', COALESCE(v_x.employee_id::text, 'company'));
  UPDATE public.expenses SET completed_at = COALESCE(completed_at, now()), outcome = v_outcome, updated_at = now() WHERE id = p_id;
  PERFORM public._expense_add_file(v_company, p_id, NULL, 'certificate', v_cert, auth.uid(), public._expense_actor_name());
  v_emp := public._expense_employee_name(v_x.employee_id);
  IF v_x.completed_at IS NULL AND v_x.employee_id IS NOT NULL THEN
    PERFORM public.notify_roles(v_company, ARRAY['hr'], 'expense', COALESCE(v_emp, 'An employee') || ' completed a course', v_x.title,
      CASE WHEN v_x.source = 'request' THEN '/expenses/' || p_id ELSE '/expenses/requests?tab=courses' END);
  END IF;
  PERFORM public.log_activity('payroll.expense_complete',
    'Marked the course "' || v_x.title || '" as completed' || COALESCE(' for ' || v_emp, ''),
    jsonb_build_object('expense_id', p_id), v_x.employee_id);
END;
$$;

-- Finance removes an entry nothing has been paid against (a duplicate, a typing
-- mistake, or a closed request). Returns the storage paths to remove.
CREATE OR REPLACE FUNCTION public.expense_delete(p_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_x public.expenses;
  v_paths text[];
  v_emp text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can delete expenses.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_x FROM public.expenses WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.payments_count > 0 OR EXISTS (SELECT 1 FROM public.expense_payments p WHERE p.expense_id = p_id) THEN
    RAISE EXCEPTION 'Payments are recorded against it. Undo them first; the record of money paid is kept otherwise.' USING ERRCODE = '22023';
  END IF;
  IF v_x.source = 'request' AND v_x.status IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'An open request cannot be deleted. Decline it instead, so the employee is told.' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(f.storage_path), '{}') INTO v_paths FROM public.expense_files f WHERE f.expense_id = p_id;
  v_emp := public._expense_employee_name(v_x.employee_id);
  DELETE FROM public.expenses WHERE id = p_id;
  PERFORM public.log_activity('payroll.expense_delete',
    'Deleted "' || v_x.title || '"' || COALESCE(' (' || v_emp || ')', ''),
    jsonb_build_object('expense_id', p_id, 'title', v_x.title), v_x.employee_id);
  RETURN v_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_hr_decide(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_hr_undo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_finance_add(uuid, jsonb, boolean, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_record_payment(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_undo_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_finance_decline(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_finance_reconsider(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_end_subscription(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_complete_course(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_delete(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.expense_hr_decide(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_hr_undo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_finance_add(uuid, jsonb, boolean, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_record_payment(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_undo_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_finance_decline(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_finance_reconsider(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_end_subscription(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_complete_course(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_delete(uuid) TO authenticated;
