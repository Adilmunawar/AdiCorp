-- Engagement: the company's own calendar, anonymous complaints that stay anonymous, and
-- poll votes that only HR can read.
--
-- 1. Celebrations, wishes, the week ahead, the portal badges and the 9 am greetings used a
--    hard-coded Asia/Karachi "today" (_engagement_today). A company in another time zone
--    (companies.timezone) saw birthdays, anniversaries and first days on the wrong day, could
--    not send wishes on the actual day, and got its greetings at 9 am Karachi time. They now
--    use public.company_today(company) and the company's own clock.
-- 2. portal_submit_complaint kept "only the date" of an anonymous complaint in created_at, but
--    updated_at defaulted to now(): engagement_complaints returned the exact second it was sent,
--    which can be matched against portal sign-ins. updated_at now carries the same date, and the
--    date is the company's date (date_trunc on UTC filed complaints sent between midnight and
--    5 am Karachi under the previous day). It is stored as midnight UTC of that date, like the
--    existing rows.
-- 3. engagement_coming_up only listed events starting inside the next 7 days, so a multi-day
--    holiday that began before today (Eid, end_date) was missing while it was still on.
--    Events overlapping the week are listed from today, with "until <day>" for multi-day ones.
-- 4. poll_votes could be read by every staff role (finance included) straight from the table,
--    although employees are told "Only HR can see who voted for what". Reading votes is now
--    HR (and owner) only; the portal and staff RPCs are SECURITY DEFINER and unaffected.

CREATE OR REPLACE FUNCTION public.engagement_celebrations(p_days integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._engagement_require_hr();
  v_today date := public.company_today(v_company);
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
BEGIN
  RETURN json_build_object(
    'today', v_today,
    'occasions', (
      SELECT COALESCE(json_agg(json_build_object(
        'employee_id', o.employee_id, 'name', o.name, 'rank', o.rank, 'avatar_url', o.avatar_url, 'department', o.department,
        'kind', o.kind, 'years', o.years, 'date', o.on_date, 'days_until', o.on_date - v_today,
        'wishes', CASE WHEN o.on_date = v_today THEN (
          SELECT count(*)::int FROM public.celebration_wishes w
          WHERE w.employee_id = o.employee_id AND w.kind = o.kind AND w.occasion_date = o.on_date
        ) ELSE 0 END,
        'wished', CASE WHEN o.on_date = v_today THEN EXISTS (
          SELECT 1 FROM public.celebration_wishes w
          WHERE w.employee_id = o.employee_id AND w.kind = o.kind AND w.occasion_date = o.on_date AND w.from_user_id = auth.uid()
        ) ELSE false END
      ) ORDER BY o.on_date, CASE o.kind WHEN 'birthday' THEN 0 WHEN 'anniversary' THEN 1 ELSE 2 END, o.name), '[]'::json)
      FROM public._engagement_occasions(v_company, v_today, v_today + v_days - 1) o
      WHERE o.shared
    ),
    'recent_wishes', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', w.id, 'kind', w.kind, 'date', w.occasion_date, 'message', w.message, 'created_at', w.created_at,
        'to_name', e.name,
        'from_name', CASE WHEN w.from_user_id IS NOT NULL THEN public._engagement_staff_name(w.from_user_id) ELSE fe.name END
      ) ORDER BY w.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM public.celebration_wishes w
        WHERE w.company_id = v_company AND w.occasion_date > v_today - 7
        ORDER BY w.created_at DESC LIMIT 30
      ) w
      JOIN public.employees e ON e.id = w.employee_id
      LEFT JOIN public.employees fe ON fe.id = w.from_employee_id
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_send_wish(p_employee uuid, p_kind text, p_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._engagement_require_hr();
  v_today date := public.company_today(v_company);
  v_message text := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_id uuid;
  v_what text;
BEGIN
  IF char_length(COALESCE(v_message, '')) > 280 THEN
    RAISE EXCEPTION 'A wish can be at most 280 characters.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public._engagement_occasions(v_company, v_today, v_today) o
    WHERE o.employee_id = p_employee AND o.kind = p_kind AND o.shared
  ) THEN
    RAISE EXCEPTION 'There is nothing to celebrate for them today.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.celebration_wishes w WHERE w.from_user_id = auth.uid() AND w.created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'That is a lot of wishes. Try again in a while.' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.celebration_wishes (company_id, employee_id, kind, occasion_date, from_user_id, message)
  VALUES (v_company, p_employee, p_kind, v_today, auth.uid(), v_message)
  ON CONFLICT (employee_id, kind, occasion_date, from_user_id) WHERE from_user_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN json_build_object('ok', true, 'already', true);
  END IF;

  v_what := CASE p_kind WHEN 'birthday' THEN 'a happy birthday' WHEN 'anniversary' THEN 'a happy work anniversary' ELSE 'a warm welcome' END;
  PERFORM public.notify_employee(
    v_company, p_employee, 'celebration',
    format('%s wished you %s 🎉', public._engagement_staff_name(auth.uid()), v_what),
    v_message, '/portal/celebrations'
  );
  RETURN json_build_object('ok', true, 'already', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_coming_up()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._engagement_require_hr();
  v_from date := public.company_today(v_company);
  v_to date := v_from + 6;
BEGIN
  RETURN json_build_object(
    'from', v_from,
    'to', v_to,
    'items', (
      SELECT COALESCE(json_agg(x ORDER BY x.date, x.sort, x.title), '[]'::json)
      FROM (
        -- Events overlapping the week; one that is already under way is listed from today.
        SELECT GREATEST(ev.date, v_from) AS date,
               CASE WHEN ev.affects_attendance OR ev.type = 'holiday' THEN 'holiday' ELSE 'event' END AS kind,
               ev.title,
               initcap(replace(COALESCE(ev.type, 'event'), '_', ' '))
                 || CASE WHEN ev.end_date > ev.date THEN ' · until ' || to_char(ev.end_date, 'FMDD Mon') ELSE '' END AS detail,
               '/events' AS href, 0 AS sort
        FROM public.events ev
        WHERE ev.company_id = v_company
          AND ev.date <= v_to
          AND GREATEST(ev.date, COALESCE(ev.end_date, ev.date)) >= v_from
        UNION ALL
        SELECT o.on_date, o.kind, o.name,
               CASE o.kind WHEN 'birthday' THEN 'Birthday'
                           WHEN 'anniversary' THEN o.years || CASE WHEN o.years = 1 THEN ' year' ELSE ' years' END || ' with the company'
                           ELSE 'First day' END,
               '/employees/' || o.employee_id, 1
        FROM public._engagement_occasions(v_company, v_from, v_to) o
        WHERE o.shared
      ) x
    ),
    'waiting', (
      SELECT COALESCE(json_agg(w ORDER BY w.sort), '[]'::json)
      FROM (
        SELECT 'leave requests' AS label, count(*)::int AS n, '/leave' AS href, 1 AS sort
        FROM public.leave_requests r WHERE r.company_id = v_company AND r.status = 'pending'
        UNION ALL
        SELECT 'overtime claims', count(*)::int, '/overtime-hours', 2
        FROM public.overtime_records r WHERE r.company_id = v_company AND r.status = 'pending'
        UNION ALL
        SELECT 'profile updates', count(*)::int, '/employee-updates', 3
        FROM public.employee_update_requests r WHERE r.company_id = v_company AND r.status = 'pending'
        UNION ALL
        SELECT 'complaints', count(*)::int, '/complaints', 4
        FROM public.complaints c WHERE c.company_id = v_company AND c.status = 'pending'
        UNION ALL
        SELECT 'unread messages', count(*)::int, '/messages', 5
        FROM public.messages m WHERE m.company_id = v_company AND m.sender_kind = 'employee' AND m.read_at IS NULL
      ) w
      WHERE w.n > 0
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_celebrations(p_token text, p_days integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public.company_today(v_emp.company_id);
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
  v_company_name text := (SELECT c.name FROM public.companies c WHERE c.id = v_emp.company_id);
BEGIN
  RETURN json_build_object(
    'today', v_today,
    'company_name', v_company_name,
    'share_birthday', v_emp.share_birthday,
    'has_birthday', v_emp.date_of_birth IS NOT NULL,
    'occasions', (
      SELECT COALESCE(json_agg(json_build_object(
        'employee_id', o.employee_id, 'name', o.name, 'rank', o.rank, 'avatar_url', o.avatar_url, 'department', o.department,
        'kind', o.kind, 'years', o.years, 'date', o.on_date, 'days_until', o.on_date - v_today,
        'is_me', o.employee_id = v_emp.id,
        'wished', EXISTS (
          SELECT 1 FROM public.celebration_wishes w
          WHERE w.employee_id = o.employee_id AND w.kind = o.kind AND w.occasion_date = o.on_date AND w.from_employee_id = v_emp.id
        ),
        'wishes', CASE WHEN o.on_date = v_today THEN (
          SELECT count(*)::int FROM public.celebration_wishes w
          WHERE w.employee_id = o.employee_id AND w.kind = o.kind AND w.occasion_date = o.on_date
        ) ELSE 0 END
      ) ORDER BY o.on_date, CASE o.kind WHEN 'birthday' THEN 0 WHEN 'anniversary' THEN 1 ELSE 2 END, o.name), '[]'::json)
      FROM public._engagement_occasions(v_emp.company_id, v_today, v_today + v_days - 1) o
      WHERE o.shared OR o.employee_id = v_emp.id
    ),
    'received', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', w.id, 'kind', w.kind, 'message', w.message, 'created_at', w.created_at,
        'from_name', CASE WHEN w.from_user_id IS NOT NULL THEN public._engagement_staff_name(w.from_user_id) ELSE fe.name END,
        'from_avatar', fe.avatar_url,
        'from_staff', w.from_user_id IS NOT NULL
      ) ORDER BY w.created_at), '[]'::json)
      FROM public.celebration_wishes w
      LEFT JOIN public.employees fe ON fe.id = w.from_employee_id
      WHERE w.employee_id = v_emp.id AND w.occasion_date = v_today
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_send_wish(p_token text, p_employee uuid, p_kind text, p_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public.company_today(v_emp.company_id);
  v_message text := NULLIF(btrim(COALESCE(p_message, '')), '');
  v_id uuid;
  v_what text;
BEGIN
  IF p_employee = v_emp.id THEN
    RETURN json_build_object('error', 'That is you! Your colleagues will send you theirs.');
  END IF;
  IF char_length(COALESCE(v_message, '')) > 280 THEN
    RETURN json_build_object('error', 'A wish can be at most 280 characters.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public._engagement_occasions(v_emp.company_id, v_today, v_today) o
    WHERE o.employee_id = p_employee AND o.kind = p_kind AND o.shared
  ) THEN
    RETURN json_build_object('error', 'There is nothing to celebrate for them today.');
  END IF;
  IF (SELECT count(*) FROM public.celebration_wishes w WHERE w.from_employee_id = v_emp.id AND w.created_at > now() - interval '1 hour') >= 60 THEN
    RETURN json_build_object('error', 'That is a lot of wishes. Try again in a while.');
  END IF;

  INSERT INTO public.celebration_wishes (company_id, employee_id, kind, occasion_date, from_employee_id, message)
  VALUES (v_emp.company_id, p_employee, p_kind, v_today, v_emp.id, v_message)
  ON CONFLICT (employee_id, kind, occasion_date, from_employee_id) WHERE from_employee_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN json_build_object('ok', true, 'already', true);
  END IF;

  v_what := CASE p_kind WHEN 'birthday' THEN 'a happy birthday' WHEN 'anniversary' THEN 'a happy work anniversary' ELSE 'a warm welcome' END;
  PERFORM public.notify_employee(v_emp.company_id, p_employee, 'celebration', format('%s wished you %s 🎉', v_emp.name, v_what), v_message, '/portal/celebrations');
  RETURN json_build_object('ok', true, 'already', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_engagement_counts(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public.company_today(v_emp.company_id);
BEGIN
  RETURN json_build_object(
    'unread_messages', (
      SELECT count(*)::int FROM public.messages m
      WHERE m.employee_id = v_emp.id AND m.sender_kind = 'staff' AND m.read_at IS NULL
    ),
    'open_polls', (
      SELECT count(*)::int FROM public.polls p
      WHERE p.company_id = v_emp.company_id AND p.status = 'active' AND (p.expires_at IS NULL OR p.expires_at > now())
        AND NOT EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.poll_id = p.id AND v.employee_id = v_emp.id)
    ),
    'celebrations_today', (
      SELECT count(*)::int FROM public._engagement_occasions(v_emp.company_id, v_today, v_today) o
      WHERE (o.shared OR o.employee_id = v_emp.id)
        AND (o.employee_id = v_emp.id OR NOT EXISTS (
          SELECT 1 FROM public.celebration_wishes w
          WHERE w.employee_id = o.employee_id AND w.kind = o.kind AND w.occasion_date = o.on_date AND w.from_employee_id = v_emp.id
        ))
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_send_morning_greetings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company record;
  v_local timestamp;
  v_today date;
  v_occ record;
  v_first text;
  v_title text;
  v_body text;
  v_done integer := 0;
BEGIN
  FOR v_company IN SELECT c.id, c.name, c.timezone FROM public.companies c LOOP
    -- 9 am on the company's own clock; a company with an unusable time zone is skipped, not the run.
    BEGIN
      v_local := now() AT TIME ZONE COALESCE(NULLIF(btrim(v_company.timezone), ''), 'UTC');
    EXCEPTION WHEN invalid_parameter_value THEN
      CONTINUE;
    END;
    IF extract(hour FROM v_local) < 9 THEN
      CONTINUE;
    END IF;
    v_today := v_local::date;
    FOR v_occ IN SELECT * FROM public._engagement_occasions(v_company.id, v_today, v_today) LOOP
      INSERT INTO public.celebration_greetings (company_id, employee_id, kind, occasion_date)
      VALUES (v_company.id, v_occ.employee_id, v_occ.kind, v_today)
      ON CONFLICT (employee_id, kind, occasion_date) DO NOTHING;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      v_first := split_part(btrim(v_occ.name), ' ', 1);
      IF v_occ.kind = 'birthday' THEN
        v_title := format('Happy birthday, %s! 🎂', v_first);
        v_body := format('Everyone at %s wishes you a wonderful year ahead.', v_company.name);
      ELSIF v_occ.kind = 'anniversary' THEN
        v_title := format('Happy work anniversary, %s! 🎉', v_first);
        v_body := format('%s %s at %s today. Thank you for all you do.', v_occ.years, CASE WHEN v_occ.years = 1 THEN 'year' ELSE 'years' END, v_company.name);
      ELSE
        v_title := format('Welcome to %s, %s! 👋', v_company.name, v_first);
        v_body := 'Today is your first day. We are glad you are here.';
      END IF;
      PERFORM public.notify_employee(v_company.id, v_occ.employee_id, 'celebration', v_title, v_body, '/portal/celebrations');
      v_done := v_done + 1;
    END LOOP;
  END LOOP;
  RETURN v_done;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_submit_complaint(p_token text, p_subject text, p_description text, p_anonymous boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_description text := btrim(COALESCE(p_description, ''));
  v_anonymous boolean := COALESCE(p_anonymous, false);
  v_day timestamptz;
  v_id uuid;
BEGIN
  IF char_length(v_subject) < 3 OR char_length(v_subject) > 120 THEN
    RETURN json_build_object('error', 'The subject must be 3 to 120 characters.');
  END IF;
  IF char_length(v_description) < 10 OR char_length(v_description) > 3000 THEN
    RETURN json_build_object('error', 'Describe what happened in 10 to 3000 characters.');
  END IF;

  IF v_anonymous THEN
    -- Nothing in the row points back at the person: no employee, and only the company's date is
    -- kept (in created_at and updated_at alike), so it cannot be matched to a sign-in time.
    -- No timeline entry and no notification either.
    v_day := public.company_today(v_emp.company_id)::timestamp AT TIME ZONE 'UTC';
    INSERT INTO public.complaints (company_id, employee_id, subject, description, is_anonymous, status, created_at, updated_at)
    VALUES (v_emp.company_id, NULL, v_subject, v_description, true, 'pending', v_day, v_day)
    RETURNING id INTO v_id;
    RETURN json_build_object('ok', true, 'anonymous', true);
  END IF;

  IF (SELECT count(*) FROM public.complaints c
      WHERE c.employee_id = v_emp.id AND c.created_at > now() - interval '1 day') >= 5 THEN
    RETURN json_build_object('error', 'You have raised several complaints today. HR will look at them first.');
  END IF;

  INSERT INTO public.complaints (company_id, employee_id, subject, description, is_anonymous, status)
  VALUES (v_emp.company_id, v_emp.id, v_subject, v_description, false, 'pending')
  RETURNING id INTO v_id;

  PERFORM public.notify_roles(v_emp.company_id, ARRAY['hr'], 'complaint', format('New complaint from %s', v_emp.name), v_subject, '/complaints?id=' || v_id);
  PERFORM public._engagement_portal_log(v_emp, 'complaint.submitted', format('%s raised the complaint "%s"', v_emp.name, v_subject),
    jsonb_build_object('complaint_id', v_id));
  RETURN json_build_object('ok', true, 'anonymous', false, 'id', v_id);
END;
$function$;

ALTER POLICY poll_votes_select ON public.poll_votes
  USING ((company_id = (SELECT public.auth_company_id())) AND (SELECT public.auth_is_hr()));
