-- Deleting an announcement or a poll also removes the portal notifications it created, so employees
-- are not pointed at something that no longer exists. The notification rows carry no reference to the
-- announcement/poll, but they were inserted in the same transaction, so created_at (transaction now())
-- matches exactly. Notifications the employee already opened are left as history.

CREATE OR REPLACE FUNCTION public.engagement_delete_announcement(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._engagement_require_hr();
  v_title text;
  v_created timestamptz;
  v_cleared integer := 0;
BEGIN
  DELETE FROM public.announcements a WHERE a.id = p_id AND a.company_id = v_company
  RETURNING a.title, a.created_at INTO v_title, v_created;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'That announcement no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.notifications n
  WHERE n.company_id = v_company AND n.kind = 'announcement' AND n.created_at = v_created AND n.read_at IS NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  PERFORM public.log_activity('announcement.deleted', format('Deleted the announcement "%s"', v_title),
    jsonb_build_object('announcement_id', p_id, 'notifications_cleared', v_cleared));
END;
$$;

CREATE OR REPLACE FUNCTION public.engagement_delete_poll(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._engagement_require_hr();
  v_question text;
  v_created timestamptz;
  v_cleared integer := 0;
BEGIN
  DELETE FROM public.polls p WHERE p.id = p_id AND p.company_id = v_company
  RETURNING p.question, p.created_at INTO v_question, v_created;
  IF v_question IS NULL THEN
    RAISE EXCEPTION 'That poll no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.notifications n
  WHERE n.company_id = v_company AND n.kind = 'poll' AND n.created_at = v_created AND n.read_at IS NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  PERFORM public.log_activity('poll.deleted', format('Deleted the poll "%s"', v_question),
    jsonb_build_object('poll_id', p_id, 'notifications_cleared', v_cleared));
END;
$$;
