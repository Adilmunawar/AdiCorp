-- Platform 4/4: server-side JSON backups (HR-safe and owner full) and the access summary.
--
-- A backup is generated table by table: platform_backup_start(scope) logs the export and returns
-- the manifest (tables, row counts, what was left out); platform_backup_table(scope, table, offset,
-- limit) then streams each table as a jsonb array page. Every company-scoped table in public is
-- covered automatically, including tables added later by other modules.
--
-- Always left out: session/login tables, notifications, and any column that looks like a secret
-- (password, token, secret, hash, otp, api key).
-- HR-safe scope (owner or HR) also leaves out every pay table (including the expenses tables, mostly
-- Finance-only under RLS), every money-like or pay-status column, and the payroll.* timeline entries.

-- Internal: tables and excluded columns for a scope. p_scope is 'hr' or 'full'.
CREATE OR REPLACE FUNCTION public._platform_backup_tables(p_scope text)
RETURNS TABLE (table_name text, excluded_columns text[], pk_columns text[])
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH t AS (
    SELECT c.oid, c.relname::text AS name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'company_id' AND a.attnum > 0 AND NOT a.attisdropped
      )
      AND c.relname NOT IN ('employee_sessions', 'portal_login_attempts', 'notifications')
      AND c.relname !~ '(session|login_attempt|push_subscription)'
      AND (
        p_scope = 'full'
        OR (
          c.relname !~ '(^|_)(pay|payroll|payslips?|salary|salaries|tax|taxes|payments?|receipts?|reimbursements?|bank_transfers?|expenses?)(_|$)'
          AND c.relname NOT IN ('salary_history', 'payslips', 'overtime_config', 'tier_config', 'pay_events', 'pay_rules')
        )
      )
  )
  SELECT t.name,
         COALESCE((
           SELECT array_agg(a.attname::text ORDER BY a.attnum)
           FROM pg_catalog.pg_attribute a
           WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
             AND (
               a.attname ~* '(password|token|secret|_hash$|^hash$|otp|api_key)'
               OR (p_scope <> 'full' AND a.attname ~* '(salary|wage|amount|hourly_rate|multiplier|allowance|deduction|gross|net_pay|net_salary|bonus|earning|pay_rate|price|cost|^pay_|^priced_|payslip)')
             )
         ), '{}'::text[]),
         COALESCE((
           SELECT array_agg(a.attname::text ORDER BY array_position(i.indkey::int2[], a.attnum))
           FROM pg_catalog.pg_index i
           JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
           WHERE i.indrelid = t.oid AND i.indisprimary
         ), '{}'::text[])
  FROM t
  ORDER BY t.name
$$;
REVOKE ALL ON FUNCTION public._platform_backup_tables(text) FROM PUBLIC, anon, authenticated;

-- Internal: the caller's role allows this scope.
CREATE OR REPLACE FUNCTION public._platform_backup_assert(p_scope text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_scope = 'full' THEN
    RETURN public._platform_assert(ARRAY['owner']);
  ELSIF p_scope = 'hr' THEN
    RETURN public._platform_assert(ARRAY['owner', 'hr']);
  END IF;
  RAISE EXCEPTION 'Unknown backup type' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public._platform_backup_assert(text) FROM PUBLIC, anon, authenticated;

-- Internal: row count of one company table under a scope.
CREATE OR REPLACE FUNCTION public._platform_backup_count(p_company uuid, p_scope text, p_table text)
RETURNS bigint
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_n bigint;
BEGIN
  IF p_table = 'activity_logs' AND p_scope <> 'full' THEN
    EXECUTE 'SELECT count(*) FROM public.activity_logs WHERE company_id = $1 AND action_type NOT LIKE ''payroll.%''' INTO v_n USING p_company;
  ELSE
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = $1', p_table) INTO v_n USING p_company;
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public._platform_backup_count(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Data overview for Settings: table row counts for the caller's scope (owner: full, HR: hr). No logging.
CREATE OR REPLACE FUNCTION public.platform_data_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr']);
  v_scope text := CASE WHEN public.auth_role() = 'owner' THEN 'full' ELSE 'hr' END;
BEGIN
  RETURN jsonb_build_object(
    'scope', v_scope,
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.table_name, 'rows', public._platform_backup_count(v_company, v_scope, t.table_name)) ORDER BY t.table_name)
      FROM public._platform_backup_tables(v_scope) t
    ), '[]'::jsonb),
    'last_backup', (
      SELECT jsonb_build_object('at', l.created_at, 'by', public._platform_person(l.user_id), 'action', l.action_type)
      FROM public.activity_logs l
      WHERE l.company_id = v_company AND l.action_type IN ('settings.backup', 'settings.full_backup')
        AND (v_scope = 'full' OR l.action_type = 'settings.backup')
      ORDER BY l.created_at DESC
      LIMIT 1
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_data_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_data_overview() TO authenticated;

-- Start a backup: rate limit, log it, notify owners (full), return the manifest.
CREATE OR REPLACE FUNCTION public.platform_backup_start(p_scope text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_backup_assert(p_scope);
  v_action text := CASE WHEN p_scope = 'full' THEN 'settings.full_backup' ELSE 'settings.backup' END;
  v_recent integer;
  v_tables jsonb;
  v_company_row jsonb;
  v_actor text := public._platform_person(auth.uid());
BEGIN
  SELECT count(*) INTO v_recent
  FROM public.activity_logs l
  WHERE l.company_id = v_company AND l.user_id = auth.uid() AND l.action_type = v_action
    AND l.created_at > now() - interval '1 hour';
  IF v_recent >= (CASE WHEN p_scope = 'full' THEN 5 ELSE 10 END) THEN
    RAISE EXCEPTION 'Too many backups in the last hour. Try again later.' USING ERRCODE = '54000';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', t.table_name,
           'rows', public._platform_backup_count(v_company, p_scope, t.table_name),
           'excluded_columns', to_jsonb(t.excluded_columns)
         ) ORDER BY t.table_name), '[]'::jsonb)
  INTO v_tables
  FROM public._platform_backup_tables(p_scope) t;

  SELECT to_jsonb(c) - CASE WHEN p_scope = 'full' THEN '{}'::text[] ELSE ARRAY['tax_id'] END
  INTO v_company_row
  FROM public.companies c WHERE c.id = v_company;

  PERFORM public.log_activity(
    v_action,
    CASE WHEN p_scope = 'full' THEN 'Downloaded a full company backup' ELSE 'Downloaded the HR backup (no pay data)' END,
    jsonb_build_object('tables', jsonb_array_length(v_tables))
  );

  IF p_scope = 'full' THEN
    PERFORM public.notify_roles(
      v_company, ARRAY['owner'], 'security.backup',
      'Full backup downloaded',
      COALESCE(v_actor, 'An owner') || ' downloaded a full backup, including pay data.',
      '/timeline?area=settings'
    );
  END IF;

  RETURN jsonb_build_object(
    'format', 'adicorp-backup',
    'version', 1,
    'scope', p_scope,
    'generated_at', now(),
    'generated_by', v_actor,
    'company', v_company_row,
    'tables', v_tables,
    'left_out', CASE WHEN p_scope = 'full'
      THEN jsonb_build_array('Sessions, login attempts and notifications', 'Passwords, password hashes and tokens', 'Uploaded files (download them from each module)')
      ELSE jsonb_build_array('Sessions, login attempts and notifications', 'Passwords, password hashes and tokens',
                             'Every pay table (salaries, payslips, pay rules, payments, receipts, expenses)',
                             'Money columns (rates, amounts, allowances, deductions)', 'Payroll timeline entries',
                             'Uploaded files (download them from each module)')
    END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_backup_start(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_backup_start(text) TO authenticated;

-- One page of one table (default 1000 rows, max 2000), ordered by primary key.
-- Requires a backup of the same scope started by this user in the last 30 minutes.
CREATE OR REPLACE FUNCTION public.platform_backup_table(p_scope text, p_table text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_backup_assert(p_scope);
  v_def record;
  v_order text;
  v_where text := '';
  v_rows jsonb;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 2000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_logs l
    WHERE l.company_id = v_company AND l.user_id = auth.uid()
      AND l.action_type = CASE WHEN p_scope = 'full' THEN 'settings.full_backup' ELSE 'settings.backup' END
      AND l.created_at > now() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'Start the backup again' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_def FROM public._platform_backup_tables(p_scope) t WHERE t.table_name = p_table;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That table is not part of this backup' USING ERRCODE = '42501';
  END IF;

  v_order := CASE WHEN cardinality(v_def.pk_columns) > 0
    THEN (SELECT string_agg(format('%I', c), ', ') FROM unnest(v_def.pk_columns) AS c)
    ELSE 'ctid' END;
  IF p_table = 'activity_logs' AND p_scope <> 'full' THEN
    v_where := ' AND action_type NOT LIKE ''payroll.%''';
  END IF;

  IF p_table = 'activity_logs' AND p_scope <> 'full' THEN
    -- Older entries may carry pay values in their details: strip them for the HR copy.
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(jsonb_set(to_jsonb(t) - $2, ''{details}'', COALESCE(public._platform_strip_money(t.details), ''{}''::jsonb))), ''[]''::jsonb) FROM (SELECT * FROM public.activity_logs WHERE company_id = $1%s ORDER BY %s LIMIT $3 OFFSET $4) t',
      v_where, v_order
    )
    INTO v_rows
    USING v_company, v_def.excluded_columns, v_limit, v_offset;
  ELSE
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t) - $2), ''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE company_id = $1%s ORDER BY %s LIMIT $3 OFFSET $4) t',
      p_table, v_where, v_order
    )
    INTO v_rows
    USING v_company, v_def.excluded_columns, v_limit, v_offset;
  END IF;

  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_backup_table(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_backup_table(text, text, integer, integer) TO authenticated;

-- Owner: who can get in. Staff by role plus employee portal access.
CREATE OR REPLACE FUNCTION public.platform_access_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner']);
BEGIN
  RETURN jsonb_build_object(
    'staff', jsonb_build_object(
      'owner', (SELECT count(*) FROM public.profiles p WHERE p.company_id = v_company AND p.role = 'owner'),
      'hr', (SELECT count(*) FROM public.profiles p WHERE p.company_id = v_company AND p.role = 'hr'),
      'finance', (SELECT count(*) FROM public.profiles p WHERE p.company_id = v_company AND p.role = 'finance'),
      'no_role', (SELECT count(*) FROM public.profiles p WHERE p.company_id = v_company AND p.role IS NULL),
      'with_mfa', (
        SELECT count(DISTINCT f.user_id) FROM auth.mfa_factors f
        JOIN public.profiles p ON p.id = f.user_id
        WHERE p.company_id = v_company AND f.status = 'verified'
      )
    ),
    'portal', (
      SELECT jsonb_build_object(
        'active_employees', count(*),
        'with_password', count(*) FILTER (WHERE e.password_hash IS NOT NULL),
        'without_password', count(*) FILTER (WHERE e.password_hash IS NULL),
        'must_change_password', count(*) FILTER (WHERE e.password_hash IS NOT NULL AND e.must_change_password),
        'signed_in_7_days', (
          SELECT count(DISTINCT s.employee_id) FROM public.employee_sessions s
          WHERE s.company_id = v_company AND s.created_at > now() - interval '7 days'
        ),
        'never_signed_in', count(*) FILTER (
          WHERE e.password_hash IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.employee_sessions s WHERE s.employee_id = e.id)
        )
      )
      FROM public.employees e
      WHERE e.company_id = v_company AND e.status = 'active'
    ),
    'require_staff_mfa', COALESCE((SELECT s.require_staff_mfa FROM public.company_settings s WHERE s.company_id = v_company), false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_access_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_access_summary() TO authenticated;
