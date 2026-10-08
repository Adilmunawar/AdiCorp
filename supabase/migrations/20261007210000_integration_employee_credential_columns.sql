-- Integration: staff clients can never read or write employee portal credentials.
--
-- employees.password (legacy, emptied by the foundation) and employees.password_hash (bcrypt) are
-- only ever touched by SECURITY DEFINER functions (employee_login, portal_change_password,
-- people_save_employee, the hashing trigger). RLS works per row, so the columns are protected with
-- column privileges instead: table-wide SELECT / INSERT / UPDATE are revoked from the client roles and
-- granted back on every other column. The frontend always selects explicit column lists.
--
-- Superseded by 20261008100000_security_review_fixes.sql, which also keeps SELECT on the legacy
-- wage_rate column closed. Re-run THAT file (not this one) after a migration adds employee columns:
-- re-running this one would give clients read access to wage_rate again.

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
  INTO v_cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.employees'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname NOT IN ('password', 'password_hash');

  REVOKE SELECT, INSERT, UPDATE ON public.employees FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.employees TO authenticated', v_cols);
  EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON public.employees TO authenticated', v_cols, v_cols);
END $$;
