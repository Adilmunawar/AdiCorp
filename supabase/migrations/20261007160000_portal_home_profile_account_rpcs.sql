-- Portal module: employee self-service home, profile change requests, avatar, sessions.
-- Depends on the foundation migrations (20261007100000..100600): _portal_employee(),
-- notify_roles(), notifications, employee_sessions, employees.password_hash etc.
-- Every RPC resolves the employee and company from the token only and returns
-- explicit column lists (never password / password_hash).

-- ---------------------------------------------------------------------------
-- Internal: activity entry written on behalf of a portal employee (no staff user).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._portal_log(
  p_employee public.employees, p_action text, p_description text, p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES (left(p_action, 100), left(COALESCE(p_description, ''), 1000),
          COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('source', 'portal'),
          NULL, p_employee.company_id, p_employee.id);
EXCEPTION WHEN OTHERS THEN
  -- Logging never breaks the action that caused it.
  NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._portal_log(public.employees, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Internal: per-employee action throttle based on the activity log.
CREATE OR REPLACE FUNCTION public._portal_throttled(p_employee uuid, p_action text, p_limit integer, p_window interval)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*) >= p_limit
  FROM public.activity_logs a
  WHERE a.employee_id = p_employee
    AND a.action_type = p_action
    AND a.created_at > now() - p_window;
$$;
REVOKE ALL ON FUNCTION public._portal_throttled(uuid, text, integer, interval) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- portal_home: everything the employee home dashboard needs, in one round trip.
-- p_today lets the browser pass its local date (the employee's own data only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_home(p_token text, p_today date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := COALESCE(p_today, (now() AT TIME ZONE 'Asia/Karachi')::date);
  v_month_start date;
  v_sat boolean;
  v_sun boolean;
  v_result json;
BEGIN
  -- Clamp a client-supplied date to a sane window around the server date.
  IF abs(v_today - current_date) > 2 THEN
    v_today := current_date;
  END IF;
  v_month_start := date_trunc('month', v_today)::date;

  SELECT COALESCE(v_emp.weekend_saturday, s.weekend_saturday, false),
         COALESCE(v_emp.weekend_sunday, s.weekend_sunday, true)
    INTO v_sat, v_sun
  FROM (SELECT 1) one
  LEFT JOIN public.company_working_settings s ON s.company_id = v_emp.company_id;

  WITH
  att AS (
    SELECT a.date, a.status, to_jsonb(a) AS j
    FROM public.attendance a
    WHERE a.employee_id = v_emp.id
      AND a.date BETWEEN v_month_start AND v_today
  ),
  holidays_in_month AS (
    SELECT DISTINCT ev.date
    FROM public.events ev
    WHERE ev.company_id = v_emp.company_id
      AND ev.date BETWEEN v_month_start AND v_today
      AND (ev.type = 'holiday' OR COALESCE(ev.affects_attendance, false))
  ),
  working_so_far AS (
    SELECT count(*)::int AS n
    FROM generate_series(v_month_start::timestamp, v_today::timestamp, interval '1 day') g(d)
    WHERE NOT (extract(isodow FROM g.d) = 6 AND v_sat)
      AND NOT (extract(isodow FROM g.d) = 7 AND v_sun)
      AND g.d::date >= COALESCE(v_emp.joining_date, v_month_start)
      AND NOT EXISTS (SELECT 1 FROM holidays_in_month h WHERE h.date = g.d::date)
  ),
  month_stats AS (
    SELECT
      count(*) FILTER (WHERE status IN ('present', 'late', 'half_day', 'short_leave', 'remote'))::int AS present,
      count(*) FILTER (WHERE status = 'absent')::int AS absent,
      count(*) FILTER (WHERE status = 'leave')::int AS on_leave,
      count(*) FILTER (WHERE status = 'short_leave')::int AS short_leave,
      count(*)::int AS recorded,
      sum(
        CASE
          WHEN (j ->> 'worked_minutes') ~ '^[0-9]+(\.[0-9]+)?$' THEN (j ->> 'worked_minutes')::numeric / 60
          WHEN (j ->> 'hours_worked') ~ '^[0-9]+(\.[0-9]+)?$' THEN (j ->> 'hours_worked')::numeric
          WHEN (j ->> 'worked_hours') ~ '^[0-9]+(\.[0-9]+)?$' THEN (j ->> 'worked_hours')::numeric
        END
      ) AS hours
    FROM att
  ),
  days AS (
    SELECT (v_today + o)::date AS d, o AS days_until
    FROM generate_series(0, 6) o
  ),
  people AS (
    SELECT e.id, e.name, e.rank, e.avatar_url, e.date_of_birth, e.joining_date,
           COALESCE(CASE WHEN (to_jsonb(e) ->> 'share_birthday') IN ('true', 'false')
                         THEN (to_jsonb(e) ->> 'share_birthday')::boolean END, true) AS share_birthday
    FROM public.employees e
    WHERE e.company_id = v_emp.company_id AND e.status = 'active'
  ),
  celebrations AS (
    SELECT p.id AS employee_id, p.name, p.rank, p.avatar_url, 'birthday'::text AS kind, NULL::int AS years,
           d.d AS on_date, d.days_until
    FROM people p
    JOIN days d ON p.date_of_birth IS NOT NULL AND (
      (extract(month FROM p.date_of_birth) = extract(month FROM d.d) AND extract(day FROM p.date_of_birth) = extract(day FROM d.d))
      OR (extract(month FROM p.date_of_birth) = 2 AND extract(day FROM p.date_of_birth) = 29
          AND extract(month FROM d.d) = 2 AND extract(day FROM d.d) = 28
          AND NOT (extract(year FROM d.d)::int % 4 = 0 AND (extract(year FROM d.d)::int % 100 <> 0 OR extract(year FROM d.d)::int % 400 = 0)))
    )
    WHERE p.share_birthday OR p.id = v_emp.id
    UNION ALL
    SELECT p.id, p.name, p.rank, p.avatar_url, 'anniversary', (extract(year FROM d.d) - extract(year FROM p.joining_date))::int,
           d.d, d.days_until
    FROM people p
    JOIN days d ON p.joining_date IS NOT NULL
      AND extract(month FROM p.joining_date) = extract(month FROM d.d)
      AND extract(day FROM p.joining_date) = extract(day FROM d.d)
      AND extract(year FROM d.d) > extract(year FROM p.joining_date)
    UNION ALL
    SELECT p.id, p.name, p.rank, p.avatar_url, 'welcome', NULL, p.joining_date, 0
    FROM people p
    WHERE p.joining_date = v_today
  )
  SELECT json_build_object(
    'today', v_today,
    'employee', json_build_object(
      'id', v_emp.id,
      'name', v_emp.name,
      'rank', v_emp.rank,
      'employee_code', v_emp.employee_code,
      'department', (SELECT dp.name FROM public.departments dp WHERE dp.id = v_emp.department_id),
      'joining_date', v_emp.joining_date,
      'avatar_url', v_emp.avatar_url
    ),
    'profile', json_build_object(
      'missing', (
        SELECT COALESCE(json_agg(f.key), '[]'::json)
        FROM (VALUES
          ('phone', v_emp.phone), ('email', v_emp.email), ('date_of_birth', v_emp.date_of_birth::text),
          ('emergency_contact', v_emp.emergency_contact), ('address', v_emp.address),
          ('bank_name', v_emp.bank_name), ('bank_account_number', v_emp.bank_account_number)
        ) AS f(key, val)
        WHERE NULLIF(btrim(COALESCE(f.val, '')), '') IS NULL
      ),
      'pending_request', EXISTS (
        SELECT 1 FROM public.employee_update_requests r
        WHERE r.employee_id = v_emp.id AND r.status = 'pending'
      )
    ),
    'attendance_today', (
      SELECT (to_jsonb(a) - 'company_id' - 'employee_id' - 'created_at')
      FROM public.attendance a
      WHERE a.employee_id = v_emp.id AND a.date = v_today
      LIMIT 1
    ),
    'month', (
      SELECT json_build_object(
        'start', v_month_start,
        'present', ms.present,
        'absent', ms.absent,
        'leave', ms.on_leave,
        'short_leave', ms.short_leave,
        'recorded', ms.recorded,
        'working_days_so_far', (SELECT n FROM working_so_far),
        'hours', round(ms.hours, 1),
        'expected_hours', (SELECT n FROM working_so_far) * COALESCE(v_emp.working_hours_per_day, 8)
      )
      FROM month_stats ms
    ),
    'leave', json_build_object(
      'pending', (
        SELECT count(*)::int FROM public.leave_requests lr
        WHERE lr.employee_id = v_emp.id AND lr.status::text = 'pending'
      ),
      -- Same figures as the leave module (allowance, approved use, pending), never the raw override rows.
      'balances', (
        SELECT COALESCE(json_agg(json_build_object(
                 'leave_type_id', b.leave_type_id,
                 'name', b.type_name,
                 'is_paid', b.is_paid,
                 'total', b.allowed,
                 'used', b.used,
                 'remaining', GREATEST(COALESCE(b.remaining, 0), 0),
                 'unlimited', b.unlimited
               ) ORDER BY b.type_name), '[]'::json)
        FROM public._leave_balance_rows(v_emp.company_id, extract(year FROM v_today)::int, v_emp.id) AS b
      )
    ),
    'payslip', (
      SELECT json_build_object('id', p.id, 'month', p.month, 'net_salary', p.net_salary)
      FROM public.payslips p
      WHERE p.employee_id = v_emp.id
        AND p.company_id = v_emp.company_id
        AND COALESCE(to_jsonb(p) ->> 'status', 'final') NOT IN ('draft', 'cancelled', 'void', 'correcting')
      ORDER BY p.month DESC, p.created_at DESC
      LIMIT 1
    ),
    'holidays', (
      SELECT COALESCE(json_agg(json_build_object(
               'id', x.id, 'title', x.title, 'date', x.date, 'type', x.type, 'description', x.description
             ) ORDER BY x.date), '[]'::json)
      FROM (
        SELECT ev.id, ev.title, ev.date, ev.type, ev.description
        FROM public.events ev
        WHERE ev.company_id = v_emp.company_id AND ev.date >= v_today
        ORDER BY ev.date
        LIMIT 5
      ) x
    ),
    'celebrations', (
      SELECT COALESCE(json_agg(json_build_object(
               'employee_id', c.employee_id, 'name', c.name, 'rank', c.rank, 'avatar_url', c.avatar_url,
               'kind', c.kind, 'years', c.years, 'date', c.on_date, 'days_until', c.days_until,
               'is_me', c.employee_id = v_emp.id
             ) ORDER BY c.days_until, c.kind, c.name), '[]'::json)
      FROM (SELECT * FROM celebrations ORDER BY days_until, name LIMIT 12) c
    ),
    'announcements', (
      SELECT COALESCE(json_agg(json_build_object(
               'id', x.id, 'title', x.title, 'content', x.content, 'created_at', x.created_at
             ) ORDER BY x.created_at DESC), '[]'::json)
      FROM (
        SELECT an.id, an.title, an.content, an.created_at
        FROM public.announcements an
        WHERE an.company_id = v_emp.company_id AND COALESCE(an.is_active, true)
          -- Department-only posts reach that department only (columns added by the engagement module).
          AND (
            COALESCE(to_jsonb(an) ->> 'audience', 'all') = 'all'
            OR (v_emp.department_id IS NOT NULL AND (to_jsonb(an) ->> 'department_id')::uuid = v_emp.department_id)
          )
        ORDER BY COALESCE((to_jsonb(an) ->> 'pinned')::boolean, false) DESC, an.created_at DESC
        LIMIT 3
      ) x
    ),
    'attention', (
      SELECT COALESCE(json_agg(json_build_object(
               'id', x.id, 'kind', x.kind, 'title', x.title, 'body', x.body, 'href', x.href, 'created_at', x.created_at
             ) ORDER BY x.created_at DESC), '[]'::json)
      FROM (
        SELECT n.id, n.kind, n.title, n.body, n.href, n.created_at
        FROM public.notifications n
        WHERE n.employee_id = v_emp.id
          AND n.company_id = v_emp.company_id
          AND n.read_at IS NULL
          AND (n.kind LIKE 'policy%' OR n.kind LIKE 'notice%' OR n.kind LIKE 'letter%' OR n.kind LIKE 'document%' OR n.kind LIKE 'asset%')
        ORDER BY n.created_at DESC
        LIMIT 5
      ) x
    ),
    'unread_notifications', (
      SELECT count(*)::int FROM public.notifications n
      WHERE n.employee_id = v_emp.id AND n.company_id = v_emp.company_id AND n.read_at IS NULL
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_home(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_home(text, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Avatar: the file is uploaded through the 'portal-files' Edge Function (bucket
-- avatars, kind 'avatar'); this RPC then points the profile at it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_update_avatar(p_token text, p_path text, p_url text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_prefix text := v_emp.company_id::text || '/' || v_emp.id::text || '/avatar-';
  v_path text := btrim(COALESCE(p_path, ''));
  v_url text := btrim(COALESCE(p_url, ''));
BEGIN
  IF public._portal_throttled(v_emp.id, 'portal.avatar.updated', 20, interval '1 hour') THEN
    RETURN json_build_object('error', 'Too many photo changes. Please try again later.');
  END IF;
  IF left(v_path, length(v_prefix)) <> v_prefix OR v_path ~ '\.\.' OR v_path !~ '\.(jpe?g|png|webp)$' THEN
    RETURN json_build_object('error', 'That photo could not be used. Please upload it again.');
  END IF;
  -- Only this project's public avatars URL for exactly that object.
  IF v_url !~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/public/avatars/'
     OR right(v_url, length('/storage/v1/object/public/avatars/' || v_path)) <> '/storage/v1/object/public/avatars/' || v_path THEN
    RETURN json_build_object('error', 'That photo could not be used. Please upload it again.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'avatars' AND o.name = v_path) THEN
    RETURN json_build_object('error', 'The uploaded photo was not found. Please upload it again.');
  END IF;

  UPDATE public.employees SET avatar_url = v_url WHERE id = v_emp.id AND company_id = v_emp.company_id;
  PERFORM public._portal_log(v_emp, 'portal.avatar.updated', v_emp.name || ' updated their profile photo');
  RETURN json_build_object('avatar_url', v_url);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_update_avatar(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_update_avatar(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_remove_avatar(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  IF v_emp.avatar_url IS NULL THEN
    RETURN json_build_object('avatar_url', NULL);
  END IF;
  UPDATE public.employees SET avatar_url = NULL WHERE id = v_emp.id AND company_id = v_emp.company_id;
  PERFORM public._portal_log(v_emp, 'portal.avatar.removed', v_emp.name || ' removed their profile photo');
  RETURN json_build_object('avatar_url', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_remove_avatar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_remove_avatar(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profile change requests. HR reviews them with process_update_request().
-- Only the fields that process_update_request applies are accepted, and only
-- values that differ from the record. One pending request per employee: a new
-- submission replaces the pending one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_request_profile_update(p_token text, p_changes jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_allowed text[] := ARRAY['father_name', 'date_of_birth', 'gender', 'email', 'phone', 'emergency_contact',
                            'address', 'education', 'bank_name', 'bank_account_number'];
  v_current jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
  v_dob date;
  v_pending uuid;
  v_id uuid;
  v_fields text;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RETURN json_build_object('error', 'Nothing to update.');
  END IF;
  IF public._portal_throttled(v_emp.id, 'employee.update_request.submitted', 10, interval '1 hour') THEN
    RETURN json_build_object('error', 'Too many requests. Please try again later.');
  END IF;

  v_current := jsonb_build_object(
    'father_name', v_emp.father_name, 'date_of_birth', v_emp.date_of_birth, 'gender', v_emp.gender,
    'email', v_emp.email, 'phone', v_emp.phone, 'emergency_contact', v_emp.emergency_contact,
    'address', v_emp.address, 'education', v_emp.education, 'bank_name', v_emp.bank_name,
    'bank_account_number', v_emp.bank_account_number
  );

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(p_changes) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      CONTINUE;
    END IF;
    v_val := btrim(regexp_replace(COALESCE(v_val, ''), '\s+', ' ', 'g'));
    IF v_val = '' THEN
      CONTINUE; -- clearing a field is not supported by HR review
    END IF;

    CASE v_key
      WHEN 'email' THEN
        v_val := lower(v_val);
        IF length(v_val) > 254 OR v_val !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' THEN
          RETURN json_build_object('error', 'Enter a valid e-mail address.', 'field', 'email');
        END IF;
      WHEN 'phone' THEN
        IF v_val !~ '^\+?[0-9][0-9 ()-]{6,19}$' THEN
          RETURN json_build_object('error', 'Enter a valid phone number.', 'field', 'phone');
        END IF;
      WHEN 'emergency_contact' THEN
        IF length(v_val) > 120 THEN
          RETURN json_build_object('error', 'Emergency contact is too long.', 'field', 'emergency_contact');
        END IF;
      WHEN 'date_of_birth' THEN
        BEGIN
          v_dob := v_val::date;
        EXCEPTION WHEN OTHERS THEN
          RETURN json_build_object('error', 'Enter a valid date of birth.', 'field', 'date_of_birth');
        END;
        IF v_dob > current_date - interval '14 years' OR v_dob < current_date - interval '100 years' THEN
          RETURN json_build_object('error', 'Date of birth looks wrong. Please check it.', 'field', 'date_of_birth');
        END IF;
        v_val := to_char(v_dob, 'YYYY-MM-DD');
      WHEN 'gender' THEN
        v_val := lower(v_val);
        IF v_val NOT IN ('male', 'female', 'other') THEN
          RETURN json_build_object('error', 'Choose a gender from the list.', 'field', 'gender');
        END IF;
      WHEN 'bank_account_number' THEN
        v_val := upper(replace(v_val, ' ', ''));
        IF v_val !~ '^[A-Z0-9-]{6,34}$' THEN
          RETURN json_build_object('error', 'Enter a valid account number or IBAN.', 'field', 'bank_account_number');
        END IF;
      WHEN 'address' THEN
        IF length(v_val) > 300 THEN
          RETURN json_build_object('error', 'Address is too long.', 'field', 'address');
        END IF;
      ELSE
        IF length(v_val) > 120 THEN
          RETURN json_build_object('error', 'One of the values is too long.', 'field', v_key);
        END IF;
    END CASE;

    IF v_val IS DISTINCT FROM btrim(COALESCE(v_current ->> v_key, '')) THEN
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    END IF;
  END LOOP;

  IF v_clean = '{}'::jsonb THEN
    RETURN json_build_object('error', 'Nothing has changed.');
  END IF;

  SELECT r.id INTO v_pending
  FROM public.employee_update_requests r
  WHERE r.employee_id = v_emp.id AND r.status = 'pending'
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_pending IS NOT NULL THEN
    UPDATE public.employee_update_requests
    SET requested_changes = v_clean, created_at = now()
    WHERE id = v_pending
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.employee_update_requests (employee_id, company_id, requested_changes, status)
    VALUES (v_emp.id, v_emp.company_id, v_clean, 'pending')
    RETURNING id INTO v_id;
  END IF;

  SELECT string_agg(replace(k, '_', ' '), ', ' ORDER BY k) INTO v_fields FROM jsonb_object_keys(v_clean) k;

  BEGIN
    PERFORM public.notify_roles(
      v_emp.company_id, ARRAY['hr'], 'profile.update_request',
      v_emp.name || ' asked to update their profile',
      'Changes to review: ' || v_fields || '.',
      '/employee-updates'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- a notification failure never blocks the request
  END;
  -- Bank details are logged as "changed" only.
  PERFORM public._portal_log(
    v_emp, 'employee.update_request.submitted',
    v_emp.name || ' requested profile changes (' || v_fields || ')',
    jsonb_build_object('request_id', v_id, 'fields', (SELECT jsonb_agg(k) FROM jsonb_object_keys(v_clean) k), 'replaced', v_pending IS NOT NULL)
  );

  RETURN json_build_object('success', true, 'id', v_id, 'replaced', v_pending IS NOT NULL, 'fields', v_clean);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_request_profile_update(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_request_profile_update(text, jsonb) TO anon, authenticated;

-- The employee's own last 10 change requests (newest first).
CREATE OR REPLACE FUNCTION public.portal_profile_requests(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_result json;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
           'id', x.id, 'status', x.status, 'requested_changes', x.requested_changes,
           'created_at', x.created_at, 'reviewed_at', x.reviewed_at
         ) ORDER BY x.created_at DESC), '[]'::json)
    INTO v_result
  FROM (
    SELECT r.id, r.status, r.requested_changes, r.created_at, r.reviewed_at
    FROM public.employee_update_requests r
    WHERE r.employee_id = v_emp.id AND r.company_id = v_emp.company_id
    ORDER BY r.created_at DESC
    LIMIT 10
  ) x;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_profile_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_profile_requests(text) TO anon, authenticated;

-- Withdraw the pending change request.
CREATE OR REPLACE FUNCTION public.portal_withdraw_profile_request(p_token text, p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_count integer;
BEGIN
  DELETE FROM public.employee_update_requests
  WHERE id = p_id AND employee_id = v_emp.id AND company_id = v_emp.company_id AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN json_build_object('error', 'That request has already been reviewed.');
  END IF;
  PERFORM public._portal_log(v_emp, 'employee.update_request.withdrawn', v_emp.name || ' withdrew a profile change request',
                             jsonb_build_object('request_id', p_id));
  RETURN json_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_withdraw_profile_request(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_withdraw_profile_request(text, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed-in devices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_sessions(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_hash bytea := extensions.digest(p_token, 'sha256');
  v_result json;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
           'created_at', s.created_at,
           'last_seen_at', s.last_seen_at,
           'expires_at', s.expires_at,
           'current', s.token_hash = v_hash
         ) ORDER BY (s.token_hash = v_hash) DESC, COALESCE(s.last_seen_at, s.created_at) DESC), '[]'::json)
    INTO v_result
  FROM public.employee_sessions s
  WHERE s.employee_id = v_emp.id
    AND s.company_id = v_emp.company_id
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_sessions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_sessions(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_sign_out_other_devices(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_count integer;
BEGIN
  UPDATE public.employee_sessions
  SET revoked_at = now()
  WHERE employee_id = v_emp.id
    AND revoked_at IS NULL
    AND token_hash <> extensions.digest(p_token, 'sha256');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    PERFORM public._portal_log(v_emp, 'portal.sessions.revoked', v_emp.name || ' signed out ' || v_count || ' other device(s)',
                               jsonb_build_object('count', v_count));
  END IF;
  RETURN json_build_object('success', true, 'count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_sign_out_other_devices(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_sign_out_other_devices(text) TO anon, authenticated;

-- Delete one or more of the employee's own notifications (read ones only, or all when p_ids is NULL and read).
CREATE OR REPLACE FUNCTION public.portal_clear_notifications(p_token text, p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE employee_id = v_emp.id
    AND company_id = v_emp.company_id
    AND (CASE WHEN p_ids IS NULL THEN read_at IS NOT NULL ELSE id = ANY (p_ids) END);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_clear_notifications(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_clear_notifications(text, uuid[]) TO anon, authenticated;
