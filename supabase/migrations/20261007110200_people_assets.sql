-- People 3/5: company assets (inventory, hand-over history, holder).
-- Hand-overs and returns go through people_assign_asset / people_return_asset;
-- a guard trigger stops direct writes from moving an asset in or out of 'assigned'.

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag text NOT NULL,
  name text NOT NULL CONSTRAINT assets_name_chk CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  category text NOT NULL DEFAULT 'other' CONSTRAINT assets_category_chk CHECK (category IN (
    'laptop', 'desktop', 'monitor', 'phone', 'tablet', 'sim', 'printer', 'network', 'accessory', 'furniture', 'vehicle', 'other')),
  brand text CONSTRAINT assets_brand_chk CHECK (brand IS NULL OR length(brand) <= 80),
  model text CONSTRAINT assets_model_chk CHECK (model IS NULL OR length(model) <= 80),
  serial_number text CONSTRAINT assets_serial_chk CHECK (serial_number IS NULL OR length(serial_number) <= 80),
  specs text CONSTRAINT assets_specs_chk CHECK (specs IS NULL OR length(specs) <= 500),
  purchase_date date,
  warranty_until date,
  condition text NOT NULL DEFAULT 'good' CONSTRAINT assets_condition_chk CHECK (condition IN ('new', 'good', 'fair', 'poor', 'damaged')),
  status text NOT NULL DEFAULT 'available' CONSTRAINT assets_status_chk CHECK (status IN ('available', 'assigned', 'repair', 'retired', 'lost')),
  location text CONSTRAINT assets_location_chk CHECK (location IS NULL OR length(location) <= 120),
  notes text CONSTRAINT assets_notes_chk CHECK (notes IS NULL OR length(notes) <= 2000),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_on date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_holder_chk CHECK (employee_id IS NULL OR status = 'assigned'),
  CONSTRAINT assets_warranty_chk CHECK (warranty_until IS NULL OR purchase_date IS NULL OR warranty_until >= purchase_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS assets_company_tag_uidx ON public.assets (company_id, lower(tag));
CREATE INDEX IF NOT EXISTS idx_assets_company_status ON public.assets (company_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_employee ON public.assets (employee_id);
CREATE INDEX IF NOT EXISTS idx_assets_company_serial ON public.assets (company_id, lower(serial_number)) WHERE serial_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- No cascade: an asset with hand-over history cannot be deleted (retire it instead).
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assigned_on date NOT NULL,
  assigned_by uuid,
  condition_out text,
  note_out text CONSTRAINT asset_assignments_note_out_chk CHECK (note_out IS NULL OR length(note_out) <= 500),
  returned_on date,
  returned_by uuid,
  condition_in text,
  note_in text CONSTRAINT asset_assignments_note_in_chk CHECK (note_in IS NULL OR length(note_in) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_assignments_dates_chk CHECK (returned_on IS NULL OR returned_on >= assigned_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_assignments_one_open_uidx ON public.asset_assignments (asset_id) WHERE returned_on IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset ON public.asset_assignments (asset_id, assigned_on DESC);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_employee ON public.asset_assignments (employee_id, assigned_on DESC);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_company ON public.asset_assignments (company_id, assigned_on DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.assets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Category tag prefixes.
CREATE OR REPLACE FUNCTION public._people_asset_prefix(p_category text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_category
    WHEN 'laptop' THEN 'LAP' WHEN 'desktop' THEN 'DSK' WHEN 'monitor' THEN 'MON' WHEN 'phone' THEN 'PHN'
    WHEN 'tablet' THEN 'TAB' WHEN 'sim' THEN 'SIM' WHEN 'printer' THEN 'PRN' WHEN 'network' THEN 'NET'
    WHEN 'accessory' THEN 'ACC' WHEN 'furniture' THEN 'FUR' WHEN 'vehicle' THEN 'VEH' ELSE 'AST' END
$$;
REVOKE ALL ON FUNCTION public._people_asset_prefix(text) FROM PUBLIC, anon, authenticated;

-- Next free tag, e.g. NOP-LAP-0007 (also used by the form to suggest a tag).
CREATE OR REPLACE FUNCTION public._people_next_asset_tag(p_company uuid, p_category text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix text := public._people_code_prefix(p_company) || '-' || public._people_asset_prefix(p_category);
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('people.asset_tag.' || p_company::text, 0));
  SELECT COALESCE(max((regexp_match(a.tag, '-(\d+)$'))[1]::integer), 0) + 1 INTO v_next
  FROM public.assets a
  WHERE a.company_id = p_company AND a.tag ~ ('^' || v_prefix || '-\d+$');
  RETURN v_prefix || '-' || lpad(v_next::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public._people_next_asset_tag(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.people_next_asset_tag(p_category text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.auth_company_id() IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage assets.' USING ERRCODE = '42501';
  END IF;
  RETURN public._people_next_asset_tag(public.auth_company_id(), COALESCE(p_category, 'other'));
END;
$$;
REVOKE ALL ON FUNCTION public.people_next_asset_tag(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_next_asset_tag(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_people_asset_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.tag := NULLIF(upper(btrim(COALESCE(NEW.tag, ''))), '');
  NEW.serial_number := NULLIF(btrim(COALESCE(NEW.serial_number, '')), '');
  IF TG_OP = 'INSERT' AND NEW.tag IS NULL THEN
    NEW.tag := public._people_next_asset_tag(NEW.company_id, NEW.category);
  END IF;
  IF NEW.tag IS NULL THEN
    RAISE EXCEPTION 'Every asset needs a tag.' USING ERRCODE = '23502';
  END IF;

  -- Hand-overs only through the RPCs (they set people.asset_op). Trusted writers without a JWT are allowed.
  IF auth.uid() IS NOT NULL AND COALESCE(current_setting('people.asset_op', true), '') <> 'on' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status = 'assigned' OR NEW.employee_id IS NOT NULL THEN
        RAISE EXCEPTION 'Add the asset first, then use Assign to hand it over.' USING ERRCODE = '22023';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
      IF OLD.status = 'assigned' THEN
        RAISE EXCEPTION 'Record the return before changing the status of an assigned asset.' USING ERRCODE = '22023';
      END IF;
      IF NEW.status = 'assigned' OR NEW.employee_id IS NOT NULL THEN
        RAISE EXCEPTION 'Use Assign to hand an asset over.' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_people_asset_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS people_asset_guard ON public.assets;
CREATE TRIGGER people_asset_guard
  BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_people_asset_guard();

CREATE OR REPLACE FUNCTION public.tg_people_company_from_asset()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT a.company_id INTO v_company FROM public.assets a WHERE a.id = NEW.asset_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Asset not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_people_company_from_asset() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS asset_assignments_set_company ON public.asset_assignments;
CREATE TRIGGER asset_assignments_set_company
  BEFORE INSERT OR UPDATE OF asset_id, company_id ON public.asset_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_people_company_from_asset();

-- ---------------------------------------------------------------------------
-- RLS: HR and owner. Assignments are written only by the RPCs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assets, public.asset_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT SELECT ON public.asset_assignments TO authenticated;

DROP POLICY IF EXISTS assets_select ON public.assets;
DROP POLICY IF EXISTS assets_insert ON public.assets;
DROP POLICY IF EXISTS assets_update ON public.assets;
DROP POLICY IF EXISTS assets_delete ON public.assets;
DROP POLICY IF EXISTS asset_assignments_select ON public.asset_assignments;
CREATE POLICY assets_select ON public.assets FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY assets_insert ON public.assets FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY assets_update ON public.assets FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()))
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY assets_delete ON public.assets FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY asset_assignments_select ON public.asset_assignments FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- ---------------------------------------------------------------------------
-- Hand over / return
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_assign_asset(
  p_asset uuid, p_employee uuid, p_date date DEFAULT NULL, p_condition text DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_asset public.assets;
  v_emp public.employees;
  v_date date := COALESCE(p_date, current_date);
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
  IF v_date > current_date THEN
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
$$;
REVOKE ALL ON FUNCTION public.people_assign_asset(uuid, uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_assign_asset(uuid, uuid, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.people_return_asset(
  p_asset uuid, p_date date DEFAULT NULL, p_condition text DEFAULT NULL, p_note text DEFAULT NULL, p_next_status text DEFAULT 'available'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_asset public.assets;
  v_open public.asset_assignments;
  v_date date := COALESCE(p_date, current_date);
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
  IF v_date > current_date THEN
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
$$;
REVOKE ALL ON FUNCTION public.people_return_asset(uuid, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_return_asset(uuid, date, text, text, text) TO authenticated;
