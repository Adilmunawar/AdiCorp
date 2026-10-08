-- Time module 1/4: schema for attendance, calendar, time clock and punch corrections.
-- Depends on the Foundation migrations (auth_* helpers, departments, employees.employee_code,
-- employees.separation_date, attendance.company_id + its RLS). Idempotent.

-- ---------------------------------------------------------------------------
-- Working week: Saturday rules (company level). weekend_saturday = true means Saturdays are off;
-- saturday_pattern narrows which Saturdays (all, 2nd + 4th, or 1st + 3rd + 5th), and the optional
-- window bounds when the rule applies (switching it on starts it today, so Saturdays already
-- worked stay working days).
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_working_settings
  ADD COLUMN IF NOT EXISTS saturday_pattern text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS saturday_off_from date,
  ADD COLUMN IF NOT EXISTS saturday_off_until date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_working_settings_saturday_chk') THEN
    ALTER TABLE public.company_working_settings ADD CONSTRAINT company_working_settings_saturday_chk
      CHECK (saturday_pattern IN ('all', 'alt_2_4', 'alt_1_3_5')
             AND (saturday_off_from IS NULL OR saturday_off_until IS NULL OR saturday_off_until >= saturday_off_from));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Time rules per company (shift starts, grace, hours, auto-present, threshold, month lock).
-- Written only through public.time_save_settings / time_set_lock.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  morning_start time NOT NULL DEFAULT '09:00',
  evening_start time NOT NULL DEFAULT '15:00',
  night_start time NOT NULL DEFAULT '21:00',
  hours_per_day numeric(4,2) NOT NULL DEFAULT 8,
  grace_minutes integer NOT NULL DEFAULT 15,
  auto_present boolean NOT NULL DEFAULT true,
  hours_threshold_pct integer NOT NULL DEFAULT 90,
  locked_through date,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_settings_ranges_chk CHECK (
    hours_per_day BETWEEN 1 AND 16
    AND grace_minutes BETWEEN 0 AND 180
    AND hours_threshold_pct BETWEEN 50 AND 100
    AND char_length(timezone) BETWEEN 1 AND 64
  )
);
ALTER TABLE public.time_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_settings_select ON public.time_settings;
CREATE POLICY time_settings_select ON public.time_settings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_staff()));

-- ---------------------------------------------------------------------------
-- Attendance: note, source, marker. Status adds 'weekend' and 'half_day' alongside legacy values.
-- source: manual (register), bulk (mark all), biometric (auto from punches), correction
-- (approved punch correction), leave (approved leave; read-only on the register), import.
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS marked_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_status_chk' AND conrelid = 'public.attendance'::regclass) THEN
    ALTER TABLE public.attendance DROP CONSTRAINT attendance_status_chk;
  END IF;
  ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_chk
    CHECK (status IN ('present', 'absent', 'leave', 'short_leave', 'half_day', 'late', 'holiday', 'weekend')) NOT VALID;
  ALTER TABLE public.attendance VALIDATE CONSTRAINT attendance_status_chk;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_source_chk') THEN
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_source_chk
      CHECK (source IN ('manual', 'bulk', 'biometric', 'correction', 'leave', 'import'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_note_chk') THEN
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_note_chk
      CHECK (note IS NULL OR char_length(note) <= 200);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON public.attendance (company_id, date);

-- ---------------------------------------------------------------------------
-- Events: multi-day spans (at most 60 days), author, updated_at.
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_span_chk') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_span_chk
      CHECK (end_date IS NULL OR (end_date >= date AND end_date <= date + 59)) NOT VALID;
    ALTER TABLE public.events VALIDATE CONSTRAINT events_span_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_title_chk') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_title_chk
      CHECK (char_length(btrim(title)) BETWEEN 1 AND 160) NOT VALID;
    ALTER TABLE public.events VALIDATE CONSTRAINT events_title_chk;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_company_date ON public.events (company_id, date);

-- ---------------------------------------------------------------------------
-- Time clock: devices (terminals / bridges), their secret keys, terminal-ID links, punches.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  serial text,
  location text,
  direction text NOT NULL DEFAULT 'both',
  is_active boolean NOT NULL DEFAULT true,
  key_prefix text NOT NULL,
  last_seen_at timestamptz,
  last_punch_at timestamptz,
  last_ip text,
  firmware text,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_devices_direction_chk CHECK (direction IN ('in', 'out', 'both')),
  CONSTRAINT time_devices_text_chk CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 80
    AND (serial IS NULL OR char_length(serial) <= 64)
    AND (location IS NULL OR char_length(location) <= 120)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS time_devices_company_serial_uidx
  ON public.time_devices (company_id, lower(serial)) WHERE serial IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_devices_company_name ON public.time_devices (company_id, name);
ALTER TABLE public.time_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_devices_select ON public.time_devices;
CREATE POLICY time_devices_select ON public.time_devices FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- Secret key hashes live apart from the device row so no client can ever read them.
CREATE TABLE IF NOT EXISTS public.time_device_keys (
  device_id uuid PRIMARY KEY REFERENCES public.time_devices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS time_device_keys_hash_uidx ON public.time_device_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_time_device_keys_company ON public.time_device_keys (company_id, created_at);
ALTER TABLE public.time_device_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_device_keys_select ON public.time_device_keys;
CREATE POLICY time_device_keys_select ON public.time_device_keys FOR SELECT TO authenticated USING (false);
REVOKE ALL ON public.time_device_keys FROM anon, authenticated;

-- Terminal user ID (PIN) <-> employee. One ID per employee, one employee per ID.
CREATE TABLE IF NOT EXISTS public.time_terminal_links (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  device_user_id text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  linked_by uuid,
  auto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, device_user_id),
  CONSTRAINT time_terminal_links_employee_key UNIQUE (company_id, employee_id),
  CONSTRAINT time_terminal_links_pin_chk CHECK (device_user_id ~ '^[A-Za-z0-9_.-]{1,32}$')
);
CREATE INDEX IF NOT EXISTS idx_time_terminal_links_employee ON public.time_terminal_links (employee_id);
ALTER TABLE public.time_terminal_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_terminal_links_select ON public.time_terminal_links;
CREATE POLICY time_terminal_links_select ON public.time_terminal_links FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- Punch corrections requested from the portal, reviewed by HR.
CREATE TABLE IF NOT EXISTS public.punch_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  kind text NOT NULL,
  time_in time,
  time_out time,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT punch_corrections_kind_chk CHECK (kind IN ('missed_in', 'missed_out', 'missed_both', 'wrong_time')),
  CONSTRAINT punch_corrections_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT punch_corrections_reason_chk CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  CONSTRAINT punch_corrections_note_chk CHECK (review_note IS NULL OR char_length(review_note) <= 300),
  CONSTRAINT punch_corrections_times_chk CHECK (
    (kind = 'missed_in' AND time_in IS NOT NULL)
    OR (kind = 'missed_out' AND time_out IS NOT NULL)
    OR (kind = 'missed_both' AND time_in IS NOT NULL AND time_out IS NOT NULL AND time_out > time_in)
    OR (kind = 'wrong_time' AND (time_in IS NOT NULL OR time_out IS NOT NULL))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS punch_corrections_one_pending_uidx
  ON public.punch_corrections (employee_id, date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_punch_corrections_company_status ON public.punch_corrections (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_punch_corrections_employee_date ON public.punch_corrections (employee_id, date);
ALTER TABLE public.punch_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS punch_corrections_select ON public.punch_corrections;
CREATE POLICY punch_corrections_select ON public.punch_corrections FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- Raw punches. device_ref is the device id (text) or 'CORRECTION'; resends are harmless.
CREATE TABLE IF NOT EXISTS public.time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.time_devices(id) ON DELETE SET NULL,
  device_ref text NOT NULL,
  device_user_id text NOT NULL,
  punch_at timestamptz NOT NULL,
  punch_date date NOT NULL,
  direction text NOT NULL DEFAULT 'unknown',
  verify_type text,
  source text NOT NULL DEFAULT 'live',
  correction_id uuid REFERENCES public.punch_corrections(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_punches_direction_chk CHECK (direction IN ('in', 'out', 'unknown')),
  CONSTRAINT time_punches_source_chk CHECK (source IN ('live', 'sync', 'correction', 'manual')),
  CONSTRAINT time_punches_text_chk CHECK (char_length(device_user_id) BETWEEN 1 AND 32 AND (verify_type IS NULL OR char_length(verify_type) <= 32))
);
CREATE UNIQUE INDEX IF NOT EXISTS time_punches_dedupe_uidx
  ON public.time_punches (company_id, device_ref, device_user_id, punch_at);
CREATE INDEX IF NOT EXISTS idx_time_punches_company_date ON public.time_punches (company_id, punch_date, punch_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_punches_employee_date ON public.time_punches (employee_id, punch_date);
CREATE INDEX IF NOT EXISTS idx_time_punches_company_pin ON public.time_punches (company_id, device_user_id);
CREATE INDEX IF NOT EXISTS idx_time_punches_device ON public.time_punches (device_id);
CREATE INDEX IF NOT EXISTS idx_time_punches_correction ON public.time_punches (correction_id);
ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_punches_select ON public.time_punches;
CREATE POLICY time_punches_select ON public.time_punches FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- No direct writes from clients on the new tables: every write goes through definer RPCs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.time_settings, public.time_devices, public.time_terminal_links,
  public.punch_corrections, public.time_punches FROM anon, authenticated;
REVOKE ALL ON public.time_settings, public.time_devices, public.time_terminal_links,
  public.punch_corrections, public.time_punches FROM anon;

-- Realtime: live punches feed and the corrections badge.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'time_punches') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.time_punches;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'punch_corrections') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.punch_corrections;
    END IF;
  END IF;
END $$;
