-- Employee portal fixes (home, profile, devices).
--
-- portal_home
--   * "Today" is the company's date (time-module timezone), never the browser's. A viewer in
--     another timezone used to see yesterday's or tomorrow's attendance, celebrations and month.
--   * Today's card now shows the live time-clock punches (first in / last out, in company time)
--     and approved leave next to the register status. The old card looked for punch columns the
--     attendance table does not have, so the times never showed.
--   * Working days so far come from working_dates(), the same rule the attendance pages use
--     (alternate Saturdays, holidays that affect attendance, extra working days).
--   * Month hours come from the time module (_time_hours). The old code read attendance columns
--     that do not exist, so the "My hours" tile never appeared.
--   * Asset and document notifications are named people.asset / people.document: the attention
--     filter missed them.
--   * Balances carry the leave kind so the home tile can leave out maternity/paternity.
-- portal_me
--   * Weekend shows the rule that applies to the employee (own setting, else the company rule)
--     instead of "Not added" for everyone who follows the company rule.
-- portal_sign_out_other_devices
--   * Counts only sessions that were still valid, so the toast matches the device list.

CREATE OR REPLACE FUNCTION public.portal_home(p_token text, p_today date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  -- p_today is accepted for older clients but ignored: the company's calendar decides "today".
  v_today date := public._time_today(v_emp.company_id);
  v_tz text := public._time_tz(v_emp.company_id);
  v_month_start date := date_trunc('month', v_today)::date;
  v_working_so_far integer;
  v_result json;
BEGIN
  SELECT count(*)::int INTO v_working_so_far
  FROM public.working_dates(v_emp.company_id, v_month_start, v_today, v_emp.id);

  WITH
  att AS (
    SELECT a.date, a.status
    FROM public.attendance a
    WHERE a.employee_id = v_emp.id
      AND a.date BETWEEN v_month_start AND v_today
  ),
  month_stats AS (
    SELECT
      count(*) FILTER (WHERE status IN ('present', 'late', 'half_day', 'short_leave'))::int AS present,
      count(*) FILTER (WHERE status = 'absent')::int AS absent,
      count(*) FILTER (WHERE status = 'leave')::int AS on_leave,
      count(*) FILTER (WHERE status = 'short_leave')::int AS short_leave,
      count(*)::int AS recorded
    FROM att
  ),
  month_hours AS (
    SELECT h.measured_days, h.worked_minutes, h.target_minutes
    FROM public._time_hours(v_emp.company_id, v_month_start, v_emp.id) h
    WHERE h.employee_id = v_emp.id
    LIMIT 1
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
    -- The register row (when HR or the day processor has written it) plus today's live punches.
    'attendance_today', (
      SELECT CASE
               WHEN reg.j IS NULL AND COALESCE(td.punches, 0) = 0 AND td.kind IS DISTINCT FROM 'leave' THEN NULL
               ELSE COALESCE(reg.j, jsonb_build_object('date', v_today))
                    || jsonb_build_object(
                         'status', COALESCE(reg.j ->> 'status', CASE WHEN td.kind = 'leave' THEN 'leave' END),
                         'first_in', to_char(td.first_in AT TIME ZONE v_tz, 'HH24:MI'),
                         'last_out', to_char(td.last_out AT TIME ZONE v_tz, 'HH24:MI'),
                         'punches', COALESCE(td.punches, 0),
                         'kind', td.kind
                       )
             END
      FROM (SELECT 1) one
      LEFT JOIN LATERAL (
        SELECT to_jsonb(a) - 'company_id' - 'employee_id' - 'created_at' - 'marked_by' AS j
        FROM public.attendance a
        WHERE a.employee_id = v_emp.id AND a.date = v_today
        LIMIT 1
      ) reg ON true
      LEFT JOIN LATERAL (
        SELECT d.kind, d.first_in, d.last_out, d.punches
        FROM public._time_days(v_emp.company_id, v_today, v_today, v_emp.id) d
        WHERE d.employee_id = v_emp.id
        LIMIT 1
      ) td ON true
    ),
    'month', (
      SELECT json_build_object(
        'start', v_month_start,
        'present', ms.present,
        'absent', ms.absent,
        'leave', ms.on_leave,
        'short_leave', ms.short_leave,
        'recorded', ms.recorded,
        'working_days_so_far', v_working_so_far,
        -- Measured days only (an in and an out punch, up to yesterday), as on My hours.
        'hours', (SELECT round(mh.worked_minutes / 60.0, 1) FROM month_hours mh WHERE mh.measured_days > 0),
        'expected_hours', COALESCE(
          (SELECT round(mh.target_minutes / 60.0, 1) FROM month_hours mh WHERE mh.measured_days > 0),
          v_working_so_far * COALESCE(NULLIF(v_emp.working_hours_per_day, 0), 8)
        )
      )
      FROM month_stats ms
    ),
    'leave', json_build_object(
      'pending', (
        SELECT count(*)::int FROM public.leave_requests lr
        WHERE lr.employee_id = v_emp.id AND lr.company_id = v_emp.company_id AND lr.status::text = 'pending'
      ),
      -- Same figures as the leave module (allowance, approved use, pending), never the raw override rows.
      'balances', (
        SELECT COALESCE(json_agg(json_build_object(
                 'leave_type_id', b.leave_type_id,
                 'name', b.type_name,
                 'kind', b.type_kind,
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
          AND (n.kind LIKE 'policy%' OR n.kind LIKE 'notice%' OR n.kind LIKE 'letter%'
               OR n.kind LIKE 'document%' OR n.kind LIKE 'asset%'
               OR n.kind LIKE 'people.document%' OR n.kind LIKE 'people.asset%')
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
$function$;

CREATE OR REPLACE FUNCTION public.portal_me(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public._time_today(v_emp.company_id);
  v_result json;
BEGIN
  UPDATE public.employee_sessions SET last_seen_at = now()
  WHERE token_hash = extensions.digest(p_token, 'sha256')
    AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes');

  SELECT json_build_object(
    'id', e.id,
    'company_id', e.company_id,
    'employee_code', e.employee_code,
    'name', e.name,
    'rank', e.rank,
    'department_id', e.department_id,
    'department', d.name,
    'status', e.status,
    'joining_date', e.joining_date,
    'separation_date', e.separation_date,
    'email', e.email,
    'phone', e.phone,
    'cnic', e.cnic,
    'father_name', e.father_name,
    'date_of_birth', e.date_of_birth,
    'gender', e.gender,
    'address', e.address,
    'education', e.education,
    'emergency_contact', e.emergency_contact,
    'bank_name', e.bank_name,
    'bank_account_number', e.bank_account_number,
    'avatar_url', e.avatar_url,
    'shift_type', e.shift_type,
    'working_hours_per_day', e.working_hours_per_day,
    -- The weekend that applies to the employee: their own setting, else the company rule today.
    'weekend_saturday', COALESCE(
      e.weekend_saturday,
      COALESCE(s.weekend_saturday, false)
        AND (s.saturday_off_from IS NULL OR v_today >= s.saturday_off_from)
        AND (s.saturday_off_until IS NULL OR v_today <= s.saturday_off_until)
    ),
    'weekend_sunday', COALESCE(e.weekend_sunday, s.weekend_sunday, true),
    'saturday_pattern', CASE WHEN e.weekend_saturday IS NULL THEN COALESCE(s.saturday_pattern, 'all') ELSE 'all' END,
    'needs_password_change', e.must_change_password,
    'company', json_build_object(
      'id', c.id, 'name', c.name, 'logo', c.logo, 'currency', c.currency,
      'phone', c.phone, 'website', c.website, 'address', c.address
    )
  )
  INTO v_result
  FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.company_working_settings s ON s.company_id = e.company_id
  WHERE e.id = v_emp.id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_sign_out_other_devices(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_count integer;
BEGIN
  UPDATE public.employee_sessions
  SET revoked_at = now()
  WHERE employee_id = v_emp.id
    AND revoked_at IS NULL
    AND expires_at > now()
    AND token_hash <> extensions.digest(p_token, 'sha256');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    PERFORM public._portal_log(v_emp, 'portal.sessions.revoked', v_emp.name || ' signed out ' || v_count || ' other device(s)',
                               jsonb_build_object('count', v_count));
  END IF;
  RETURN json_build_object('success', true, 'count', v_count);
END;
$function$;
