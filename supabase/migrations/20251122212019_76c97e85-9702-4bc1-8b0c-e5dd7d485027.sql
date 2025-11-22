-- Fix function search path vulnerability by adding SET search_path = public to all functions

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT is_admin FROM public.profiles WHERE id = user_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_profile(user_id uuid)
 RETURNS SETOF profiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT * FROM public.profiles WHERE id = user_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT company_id FROM public.profiles WHERE id = user_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_salary_stats(target_month date, in_company_id uuid)
 RETURNS TABLE(total_calculated_salary numeric, total_budget_salary numeric, average_daily_rate numeric, employee_count integer)
 LANGUAGE sql
 SET search_path = public
AS $function$
  WITH employees AS (
    SELECT id, wage_rate
    FROM public.employees
    WHERE company_id = in_company_id AND status = 'active'
  ),
  attendance AS (
    SELECT
      a.employee_id,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present,
      SUM(CASE WHEN a.status = 'short_leave' THEN 1 ELSE 0 END) as short_leave
    FROM public.attendance a
    WHERE a.employee_id IN (SELECT id FROM employees)
      AND a.date >= date_trunc('month', target_month)
      AND a.date <= (date_trunc('month', target_month) + interval '1 month - 1 day')
    GROUP BY a.employee_id
  ),
  working_days AS (
    SELECT 22 AS days
  ),
  salary_data AS (
    SELECT
      e.id,
      COALESCE(e.wage_rate,0) as wage_rate,
      COALESCE(a.present,0) as present_days,
      COALESCE(a.short_leave,0) as short_leave_days,
      wd.days as total_working_days,
      COALESCE(e.wage_rate,0)::numeric / NULLIF(wd.days,0) as daily_rate,
      (COALESCE(a.present,0) + COALESCE(a.short_leave,0) * 0.5) as actual_working_days,
      ((COALESCE(e.wage_rate,0)::numeric / NULLIF(wd.days,0)) * (COALESCE(a.present,0) + COALESCE(a.short_leave,0) * 0.5)) as calculated_salary
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id
    CROSS JOIN working_days wd
    GROUP BY e.id, e.wage_rate, a.present, a.short_leave, wd.days
  )
  SELECT
    COALESCE(SUM(calculated_salary),0) as total_calculated_salary,
    COALESCE(SUM(wage_rate),0) as total_budget_salary,
    COALESCE(AVG(daily_rate),0) as average_daily_rate,
    COUNT(*) as employee_count
  FROM salary_data;
$function$;

CREATE OR REPLACE FUNCTION public.get_working_days_for_month(target_company_id uuid, target_month date)
 RETURNS TABLE(total_working_days integer, daily_rate_divisor integer, working_dates date[])
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  company_settings RECORD;
  monthly_config RECORD;
  start_date DATE;
  end_date DATE;
  iter_date DATE;
  working_dates_array DATE[] := ARRAY[]::DATE[];
  day_of_week INTEGER;
  is_working_day BOOLEAN;
BEGIN
  SELECT * INTO company_settings 
  FROM public.company_working_settings 
  WHERE company_id = target_company_id;
  
  IF NOT FOUND THEN
    company_settings.default_working_days_per_month := 22;
    company_settings.salary_divisor := 26;
    company_settings.weekend_saturday := false;
    company_settings.weekend_sunday := true;
  END IF;
  
  SELECT * INTO monthly_config 
  FROM public.monthly_working_days 
  WHERE company_id = target_company_id AND month = DATE_TRUNC('month', target_month);
  
  IF FOUND THEN
    total_working_days := monthly_config.working_days_count;
    daily_rate_divisor := monthly_config.daily_rate_divisor;
  ELSE
    total_working_days := company_settings.default_working_days_per_month;
    daily_rate_divisor := company_settings.salary_divisor;
  END IF;
  
  start_date := DATE_TRUNC('month', target_month);
  end_date := (DATE_TRUNC('month', target_month) + INTERVAL '1 month - 1 day')::DATE;
  iter_date := start_date;
  
  WHILE iter_date <= end_date LOOP
    day_of_week := EXTRACT(DOW FROM iter_date);
    is_working_day := true;
    
    IF day_of_week = 0 AND company_settings.weekend_sunday THEN
      is_working_day := false;
    END IF;
    
    IF day_of_week = 6 AND NOT company_settings.weekend_saturday THEN
      is_working_day := false;
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM public.events 
      WHERE company_id = target_company_id 
      AND date = iter_date 
      AND affects_attendance = true 
      AND type IN ('holiday', 'off_day')
    ) THEN
      is_working_day := false;
    END IF;
    
    IF is_working_day THEN
      working_dates_array := array_append(working_dates_array, iter_date);
    END IF;
    
    iter_date := iter_date + 1;
  END LOOP;
  
  working_dates := working_dates_array;
  RETURN NEXT;
END;
$function$;