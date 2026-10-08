-- Overtime: moving approved hours back to pending was silent. Finance had been told the hours were
-- waiting for a rate (and may already have priced them: that price is cleared here), and the
-- employee had been told they were approved. Both are now told, the same way leave undo tells the
-- employee. Hours only: no amounts in either message.

CREATE OR REPLACE FUNCTION public.overtime_review(p_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 300), '');
  v_verb text;
BEGIN
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Choose approve, reject or undo.' USING ERRCODE = '22023';
  END IF;
  SELECT o.id, o.employee_id, o.date, o.hours, o.status, o.payslip_id, e.name AS employee_name
  INTO v
  FROM public.overtime_records o
  JOIN public.employees e ON e.id = o.employee_id
  WHERE o.id = p_id AND o.company_id = v_company
  FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That overtime entry no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF public._ot_locked(v.payslip_id) THEN
    RAISE EXCEPTION 'This overtime is on a final payslip, so it is paid and locked.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'pending' AND v.status = 'pending' THEN
    RAISE EXCEPTION 'This entry is already pending.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status <> 'pending' AND v.status <> 'pending' THEN
    RAISE EXCEPTION 'This entry has already been decided. Refresh to see its status.' USING ERRCODE = 'P0001';
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.overtime_records
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = v_note, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.overtime_records
    SET status = p_status,
        reviewed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
        reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
        review_notes = CASE WHEN p_status = 'pending' THEN NULL ELSE v_note END,
        pay_status = 'unpriced', hourly_rate = 0, multiplier = 1, total_amount = 0,
        payslip_id = NULL, priced_by = NULL, priced_at = NULL, updated_at = now()
    WHERE id = p_id;
  END IF;

  v_verb := CASE WHEN p_status = 'pending' THEN 'undone' ELSE p_status END;
  PERFORM public.log_activity(
    'overtime.' || v_verb,
    CASE WHEN p_status = 'pending'
      THEN format('%s moved %s''s overtime on %s back to pending', public._leave_actor_name(), v.employee_name, to_char(v.date, 'FMDD Mon YYYY'))
      ELSE format('%s %s %s overtime for %s on %s', public._leave_actor_name(), p_status, public._ot_hours_label(v.hours), v.employee_name, to_char(v.date, 'FMDD Mon YYYY')) END,
    jsonb_build_object('id', p_id, 'date', v.date, 'hours', v.hours, 'from', v.status, 'to', p_status, 'note', v_note),
    v.employee_id
  );

  IF p_status <> 'pending' THEN
    PERFORM public.notify_employee(
      v_company, v.employee_id, 'overtime',
      CASE WHEN p_status = 'approved' THEN 'Your overtime was approved' ELSE 'Your overtime was not approved' END,
      format('%s on %s%s%s', public._ot_hours_label(v.hours), to_char(v.date, 'FMDD Mon YYYY'),
             CASE WHEN p_status = 'approved' THEN ' · paid with your salary once Finance sets the rate' ELSE '' END,
             CASE WHEN v_note IS NOT NULL THEN format(' · HR: "%s"', left(v_note, 100)) ELSE '' END),
      '/portal/overtime'
    );
  ELSIF v.status = 'approved' THEN
    PERFORM public.notify_employee(
      v_company, v.employee_id, 'overtime', 'Your overtime is back under review',
      format('%s on %s', public._ot_hours_label(v.hours), to_char(v.date, 'FMDD Mon YYYY')),
      '/portal/overtime'
    );
    PERFORM public.notify_roles(
      v_company, ARRAY['finance'], 'overtime',
      format('Overtime approval withdrawn for %s', v.employee_name),
      format('%s on %s · back with HR, so it is off the pay list until it is approved again', public._ot_hours_label(v.hours), to_char(v.date, 'FMDD Mon YYYY')),
      '/payroll/overtime'
    );
  END IF;
  IF p_status = 'approved' THEN
    PERFORM public._ot_tell_finance(v_company, v.employee_name, v.hours, v.date);
  END IF;
  RETURN json_build_object('id', p_id, 'status', p_status);
END;
$function$;
