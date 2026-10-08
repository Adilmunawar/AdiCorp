-- Leave & overtime module (2/5): schema.
--   * leave_settings: per-company switch for "leave needs HR approval".
--   * leave_requests.requested_by: the staff member who filed on someone's behalf (NULL = the employee, from the portal).
--   * attendance.leave_request_id: the approved request that wrote a 'leave' row, so undo removes exactly those rows.
--   * leave_balances.total_days becomes an optional per-person allocation override for a year.
--   * overtime_records: claimed_hours (the employee's original claim), pay_status (Finance's stage), payslip link,
--     pricing audit. HR never reads the table directly any more: money columns are Finance/owner only, HR goes
--     through the hours-only RPCs (overtime_hours_list etc.).
-- Requires the foundation migrations (auth_* helpers, notifications, activity log).

-- ---------------------------------------------------------------------------
-- leave_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  requires_approval boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_settings_updated_by ON public.leave_settings (updated_by);
ALTER TABLE public.leave_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_settings_select ON public.leave_settings;
CREATE POLICY leave_settings_select ON public.leave_settings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));
-- Writes only through leave_settings_save().
REVOKE ALL ON public.leave_settings FROM anon;
GRANT SELECT ON public.leave_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- leave_requests: who filed it
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.leave_requests'::regclass AND attname = 'requested_by' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.leave_requests
      ADD COLUMN requested_by uuid CONSTRAINT leave_requests_requested_by_fkey REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_leave_requests_requested_by ON public.leave_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_start ON public.leave_requests (employee_id, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type ON public.leave_requests (leave_type_id);

-- The legacy trigger kept leave_balances.used_days in step on status changes. Used days are now always
-- computed from approved requests, and the trigger could push used_days below zero on an undo.
DROP TRIGGER IF EXISTS on_leave_request_status_change ON public.leave_requests;
DROP FUNCTION IF EXISTS public.update_leave_balance_on_approval();

-- Leave decisions go through the leave_request_* RPCs only (they keep attendance in step).
DROP POLICY IF EXISTS leave_requests_insert ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_update ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_delete ON public.leave_requests;

-- ---------------------------------------------------------------------------
-- attendance: rows written by an approved leave request
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.attendance'::regclass AND attname = 'leave_request_id' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.attendance
      ADD COLUMN leave_request_id uuid CONSTRAINT attendance_leave_request_id_fkey REFERENCES public.leave_requests(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_attendance_leave_request ON public.attendance (leave_request_id) WHERE leave_request_id IS NOT NULL;
-- Same definitions as the time module (no-ops when it ran first): leave rows are written with
-- source 'leave' and the note "Approved leave", read-only on the register.
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS marked_by uuid;

-- Existing approved leave already marked in attendance: link those rows so an undo cleans them up too.
UPDATE public.attendance a
SET leave_request_id = r.id, source = 'leave', note = COALESCE(a.note, 'Approved leave')
FROM public.leave_requests r
WHERE r.status = 'approved'
  AND a.employee_id = r.employee_id
  AND a.date BETWEEN r.start_date AND r.end_date
  AND a.status = 'leave'
  AND a.leave_request_id IS NULL;

-- ---------------------------------------------------------------------------
-- leave_types / leave_balances: writes only through RPCs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS leave_types_insert ON public.leave_types;
DROP POLICY IF EXISTS leave_types_update ON public.leave_types;
DROP POLICY IF EXISTS leave_types_delete ON public.leave_types;
DROP POLICY IF EXISTS leave_balances_insert ON public.leave_balances;
DROP POLICY IF EXISTS leave_balances_update ON public.leave_balances;
DROP POLICY IF EXISTS leave_balances_delete ON public.leave_balances;

-- ---------------------------------------------------------------------------
-- overtime_records: hours side vs Finance side
-- ---------------------------------------------------------------------------
ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS claimed_hours numeric;
ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS pay_status text NOT NULL DEFAULT 'unpriced';
ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS priced_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.overtime_records'::regclass AND attname = 'payslip_id' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.overtime_records
      ADD COLUMN payslip_id uuid CONSTRAINT overtime_records_payslip_id_fkey REFERENCES public.payslips(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.overtime_records'::regclass AND attname = 'priced_by' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.overtime_records
      ADD COLUMN priced_by uuid CONSTRAINT overtime_records_priced_by_fkey REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'overtime_records_pay_status_chk' AND conrelid = 'public.overtime_records'::regclass) THEN
    ALTER TABLE public.overtime_records
      ADD CONSTRAINT overtime_records_pay_status_chk CHECK (pay_status IN ('unpriced', 'priced', 'no_pay'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'overtime_records_claimed_hours_chk' AND conrelid = 'public.overtime_records'::regclass) THEN
    ALTER TABLE public.overtime_records
      ADD CONSTRAINT overtime_records_claimed_hours_chk CHECK (claimed_hours IS NULL OR (claimed_hours > 0 AND claimed_hours <= 24));
  END IF;
END $$;

ALTER TABLE public.overtime_records ALTER COLUMN hourly_rate SET DEFAULT 0;
ALTER TABLE public.overtime_records ALTER COLUMN multiplier SET DEFAULT 1;
ALTER TABLE public.overtime_records ALTER COLUMN total_amount SET DEFAULT 0;

-- Legacy approved entries that already carry an amount were priced by the old flow.
UPDATE public.overtime_records
SET pay_status = 'priced'
WHERE status = 'approved' AND total_amount > 0 AND pay_status = 'unpriced' AND priced_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_overtime_records_payslip ON public.overtime_records (payslip_id);
CREATE INDEX IF NOT EXISTS idx_overtime_records_priced_by ON public.overtime_records (priced_by);
CREATE INDEX IF NOT EXISTS idx_overtime_records_employee_date ON public.overtime_records (employee_id, date);
CREATE INDEX IF NOT EXISTS idx_overtime_records_company_pay ON public.overtime_records (company_id, pay_status) WHERE status = 'approved';

-- Money columns are Finance/owner only: the table itself is Finance's. HR reads and writes hours through RPCs.
DROP POLICY IF EXISTS overtime_records_select ON public.overtime_records;
DROP POLICY IF EXISTS overtime_records_insert ON public.overtime_records;
DROP POLICY IF EXISTS overtime_records_update ON public.overtime_records;
DROP POLICY IF EXISTS overtime_records_delete ON public.overtime_records;
CREATE POLICY overtime_records_select ON public.overtime_records FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
CREATE POLICY overtime_records_insert ON public.overtime_records FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
CREATE POLICY overtime_records_update ON public.overtime_records FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()))
  WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));
CREATE POLICY overtime_records_delete ON public.overtime_records FOR DELETE TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_finance()));

-- Defence in depth for definer RPCs running as an HR user: non-Finance callers never set money, they can
-- only clear Finance's figures (an undo or rejection sends the entry back to Finance as unpriced).
CREATE OR REPLACE FUNCTION public.tg_overtime_money_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.auth_is_finance() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.hourly_rate := 0;
      NEW.multiplier := 1;
      NEW.total_amount := 0;
      NEW.pay_status := 'unpriced';
      NEW.payslip_id := NULL;
      NEW.priced_by := NULL;
      NEW.priced_at := NULL;
    ELSIF NEW.pay_status = 'unpriced' AND NEW.payslip_id IS NULL
          AND NEW.hourly_rate = 0 AND NEW.total_amount = 0 THEN
      NEW.multiplier := 1;
      NEW.priced_by := NULL;
      NEW.priced_at := NULL;
    ELSE
      NEW.hourly_rate := OLD.hourly_rate;
      NEW.multiplier := OLD.multiplier;
      NEW.total_amount := OLD.total_amount;
      NEW.pay_status := OLD.pay_status;
      NEW.payslip_id := OLD.payslip_id;
      NEW.priced_by := OLD.priced_by;
      NEW.priced_at := OLD.priced_at;
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
