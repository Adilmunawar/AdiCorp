-- People 2/5: onboarding and offboarding checklists.
-- Templates hold ordered steps with due offsets (days from the start date).
-- Starting a checklist copies the template; later template edits never touch
-- checklists already started. Auto steps (auto_key) tick from live data until
-- HR ticks or unticks them by hand (touched = true).

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT checklist_templates_kind_chk CHECK (kind IN ('onboarding', 'offboarding')),
  name text NOT NULL CONSTRAINT checklist_templates_name_chk CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  description text CONSTRAINT checklist_templates_description_chk CHECK (description IS NULL OR length(description) <= 500),
  is_default boolean NOT NULL DEFAULT false,
  default_due_days integer NOT NULL DEFAULT 14 CONSTRAINT checklist_templates_due_chk CHECK (default_due_days BETWEEN 0 AND 365),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_templates_company_kind_name_uidx
  ON public.checklist_templates (company_id, kind, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS checklist_templates_one_default_uidx
  ON public.checklist_templates (company_id, kind) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.checklist_template_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  title text NOT NULL CONSTRAINT checklist_template_steps_title_chk CHECK (length(btrim(title)) BETWEEN 3 AND 120),
  description text CONSTRAINT checklist_template_steps_description_chk CHECK (description IS NULL OR length(description) <= 500),
  auto_key text,
  due_offset_days integer NOT NULL DEFAULT 0 CONSTRAINT checklist_template_steps_offset_chk CHECK (due_offset_days BETWEEN 0 AND 365),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_template_steps_template ON public.checklist_template_steps (template_id, position);
CREATE INDEX IF NOT EXISTS idx_checklist_template_steps_company ON public.checklist_template_steps (company_id);

CREATE TABLE IF NOT EXISTS public.employee_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  kind text NOT NULL CONSTRAINT employee_checklists_kind_chk CHECK (kind IN ('onboarding', 'offboarding')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open' CONSTRAINT employee_checklists_status_chk CHECK (status IN ('open', 'done', 'cancelled')),
  start_date date NOT NULL DEFAULT current_date,
  due_date date,
  note text CONSTRAINT employee_checklists_note_chk CHECK (note IS NULL OR length(note) <= 1000),
  started_by uuid DEFAULT auth.uid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_checklists_due_chk CHECK (due_date IS NULL OR due_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_checklists_one_open_uidx
  ON public.employee_checklists (employee_id, kind) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_employee_checklists_company_status_due ON public.employee_checklists (company_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_employee_checklists_employee ON public.employee_checklists (employee_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_checklists_template ON public.employee_checklists (template_id);

CREATE TABLE IF NOT EXISTS public.employee_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES public.employee_checklists(id) ON DELETE CASCADE,
  title text NOT NULL CONSTRAINT employee_checklist_items_title_chk CHECK (length(btrim(title)) BETWEEN 3 AND 120),
  description text CONSTRAINT employee_checklist_items_description_chk CHECK (description IS NULL OR length(description) <= 500),
  auto_key text,
  position integer NOT NULL DEFAULT 0,
  due_date date,
  done_at timestamptz,
  done_by uuid,
  touched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_checklist_items_checklist ON public.employee_checklist_items (checklist_id, position);
CREATE INDEX IF NOT EXISTS idx_employee_checklist_items_company ON public.employee_checklist_items (company_id);

-- company_id always follows the parent row.
CREATE OR REPLACE FUNCTION public.tg_people_company_from_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT t.company_id INTO v_company FROM public.checklist_templates t WHERE t.id = NEW.template_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_people_company_from_template() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_people_company_from_checklist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT c.company_id INTO v_company FROM public.employee_checklists c WHERE c.id = NEW.checklist_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Checklist not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_people_company_from_checklist() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS checklist_template_steps_set_company ON public.checklist_template_steps;
CREATE TRIGGER checklist_template_steps_set_company
  BEFORE INSERT OR UPDATE OF template_id, company_id ON public.checklist_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_people_company_from_template();

DROP TRIGGER IF EXISTS employee_checklists_set_company ON public.employee_checklists;
CREATE TRIGGER employee_checklists_set_company
  BEFORE INSERT OR UPDATE OF employee_id, company_id ON public.employee_checklists
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_company_from_employee();

DROP TRIGGER IF EXISTS employee_checklist_items_set_company ON public.employee_checklist_items;
CREATE TRIGGER employee_checklist_items_set_company
  BEFORE INSERT OR UPDATE OF checklist_id, company_id ON public.employee_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_people_company_from_checklist();

DROP TRIGGER IF EXISTS set_updated_at ON public.checklist_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.employee_checklists;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.employee_checklists
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: HR and owner only (one SELECT policy per table).
-- ---------------------------------------------------------------------------
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_checklist_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.checklist_templates, public.checklist_template_steps,
              public.employee_checklists, public.employee_checklist_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates, public.checklist_template_steps,
      public.employee_checklists, public.employee_checklist_items TO authenticated;

DO $$
DECLARE
  t text;
  v_hr text := 'company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr())';
BEGIN
  FOREACH t IN ARRAY ARRAY['checklist_templates', 'checklist_template_steps', 'employee_checklists', 'employee_checklist_items']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_select', t, v_hr);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_insert', t, v_hr);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_update', t, v_hr, v_hr);
    IF t = 'checklist_templates' THEN
      -- The default template of each kind can be emptied or renamed, never deleted.
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s AND NOT is_default)', t || '_delete', t, v_hr);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_delete', t, v_hr);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Default templates (seeded once per company and kind).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._people_seed_templates(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tpl uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('people.templates.' || p_company::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.company_id = p_company AND t.kind = 'onboarding' AND t.is_default) THEN
    INSERT INTO public.checklist_templates (company_id, kind, name, description, is_default, default_due_days, created_by)
    VALUES (p_company, 'onboarding', 'Standard onboarding',
            'Everything a new joiner needs in their first two weeks.', true, 14, NULL)
    RETURNING id INTO v_tpl;
    INSERT INTO public.checklist_template_steps (company_id, template_id, title, description, auto_key, due_offset_days, position)
    SELECT p_company, v_tpl, s.title, s.description, s.auto_key, s.offset_days, s.pos
    FROM (VALUES
      ('Collect CNIC copy', 'Upload a clear copy of both sides to Documents.', 'doc_id_copy', 0, 1),
      ('Signed employment contract', 'The signed contract is uploaded to Documents.', 'doc_contract', 0, 2),
      ('Educational certificates', 'Highest degree or diploma uploaded to Documents.', 'doc_certificate', 3, 3),
      ('Set position, department and joining date', 'Employment details are complete on the profile.', 'employment_set', 0, 4),
      ('Salary set by Finance', 'Finance confirms the salary. HR only sees whether it is set, never the amount.', 'salary_set', 3, 5),
      ('Portal access shared', 'Set a portal password and share the sign-in details with the employee.', 'portal_access', 1, 6),
      ('Hand over equipment', 'Laptop, phone or other assets are assigned in Assets.', 'assets_issued', 1, 7),
      ('Bank details on file', 'Bank name and account number are on the profile.', 'bank_details', 7, 8),
      ('Profile complete', 'Name, CNIC, father''s name, phone, date of birth and emergency contact are filled.', 'profile_complete', 7, 9),
      ('Orientation and team introduction', 'Walk through the office, tools, policies and the team.', NULL, 2, 10),
      ('Probation goals agreed', 'Agree goals and the review date with the line manager.', NULL, 14, 11)
    ) AS s(title, description, auto_key, offset_days, pos);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.checklist_templates t WHERE t.company_id = p_company AND t.kind = 'offboarding' AND t.is_default) THEN
    INSERT INTO public.checklist_templates (company_id, kind, name, description, is_default, default_due_days, created_by)
    VALUES (p_company, 'offboarding', 'Standard offboarding',
            'A clean exit: handover, equipment, final pay and paperwork.', true, 7, NULL)
    RETURNING id INTO v_tpl;
    INSERT INTO public.checklist_template_steps (company_id, template_id, title, description, auto_key, due_offset_days, position)
    SELECT p_company, v_tpl, s.title, s.description, s.auto_key, s.offset_days, s.pos
    FROM (VALUES
      ('Resignation or termination letter on file', 'Upload the letter to Documents.', NULL, 0, 1),
      ('Handover of work', 'Open tasks, files and accounts are handed to a named colleague.', NULL, 0, 2),
      ('Return equipment', 'Every assigned asset is returned in Assets.', 'assets_returned', 0, 3),
      ('Portal access disabled', 'The employee can no longer sign in to the portal.', 'access_disabled', 0, 4),
      ('Exit interview', 'Record feedback on the role, team and reasons for leaving.', NULL, 3, 5),
      ('Settle leave, overtime and advances', 'Agree the balances with Finance.', NULL, 5, 6),
      ('Final payslip for the last month', 'Finance issues the final payslip.', 'final_payslip', 7, 7),
      ('Experience certificate', 'Issue the experience or relieving letter.', NULL, 7, 8)
    ) AS s(title, description, auto_key, offset_days, pos);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._people_seed_templates(uuid) FROM PUBLIC, anon, authenticated;

-- HR: make sure the company has its default templates. Returns the number of templates.
CREATE OR REPLACE FUNCTION public.people_ensure_checklist_templates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_count integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage checklists.' USING ERRCODE = '42501';
  END IF;
  PERFORM public._people_seed_templates(v_company);
  SELECT count(*) INTO v_count FROM public.checklist_templates t WHERE t.company_id = v_company;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.people_ensure_checklist_templates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_ensure_checklist_templates() TO authenticated;

-- ---------------------------------------------------------------------------
-- Start a checklist for one employee (copies the template).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_start_checklist(
  p_employee uuid,
  p_kind text,
  p_template uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_due date DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_notify boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_emp public.employees;
  v_tpl public.checklist_templates;
  v_start date;
  v_due date;
  v_id uuid;
  v_label text := CASE p_kind WHEN 'offboarding' THEN 'Offboarding' ELSE 'Onboarding' END;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can start checklists.' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('onboarding', 'offboarding') THEN
    RAISE EXCEPTION 'Choose onboarding or offboarding.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_kind = 'onboarding' AND v_emp.status <> 'active' THEN
    RAISE EXCEPTION 'Onboarding is only for active employees.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.employee_checklists c WHERE c.employee_id = p_employee AND c.kind = p_kind AND c.status = 'open') THEN
    RAISE EXCEPTION '% already has an open % checklist.', v_emp.name, lower(v_label) USING ERRCODE = '23505';
  END IF;

  PERFORM public._people_seed_templates(v_company);
  IF p_template IS NULL THEN
    SELECT * INTO v_tpl FROM public.checklist_templates t WHERE t.company_id = v_company AND t.kind = p_kind AND t.is_default;
  ELSE
    SELECT * INTO v_tpl FROM public.checklist_templates t WHERE t.id = p_template AND t.company_id = v_company;
  END IF;
  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Template not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_tpl.kind <> p_kind THEN
    RAISE EXCEPTION 'That template is for %.', v_tpl.kind USING ERRCODE = '22023';
  END IF;

  v_start := COALESCE(p_start,
                      CASE WHEN p_kind = 'offboarding' THEN v_emp.separation_date ELSE v_emp.joining_date END,
                      current_date);
  v_due := COALESCE(p_due, v_start + v_tpl.default_due_days);
  IF v_due < v_start THEN
    RAISE EXCEPTION 'The due date cannot be before the start date.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.employee_checklists (company_id, employee_id, template_id, kind, title, start_date, due_date, note)
  VALUES (v_company, p_employee, v_tpl.id, p_kind, v_tpl.name, v_start, v_due, NULLIF(btrim(p_note), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.employee_checklist_items (company_id, checklist_id, title, description, auto_key, position, due_date)
  SELECT v_company, v_id, s.title, s.description, s.auto_key, s.position, v_start + s.due_offset_days
  FROM public.checklist_template_steps s
  WHERE s.template_id = v_tpl.id
  ORDER BY s.position, s.created_at;

  PERFORM public.log_activity(p_kind || '.started',
    format('Started %s for %s', lower(v_label), v_emp.name),
    jsonb_build_object('checklist_id', v_id, 'template', v_tpl.name, 'due_date', v_due), p_employee);

  IF p_notify THEN
    PERFORM public.notify_roles(v_company, ARRAY['hr'], 'people.checklist',
      v_label || ' started',
      format('%s for %s is due %s.', v_tpl.name, v_emp.name, to_char(v_due, 'DD Mon YYYY')),
      '/checklists/' || v_id);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.people_start_checklist(uuid, text, uuid, date, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_start_checklist(uuid, text, uuid, date, date, text, boolean) TO authenticated;

-- Tick or untick one step by hand (the step stops following live data).
CREATE OR REPLACE FUNCTION public.people_set_checklist_item(p_item uuid, p_done boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_item public.employee_checklist_items;
  v_list public.employee_checklists;
  v_done integer;
  v_total integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can update checklists.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_item FROM public.employee_checklist_items i WHERE i.id = p_item AND i.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_list FROM public.employee_checklists c WHERE c.id = v_item.checklist_id;
  IF v_list.status <> 'open' THEN
    RAISE EXCEPTION 'This checklist is closed. Reopen it to make changes.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.employee_checklist_items
  SET done_at = CASE WHEN p_done THEN COALESCE(done_at, now()) END,
      done_by = CASE WHEN p_done THEN COALESCE(done_by, auth.uid()) END,
      touched = true
  WHERE id = p_item;

  SELECT count(*) FILTER (WHERE i.done_at IS NOT NULL), count(*) INTO v_done, v_total
  FROM public.employee_checklist_items i WHERE i.checklist_id = v_list.id;

  PERFORM public.log_activity(v_list.kind || '.step',
    format('%s "%s"', CASE WHEN p_done THEN 'Ticked' ELSE 'Unticked' END, v_item.title),
    jsonb_build_object('checklist_id', v_list.id, 'item_id', p_item, 'done', p_done), v_list.employee_id);

  RETURN json_build_object('done', v_done, 'total', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.people_set_checklist_item(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_set_checklist_item(uuid, boolean) TO authenticated;

-- Complete ('done'), cancel ('cancelled') or reopen ('open') a checklist.
CREATE OR REPLACE FUNCTION public.people_set_checklist_status(p_checklist uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_list public.employee_checklists;
  v_name text;
  v_action text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can update checklists.' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'done', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown status.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_list FROM public.employee_checklists c WHERE c.id = p_checklist AND c.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_list.status = p_status THEN
    RETURN;
  END IF;
  IF p_status = 'open' AND EXISTS (
    SELECT 1 FROM public.employee_checklists c
    WHERE c.employee_id = v_list.employee_id AND c.kind = v_list.kind AND c.status = 'open' AND c.id <> v_list.id
  ) THEN
    RAISE EXCEPTION 'Another % checklist is already open for this person.', v_list.kind USING ERRCODE = '23505';
  END IF;

  UPDATE public.employee_checklists
  SET status = p_status,
      closed_at = CASE WHEN p_status = 'open' THEN NULL ELSE now() END,
      closed_by = CASE WHEN p_status = 'open' THEN NULL ELSE auth.uid() END
  WHERE id = p_checklist;

  SELECT e.name INTO v_name FROM public.employees e WHERE e.id = v_list.employee_id;
  v_action := CASE p_status WHEN 'done' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE 'reopened' END;
  PERFORM public.log_activity(v_list.kind || '.' || v_action,
    format('%s %s for %s', initcap(v_action), v_list.kind, v_name),
    jsonb_build_object('checklist_id', p_checklist), v_list.employee_id);
END;
$$;
REVOKE ALL ON FUNCTION public.people_set_checklist_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_set_checklist_status(uuid, text) TO authenticated;
