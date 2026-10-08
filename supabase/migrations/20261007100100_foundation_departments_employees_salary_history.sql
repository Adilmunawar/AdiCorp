-- Foundation 2/7: employee trigger fixes, departments, new employee columns,
-- salary_history (finance-only pay source of truth) and current_salary().
-- Idempotent. Existing rows stay valid.

-- ---------------------------------------------------------------------------
-- Conflicting working-day triggers (must run before any bulk employee UPDATE)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_set_employee_working_days ON public.employees;
DROP FUNCTION IF EXISTS public.set_employee_working_days();

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS check_working_days;
ALTER TABLE public.employees
  ADD CONSTRAINT check_working_days CHECK (working_days_per_week BETWEEN 1 AND 7);

CREATE OR REPLACE FUNCTION public.calculate_employee_salary_divisor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_sat boolean;
  v_sun boolean;
  v_days integer;
BEGIN
  SELECT COALESCE(NEW.weekend_saturday, s.weekend_saturday, false),
         COALESCE(NEW.weekend_sunday, s.weekend_sunday, true)
    INTO v_sat, v_sun
  FROM (SELECT 1) AS one
  LEFT JOIN public.company_working_settings s ON s.company_id = NEW.company_id;

  v_days := 7 - (CASE WHEN v_sat THEN 1 ELSE 0 END) - (CASE WHEN v_sun THEN 1 ELSE 0 END);
  NEW.working_days_per_week := v_days;
  NEW.salary_divisor := CASE WHEN v_days <= 5 THEN 22 WHEN v_days = 6 THEN 26 ELSE 30 END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_employee_salary_divisor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calculate_salary_divisor_trigger ON public.employees;
CREATE TRIGGER calculate_salary_divisor_trigger
  BEFORE INSERT OR UPDATE OF weekend_saturday, weekend_sunday, company_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.calculate_employee_salary_divisor();

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CONSTRAINT departments_name_chk CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_company_lower_name_uidx
  ON public.departments (company_id, lower(name));
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select ON public.departments;
DROP POLICY IF EXISTS departments_insert ON public.departments;
DROP POLICY IF EXISTS departments_update ON public.departments;
DROP POLICY IF EXISTS departments_delete ON public.departments;
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));
CREATE POLICY departments_insert ON public.departments FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY departments_update ON public.departments FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()))
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY departments_delete ON public.departments FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- ---------------------------------------------------------------------------
-- New employee columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS separation_date date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Pay no longer lives on employees: new rows need no wage_rate.
ALTER TABLE public.employees ALTER COLUMN wage_rate SET DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_code_uidx
  ON public.employees (company_id, employee_code) WHERE employee_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees (department_id);
-- CNIC unique per company (digits only); 0 duplicates exist today. Also serves portal login lookups.
CREATE UNIQUE INDEX IF NOT EXISTS employees_cnic_company_uidx
  ON public.employees ((regexp_replace(cnic, '\D', '', 'g')), company_id)
  WHERE cnic IS NOT NULL AND btrim(cnic) <> '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_separation_after_joining_chk' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_separation_after_joining_chk
      CHECK (separation_date IS NULL OR joining_date IS NULL OR separation_date >= joining_date) NOT VALID;
    ALTER TABLE public.employees VALIDATE CONSTRAINT employees_separation_after_joining_chk;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- salary_history (finance/owner only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  monthly_salary numeric(14, 2) NOT NULL CONSTRAINT salary_history_salary_chk CHECK (monthly_salary >= 0),
  other_allowance numeric(14, 2) NOT NULL DEFAULT 0 CONSTRAINT salary_history_allowance_chk CHECK (other_allowance >= 0),
  pay_method text NOT NULL DEFAULT 'bank' CONSTRAINT salary_history_pay_method_chk CHECK (pay_method IN ('bank', 'cash')),
  reason text,
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_history_employee_effective_key UNIQUE (employee_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_salary_history_company_effective ON public.salary_history (company_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_salary_history_created_by ON public.salary_history (created_by);
ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;

-- company_id always follows the employee (prevents cross-tenant rows; RLS WITH CHECK then validates).
CREATE OR REPLACE FUNCTION public.tg_set_company_from_employee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT e.company_id INTO v_company FROM public.employees e WHERE e.id = NEW.employee_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Employee % not found', NEW.employee_id USING ERRCODE = '23503';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_set_company_from_employee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS salary_history_set_company ON public.salary_history;
CREATE TRIGGER salary_history_set_company
  BEFORE INSERT OR UPDATE OF employee_id, company_id ON public.salary_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_company_from_employee();

DROP POLICY IF EXISTS salary_history_select ON public.salary_history;
DROP POLICY IF EXISTS salary_history_insert ON public.salary_history;
DROP POLICY IF EXISTS salary_history_update ON public.salary_history;
DROP POLICY IF EXISTS salary_history_delete ON public.salary_history;
CREATE POLICY salary_history_select ON public.salary_history FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
CREATE POLICY salary_history_insert ON public.salary_history FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
CREATE POLICY salary_history_update ON public.salary_history FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()))
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
CREATE POLICY salary_history_delete ON public.salary_history FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));

-- Seed one opening row per existing employee from the legacy wage_rate.
INSERT INTO public.salary_history (company_id, employee_id, effective_from, monthly_salary, other_allowance, pay_method, reason, created_by)
SELECT e.company_id,
       e.id,
       COALESCE(e.joining_date, e.created_at::date),
       GREATEST(COALESCE(e.wage_rate, 0), 0),
       0,
       CASE WHEN COALESCE(btrim(e.bank_account_number), '') <> '' THEN 'bank' ELSE 'cash' END,
       'Opening salary',
       NULL
FROM public.employees e
WHERE NOT EXISTS (SELECT 1 FROM public.salary_history s WHERE s.employee_id = e.id);

-- Salary in effect today (latest effective_from <= today, else the earliest future row).
-- Finance/owner of the employee's company only; everyone else gets NULL.
CREATE OR REPLACE FUNCTION public.current_salary(employee uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.monthly_salary
  FROM public.salary_history s
  WHERE s.employee_id = current_salary.employee
    AND s.company_id = public.auth_company_id()
    AND public.auth_is_finance()
  ORDER BY (s.effective_from <= current_date) DESC,
           CASE WHEN s.effective_from <= current_date THEN s.effective_from END DESC NULLS LAST,
           s.effective_from ASC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_salary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_salary(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Employee write guards: department must be in the same company; only
-- Finance/owner may touch the legacy wage_rate (HR never handles money).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_employees_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.department_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.department_id IS DISTINCT FROM OLD.department_id OR NEW.company_id IS DISTINCT FROM OLD.company_id)
     AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = NEW.department_id AND d.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Department does not belong to this company' USING ERRCODE = '23503';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.auth_is_finance() THEN
    IF (TG_OP = 'INSERT' AND COALESCE(NEW.wage_rate, 0) <> 0)
       OR (TG_OP = 'UPDATE' AND NEW.wage_rate IS DISTINCT FROM OLD.wage_rate) THEN
      RAISE EXCEPTION 'Only Finance can change pay' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_employees_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_guard ON public.employees;
CREATE TRIGGER employees_guard
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_employees_guard();

-- Legacy writers that still set wage_rate keep salary_history in step.
CREATE OR REPLACE FUNCTION public.tg_employees_legacy_wage_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_method text := CASE WHEN COALESCE(btrim(NEW.bank_account_number), '') <> '' THEN 'bank' ELSE 'cash' END;
BEGIN
  IF COALESCE(NEW.wage_rate, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.salary_history (company_id, employee_id, effective_from, monthly_salary, pay_method, reason)
    VALUES (NEW.company_id, NEW.id, COALESCE(NEW.joining_date, current_date), NEW.wage_rate, v_method, 'Opening salary')
    ON CONFLICT (employee_id, effective_from) DO NOTHING;
  ELSIF NEW.wage_rate IS DISTINCT FROM OLD.wage_rate THEN
    INSERT INTO public.salary_history (company_id, employee_id, effective_from, monthly_salary, pay_method, reason)
    VALUES (NEW.company_id, NEW.id,
            GREATEST(date_trunc('month', current_date)::date, COALESCE(NEW.joining_date, date_trunc('month', current_date)::date)),
            NEW.wage_rate, v_method, 'Salary updated')
    ON CONFLICT (employee_id, effective_from) DO UPDATE SET monthly_salary = EXCLUDED.monthly_salary;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_employees_legacy_wage_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_legacy_wage_sync ON public.employees;
CREATE TRIGGER employees_legacy_wage_sync
  AFTER INSERT OR UPDATE OF wage_rate ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_employees_legacy_wage_sync();

-- Showcase tenant: pay now lives only in salary_history, so the legacy column
-- (readable by every staff role) no longer exposes salaries to HR.
UPDATE public.employees
SET wage_rate = 0
WHERE company_id = 'bc8defea-829f-4eeb-b210-6918e88e3019'
  AND wage_rate <> 0
  AND EXISTS (SELECT 1 FROM public.salary_history s WHERE s.employee_id = employees.id);
