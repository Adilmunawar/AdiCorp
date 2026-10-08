-- Courses & expenses: a subscription's renewal date counts from its first *paid* day.
--
-- Without a start date the cycle was anchored on the payment that was *recorded* first
-- (ORDER BY created_at). When Finance backfills an older payment after a newer one
-- (records October, then adds September), the anchor became October and the renewal
-- date jumped a whole cycle ahead: two monthly payments from 9 Sep gave 9 Dec instead
-- of 9 Nov, so a due renewal disappeared from "To pay". The earliest paid_on is the
-- real first cycle. Same signature, attributes and grants; live dates do not change
-- (every subscription's payments were recorded in date order).

CREATE OR REPLACE FUNCTION public._expense_renewal(p_id uuid)
RETURNS date
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_billing text;
  v_start date;
  v_count integer;
  v_first date;
BEGIN
  SELECT x.billing, x.start_date INTO v_billing, v_start FROM public.expenses x WHERE x.id = p_id;
  IF v_billing IS NULL OR v_billing = 'once' THEN
    RETURN NULL;
  END IF;
  SELECT count(*)::integer, min(p.paid_on) INTO v_count, v_first FROM public.expense_payments p WHERE p.expense_id = p_id;
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;
  RETURN (COALESCE(v_start, v_first) + make_interval(months => (CASE v_billing WHEN 'yearly' THEN 12 ELSE 1 END) * v_count))::date;
END;
$$;
