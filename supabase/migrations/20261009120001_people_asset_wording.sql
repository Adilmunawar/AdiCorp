-- People: readable wording in asset hand-over messages.
--
-- Portal notifications were titled from the raw category ("Sim handed over to you",
-- "Other handed over to you"), and handing over an asset that is not in store said
-- "this one is repair". Same functions as 20261009120000 otherwise (company-day dates).

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
    RAISE EXCEPTION 'Only an available asset can be handed over (this one is %).',
      CASE v_asset.status WHEN 'assigned' THEN 'already handed out' WHEN 'repair' THEN 'in repair' ELSE v_asset.status END
      USING ERRCODE = '22023';
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
    (CASE v_asset.category WHEN 'sim' THEN 'SIM card' WHEN 'network' THEN 'Network device' WHEN 'other' THEN 'Equipment' ELSE initcap(v_asset.category) END) || ' handed over to you',
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
      (CASE v_asset.category WHEN 'sim' THEN 'SIM card' WHEN 'network' THEN 'Network device' WHEN 'other' THEN 'Equipment' ELSE initcap(v_asset.category) END) || ' return recorded',
      format('HR recorded the return of %s (%s) on %s. Thank you.', v_asset.name, v_asset.tag, to_char(v_date, 'DD Mon YYYY')),
      '/portal/assets');
  END IF;
  PERFORM public.log_activity('asset.returned',
    format('%s returned %s (%s)', COALESCE(v_name, 'Holder'), v_asset.name, v_asset.tag),
    jsonb_build_object('asset_id', p_asset, 'returned_on', v_date, 'next_status', v_next), v_asset.employee_id);
  RETURN json_build_object('status', v_next);
END;
$function$;
