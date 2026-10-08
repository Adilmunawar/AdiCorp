-- Engagement, second pass: poll turnout that adds up, and complaint replies that tell the
-- employee the right thing.
--
-- 1. _engagement_poll_json counted every vote in total_votes but only today's active staff in
--    "eligible". Once someone who voted leaves, HR reads "53 of 52 voted" and "Not voted yet"
--    no longer matches eligible - voted. Eligible is now everyone who could take part: today's
--    active staff plus anyone who already voted, so voted <= eligible and the difference is
--    exactly the "not voted yet" list of engagement_poll_detail.
-- 2. engagement_respond_complaint:
--    - a NULL status slipped past the NOT IN check and failed on the NOT NULL column with a raw
--      constraint error; it now gets the same "Choose a status." as any unknown value;
--    - moving a complaint to "investigating" told the employee "Your complaint is now
--      investigating", and back to "pending" "Your complaint is now pending";
--    - removing HR's response (and changing nothing else) sent the employee "Your complaint is
--      now pending", and kept "Last response by <name>" on a complaint with no response.
--      Removing a response now clears who / when, logs it as removed and notifies nobody.
-- 3. engagement_set_poll_status: a NULL status got the same raw constraint error; closing a
--    poll that is already closed no longer moves its closing time.
-- 4. engagement_coming_up: the "complaints" chip counts pending complaints, so it opens the
--    Pending tab instead of the full list.

CREATE OR REPLACE FUNCTION public._engagement_poll_json(p_poll public.polls, p_with_counts boolean)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH opts AS (
    SELECT o.id, o.option_text, o.position,
           (SELECT count(*) FROM public.poll_votes v WHERE v.option_id = o.id AND v.poll_id = o.poll_id)::int AS votes
    FROM public.poll_options o
    WHERE o.poll_id = p_poll.id
  ),
  total AS (SELECT COALESCE(sum(votes), 0)::int AS n FROM opts)
  SELECT json_build_object(
    'id', p_poll.id,
    'question', p_poll.question,
    'description', p_poll.description,
    'status', CASE WHEN p_poll.status = 'active' AND (p_poll.expires_at IS NULL OR p_poll.expires_at > now()) THEN 'open' ELSE 'closed' END,
    'expires_at', p_poll.expires_at,
    'closed_at', COALESCE(p_poll.closed_at, CASE WHEN p_poll.expires_at <= now() THEN p_poll.expires_at END),
    'created_at', p_poll.created_at,
    'author_name', public._engagement_staff_name(p_poll.created_by),
    'total_votes', CASE WHEN p_with_counts THEN (SELECT n FROM total) END,
    -- Today's active staff, plus anyone who voted and has since left.
    'eligible', CASE WHEN p_with_counts THEN (
      SELECT count(*)::int FROM public.employees e
      WHERE e.company_id = p_poll.company_id
        AND (e.status = 'active' OR EXISTS (SELECT 1 FROM public.poll_votes v WHERE v.poll_id = p_poll.id AND v.employee_id = e.id))
    ) END,
    'options', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', o.id, 'text', o.option_text, 'position', o.position,
        'votes', CASE WHEN p_with_counts THEN o.votes END,
        'percent', CASE WHEN (SELECT n FROM total) > 0 THEN round(o.votes * 100.0 / (SELECT n FROM total))::int ELSE 0 END
      ) ORDER BY o.position, o.id), '[]'::json)
      FROM opts o
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.engagement_respond_complaint(p_id uuid, p_status text, p_response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._engagement_require_hr();
  v_old public.complaints;
  v_response text := NULLIF(btrim(COALESCE(p_response, '')), '');
  v_status_changed boolean;
  v_response_changed boolean;
  v_title text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('pending', 'investigating', 'resolved') THEN
    RAISE EXCEPTION 'Choose a status.' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_response, '')) > 2000 THEN
    RAISE EXCEPTION 'The response can be at most 2000 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old FROM public.complaints c WHERE c.id = p_id AND c.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That complaint no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  v_status_changed := v_old.status IS DISTINCT FROM p_status;
  v_response_changed := v_old.response IS DISTINCT FROM v_response;
  IF NOT v_status_changed AND NOT v_response_changed THEN
    RETURN;
  END IF;

  -- Who responded, and when, belongs to the response: removing it clears both.
  UPDATE public.complaints c
  SET status = p_status,
      response = v_response,
      responded_by = CASE WHEN NOT v_response_changed THEN c.responded_by WHEN v_response IS NULL THEN NULL ELSE auth.uid() END,
      responded_at = CASE WHEN NOT v_response_changed THEN c.responded_at WHEN v_response IS NULL THEN NULL ELSE now() END
  WHERE c.id = p_id;

  IF NOT v_old.is_anonymous AND v_old.employee_id IS NOT NULL THEN
    v_title := CASE
      WHEN v_status_changed AND p_status = 'resolved' THEN 'Your complaint was resolved'
      WHEN v_response_changed AND v_response IS NOT NULL THEN 'HR responded to your complaint'
      WHEN v_status_changed AND p_status = 'investigating' THEN 'HR is looking into your complaint'
      WHEN v_status_changed AND p_status = 'pending' THEN 'Your complaint is open again'
    END;
    -- NULL when HR only took its response back: there is nothing new to tell the employee.
    IF v_title IS NOT NULL THEN
      PERFORM public.notify_employee(v_company, v_old.employee_id, 'complaint', v_title, v_old.subject, '/portal/complaints');
    END IF;
  END IF;

  IF v_status_changed THEN
    PERFORM public.log_activity(
      'complaint.status', format('Marked the complaint "%s" %s', v_old.subject, p_status),
      jsonb_build_object('complaint_id', p_id, 'from', v_old.status, 'to', p_status, 'anonymous', v_old.is_anonymous),
      CASE WHEN v_old.is_anonymous THEN NULL ELSE v_old.employee_id END
    );
  END IF;
  IF v_response_changed THEN
    PERFORM public.log_activity(
      'complaint.response',
      CASE WHEN v_response IS NULL THEN format('Removed the response to the complaint "%s"', v_old.subject)
           ELSE format('Responded to the complaint "%s"', v_old.subject) END,
      jsonb_build_object('complaint_id', p_id, 'anonymous', v_old.is_anonymous, 'removed', v_response IS NULL),
      CASE WHEN v_old.is_anonymous THEN NULL ELSE v_old.employee_id END
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_set_poll_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._engagement_require_hr();
  v_question text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('active', 'closed') THEN
    RAISE EXCEPTION 'Unknown poll status.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.polls p
  SET status = p_status,
      -- Closing an already closed poll keeps the time it closed.
      closed_at = CASE WHEN p_status = 'closed' THEN COALESCE(CASE WHEN p.status = 'closed' THEN p.closed_at END, now()) END,
      -- Reopening a poll that ran out of time removes the deadline.
      expires_at = CASE WHEN p_status = 'active' AND p.expires_at <= now() THEN NULL ELSE p.expires_at END
  WHERE p.id = p_id AND p.company_id = v_company
  RETURNING p.question INTO v_question;
  IF v_question IS NULL THEN
    RAISE EXCEPTION 'That poll no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_activity(
    CASE WHEN p_status = 'closed' THEN 'poll.closed' ELSE 'poll.reopened' END,
    format('%s the poll "%s"', CASE WHEN p_status = 'closed' THEN 'Closed' ELSE 'Reopened' END, v_question),
    jsonb_build_object('poll_id', p_id)
  );
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
        SELECT 'complaints', count(*)::int, '/complaints?tab=pending', 4
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
