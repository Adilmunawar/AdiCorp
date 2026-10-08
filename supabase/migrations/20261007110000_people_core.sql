-- People 1/5: pay events for Finance, employee codes, profile-request review
-- columns, document expiry and the shared field validator.
-- Depends on the foundation migrations (20261007100000-20261007100600).
-- Idempotent; existing rows stay valid. No other tenant's rows are modified.

-- ---------------------------------------------------------------------------
-- pay_events: HR-side changes Finance must act on (shared with payroll).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pay_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  detail text,
  effective_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_by uuid,
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pay_events_company_created ON public.pay_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pay_events_employee ON public.pay_events (employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_events_company_open ON public.pay_events (company_id) WHERE done_at IS NULL;
ALTER TABLE public.pay_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_events TO authenticated;

-- Finance/owner only. Created only when no policy exists yet, so the payroll
-- module can own this table without duplicate permissive policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pay_events') THEN
    CREATE POLICY pay_events_select ON public.pay_events FOR SELECT TO authenticated
      USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
    CREATE POLICY pay_events_insert ON public.pay_events FOR INSERT TO authenticated
      WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
    CREATE POLICY pay_events_update ON public.pay_events FOR UPDATE TO authenticated
      USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()))
      WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
    CREATE POLICY pay_events_delete ON public.pay_events FOR DELETE TO authenticated
      USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
  END IF;
END $$;

-- Record a pay event and tell Finance (and the owner). During bulk operations
-- (people.bulk = 'on') the per-row notification is skipped; the caller sends one summary.
CREATE OR REPLACE FUNCTION public._people_pay_event(
  p_company uuid, p_employee uuid, p_kind text, p_title text, p_detail text, p_effective date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.pay_events (company_id, employee_id, kind, title, detail, effective_date, created_by)
  VALUES (p_company, p_employee, p_kind, left(p_title, 200), left(p_detail, 2000), p_effective, auth.uid());

  IF COALESCE(current_setting('people.bulk', true), '') <> 'on' THEN
    PERFORM public.notify_roles(p_company, ARRAY['finance'], 'payroll', p_title, p_detail, '/payroll');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._people_pay_event(uuid, uuid, text, text, text, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Employee codes: <COMPANY INITIALS>-0001, assigned on insert when blank.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._people_code_prefix(p_company uuid)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_prefix text;
BEGIN
  SELECT c.name INTO v_name FROM public.companies c WHERE c.id = p_company;
  v_name := regexp_replace(COALESCE(v_name, ''), '[^A-Za-z ]', ' ', 'g');

  SELECT string_agg(left(t.w, 1), '' ORDER BY t.n) INTO v_prefix
  FROM (
    SELECT w, n
    FROM regexp_split_to_table(v_name, '\s+') WITH ORDINALITY AS s(w, n)
    WHERE w <> ''
    ORDER BY n
    LIMIT 3
  ) AS t;

  IF v_prefix IS NULL OR length(v_prefix) < 2 THEN
    v_prefix := left(regexp_replace(v_name, '[^A-Za-z]', '', 'g'), 3);
  END IF;
  v_prefix := upper(COALESCE(v_prefix, ''));
  RETURN CASE WHEN length(v_prefix) >= 2 THEN v_prefix ELSE 'EMP' END;
END;
$$;
REVOKE ALL ON FUNCTION public._people_code_prefix(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._people_next_code(p_company uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix text := public._people_code_prefix(p_company);
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('people.employee_code.' || p_company::text, 0));
  SELECT COALESCE(max((regexp_match(e.employee_code, '-(\d+)$'))[1]::integer), 0) + 1
    INTO v_next
  FROM public.employees e
  WHERE e.company_id = p_company
    AND e.employee_code ~ ('^' || v_prefix || '-\d+$');
  RETURN v_prefix || '-' || lpad(v_next::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public._people_next_code(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_people_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.employee_code := NULLIF(upper(btrim(COALESCE(NEW.employee_code, ''))), '');
  IF NEW.employee_code IS NULL THEN
    NEW.employee_code := public._people_next_code(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_people_employee_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS people_employee_code ON public.employees;
CREATE TRIGGER people_employee_code
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_people_employee_code();

-- Give every employee of one company without a code the next codes, oldest joiner first.
CREATE OR REPLACE FUNCTION public._people_fill_codes(p_company uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT e.id FROM public.employees e
    WHERE e.company_id = p_company AND (e.employee_code IS NULL OR btrim(e.employee_code) = '')
    ORDER BY e.joining_date NULLS LAST, e.created_at, e.id
  LOOP
    UPDATE public.employees SET employee_code = public._people_next_code(p_company) WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public._people_fill_codes(uuid) FROM PUBLIC, anon, authenticated;

-- Showcase tenant only (other tenants assign theirs from the directory).
SELECT public._people_fill_codes('bc8defea-829f-4eeb-b210-6918e88e3019');

-- ---------------------------------------------------------------------------
-- Pay events from employee changes (any writer). Separation dates come from the
-- row; the rejoin RPC passes its date through the people.rejoin_date setting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_people_pay_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dept text;
  v_old_dept text;
  v_rejoin date := NULLIF(current_setting('people.rejoin_date', true), '')::date;
BEGIN
  SELECT d.name INTO v_dept FROM public.departments d WHERE d.id = NEW.department_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public._people_pay_event(
      NEW.company_id, NEW.id, 'joined', NEW.name || ' joins',
      format('Joins on %s as %s%s. Set a salary before the first payroll.',
             to_char(COALESCE(NEW.joining_date, current_date), 'DD Mon YYYY'), NEW.rank, COALESCE(' in ' || v_dept, '')),
      COALESCE(NEW.joining_date, current_date));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'separated' THEN
      PERFORM public._people_pay_event(
        NEW.company_id, NEW.id, 'left', NEW.name || ' leaves',
        format('Last working day %s. The final payslip pays up to and including that day.',
               to_char(COALESCE(NEW.separation_date, current_date), 'DD Mon YYYY')),
        COALESCE(NEW.separation_date, current_date));
    ELSIF NEW.status = 'active' AND OLD.status = 'separated' THEN
      PERFORM public._people_pay_event(
        NEW.company_id, NEW.id, 'rejoined', NEW.name || ' rejoins',
        format('Rejoins on %s as %s. Check the salary before the next payroll.',
               to_char(COALESCE(v_rejoin, current_date), 'DD Mon YYYY'), NEW.rank),
        COALESCE(v_rejoin, current_date));
    END IF;
  END IF;

  IF NEW.joining_date IS DISTINCT FROM OLD.joining_date AND OLD.joining_date IS NOT NULL THEN
    PERFORM public._people_pay_event(
      NEW.company_id, NEW.id, 'joining_date', NEW.name || ': joining date changed',
      format('Joining date moved from %s to %s. Check pay for the affected months.',
             to_char(OLD.joining_date, 'DD Mon YYYY'), to_char(NEW.joining_date, 'DD Mon YYYY')),
      LEAST(OLD.joining_date, NEW.joining_date));
  END IF;

  IF NEW.rank IS DISTINCT FROM OLD.rank OR NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    SELECT d.name INTO v_old_dept FROM public.departments d WHERE d.id = OLD.department_id;
    PERFORM public._people_pay_event(
      NEW.company_id, NEW.id, 'position', NEW.name || ': new position',
      format('Now %s%s (was %s%s). Review the salary if it changes with the role.',
             NEW.rank, COALESCE(' in ' || v_dept, ''), OLD.rank, COALESCE(' in ' || v_old_dept, '')),
      current_date);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_people_pay_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS people_pay_events ON public.employees;
CREATE TRIGGER people_pay_events
  AFTER INSERT OR UPDATE OF status, joining_date, rank, department_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_people_pay_events();

-- ---------------------------------------------------------------------------
-- Profile change requests: field-by-field review.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employee_update_requests
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS decisions jsonb;

ALTER TABLE public.employee_update_requests DROP CONSTRAINT IF EXISTS employee_update_requests_status_check;
ALTER TABLE public.employee_update_requests
  ADD CONSTRAINT employee_update_requests_status_check
  CHECK (status IN ('pending', 'approved', 'partially_approved', 'rejected', 'cancelled'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_update_requests_text_chk'
                 AND conrelid = 'public.employee_update_requests'::regclass) THEN
    ALTER TABLE public.employee_update_requests ADD CONSTRAINT employee_update_requests_text_chk
      CHECK ((note IS NULL OR length(note) <= 500) AND (review_note IS NULL OR length(review_note) <= 500)) NOT VALID;
    ALTER TABLE public.employee_update_requests VALIDATE CONSTRAINT employee_update_requests_text_chk;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_update_requests_employee_created
  ON public.employee_update_requests (employee_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Documents: optional expiry date.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS expires_on date;
CREATE INDEX IF NOT EXISTS idx_employee_documents_company_type ON public.employee_documents (company_id, document_type);

-- ---------------------------------------------------------------------------
-- Field validator shared by HR saves, portal requests and request reviews.
-- Returns the normalised value (NULL when blank) or raises a readable error.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._people_clean_field(p_field text, p_value text)
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v text := NULLIF(btrim(regexp_replace(COALESCE(p_value, ''), '\s+', ' ', 'g')), '');
  v_digits text;
  v_date date;
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_field
    WHEN 'cnic' THEN
      v_digits := regexp_replace(v, '\D', '', 'g');
      IF length(v_digits) <> 13 THEN
        RAISE EXCEPTION 'CNIC must have 13 digits.' USING ERRCODE = '22023';
      END IF;
      v := substr(v_digits, 1, 5) || '-' || substr(v_digits, 6, 7) || '-' || substr(v_digits, 13, 1);
    WHEN 'phone' THEN
      IF v !~ '^\+?[0-9 ()-]{7,20}$' THEN
        RAISE EXCEPTION 'Enter a valid phone number (7 to 20 digits, spaces or dashes).' USING ERRCODE = '22023';
      END IF;
    WHEN 'email' THEN
      v := lower(v);
      IF length(v) > 254 OR v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Enter a valid e-mail address.' USING ERRCODE = '22023';
      END IF;
    WHEN 'date_of_birth' THEN
      BEGIN
        v_date := v::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Enter the date of birth as YYYY-MM-DD.' USING ERRCODE = '22023';
      END;
      IF v_date < date '1930-01-01' OR v_date > (current_date - interval '14 years')::date THEN
        RAISE EXCEPTION 'The date of birth looks wrong.' USING ERRCODE = '22023';
      END IF;
      v := to_char(v_date, 'YYYY-MM-DD');
    WHEN 'gender' THEN
      v := lower(v);
      IF v NOT IN ('female', 'male', 'other') THEN
        RAISE EXCEPTION 'Choose female, male or other.' USING ERRCODE = '22023';
      END IF;
    WHEN 'bank_account_number' THEN
      v := upper(v);
      IF v !~ '^[A-Z0-9 -]{4,34}$' THEN
        RAISE EXCEPTION 'Enter a valid bank account number or IBAN.' USING ERRCODE = '22023';
      END IF;
    WHEN 'father_name', 'emergency_contact', 'bank_name', 'education' THEN
      IF length(v) > 120 THEN
        RAISE EXCEPTION '% is too long (120 characters at most).', initcap(replace(p_field, '_', ' ')) USING ERRCODE = '22023';
      END IF;
    WHEN 'address' THEN
      IF length(v) > 300 THEN
        RAISE EXCEPTION 'Address is too long (300 characters at most).' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown field %', p_field USING ERRCODE = '22023';
  END CASE;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public._people_clean_field(text, text) FROM PUBLIC, anon, authenticated;

-- Fields an employee may ask HR to change from the portal.
CREATE OR REPLACE FUNCTION public._people_request_fields()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['phone', 'email', 'date_of_birth', 'father_name', 'emergency_contact', 'address',
               'gender', 'education', 'bank_name', 'bank_account_number']
$$;
REVOKE ALL ON FUNCTION public._people_request_fields() FROM PUBLIC, anon, authenticated;
