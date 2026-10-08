-- Payroll 1/5: pay rules, payslip columns and payslip RLS.
--   * payroll_settings: one row per company with the pay rules (basic share, medical exemption,
--     yearly tax slabs, overtime suggestion rules). Finance/owner only; written by payroll_save_rules().
--   * payslips: the Finance sheet's figures (basic/allowances split, other allowances, income tax,
--     taxable salary, extra lines, other deductions), the life cycle (draft -> final -> paid) and what
--     each draft was filled from (salary_basis, other_basis, overtime_basis) so stale drafts show.
--     Rows made by the earlier payroll are kept as they are and flagged legacy (final, already seen).
--   * pay_events (created by the People module) is read here; overtime_records pricing columns are
--     created by the Leave & overtime module.
-- Depends on the foundation migrations. Idempotent; no other company's figures are changed.

-- ---------------------------------------------------------------------------
-- payroll_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_settings_rules_chk CHECK (jsonb_typeof(rules) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_payroll_settings_updated_by ON public.payroll_settings (updated_by);
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payroll_settings FROM authenticated;
GRANT SELECT ON public.payroll_settings TO authenticated;
DROP POLICY IF EXISTS payroll_settings_select ON public.payroll_settings;
CREATE POLICY payroll_settings_select ON public.payroll_settings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));

-- ---------------------------------------------------------------------------
-- payslips: one per person per month (keep the newest of Nexus' duplicate June 2026 rows)
-- ---------------------------------------------------------------------------
DELETE FROM public.payslips p
USING (
  SELECT id, row_number() OVER (PARTITION BY employee_id, month ORDER BY created_at DESC, id DESC) AS rn
  FROM public.payslips
  WHERE company_id = 'bc8defea-829f-4eeb-b210-6918e88e3019'
) d
WHERE p.id = d.id AND d.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS payslips_employee_month_uidx ON public.payslips (employee_id, month);

-- New columns. Rows that exist before this migration are the earlier payroll's: final, seen, legacy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.payslips'::regclass AND attname = 'status' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.payslips ADD COLUMN status text NOT NULL DEFAULT 'final';
    ALTER TABLE public.payslips ALTER COLUMN status SET DEFAULT 'draft';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.payslips'::regclass AND attname = 'legacy' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.payslips ADD COLUMN legacy boolean NOT NULL DEFAULT true;
    ALTER TABLE public.payslips ALTER COLUMN legacy SET DEFAULT false;
  END IF;
END $$;

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS allowances numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_basis numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS income_tax numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_income numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS other_deductions numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS salary_basis numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_basis numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_method text NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS paid_on date,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_leave_days numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absent_days numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_days integer,
  ADD COLUMN IF NOT EXISTS month_days integer,
  ADD COLUMN IF NOT EXISTS notes_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Columns the earlier payroll required; new drafts fill what they need.
ALTER TABLE public.payslips ALTER COLUMN basic_salary SET DEFAULT 0;
ALTER TABLE public.payslips ALTER COLUMN daily_rate SET DEFAULT 0;
ALTER TABLE public.payslips ALTER COLUMN days_worked SET DEFAULT 0;
ALTER TABLE public.payslips ALTER COLUMN gross_salary SET DEFAULT 0;
ALTER TABLE public.payslips ALTER COLUMN net_salary SET DEFAULT 0;

-- Earlier payslips were shown to employees already: published and seen, nothing new for them.
UPDATE public.payslips
SET published_at = created_at, seen_at = created_at, other_deductions = total_deductions
WHERE legacy AND published_at IS NULL;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('payslips_status_chk', 'CHECK (status IN (''draft'', ''final'', ''paid''))'),
      ('payslips_pay_method_chk', 'CHECK (pay_method IN (''bank'', ''cash''))'),
      ('payslips_paid_on_chk', 'CHECK (status <> ''paid'' OR paid_on IS NOT NULL)'),
      ('payslips_lines_chk', 'CHECK (CASE WHEN jsonb_typeof(lines) = ''array'' THEN jsonb_array_length(lines) <= 6 ELSE false END)'),
      ('payslips_month_first_chk', 'CHECK (month = date_trunc(''month'', month::timestamp)::date)'),
      ('payslips_new_figures_chk', 'CHECK (allowances >= 0 AND other_allowances >= 0 AND income_tax >= 0 AND taxable_income >= 0 AND other_deductions >= 0 AND overtime_basis >= 0 AND salary_basis >= 0 AND other_basis >= 0)'),
      ('payslips_notes_len_chk', 'CHECK (notes IS NULL OR char_length(notes) <= 600)')
    ) AS v(name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name AND conrelid = 'public.payslips'::regclass) THEN
      EXECUTE format('ALTER TABLE public.payslips ADD CONSTRAINT %I %s NOT VALID', c.name, c.def);
      EXECUTE format('ALTER TABLE public.payslips VALIDATE CONSTRAINT %I', c.name);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_payslips_company_month ON public.payslips (company_id, month);
CREATE INDEX IF NOT EXISTS idx_payslips_company_status ON public.payslips (company_id, status, month);
CREATE INDEX IF NOT EXISTS idx_payslips_employee_unseen ON public.payslips (employee_id) WHERE status IN ('final', 'paid') AND seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payslips_generated_by ON public.payslips (generated_by);

DROP TRIGGER IF EXISTS set_updated_at ON public.payslips;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Payslips are written only by the payroll_* RPCs (they keep totals, overtime claims, the life cycle
-- and the employee's notifications in step). Finance/owner read them directly.
DROP POLICY IF EXISTS payslips_insert ON public.payslips;
DROP POLICY IF EXISTS payslips_update ON public.payslips;
DROP POLICY IF EXISTS payslips_delete ON public.payslips;
DROP POLICY IF EXISTS payslips_select ON public.payslips;
CREATE POLICY payslips_select ON public.payslips FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
REVOKE ALL ON public.payslips FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payslips FROM authenticated;
GRANT SELECT ON public.payslips TO authenticated;

-- ---------------------------------------------------------------------------
-- pay_events (table owned by the People module migration; payroll adds the leave kinds and indexes)
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
ALTER TABLE public.pay_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pay_events_company_created ON public.pay_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pay_events_employee ON public.pay_events (employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_events_company_open ON public.pay_events (company_id) WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pay_events_created_by ON public.pay_events (created_by);
CREATE INDEX IF NOT EXISTS idx_pay_events_done_by ON public.pay_events (done_by);
REVOKE ALL ON public.pay_events FROM anon;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pay_events' AND cmd = 'SELECT') THEN
    CREATE POLICY pay_events_select ON public.pay_events FOR SELECT TO authenticated
      USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
  END IF;
END $$;
