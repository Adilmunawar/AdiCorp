-- Security review fixes (2026-10-08).
--
-- 1. Working week / monthly working days: the client write policies allowed any staff role,
--    so Finance could change or delete the company working week directly through the API,
--    bypassing platform_update_settings / time_save_settings (owner + HR only). The working
--    week drives leave counting, attendance and the payroll divisor. Writes are now owner/HR.
-- 2. employees.wage_rate (legacy salary column): HR could read it through the API. Writes were
--    already Finance-only (tg_employees_guard); reads are now closed to every client role. The
--    app never selects it, and real salaries live in salary_history (Finance only).
--    This block supersedes 20261007210000: re-run THIS file after adding employee columns.
-- 3. Storage, expense-files bucket: HR could list and download every '<company>/quote/...' and
--    '<company>/certificate/...' object, including quotes attached to Finance's own entries,
--    which the expense_files table hides from HR. HR now reads only objects that back an
--    expense_files row HR may see (employee requests, no payment), plus files it uploaded.
-- 4. Storage, cvs bucket: the anonymous upload policy is no longer used (careers-apply stores
--    CVs with the service role) and let anyone upload into any company's CV folder. Dropped.
-- 5. Storage UPDATE: WITH CHECK only checked the company folder, so a row a role may update
--    could be moved into a bucket that role may not write (e.g. into expense-files receipts).
--    WITH CHECK now matches USING.
-- 6. engagement_private.config: explicit deny-all policy (RLS was on with no policy; the
--    table is only read by SECURITY DEFINER functions).
-- 7. leave_requests had two identical indexes on leave_type_id; the unused one is dropped.

-- 1 ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS company_working_settings_insert ON public.company_working_settings;
DROP POLICY IF EXISTS company_working_settings_update ON public.company_working_settings;
DROP POLICY IF EXISTS company_working_settings_delete ON public.company_working_settings;

CREATE POLICY company_working_settings_insert ON public.company_working_settings FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY company_working_settings_update ON public.company_working_settings FOR UPDATE TO authenticated
USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()))
WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY company_working_settings_delete ON public.company_working_settings FOR DELETE TO authenticated
USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

DROP POLICY IF EXISTS monthly_working_days_insert ON public.monthly_working_days;
DROP POLICY IF EXISTS monthly_working_days_update ON public.monthly_working_days;
DROP POLICY IF EXISTS monthly_working_days_delete ON public.monthly_working_days;

CREATE POLICY monthly_working_days_insert ON public.monthly_working_days FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY monthly_working_days_update ON public.monthly_working_days FOR UPDATE TO authenticated
USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()))
WITH CHECK (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
CREATE POLICY monthly_working_days_delete ON public.monthly_working_days FOR DELETE TO authenticated
USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- 2 ---------------------------------------------------------------------------------------
-- Idempotent: rebuilds the employees column privileges from the live column list.
--   SELECT          : every column except password, password_hash, wage_rate
--   INSERT / UPDATE : every column except password, password_hash (wage_rate stays writable;
--                     tg_employees_guard refuses it for anyone but Finance/owner)
DO $$
DECLARE
  v_read text;
  v_write text;
BEGIN
  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
  INTO v_read
  FROM pg_attribute a
  WHERE a.attrelid = 'public.employees'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname NOT IN ('password', 'password_hash', 'wage_rate');

  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
  INTO v_write
  FROM pg_attribute a
  WHERE a.attrelid = 'public.employees'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname NOT IN ('password', 'password_hash');

  REVOKE SELECT, INSERT, UPDATE ON public.employees FROM anon, authenticated;
  REVOKE SELECT (wage_rate) ON public.employees FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.employees TO authenticated', v_read);
  EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON public.employees TO authenticated', v_write, v_write);
END $$;

-- 3 + 5 -----------------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_objects_select ON storage.objects;
CREATE POLICY tenant_objects_select ON storage.objects FOR SELECT TO authenticated
USING (
  (bucket_id = 'logos')
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id IN ('employee-documents', 'avatars', 'company-files') AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files' AND (
            (SELECT public.auth_is_finance())
            OR (
              (SELECT public.auth_is_hr())
              AND (storage.foldername(name))[2] IN ('quote', 'certificate')
              AND (
                owner_id = (SELECT auth.uid())::text
                OR EXISTS (
                  SELECT 1
                  FROM public.expense_files f
                  JOIN public.expenses x ON x.id = f.expense_id
                  WHERE f.storage_path = objects.name
                    AND f.company_id = (SELECT public.auth_company_id())
                    AND f.kind IN ('quote', 'certificate')
                    AND f.payment_id IS NULL
                    AND x.source = 'request'
                )
              )
            )))
      OR (bucket_id = 'cvs' AND (SELECT public.auth_is_hr()))
    )
  )
);

DROP POLICY IF EXISTS tenant_objects_update ON storage.objects;
CREATE POLICY tenant_objects_update ON storage.objects FOR UPDATE TO authenticated
USING (
  (bucket_id = 'logos' AND (
     owner_id = (SELECT auth.uid())::text
     OR ((storage.foldername(name))[1] = (SELECT public.auth_company_id())::text AND (SELECT public.auth_is_owner()))))
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id IN ('employee-documents', 'cvs') AND (SELECT public.auth_is_hr()))
      OR (bucket_id IN ('avatars', 'company-files') AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files' AND (SELECT public.auth_is_finance()))
    )
  )
)
WITH CHECK (
  (bucket_id = 'logos' AND (
     owner_id = (SELECT auth.uid())::text
     OR ((storage.foldername(name))[1] = (SELECT public.auth_company_id())::text AND (SELECT public.auth_is_owner()))))
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id IN ('employee-documents', 'cvs') AND (SELECT public.auth_is_hr()))
      OR (bucket_id IN ('avatars', 'company-files') AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files' AND (SELECT public.auth_is_finance()))
    )
  )
);

-- 4 ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS public_cv_upload ON storage.objects;

-- 6 ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS config_no_client_access ON engagement_private.config;
CREATE POLICY config_no_client_access ON engagement_private.config FOR SELECT TO authenticated USING (false);

-- 7 ---------------------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_leave_requests_leave_type_id;
