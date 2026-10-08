-- Payroll 4/5: HR -> Finance pay events for unpaid leave.
-- Joiners, leavers, rejoins, joining-date and position changes are recorded by the People module's
-- trigger on employees (tg_people_pay_events). Approved unpaid leave, and unpaid leave that is no longer
-- approved, are recorded here from leave_requests whichever way the change is made, so the Leave
-- module's RPCs do not need to write pay events themselves. Facts only, no money: HR causes these.
-- A failure here never blocks HR's own action.

CREATE OR REPLACE FUNCTION public.tg_payroll_leave_pay_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_was boolean := TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'approved';
  v_now boolean := TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'approved';
  v_row public.leave_requests;
  v_kind text;
  v_unpaid boolean;
  v_type text;
  v_name text;
  v_days integer;
  v_when text;
  v_title text;
  v_detail text;
BEGIN
  IF v_was = v_now THEN
    RETURN NULL;
  END IF;
  IF v_now THEN
    v_row := NEW;
    v_kind := 'unpaid_leave';
  ELSE
    v_row := OLD;
    v_kind := 'unpaid_leave_undone';
  END IF;

  BEGIN
    SELECT NOT t.is_paid, t.name INTO v_unpaid, v_type FROM public.leave_types t WHERE t.id = v_row.leave_type_id;
    IF NOT COALESCE(v_unpaid, false) THEN
      RETURN NULL;
    END IF;
    SELECT e.name INTO v_name FROM public.employees e WHERE e.id = v_row.employee_id;
    IF v_name IS NULL THEN
      RETURN NULL;
    END IF;
    -- Recorded once per change, even when an RPC records the same event in this transaction.
    IF EXISTS (SELECT 1 FROM public.pay_events v
               WHERE v.employee_id = v_row.employee_id AND v.kind = v_kind
                 AND v.effective_date IS NOT DISTINCT FROM v_row.start_date AND v.created_at >= now()) THEN
      RETURN NULL;
    END IF;

    SELECT count(*) INTO v_days FROM public._payroll_working_dates(v_row.employee_id, v_row.start_date, v_row.end_date);
    v_when := CASE WHEN v_row.end_date IS NULL OR v_row.end_date = v_row.start_date
                   THEN public._payroll_day_label(v_row.start_date)
                   ELSE format('%s to %s', to_char(v_row.start_date, 'FMDD Mon'), public._payroll_day_label(v_row.end_date)) END;
    IF v_kind = 'unpaid_leave' THEN
      v_title := format('Unpaid leave: %s', v_name);
      v_detail := format('%s, %s: %s working %s not paid.', v_type, v_when, v_days, CASE WHEN v_days = 1 THEN 'day' ELSE 'days' END);
    ELSE
      v_title := format('Unpaid leave taken back: %s', v_name);
      v_detail := format('%s from %s is no longer approved, so those days are paid again.', v_type, public._payroll_day_label(v_row.start_date));
    END IF;

    INSERT INTO public.pay_events (company_id, employee_id, kind, title, detail, effective_date, created_by)
    VALUES (v_row.company_id, v_row.employee_id, v_kind, left(v_title, 200), left(v_detail, 500), v_row.start_date, auth.uid());
    PERFORM public.notify_roles(v_row.company_id, ARRAY['finance'], 'payroll', v_title, v_detail, '/payroll/updates');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pay event not recorded: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_payroll_leave_pay_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payroll_leave_pay_events ON public.leave_requests;
CREATE TRIGGER payroll_leave_pay_events
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_leave_pay_events();
