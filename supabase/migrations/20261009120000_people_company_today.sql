-- People: "today" is the company's day, not the database's UTC day.
--
-- Asia/Karachi is UTC+5, so between 00:00 and 05:00 local time current_date is still
-- yesterday. Handing over or returning equipment dated today was refused with "The
-- hand-over date cannot be in the future", the overdue-checklist badge counted a day late,
-- and the 90-day limits on separation and rejoining dates were a day short.
--
-- people_revoke_portal_sessions also reported expired sessions as "devices" signed out,
-- while the profile shows only live ones; it now counts live sessions only.

CREATE OR REPLACE FUNCTION public.people_assign_asset(p_asset uuid, p_employee uuid, p_date date DEFAULT NULL::date, p_condition text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
  v_today date := public.company_today(public.auth_company_id());
  v_asset public.assets;
  v_emp public.employees;
  v_date date := COALESCE(p_date, v_today);
  v_condition text := COALESCE(NULLIF(btrim(p_condition), ''), NULL);
  v_id uuid;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can hand over assets.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_asset FROM public.assets a WHERE a.id = p_asset AND a.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.status <> 'available' THEN
    RAISE EXCEPTION 'Only an available asset can be handed over (this one is %).', v_asset.status USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp.status <> 'active' THEN
    RAISE EXCEPTION 'Assets can only be handed to active employees.' USING ERRCODE = '22023';
  END IF;
  IF v_date > v_today THEN
    RAISE EXCEPTION 'The hand-over date cannot be in the future.' USING ERRCODE = '22023';
  END IF;
  IF v_condition IS NOT NULL AND v_condition NOT IN ('new', 'good', 'fair', 'poor', 'damaged') THEN
    RAISE EXCEPTION 'Unknown condition.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('people.asset_op', 'on', true);
  INSERT INTO public.asset_assignments (company_id, asset_id, employee_id, assigned_on, assigned_by, condition_out, note_out)
  VALUES (v_company, p_asset, p_employee, v_date, auth.uid(), COALESCE(v_condition, v_asset.condition), NULLIF(btrim(p_note), ''))
  RETURNING id INTO v_id;
  UPDATE public.assets
  SET status = 'assigned', employee_id = p_employee, assigned_on = v_date, condition = COALESCE(v_condition, condition)
  WHERE id = p_asset;
  PERFORM set_config('people.asset_op', '', true);

  PERFORM public.notify_employee(v_company, p_employee, 'people.asset',
    initcap(v_asset.category) || ' handed over to you',
    format('%s (%s) is now in your care. Please look after it and return it when HR asks.', v_asset.name, v_asset.tag),
    '/portal/assets');
  PERFORM public.log_activity('asset.assigned',
    format('Handed %s (%s) to %s', v_asset.name, v_asset.tag, v_emp.name),
    jsonb_build_object('asset_id', p_asset, 'assignment_id', v_id, 'assigned_on', v_date), p_employee);
  RETURN json_build_object('assignment_id', v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.people_return_asset(p_asset uuid, p_date date DEFAULT NULL::date, p_condition text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_next_status text DEFAULT 'available'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
  v_today date := public.company_today(public.auth_company_id());
  v_asset public.assets;
  v_open public.asset_assignments;
  v_date date := COALESCE(p_date, v_today);
  v_condition text := NULLIF(btrim(p_condition), '');
  v_next text := COALESCE(NULLIF(btrim(p_next_status), ''), 'available');
  v_name text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can record returns.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_asset FROM public.assets a WHERE a.id = p_asset AND a.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.status <> 'assigned' THEN
    RAISE EXCEPTION 'This asset is not handed out.' USING ERRCODE = '22023';
  END IF;
  IF v_next NOT IN ('available', 'repair', 'retired', 'lost') THEN
    RAISE EXCEPTION 'Choose what happens next: available, repair, retired or lost.' USING ERRCODE = '22023';
  END IF;
  IF v_condition IS NOT NULL AND v_condition NOT IN ('new', 'good', 'fair', 'poor', 'damaged') THEN
    RAISE EXCEPTION 'Unknown condition.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_open FROM public.asset_assignments x WHERE x.asset_id = p_asset AND x.returned_on IS NULL FOR UPDATE;
  IF v_open.id IS NOT NULL AND v_date < v_open.assigned_on THEN
    RAISE EXCEPTION 'The return date cannot be before the hand-over date (%).', to_char(v_open.assigned_on, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF v_date > v_today THEN
    RAISE EXCEPTION 'The return date cannot be in the future.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('people.asset_op', 'on', true);
  IF v_open.id IS NOT NULL THEN
    UPDATE public.asset_assignments
    SET returned_on = v_date, returned_by = auth.uid(), condition_in = COALESCE(v_condition, v_asset.condition), note_in = NULLIF(btrim(p_note), '')
    WHERE id = v_open.id;
  END IF;
  UPDATE public.assets
  SET status = v_next, employee_id = NULL, assigned_on = NULL, condition = COALESCE(v_condition, condition)
  WHERE id = p_asset;
  PERFORM set_config('people.asset_op', '', true);

  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = v_asset.employee_id;
  IF v_asset.employee_id IS NOT NULL THEN
    PERFORM public.notify_employee(v_company, v_asset.employee_id, 'people.asset',
      initcap(v_asset.category) || ' return recorded',
      format('HR recorded the return of %s (%s) on %s. Thank you.', v_asset.name, v_asset.tag, to_char(v_date, 'DD Mon YYYY')),
      '/portal/assets');
  END IF;
  PERFORM public.log_activity('asset.returned',
    format('%s returned %s (%s)', COALESCE(v_name, 'Holder'), v_asset.name, v_asset.tag),
    jsonb_build_object('asset_id', p_asset, 'returned_on', v_date, 'next_status', v_next), v_asset.employee_id);
  RETURN json_build_object('status', v_next);
END;
$function$;

CREATE OR REPLACE FUNCTION public.people_badge_counts()
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT json_build_object(
    'pending_updates', (
      SELECT count(*) FROM public.employee_update_requests r
      WHERE r.company_id = (SELECT public.auth_company_id()) AND r.status = 'pending'),
    'missing_documents', (
      SELECT count(*) FROM public.employees e
      WHERE e.company_id = (SELECT public.auth_company_id()) AND e.status = 'active'
        AND (SELECT count(DISTINCT d.document_type) FROM public.employee_documents d
             WHERE d.employee_id = e.id AND d.document_type IN ('id_copy', 'contract', 'certificate')) < 3),
    'overdue_checklists', (
      SELECT count(*) FROM public.employee_checklists c
      WHERE c.company_id = (SELECT public.auth_company_id()) AND c.status = 'open'
        AND c.due_date < public.company_today((SELECT public.auth_company_id())))
  )
$function$;

CREATE OR REPLACE FUNCTION public.people_separate_employee(p_employee uuid, p_last_day date, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
  v_emp public.employees;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_checklist uuid;
  v_assets integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can separate employees.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp.status = 'separated' THEN
    RAISE EXCEPTION '% is already separated.', v_emp.name USING ERRCODE = '22023';
  END IF;
  IF v_emp.user_id IS NOT NULL AND v_emp.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot separate your own record.' USING ERRCODE = '42501';
  END IF;
  IF p_last_day IS NULL THEN
    RAISE EXCEPTION 'Choose the last working day.' USING ERRCODE = '22023';
  END IF;
  IF v_emp.joining_date IS NOT NULL AND p_last_day < v_emp.joining_date THEN
    RAISE EXCEPTION 'The last day cannot be before the joining date (%).', to_char(v_emp.joining_date, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF p_last_day > public.company_today(v_company) + 90 THEN
    RAISE EXCEPTION 'The last day can be at most 90 days ahead.' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the reason under 500 characters.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.employees SET status = 'separated', separation_date = p_last_day WHERE id = p_employee;

  UPDATE public.employee_checklists
  SET status = 'cancelled', closed_at = now(), closed_by = auth.uid()
  WHERE employee_id = p_employee AND kind = 'onboarding' AND status = 'open';

  PERFORM public._people_seed_templates(v_company);
  IF NOT EXISTS (SELECT 1 FROM public.employee_checklists c WHERE c.employee_id = p_employee AND c.kind = 'offboarding' AND c.status = 'open')
     AND EXISTS (SELECT 1 FROM public.checklist_templates t JOIN public.checklist_template_steps s ON s.template_id = t.id
                 WHERE t.company_id = v_company AND t.kind = 'offboarding' AND t.is_default) THEN
    v_checklist := public.people_start_checklist(p_employee, 'offboarding', NULL, p_last_day, NULL, NULL, false);
  END IF;

  SELECT count(*) INTO v_assets FROM public.assets a WHERE a.employee_id = p_employee AND a.status = 'assigned';

  PERFORM public.notify_roles(v_company, ARRAY['hr'], 'people.offboarding', 'Offboarding started',
    format('%s leaves on %s.%s', v_emp.name, to_char(p_last_day, 'DD Mon YYYY'),
           CASE WHEN v_assets > 0 THEN format(' %s asset%s still to return.', v_assets, CASE WHEN v_assets = 1 THEN '' ELSE 's' END) ELSE '' END),
    COALESCE('/checklists/' || v_checklist, '/employees/' || p_employee));
  PERFORM public.log_activity('employee.separated',
    format('Separated %s, last day %s', v_emp.name, to_char(p_last_day, 'DD Mon YYYY')),
    jsonb_build_object('last_day', p_last_day, 'reason', v_reason, 'checklist_id', v_checklist), p_employee);

  RETURN json_build_object('checklist_id', v_checklist, 'assets_out', v_assets);
END;
$function$;

CREATE OR REPLACE FUNCTION public.people_rejoin_employee(p_employee uuid, p_date date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public.auth_company_id();
  v_today date := public.company_today(public.auth_company_id());
  v_emp public.employees;
  v_date date := COALESCE(p_date, v_today);
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can reactivate employees.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp.status = 'active' THEN
    RAISE EXCEPTION '% is already active.', v_emp.name USING ERRCODE = '22023';
  END IF;
  IF v_emp.separation_date IS NOT NULL AND v_date <= v_emp.separation_date THEN
    RAISE EXCEPTION 'The rejoining date must be after the last working day (%).', to_char(v_emp.separation_date, 'DD Mon YYYY') USING ERRCODE = '22023';
  END IF;
  IF v_date > v_today + 90 THEN
    RAISE EXCEPTION 'The rejoining date can be at most 90 days ahead.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('people.rejoin_date', v_date::text, true);
  UPDATE public.employees SET status = 'active', separation_date = NULL WHERE id = p_employee;
  PERFORM set_config('people.rejoin_date', '', true);

  UPDATE public.employee_checklists
  SET status = 'cancelled', closed_at = now(), closed_by = auth.uid()
  WHERE employee_id = p_employee AND kind = 'offboarding' AND status = 'open';

  PERFORM public.log_activity('employee.rejoined',
    format('Reactivated %s from %s', v_emp.name, to_char(v_date, 'DD Mon YYYY')),
    jsonb_build_object('rejoin_date', v_date, 'previous_last_day', v_emp.separation_date), p_employee);
  RETURN json_build_object('status', 'active');
END;
$function$;

CREATE OR REPLACE FUNCTION public.people_revoke_portal_sessions(p_employee uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_name text;
  v_count integer;
BEGIN
  IF public.auth_company_id() IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can sign employees out.' USING ERRCODE = '42501';
  END IF;
  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = p_employee AND e.company_id = public.auth_company_id();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  -- Report the devices that were really signed in (the profile's "Active devices"), not expired sessions.
  SELECT count(*) INTO v_count FROM public.employee_sessions s
  WHERE s.employee_id = p_employee AND s.revoked_at IS NULL AND s.expires_at > now();
  UPDATE public.employee_sessions SET revoked_at = now()
  WHERE employee_id = p_employee AND revoked_at IS NULL;
  PERFORM public.log_activity('employee.portal_signed_out', format('Signed %s out of the portal on all devices', v_name),
    jsonb_build_object('sessions', v_count), p_employee);
  RETURN v_count;
END;
$function$;
