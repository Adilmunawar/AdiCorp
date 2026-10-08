-- Foundation 5/7: tenant-scoped RLS rebuilt on the cached helpers.
-- One SELECT policy per table, split writes, TO authenticated only, role-correct.
--   owner   : everything
--   hr      : people, time, leave, approvals, engagement (never money)
--   finance : payroll, salaries, pay rules, overtime pricing (read-only people/time)
-- Portal employees never touch tables directly (portal_* SECURITY DEFINER RPCs).

-- ---------------------------------------------------------------------------
-- Denormalised company_id where policies previously needed per-row lookups
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.attendance a SET company_id = e.company_id
FROM public.employees e
WHERE e.id = a.employee_id AND a.company_id IS DISTINCT FROM e.company_id;
ALTER TABLE public.attendance ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON public.attendance (company_id, date);
DROP TRIGGER IF EXISTS attendance_set_company ON public.attendance;
CREATE TRIGGER attendance_set_company
  BEFORE INSERT OR UPDATE OF employee_id, company_id ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_company_from_employee();

ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.leave_balances b SET company_id = e.company_id
FROM public.employees e
WHERE e.id = b.employee_id AND b.company_id IS DISTINCT FROM e.company_id;
ALTER TABLE public.leave_balances ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leave_balances_company_year ON public.leave_balances (company_id, year);
DROP TRIGGER IF EXISTS leave_balances_set_company ON public.leave_balances;
CREATE TRIGGER leave_balances_set_company
  BEFORE INSERT OR UPDATE OF employee_id, company_id ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_company_from_employee();

CREATE OR REPLACE FUNCTION public.tg_set_company_from_poll()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT p.company_id INTO v_company FROM public.polls p WHERE p.id = NEW.poll_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Poll % not found', NEW.poll_id USING ERRCODE = '23503';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_set_company_from_poll() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.poll_options ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.poll_options o SET company_id = p.company_id
FROM public.polls p WHERE p.id = o.poll_id AND o.company_id IS DISTINCT FROM p.company_id;
ALTER TABLE public.poll_options ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poll_options_company ON public.poll_options (company_id);
DROP TRIGGER IF EXISTS poll_options_set_company ON public.poll_options;
CREATE TRIGGER poll_options_set_company
  BEFORE INSERT OR UPDATE OF poll_id, company_id ON public.poll_options
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_company_from_poll();

ALTER TABLE public.poll_votes ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
UPDATE public.poll_votes v SET company_id = p.company_id
FROM public.polls p WHERE p.id = v.poll_id AND v.company_id IS DISTINCT FROM p.company_id;
ALTER TABLE public.poll_votes ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poll_votes_company ON public.poll_votes (company_id);
DROP TRIGGER IF EXISTS poll_votes_set_company ON public.poll_votes;
CREATE TRIGGER poll_votes_set_company
  BEFORE INSERT OR UPDATE OF poll_id, company_id ON public.poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_company_from_poll();

-- employee_update_requests: company follows the employee too.
DROP TRIGGER IF EXISTS employee_update_requests_set_company ON public.employee_update_requests;
CREATE TRIGGER employee_update_requests_set_company
  BEFORE INSERT OR UPDATE OF employee_id, company_id ON public.employee_update_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_company_from_employee();

-- HR may record overtime hours but never sets or alters money on them.
CREATE OR REPLACE FUNCTION public.tg_overtime_money_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.auth_is_finance() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.hourly_rate := 0;
      NEW.total_amount := 0;
    ELSE
      NEW.hourly_rate := OLD.hourly_rate;
      NEW.multiplier := OLD.multiplier;
      NEW.total_amount := OLD.total_amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_overtime_money_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS overtime_records_money_guard ON public.overtime_records;
CREATE TRIGGER overtime_records_money_guard
  BEFORE INSERT OR UPDATE ON public.overtime_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_overtime_money_guard();

-- ---------------------------------------------------------------------------
-- Drop every legacy policy on the tables rebuilt here
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (ARRAY[
      'companies', 'employees', 'attendance', 'events', 'working_days_config', 'monthly_working_days',
      'company_working_settings', 'activity_logs', 'employee_documents', 'leave_types', 'leave_balances',
      'leave_requests', 'payslips', 'overtime_config', 'overtime_records', 'tier_config', 'health_check',
      'employee_update_requests', 'messages', 'complaints', 'polls', 'poll_options', 'poll_votes', 'announcements'
    ])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Standard policy sets
--   staff_read : SELECT for any staff role of the company
--   <role>_write : INSERT / UPDATE / DELETE for that role of the company
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  v_read text;
  v_write text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      -- table,                    read,      write
      ('employees',                'staff',   'hr'),
      ('attendance',               'staff',   'hr'),
      ('events',                   'staff',   'hr'),
      ('working_days_config',      'staff',   'hr'),
      ('monthly_working_days',     'staff',   'staff'),
      ('company_working_settings', 'staff',   'staff'),
      ('employee_documents',       'staff',   'hr'),
      ('leave_types',              'staff',   'hr'),
      ('leave_balances',           'staff',   'hr'),
      ('leave_requests',           'staff',   'hr'),
      ('payslips',                 'finance', 'finance'),
      ('overtime_config',          'staff',   'finance'),
      ('tier_config',              'staff',   'finance'),
      ('polls',                    'staff',   'hr'),
      ('poll_options',             'staff',   'hr'),
      ('announcements',            'staff',   'hr')
    ) AS v(tbl, rd, wr)
  LOOP
    v_read := format('company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_%s())', t.rd);
    v_write := format('company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_%s())', t.wr);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t.tbl || '_select', t.tbl, v_read);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t.tbl || '_insert', t.tbl, v_write);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t.tbl || '_update', t.tbl, v_write, v_write);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t.tbl || '_delete', t.tbl, v_write);
  END LOOP;
END $$;

-- companies: members read; the owner updates; inserts only via create_company_for_current_user().
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (id = (SELECT public.auth_company_id()) OR created_by = (SELECT auth.uid()));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
  USING (id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_owner()))
  WITH CHECK (id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_owner()));

-- activity_logs: payroll.* entries are Finance/owner only; immutable.
CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.auth_company_id())
    AND (SELECT public.auth_is_staff())
    AND (action_type NOT LIKE 'payroll.%' OR (SELECT public.auth_is_finance()))
  );
CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.auth_company_id())
    AND user_id = (SELECT auth.uid())
    AND (SELECT public.auth_is_staff())
    AND (action_type NOT LIKE 'payroll.%' OR (SELECT public.auth_is_finance()))
  );

-- overtime_records: HR records/approves hours, Finance prices (money guarded by trigger).
CREATE POLICY overtime_records_select ON public.overtime_records FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));
CREATE POLICY overtime_records_insert ON public.overtime_records FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));
CREATE POLICY overtime_records_update ON public.overtime_records FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()))
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));
CREATE POLICY overtime_records_delete ON public.overtime_records FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- employee_update_requests: HR reviews; employees submit through portal RPCs.
CREATE POLICY employee_update_requests_select ON public.employee_update_requests FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY employee_update_requests_update ON public.employee_update_requests FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()))
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY employee_update_requests_delete ON public.employee_update_requests FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- complaints: HR only (employees submit through portal RPCs).
CREATE POLICY complaints_select ON public.complaints FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY complaints_update ON public.complaints FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()))
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY complaints_delete ON public.complaints FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- poll_votes: cast through portal RPCs; staff read results, HR may remove.
CREATE POLICY poll_votes_select ON public.poll_votes FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));
CREATE POLICY poll_votes_delete ON public.poll_votes FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- messages: own conversations; HR sees every employee thread of the company.
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.auth_company_id())
    AND (SELECT public.auth_is_staff())
    AND (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()) OR (SELECT public.auth_is_hr()))
  );
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.auth_company_id())
    AND sender_id = (SELECT auth.uid())
    AND (SELECT public.auth_is_staff())
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = messages.receiver_id AND e.company_id = messages.company_id)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = messages.receiver_id AND p.company_id = messages.company_id)
    )
  );
CREATE POLICY messages_update ON public.messages FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.auth_company_id())
    AND (receiver_id = (SELECT auth.uid()) OR (SELECT public.auth_is_hr()))
  )
  WITH CHECK (company_id = (SELECT public.auth_company_id()));
CREATE POLICY messages_delete ON public.messages FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- health_check: keep-alive probe (no tenant data).
CREATE POLICY health_check_select ON public.health_check FOR SELECT TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Grants: no anonymous table access; nobody may TRUNCATE through the API roles
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT SELECT ON public.health_check TO anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ---------------------------------------------------------------------------
-- Realtime: never broadcast employee rows (CNIC, bank, password hash)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'employees') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.employees;
  END IF;
END $$;
