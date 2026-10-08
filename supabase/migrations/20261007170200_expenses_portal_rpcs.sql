-- Courses & expenses 3/3: employee portal RPCs (anon key + session token).
-- The employee and company come from the token only; every reply lists its
-- columns explicitly. An employee sees their own items in full.

-- Activity written on behalf of a portal employee (no staff user).
CREATE OR REPLACE FUNCTION public._expense_log_employee(
  p_company uuid, p_employee uuid, p_action text, p_description text, p_details jsonb
)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES (left(p_action, 100), left(COALESCE(p_description, ''), 1000), COALESCE(p_details, '{}'::jsonb), NULL, p_company, p_employee);
$$;
REVOKE ALL ON FUNCTION public._expense_log_employee(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

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
    'paid_total', COALESCE((SELECT sum(p.amount) FROM public.expense_payments p WHERE p.expense_id = p_x.id), 0));
$$;
REVOKE ALL ON FUNCTION public._expense_portal_json(public.expenses) FROM PUBLIC, anon, authenticated;

-- The signed-in employee's items, newest first.
CREATE OR REPLACE FUNCTION public.portal_expenses(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(public._expense_portal_json(x) ORDER BY x.created_at DESC, x.id DESC)
    FROM public.expenses x
    WHERE x.company_id = v_emp.company_id AND x.employee_id = v_emp.id
  ), '[]'::jsonb);
END;
$$;

-- One item with its payments and files.
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
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method,
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

-- The employee asks. HR (and the owner) are told.
CREATE OR REPLACE FUNCTION public.portal_expense_request(p_token text, p_input jsonb, p_quote jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_v jsonb;
  v_quote jsonb;
  v_id uuid;
BEGIN
  v_v := public._expense_clean(p_input, true);
  v_quote := public._expense_file_clean(p_quote, v_emp.company_id, 'quote', v_emp.id::text);
  INSERT INTO public.expenses (
    company_id, employee_id, category, title, provider, link, amount, currency, billing, purpose, benefit,
    start_date, end_date, reimburse, source, status, requested_by, requested_by_name)
  VALUES (
    v_emp.company_id, v_emp.id, v_v->>'category', v_v->>'title', v_v->>'provider', v_v->>'link', (v_v->>'amount')::numeric,
    v_v->>'currency', v_v->>'billing', v_v->>'purpose', v_v->>'benefit',
    (v_v->>'start_date')::date, (v_v->>'end_date')::date, (v_v->>'reimburse')::boolean,
    'request', 'pending', NULL, v_emp.name)
  RETURNING id INTO v_id;
  PERFORM public._expense_add_file(v_emp.company_id, v_id, NULL, 'quote', v_quote, NULL, v_emp.name);
  PERFORM public.notify_roles(v_emp.company_id, ARRAY['hr'], 'expense', v_emp.name || ' asked for: ' || (v_v->>'title'),
    public._expense_category_label(v_v->>'category') || '. Waiting for your decision.', '/expenses/' || v_id);
  PERFORM public._expense_log_employee(v_emp.company_id, v_emp.id, 'expense.request',
    'Asked for ' || public._expense_category_label(v_v->>'category', true) || ': ' || (v_v->>'title') || ' ('
      || public._expense_money((v_v->>'amount')::numeric, v_v->>'currency')
      || CASE WHEN v_v->>'billing' = 'once' THEN '' ELSE ' ' || (v_v->>'billing') END || ')',
    jsonb_build_object('expense_id', v_id));
  RETURN v_id;
END;
$$;

-- The employee takes back a request HR has not decided yet.
CREATE OR REPLACE FUNCTION public.portal_expense_withdraw(p_token text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_x public.expenses;
BEGIN
  SELECT * INTO v_x FROM public.expenses x
  WHERE x.id = p_id AND x.company_id = v_emp.company_id AND x.employee_id = v_emp.id AND x.source = 'request'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not yours.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.status <> 'pending' THEN
    RAISE EXCEPTION 'HR has already decided on it. Ask HR if it needs to change.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.expenses SET status = 'withdrawn', updated_at = now() WHERE id = p_id;
  PERFORM public._expense_log_employee(v_emp.company_id, v_emp.id, 'expense.withdraw', 'Withdrew a request: ' || v_x.title,
    jsonb_build_object('expense_id', p_id));
END;
$$;

-- A course is done: what was learned and how it will be used. HR is told the first time.
CREATE OR REPLACE FUNCTION public.portal_expense_complete(p_token text, p_id uuid, p_outcome text, p_certificate jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_x public.expenses;
  v_outcome text := left(btrim(COALESCE(p_outcome, '')), 1500);
  v_cert jsonb;
BEGIN
  SELECT * INTO v_x FROM public.expenses x
  WHERE x.id = p_id AND x.company_id = v_emp.company_id AND x.employee_id = v_emp.id
  FOR UPDATE;
  IF NOT FOUND OR v_x.category <> 'course' THEN
    RAISE EXCEPTION 'That course is not yours.' USING ERRCODE = 'P0001';
  END IF;
  IF v_x.status NOT IN ('paid', 'active', 'ended') THEN
    RAISE EXCEPTION 'A course can be marked complete once it has been paid for.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_outcome) < 20 THEN
    RAISE EXCEPTION 'Say what you learned and how you will use it at work, in a sentence or two.' USING ERRCODE = '22023';
  END IF;
  v_cert := public._expense_file_clean(p_certificate, v_emp.company_id, 'certificate', v_emp.id::text);
  UPDATE public.expenses SET completed_at = COALESCE(completed_at, now()), outcome = v_outcome, updated_at = now() WHERE id = p_id;
  PERFORM public._expense_add_file(v_emp.company_id, p_id, NULL, 'certificate', v_cert, NULL, v_emp.name);
  IF v_x.completed_at IS NULL THEN
    PERFORM public.notify_roles(v_emp.company_id, ARRAY['hr'], 'expense', v_emp.name || ' completed a course', v_x.title,
      CASE WHEN v_x.source = 'request' THEN '/expenses/' || p_id ELSE '/expenses/requests?tab=courses' END);
  END IF;
  PERFORM public._expense_log_employee(v_emp.company_id, v_emp.id, 'expense.complete',
    'Marked the course "' || v_x.title || '" as completed', jsonb_build_object('expense_id', p_id));
END;
$$;

REVOKE ALL ON FUNCTION public.portal_expenses(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_expense(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_expense_request(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_expense_withdraw(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_expense_complete(text, uuid, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.portal_expenses(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_expense(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_expense_request(text, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_expense_withdraw(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_expense_complete(text, uuid, text, jsonb) TO anon, authenticated;
