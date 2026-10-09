-- Leave: the balance refusal read "1 day remain and this request needs 3 days"; a single
-- remaining day now reads "1 day remains". The sentence still starts with
-- "Not enough <type> leave for <year>:" which the app matches to offer "File anyway" /
-- "Approve anyway". Behaviour is otherwise unchanged.
CREATE OR REPLACE FUNCTION public._leave_balance_check(p_company uuid, p_employee uuid, p_leave_type uuid, p_start date, p_end date)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  y record;
  v_remaining numeric;
  v_type text;
BEGIN
  FOR y IN SELECT * FROM public._leave_year_days(p_employee, p_start, p_end) LOOP
    SELECT b.remaining, b.type_name INTO v_remaining, v_type
    FROM public._leave_balance_rows(p_company, y.year, p_employee) b
    WHERE b.leave_type_id = p_leave_type;
    IF v_remaining IS NOT NULL AND v_remaining - y.days < 0 THEN
      RAISE EXCEPTION 'Not enough % leave for %: % and this request needs % in %.',
        v_type, y.year,
        CASE WHEN v_remaining = 1 THEN '1 day remains'
             WHEN v_remaining > 0 THEN public._leave_day_word(v_remaining) || ' remain'
             WHEN v_remaining = 0 THEN 'none remain'
             ELSE 'none remain (' || public._leave_day_word(-v_remaining) || ' over)' END,
        public._leave_day_word(y.days), y.year
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._leave_balance_check(uuid, uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
