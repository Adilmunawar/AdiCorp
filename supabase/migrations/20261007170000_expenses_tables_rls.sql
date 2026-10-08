-- Courses & expenses 1/3: tables, indexes, RLS and grants.
--
-- What the company spends on its people and tools beyond salaries. An employee
-- asks from the portal (a course, a subscription, equipment, travel, or paying
-- them back); HR approves or rejects; approved items go to Finance, who pays
-- (one payment, or one per renewal for a subscription) or declines. Finance can
-- also record spending itself, for one employee or for the whole company.
--
-- Visibility:
--   Finance/owner : everything (expenses, payments, every file).
--   HR            : only employee requests (source = 'request'), never payments,
--                   receipts or Finance's own entries.
--   Employee      : their own items in full, through portal_* RPCs only.
-- Every write goes through SECURITY DEFINER RPCs (next migrations), so clients
-- get SELECT only.

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL = a company-wide item (Finance entries only).
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('course', 'subscription', 'equipment', 'travel', 'other')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  provider text NOT NULL DEFAULT '' CHECK (char_length(provider) <= 80),
  link text NOT NULL DEFAULT '' CHECK (char_length(link) <= 300),
  -- The quoted cost per billing cycle, in `currency`.
  amount numeric(14, 2) NOT NULL CHECK (amount > 0 AND amount < 100000000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  billing text NOT NULL DEFAULT 'once' CHECK (billing IN ('once', 'monthly', 'yearly')),
  purpose text NOT NULL DEFAULT '' CHECK (char_length(purpose) <= 1500),
  benefit text NOT NULL DEFAULT '' CHECK (char_length(benefit) <= 1500),
  start_date date,
  end_date date,
  -- The employee paid it themselves and asks to be paid back.
  reimburse boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('request', 'finance')),
  status text NOT NULL CHECK (status IN ('pending', 'rejected', 'withdrawn', 'approved', 'declined', 'paid', 'active', 'ended')),
  hr_by uuid,
  hr_by_name text,
  hr_at timestamptz,
  hr_note text NOT NULL DEFAULT '' CHECK (char_length(hr_note) <= 500),
  finance_by uuid,
  finance_by_name text,
  finance_at timestamptz,
  finance_note text NOT NULL DEFAULT '' CHECK (char_length(finance_note) <= 500),
  -- A running subscription's next renewal (start + cycle x payments, never drifting).
  renews_on date,
  ended_on date,
  -- Not money: lets HR follow progress without reading expense_payments.
  payments_count integer NOT NULL DEFAULT 0 CHECK (payments_count >= 0),
  last_paid_on date,
  completed_at timestamptz,
  outcome text NOT NULL DEFAULT '' CHECK (char_length(outcome) <= 1500),
  -- Staff author of a Finance entry; employee requests keep the employee's name here.
  requested_by uuid,
  requested_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_dates_chk CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT expenses_billing_chk CHECK ((category = 'subscription') = (billing <> 'once')),
  CONSTRAINT expenses_request_employee_chk CHECK (source = 'finance' OR employee_id IS NOT NULL),
  CONSTRAINT expenses_reimburse_chk CHECK (NOT reimburse OR employee_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_expenses_company_created ON public.expenses (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_company_status ON public.expenses (company_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_employee_created ON public.expenses (employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  -- Always in the company currency: what actually left the bank.
  amount numeric(14, 2) NOT NULL CHECK (amount > 0 AND amount < 100000000),
  paid_on date NOT NULL CHECK (paid_on >= DATE '2000-01-01'),
  method text NOT NULL CHECK (method IN ('bank', 'card', 'cash', 'reimbursed')),
  reference text NOT NULL DEFAULT '' CHECK (char_length(reference) <= 80),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_payments_expense ON public.expense_payments (expense_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_payments_company_paid ON public.expense_payments (company_id, paid_on DESC);

CREATE TABLE IF NOT EXISTS public.expense_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  -- Set for a receipt that belongs to one payment (removed with it).
  payment_id uuid REFERENCES public.expense_payments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('quote', 'receipt', 'certificate')),
  -- Object name in the private 'expense-files' bucket: <company>/<kind>/<employee|company>/<file>.
  storage_path text NOT NULL UNIQUE CHECK (char_length(storage_path) <= 500),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL DEFAULT '' CHECK (char_length(mime_type) <= 120),
  file_size bigint NOT NULL DEFAULT 0 CHECK (file_size >= 0 AND file_size <= 8388608),
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_files_expense ON public.expense_files (expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_files_payment ON public.expense_files (payment_id);
CREATE INDEX IF NOT EXISTS idx_expense_files_company_created ON public.expense_files (company_id, created_at DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.auth_company_id())
  AND ((SELECT public.auth_is_finance()) OR ((SELECT public.auth_is_hr()) AND source = 'request'))
);

DROP POLICY IF EXISTS expense_payments_select ON public.expense_payments;
CREATE POLICY expense_payments_select ON public.expense_payments FOR SELECT TO authenticated
USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));

DROP POLICY IF EXISTS expense_files_select ON public.expense_files;
CREATE POLICY expense_files_select ON public.expense_files FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.auth_company_id())
  AND (
    (SELECT public.auth_is_finance())
    OR (
      (SELECT public.auth_is_hr())
      AND kind IN ('quote', 'certificate')
      AND payment_id IS NULL
      AND EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = expense_files.expense_id AND x.source = 'request')
    )
  )
);

REVOKE ALL ON public.expenses, public.expense_payments, public.expense_files FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.expenses, public.expense_payments, public.expense_files FROM authenticated;
GRANT SELECT ON public.expenses, public.expense_payments, public.expense_files TO authenticated;
GRANT ALL ON public.expenses, public.expense_payments, public.expense_files TO service_role;
