-- Payslip "paid leave days" counted approved unpaid leave too (pay itself was already right).
-- Leave days covered by an approved unpaid-type request are no longer counted as paid leave.

CREATE OR REPLACE FUNCTION public._payroll_attendance(p_employee uuid, p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_start date := date_trunc('month', p_month::timestamp)::date;
  v_end date := (date_trunc('month', p_month::timestamp) + interval '1 month - 1 day')::date;
  v_join date;
  v_sep date;
  v_from date;
  v_to date;
  v_sofar date;
  v_month_days integer := 0;
  v_so_far integer := 0;
  v_unmarked integer := 0;
  v_present integer := 0;
  v_half integer := 0;
  v_leave integer := 0;
  v_absent integer := 0;
BEGIN
  SELECT e.joining_date, e.separation_date INTO v_join, v_sep FROM public.employees e WHERE e.id = p_employee;
  v_from := GREATEST(v_start, COALESCE(v_join, v_start));
  v_to := LEAST(v_end, COALESCE(v_sep, v_end));
  v_sofar := LEAST(v_to, current_date);

  IF v_from <= v_to THEN
    SELECT count(*) INTO v_month_days FROM public._payroll_working_dates(p_employee, v_from, v_to);
  END IF;
  IF v_from <= v_sofar THEN
    SELECT count(*), count(*) FILTER (WHERE a.id IS NULL)
    INTO v_so_far, v_unmarked
    FROM public._payroll_working_dates(p_employee, v_from, v_sofar) AS w(d)
    LEFT JOIN public.attendance a ON a.employee_id = p_employee AND a.date = w.d;

    SELECT count(*) FILTER (WHERE a.status IN ('present', 'late')),
           count(*) FILTER (WHERE a.status IN ('short_leave', 'half_day')),
           count(*) FILTER (WHERE a.status = 'leave' AND NOT EXISTS (
             SELECT 1 FROM public.leave_requests r
             JOIN public.leave_types t ON t.id = r.leave_type_id
             WHERE r.employee_id = p_employee AND r.status = 'approved' AND NOT t.is_paid
               AND a.date BETWEEN r.start_date AND r.end_date
           )),
           count(*) FILTER (WHERE a.status = 'absent')
    INTO v_present, v_half, v_leave, v_absent
    FROM public.attendance a
    WHERE a.employee_id = p_employee AND a.date BETWEEN v_from AND v_sofar;
  END IF;

  RETURN jsonb_build_object(
    'working_days', v_so_far,
    'working_days_month', v_month_days,
    'present', v_present,
    'half', v_half,
    'leave', v_leave,
    'absent', v_absent,
    'unmarked', v_unmarked,
    'days_worked', v_present + v_half * 0.5
  );
END;
$$;

-- Reference figure only: bring existing payslips in line.
UPDATE public.payslips p
SET paid_leave_days = (public._payroll_attendance(p.employee_id, p.month) ->> 'leave')::numeric
WHERE p.paid_leave_days IS DISTINCT FROM (public._payroll_attendance(p.employee_id, p.month) ->> 'leave')::numeric
  AND EXISTS (
    SELECT 1 FROM public.leave_requests r JOIN public.leave_types t ON t.id = r.leave_type_id
    WHERE r.employee_id = p.employee_id AND r.status = 'approved' AND NOT t.is_paid
      AND r.start_date < (p.month + interval '1 month')::date AND r.end_date >= date_trunc('month', p.month)::date
  );
