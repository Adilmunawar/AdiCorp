-- Courses & expenses: a subscription's renewal never lands before the cycle its first payment pays for.
--
-- The renewal date was start date + one cycle per payment. When the start date lies more
-- than a cycle before the first payment, the item was overdue the moment it was paid:
--   * Finance adds a running tool ("started 1 Mar 2025") and records today's payment:
--     "Renewal overdue since 1 Apr 2025", listed under To pay, counted in the badge.
--   * An approved request starting 12 Aug is first paid on 20 Sep: renews 12 Sep, overdue.
-- The cycles before the first payment were never paid for, so they are skipped: the anchor
-- moves on by whole cycles to the one the first payment falls in, keeping the start date's
-- day of the month (1 Mar 2025, paid 9 Oct 2026, renews 1 Nov 2026). Counting from the
-- start every time still never drifts (31 Jan, paid 15 Mar: renews 31 Mar, then 30 Apr).
-- A first payment on or before the start date (every live subscription) gives the same
-- date as before; backfilling older payments keeps the same date, and missing renewals
-- still show as overdue. Same signature, attributes and grants.

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
  v_anchor date;
  v_cycle integer;
  v_months integer;
  v_skip integer := 0;
BEGIN
  SELECT x.billing, x.start_date INTO v_billing, v_start FROM public.expenses x WHERE x.id = p_id;
  IF v_billing IS NULL OR v_billing = 'once' THEN
    RETURN NULL;
  END IF;
  SELECT count(*)::integer, min(p.paid_on) INTO v_count, v_first FROM public.expense_payments p WHERE p.expense_id = p_id;
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;
  v_cycle := CASE v_billing WHEN 'yearly' THEN 12 ELSE 1 END;
  v_anchor := COALESCE(v_start, v_first);
  IF v_first > v_anchor THEN
    -- Whole months from the start to the first paid day (start + n months <= first paid day).
    v_months := (extract(year FROM v_first)::integer - extract(year FROM v_anchor)::integer) * 12
              + (extract(month FROM v_first)::integer - extract(month FROM v_anchor)::integer);
    IF (v_anchor + make_interval(months => v_months))::date > v_first THEN
      v_months := v_months - 1;
    END IF;
    v_skip := GREATEST(v_months, 0) / v_cycle;
  END IF;
  RETURN (v_anchor + make_interval(months => v_cycle * (v_skip + v_count)))::date;
END;
$$;

REVOKE ALL ON FUNCTION public._expense_renewal(uuid) FROM PUBLIC, anon, authenticated;
