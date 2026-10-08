-- Engagement 3/4: employee portal RPCs (anon key + session token).
-- Each portal_* function takes p_token first, resolves the employee and company from the
-- token alone (public._portal_employee), never trusts ids for identity, and returns
-- explicit column lists.

-- Activity entry written on behalf of a portal employee (no staff user). Never fails the caller.
CREATE OR REPLACE FUNCTION public._engagement_portal_log(
  p_employee public.employees, p_action text, p_description text, p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES (left(p_action, 100), left(COALESCE(p_description, ''), 1000),
          COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('source', 'portal'),
          NULL, p_employee.company_id, p_employee.id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._engagement_portal_log(public.employees, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- Announcements
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.portal_announcements(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object(
      'id', a.id, 'title', a.title, 'content', a.content, 'pinned', a.pinned,
      'created_at', a.created_at, 'updated_at', a.updated_at,
      'author_name', public._engagement_staff_name(a.created_by),
      'department_name', CASE WHEN a.audience = 'department' THEN d.name END
    ) ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC), '[]'::json)
    FROM public.announcements a
    LEFT JOIN public.departments d ON d.id = a.department_id
    WHERE a.company_id = v_emp.company_id
      AND a.is_active
      AND (a.audience = 'all' OR (a.department_id IS NOT NULL AND a.department_id = v_emp.department_id))
  );
END;
$$;

-- ===========================================================================
-- Polls: results (percentages only) after voting, after closing, never who voted
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.portal_polls(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN (
    WITH base AS (
      SELECT p.*,
             (p.status = 'active' AND (p.expires_at IS NULL OR p.expires_at > now())) AS is_open,
             (SELECT v.option_id FROM public.poll_votes v WHERE v.poll_id = p.id AND v.employee_id = v_emp.id) AS my_option
      FROM public.polls p
      WHERE p.company_id = v_emp.company_id
      ORDER BY (p.status = 'active' AND (p.expires_at IS NULL OR p.expires_at > now())) DESC, p.created_at DESC
      LIMIT 60
    )
    SELECT COALESCE(json_agg(json_build_object(
      'id', b.id, 'question', b.question, 'description', b.description,
      'status', CASE WHEN b.is_open THEN 'open' ELSE 'closed' END,
      'expires_at', b.expires_at, 'created_at', b.created_at,
      'my_option_id', b.my_option,
      'show_results', (b.my_option IS NOT NULL OR NOT b.is_open),
      'options', (
        SELECT COALESCE(json_agg(json_build_object(
          'id', o.id, 'text', o.option_text,
          'percent', CASE WHEN (b.my_option IS NOT NULL OR NOT b.is_open) AND t.n > 0
                          THEN round(o.votes * 100.0 / t.n)::int END
        ) ORDER BY o.position, o.id), '[]'::json)
        FROM (
          SELECT po.id, po.option_text, po.position,
                 (SELECT count(*) FROM public.poll_votes v WHERE v.option_id = po.id AND v.poll_id = po.poll_id) AS votes
          FROM public.poll_options po WHERE po.poll_id = b.id
        ) o
        CROSS JOIN (SELECT count(*) AS n FROM public.poll_votes v WHERE v.poll_id = b.id) t
      )
    ) ORDER BY b.is_open DESC, b.created_at DESC), '[]'::json)
    FROM base b
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_vote(p_token text, p_poll uuid, p_option uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_poll public.polls;
BEGIN
  SELECT * INTO v_poll FROM public.polls p WHERE p.id = p_poll AND p.company_id = v_emp.company_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'That poll no longer exists.');
  END IF;
  IF v_poll.status <> 'active' OR (v_poll.expires_at IS NOT NULL AND v_poll.expires_at <= now()) THEN
    RETURN json_build_object('error', 'This poll is closed.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.poll_options o WHERE o.id = p_option AND o.poll_id = v_poll.id) THEN
    RETURN json_build_object('error', 'Pick one of the options.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.poll_id = v_poll.id AND v.employee_id = v_emp.id) THEN
    RETURN json_build_object('error', 'You have already voted in this poll. It is one vote per person.');
  END IF;

  BEGIN
    INSERT INTO public.poll_votes (poll_id, option_id, employee_id, company_id)
    VALUES (v_poll.id, p_option, v_emp.id, v_emp.company_id);
  EXCEPTION WHEN unique_violation THEN
    -- A double submit that raced past the check above.
    RETURN json_build_object('error', 'You have already voted in this poll. It is one vote per person.');
  END;

  -- The timeline records that they voted, never what they chose.
  PERFORM public._engagement_portal_log(v_emp, 'poll.voted', format('%s voted in the poll "%s"', v_emp.name, v_poll.question),
    jsonb_build_object('poll_id', v_poll.id));
  RETURN json_build_object('ok', true);
END;
$$;

-- ===========================================================================
-- Complaints
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.portal_complaints(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  -- Anonymous complaints store no employee, so they can never be listed back.
  RETURN (
    SELECT COALESCE(json_agg(json_build_object(
      'id', c.id, 'subject', c.subject, 'description', c.description, 'status', c.status,
      'response', c.response, 'responded_at', c.responded_at,
      'created_at', c.created_at, 'updated_at', c.updated_at
    ) ORDER BY c.created_at DESC, c.id DESC), '[]'::json)
    FROM public.complaints c
    WHERE c.company_id = v_emp.company_id AND c.employee_id = v_emp.id AND NOT c.is_anonymous
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_submit_complaint(p_token text, p_subject text, p_description text, p_anonymous boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_description text := btrim(COALESCE(p_description, ''));
  v_anonymous boolean := COALESCE(p_anonymous, false);
  v_id uuid;
BEGIN
  IF char_length(v_subject) < 3 OR char_length(v_subject) > 120 THEN
    RETURN json_build_object('error', 'The subject must be 3 to 120 characters.');
  END IF;
  IF char_length(v_description) < 10 OR char_length(v_description) > 3000 THEN
    RETURN json_build_object('error', 'Describe what happened in 10 to 3000 characters.');
  END IF;

  IF v_anonymous THEN
    -- Nothing in the row points back at the person: no employee, and only the date is kept,
    -- so it cannot be matched to a sign-in time. No timeline entry and no notification either.
    INSERT INTO public.complaints (company_id, employee_id, subject, description, is_anonymous, status, created_at)
    VALUES (v_emp.company_id, NULL, v_subject, v_description, true, 'pending', date_trunc('day', now()))
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
$$;

-- ===========================================================================
-- Messages (the employee's one thread with HR)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.portal_messages(p_token text, p_limit integer DEFAULT 300)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
BEGIN
  -- Opening the thread reads what HR sent.
  UPDATE public.messages m SET read_at = now()
  WHERE m.employee_id = v_emp.id AND m.company_id = v_emp.company_id AND m.sender_kind = 'staff' AND m.read_at IS NULL;

  RETURN json_build_object(
    'topic', public._engagement_chat_topic(v_emp.id),
    'messages', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', x.id, 'content', x.content, 'sender_kind', x.sender_kind,
        'sender_name', CASE WHEN x.sender_kind = 'staff' THEN public._engagement_staff_name(x.sender_user_id) ELSE v_emp.name END,
        'mine', x.sender_kind = 'employee',
        'created_at', x.created_at, 'read_at', x.read_at
      ) ORDER BY x.created_at, x.id), '[]'::json)
      FROM (
        SELECT m.* FROM public.messages m
        WHERE m.employee_id = v_emp.id AND m.company_id = v_emp.company_id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT v_limit
      ) x
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_send_message(p_token text, p_content text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_content text := btrim(COALESCE(p_content, ''));
  v_row public.messages;
BEGIN
  IF v_content = '' THEN
    RETURN json_build_object('error', 'Write a message first.');
  END IF;
  IF char_length(v_content) > 2000 THEN
    RETURN json_build_object('error', 'A message can be at most 2000 characters.');
  END IF;
  IF (SELECT count(*) FROM public.messages m
      WHERE m.employee_id = v_emp.id AND m.sender_kind = 'employee' AND m.created_at > now() - interval '5 minutes') >= 30 THEN
    RETURN json_build_object('error', 'You are sending messages too quickly. Wait a moment.');
  END IF;

  INSERT INTO public.messages (company_id, employee_id, sender_kind, sender_user_id, content)
  VALUES (v_emp.company_id, v_emp.id, 'employee', NULL, v_content)
  RETURNING * INTO v_row;

  -- Replying reads what HR sent.
  UPDATE public.messages m SET read_at = now()
  WHERE m.employee_id = v_emp.id AND m.sender_kind = 'staff' AND m.read_at IS NULL;

  PERFORM public.notify_roles(v_emp.company_id, ARRAY['hr'], 'message', format('New message from %s', v_emp.name),
    left(v_content, 140), '/messages?employee=' || v_emp.id);
  PERFORM public._engagement_ping_thread(v_emp.id, v_row.id);

  RETURN json_build_object(
    'id', v_row.id, 'content', v_row.content, 'sender_kind', v_row.sender_kind, 'sender_name', v_emp.name,
    'mine', true, 'created_at', v_row.created_at, 'read_at', v_row.read_at
  );
END;
$$;

-- Badges for the portal navigation.
CREATE OR REPLACE FUNCTION public.portal_engagement_counts(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public._engagement_today();
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
$$;

-- ===========================================================================
-- Celebrations
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.portal_celebrations(p_token text, p_days integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public._engagement_today();
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
$$;

CREATE OR REPLACE FUNCTION public.portal_send_wish(p_token text, p_employee uuid, p_kind text, p_message text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_today date := public._engagement_today();
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
$$;

CREATE OR REPLACE FUNCTION public.portal_set_share_birthday(p_token text, p_share boolean)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_share boolean := COALESCE(p_share, true);
BEGIN
  UPDATE public.employees e SET share_birthday = v_share WHERE e.id = v_emp.id AND e.company_id = v_emp.company_id;
  PERFORM public._engagement_portal_log(v_emp, 'celebration.privacy',
    format('%s %s their birthday with colleagues', v_emp.name, CASE WHEN v_share THEN 'shared' ELSE 'stopped sharing' END),
    jsonb_build_object('share_birthday', v_share));
  RETURN json_build_object('ok', true, 'share_birthday', v_share);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: portal RPCs are called with the anon key (or by a signed-in browser)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.portal_announcements(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_polls(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_vote(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_complaints(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_submit_complaint(text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_messages(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_send_message(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_engagement_counts(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_celebrations(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_send_wish(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_set_share_birthday(text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.portal_announcements(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_polls(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_vote(text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_complaints(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_submit_complaint(text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_messages(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_send_message(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_engagement_counts(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_celebrations(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_send_wish(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_set_share_birthday(text, boolean) TO anon, authenticated;
