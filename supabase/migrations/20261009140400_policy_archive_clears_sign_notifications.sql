-- Archiving a policy removes the unread "Please read and sign" notifications for its versions, so
-- employees are not sent to a sign page for a policy that is no longer live. Opened notifications are
-- kept as history; restoring the policy does not re-create them (HR can use "Remind unsigned").

CREATE OR REPLACE FUNCTION public.policy_set_archived(p_policy uuid, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_title text;
  v_cleared integer := 0;
BEGIN
  IF NOT COALESCE(p_archived, false) THEN
    SELECT p.title INTO v_title FROM public.policies p
    WHERE p.id = p_policy AND p.company_id = v_company AND p.archived_at IS NOT NULL;
    IF v_title IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.policies o
      WHERE o.company_id = v_company AND o.id <> p_policy AND o.archived_at IS NULL
        AND lower(o.title) = lower(v_title)) THEN
      RAISE EXCEPTION 'A live policy is already called "%". Rename or archive that one first.', v_title USING ERRCODE = '23505';
    END IF;
    v_title := NULL;
  END IF;

  UPDATE public.policies
  SET archived_at = CASE WHEN p_archived THEN COALESCE(archived_at, now()) ELSE NULL END
  WHERE id = p_policy AND company_id = v_company
  RETURNING title INTO v_title;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'That policy was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(p_archived, false) THEN
    DELETE FROM public.notifications n
    WHERE n.company_id = v_company AND n.kind = 'policy' AND n.read_at IS NULL
      AND n.href IN (SELECT '/portal/policies/sign/' || v.id FROM public.policy_versions v WHERE v.policy_id = p_policy);
    GET DIAGNOSTICS v_cleared = ROW_COUNT;
  END IF;

  PERFORM public.log_activity(CASE WHEN p_archived THEN 'policy.archived' ELSE 'policy.restored' END,
    public._policies_actor_name() || CASE WHEN p_archived THEN ' archived ' ELSE ' restored ' END || v_title,
    jsonb_build_object('policy_id', p_policy, 'notifications_cleared', v_cleared));
END;
$function$;
