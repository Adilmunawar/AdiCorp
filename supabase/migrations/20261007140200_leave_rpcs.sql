-- Leave & overtime module (3/5): leave RPCs for staff (HR and owner decide; Finance reads).
-- Every write is a SECURITY DEFINER function so the request, its attendance rows, the pay event for Finance,
-- the notifications and the timeline entry move together in one transaction.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Today in the company's time zone (companies.timezone when present, else Asia/Karachi).
CREATE OR REPLACE FUNCTION public._leave_today(p_company uuid)
RETURNS date
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT NULLIF(btrim(to_jsonb(c) ->> 'timezone'), '') INTO v_tz FROM public.companies c WHERE c.id = p_company;
  BEGIN
    RETURN (now() AT TIME ZONE COALESCE(v_tz, 'Asia/Karachi'))::date;
  EXCEPTION WHEN others THEN
    RETURN (now() AT TIME ZONE 'Asia/Karachi')::date;
  END;
END;
$$;

-- "12 Oct 2026" or "12 Oct to 15 Oct 2026" (years shown on both sides when they differ).
CREATE OR REPLACE FUNCTION public._leave_when(p_start date, p_end date)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_start = p_end THEN to_char(p_start, 'FMDD Mon YYYY')
    WHEN extract(year FROM p_start) = extract(year FROM p_end) THEN to_char(p_start, 'FMDD Mon') || ' to ' || to_char(p_end, 'FMDD Mon YYYY')
    ELSE to_char(p_start, 'FMDD Mon YYYY') || ' to ' || to_char(p_end, 'FMDD Mon YYYY')
  END
$$;

CREATE OR REPLACE FUNCTION public._leave_day_word(p_days numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT trim_scale(p_days)::text || CASE WHEN p_days = 1 THEN ' day' ELSE ' days' END
$$;

-- The signed-in staff member's display name.
CREATE OR REPLACE FUNCTION public._leave_actor_name()
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') FROM public.profiles p WHERE p.id = auth.uid()),
    'HR'
  )
$$;

-- Owner or HR of a company; returns that company.
CREATE OR REPLACE FUNCTION public._leave_require_hr()
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can do this.' USING ERRCODE = '42501';
  END IF;
  RETURN v_company;
END;
$$;

-- Working dates for one person in a range. Uses the time module's public.working_dates (the one
-- definition shared by time, leave and payroll) when it exists; otherwise the same rule inline: inside
-- employment, not a holiday/off day, and either an extra working day or not one of the person's weekend
-- days (their own weekend flags, else the company's).
CREATE OR REPLACE FUNCTION public._leave_working_dates(p_employee uuid, p_start date, p_end date)
RETURNS date[]
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_dates date[];
BEGIN
  SELECT e.company_id INTO v_company FROM public.employees e WHERE e.id = p_employee;
  IF v_company IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RETURN '{}'::date[];
  END IF;
  IF to_regprocedure('public.working_dates(uuid,date,date,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(array_agg(w ORDER BY w), ''{}''::date[]) FROM public.working_dates($1, $2, $3, $4) AS w'
      INTO v_dates USING v_company, p_start, p_end, p_employee;
    RETURN v_dates;
  END IF;

  WITH e AS (
    SELECT emp.company_id, emp.joining_date, emp.separation_date,
           COALESCE(emp.weekend_saturday, s.weekend_saturday, false) AS sat,
           COALESCE(emp.weekend_sunday, s.weekend_sunday, true) AS sun
    FROM public.employees emp
    LEFT JOIN public.company_working_settings s ON s.company_id = emp.company_id
    WHERE emp.id = p_employee
  )
  SELECT COALESCE(array_agg(g::date ORDER BY g), '{}'::date[]) INTO v_dates
  FROM e,
       generate_series(GREATEST(p_start, COALESCE(e.joining_date, p_start))::timestamp,
                       LEAST(p_end, COALESCE(e.separation_date, p_end))::timestamp,
                       interval '1 day') AS g
  WHERE NOT EXISTS (
          SELECT 1 FROM public.events ev
          WHERE ev.company_id = e.company_id AND ev.date = g::date
            AND ev.affects_attendance AND ev.type IN ('holiday', 'off_day')
        )
    AND (
          EXISTS (SELECT 1 FROM public.events ev WHERE ev.company_id = e.company_id AND ev.date = g::date AND ev.type = 'working_day')
          OR NOT ((extract(dow FROM g) = 6 AND e.sat) OR (extract(dow FROM g) = 0 AND e.sun))
        );
  RETURN v_dates;
END;
$$;

-- First month in the range closed by a final or paid payslip of this person (NULL when none).
-- payslips.status is owned by the payroll module; read through jsonb so this works before it exists.
CREATE OR REPLACE FUNCTION public._leave_locked_month(p_employee uuid, p_start date, p_end date)
RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT min(p.month)
  FROM public.payslips p
  WHERE p.employee_id = p_employee
    AND p.month BETWEEN date_trunc('month', p_start::timestamp)::date AND date_trunc('month', p_end::timestamp)::date
    AND (to_jsonb(p) ->> 'status') IN ('final', 'finalized', 'paid', 'locked')
$$;

-- Timeline entry written from a portal RPC (no staff user; the employee is the actor).
CREATE OR REPLACE FUNCTION public._leave_log_portal(p_company uuid, p_employee uuid, p_action text, p_description text, p_details jsonb)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES (left(p_action, 100), left(p_description, 1000), COALESCE(p_details, '{}'::jsonb), NULL, p_company, p_employee)
$$;

-- A fact for Finance's "HR updates" inbox (pay_events, owned by the people module) plus a notification.
-- Never fails the caller: HR's own action must not break because of it.
CREATE OR REPLACE FUNCTION public._leave_pay_event(
  p_company uuid, p_employee uuid, p_kind text, p_title text, p_detail text, p_effective date
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_done boolean := false;
BEGIN
  IF to_regclass('public.pay_events') IS NOT NULL THEN
    BEGIN
      -- The payroll module's trigger on leave_requests may already have recorded (and announced) this
      -- change in the same transaction: record it once.
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.pay_events v WHERE v.employee_id = $1 AND v.kind = $2
                 AND v.effective_date IS NOT DISTINCT FROM $3 AND v.created_at >= now())'
        INTO v_done USING p_employee, p_kind, p_effective;
      IF v_done THEN
        RETURN;
      END IF;
      EXECUTE 'INSERT INTO public.pay_events (company_id, employee_id, kind, title, detail, effective_date, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7)'
        USING p_company, p_employee, p_kind, left(p_title, 200), left(COALESCE(p_detail, ''), 500), p_effective, auth.uid();
    EXCEPTION WHEN others THEN
      RAISE WARNING 'pay event not recorded: %', SQLERRM;
    END;
  END IF;
  PERFORM public.notify_roles(p_company, ARRAY['finance'], 'payroll', p_title, p_detail, '/payroll/updates');
END;
$$;

-- Files a pending request after the business checks shared by HR and the portal. Returns the new row.
CREATE OR REPLACE FUNCTION public._leave_create(
  p_company uuid, p_employee uuid, p_leave_type uuid, p_start date, p_end date, p_reason text, p_requested_by uuid
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_emp record;
  v_type record;
  v_clash record;
  v_days integer;
  v_today date := public._leave_today(p_company);
  v_row public.leave_requests;
BEGIN
  SELECT e.id, e.name, e.status INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = p_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick an employee.' USING ERRCODE = 'P0001';
  END IF;
  IF v_emp.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION '% is no longer an active employee.', v_emp.name USING ERRCODE = 'P0001';
  END IF;
  SELECT t.id, t.name, t.is_active INTO v_type FROM public.leave_types t WHERE t.id = p_leave_type AND t.company_id = p_company;
  IF NOT FOUND OR NOT v_type.is_active THEN
    RAISE EXCEPTION 'Pick a leave type.' USING ERRCODE = 'P0001';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Pick a start and an end date.' USING ERRCODE = 'P0001';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'The end date is before the start date.' USING ERRCODE = 'P0001';
  END IF;
  IF p_start < v_today - 30 THEN
    RAISE EXCEPTION 'Leave can start at most 30 days back. For older dates ask HR to correct attendance directly.' USING ERRCODE = 'P0001';
  END IF;
  IF p_end - p_start >= 200 THEN
    RAISE EXCEPTION 'One request can cover at most 200 days. Split it up.' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.status, r.start_date, r.end_date, t.name AS type_name INTO v_clash
  FROM public.leave_requests r
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.employee_id = p_employee AND r.status IN ('pending', 'approved')
    AND r.start_date <= p_end AND r.end_date >= p_start
  ORDER BY r.start_date
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% already has % % % request for %. Cancel or decide that one first.',
      v_emp.name, CASE WHEN v_clash.status = 'approved' THEN 'an' ELSE 'a' END, v_clash.status,
      lower(v_clash.type_name), public._leave_when(v_clash.start_date, v_clash.end_date)
      USING ERRCODE = 'P0001';
  END IF;

  v_days := cardinality(public._leave_working_dates(p_employee, p_start, p_end));
  IF v_days < 1 THEN
    RAISE EXCEPTION 'Every day in that range is a weekend or holiday for this employee, so there is no leave to take.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.leave_requests (employee_id, company_id, leave_type_id, start_date, end_date, days_count, reason, status, requested_by)
  VALUES (p_employee, p_company, p_leave_type, p_start, p_end, v_days, NULLIF(left(btrim(COALESCE(p_reason, '')), 500), ''), 'pending', p_requested_by)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Moves a request to a new status and keeps attendance in step, in one transaction:
-- approving upserts 'leave' rows for the counted days (replacing a mark HR made on those days);
-- leaving 'approved' deletes only the rows this request wrote. Refused when a month in the range
-- is closed by a final payslip. Returns the number of attendance rows written or removed.
CREATE OR REPLACE FUNCTION public._leave_set_status(p_id uuid, p_status public.leave_status, p_reviewer uuid, p_note text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r public.leave_requests;
  v_locked date;
  v_name text;
  v_days integer := 0;
BEGIN
  SELECT * INTO r FROM public.leave_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'approved' OR r.status = 'approved' THEN
    v_locked := public._leave_locked_month(r.employee_id, r.start_date, r.end_date);
    IF v_locked IS NOT NULL THEN
      SELECT e.name INTO v_name FROM public.employees e WHERE e.id = r.employee_id;
      RAISE EXCEPTION '% is closed for %: a final payslip exists, so attendance cannot change.',
        to_char(v_locked, 'FMMonth YYYY'), v_name USING ERRCODE = 'P0001';
    END IF;
    -- Attendance months the company locked (time module), when that module is installed.
    IF to_regprocedure('public._time_locked(uuid,uuid,date)') IS NOT NULL THEN
      EXECUTE 'SELECT min(d) FROM unnest($1) AS d WHERE public._time_locked($2, $3, d)'
        INTO v_locked USING public._leave_working_dates(r.employee_id, r.start_date, r.end_date), r.company_id, r.employee_id;
      IF v_locked IS NOT NULL THEN
        RAISE EXCEPTION 'Attendance for % is locked, so this leave cannot change. Ask the owner to unlock the month first.',
          to_char(v_locked, 'FMMonth YYYY') USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF p_status = 'pending' THEN
    UPDATE public.leave_requests
    SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_notes = NULL, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.leave_requests
    SET status = p_status, reviewed_by = p_reviewer, reviewed_at = now(),
        review_notes = NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''), updated_at = now()
    WHERE id = p_id;
  END IF;

  IF p_status = 'approved' THEN
    INSERT INTO public.attendance (employee_id, company_id, date, status, leave_request_id, source, note, marked_by)
    SELECT r.employee_id, r.company_id, d, 'leave', r.id, 'leave', 'Approved leave', p_reviewer
    FROM unnest(public._leave_working_dates(r.employee_id, r.start_date, r.end_date)) AS d
    ON CONFLICT (employee_id, date) DO UPDATE
      SET status = 'leave', leave_request_id = EXCLUDED.leave_request_id, source = 'leave',
          note = 'Approved leave', marked_by = EXCLUDED.marked_by;
    GET DIAGNOSTICS v_days = ROW_COUNT;
  ELSIF r.status = 'approved' THEN
    DELETE FROM public.attendance a
    WHERE a.employee_id = r.employee_id AND a.leave_request_id = r.id AND a.status = 'leave';
    GET DIAGNOSTICS v_days = ROW_COUNT;
  END IF;
  RETURN v_days;
END;
$$;

-- Approval side effects shared by HR approval, "approve now" and auto-approval.
CREATE OR REPLACE FUNCTION public._leave_after_approval(p_id uuid, p_days integer, p_automatic boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v record;
  v_when text;
BEGIN
  SELECT r.id, r.company_id, r.employee_id, r.start_date, r.end_date, r.days_count, r.review_notes,
         e.name AS employee_name, t.name AS type_name, t.is_paid
  INTO v
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id;
  v_when := public._leave_when(v.start_date, v.end_date);

  IF p_automatic THEN
    -- Auto-approval only happens on a portal request: the employee is the actor.
    PERFORM public._leave_log_portal(
      v.company_id, v.employee_id, 'leave.approved',
      format('%s leave for %s, %s, was approved automatically', v.type_name, v.employee_name, v_when),
      jsonb_build_object('id', v.id, 'start', v.start_date, 'end', v.end_date, 'days', v.days_count, 'attendance_days', p_days, 'automatic', true)
    );
  ELSE
    PERFORM public.log_activity(
      'leave.approved',
      format('%s approved %s leave for %s, %s', public._leave_actor_name(), lower(v.type_name), v.employee_name, v_when),
      jsonb_build_object('id', v.id, 'start', v.start_date, 'end', v.end_date, 'days', v.days_count, 'attendance_days', p_days, 'automatic', false),
      v.employee_id
    );
  END IF;
  -- Unpaid leave comes off the month's pay: Finance is told.
  IF NOT v.is_paid THEN
    PERFORM public._leave_pay_event(
      v.company_id, v.employee_id, 'unpaid_leave',
      format('Unpaid leave: %s', v.employee_name),
      format('%s, %s: %s not paid.', v.type_name, v_when, replace(public._leave_day_word(v.days_count), 'day', 'working day')),
      v.start_date
    );
  END IF;
  IF NOT p_automatic THEN
    PERFORM public.notify_employee(
      v.company_id, v.employee_id, 'leave', 'Your leave was approved',
      format('%s, %s%s', v.type_name, v_when, CASE WHEN v.review_notes IS NOT NULL THEN format(' · HR: "%s"', left(v.review_notes, 100)) ELSE '' END),
      '/portal/leave'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._leave_today(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_when(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_day_word(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_actor_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_require_hr() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_working_dates(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_locked_month(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_log_portal(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_pay_event(uuid, uuid, text, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_create(uuid, uuid, uuid, date, date, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_set_status(uuid, public.leave_status, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_after_approval(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reads (any staff role of the company)
-- ---------------------------------------------------------------------------

-- Balance rows: active people (or one person) x active types for a calendar year.
-- allowed = the person's allocation override for the year, else the type's days per year.
-- unlimited = a type with 0 days per year and no override (e.g. unpaid). Pending days are shown, not deducted.
CREATE OR REPLACE FUNCTION public._leave_balance_rows(p_company uuid, p_year integer, p_employee uuid)
RETURNS TABLE (
  employee_id uuid, employee_name text, employee_code text, department text, avatar_url text,
  leave_type_id uuid, type_name text, type_kind text, is_paid boolean,
  default_days numeric, allowed numeric, custom boolean, unlimited boolean,
  used numeric, pending numeric, remaining numeric
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT e.id, e.name, e.employee_code, d.name, e.avatar_url,
         t.id, t.name, t.type::text, t.is_paid,
         t.days_per_year::numeric,
         COALESCE(b.total_days, t.days_per_year::numeric),
         b.id IS NOT NULL,
         b.id IS NULL AND t.days_per_year = 0,
         COALESCE(u.used, 0), COALESCE(u.pending, 0),
         CASE WHEN b.id IS NULL AND t.days_per_year = 0 THEN NULL
              ELSE COALESCE(b.total_days, t.days_per_year::numeric) - COALESCE(u.used, 0) END
  FROM public.employees e
  JOIN public.leave_types t ON t.company_id = e.company_id AND t.is_active
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.leave_balances b ON b.employee_id = e.id AND b.leave_type_id = t.id AND b.year = p_year
  LEFT JOIN LATERAL (
    SELECT sum(r.days_count) FILTER (WHERE r.status = 'approved') AS used,
           sum(r.days_count) FILTER (WHERE r.status = 'pending') AS pending
    FROM public.leave_requests r
    WHERE r.employee_id = e.id AND r.leave_type_id = t.id
      AND r.start_date >= make_date(p_year, 1, 1) AND r.start_date < make_date(p_year + 1, 1, 1)
  ) u ON true
  WHERE e.company_id = p_company
    AND (CASE WHEN p_employee IS NULL THEN e.status = 'active' ELSE e.id = p_employee END)
  ORDER BY e.name, t.days_per_year = 0, t.name
$$;
REVOKE ALL ON FUNCTION public._leave_balance_rows(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.leave_balances(p_year integer, p_employee uuid DEFAULT NULL)
RETURNS TABLE (
  employee_id uuid, employee_name text, employee_code text, department text, avatar_url text,
  leave_type_id uuid, type_name text, type_kind text, is_paid boolean,
  default_days numeric, allowed numeric, custom boolean, unlimited boolean,
  used numeric, pending numeric, remaining numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Pick a year.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM public._leave_balance_rows(public.auth_company_id(), p_year, p_employee);
END;
$$;

-- Requests with names resolved. Filters: by start year, by status, by person, or by overlap with a date range
-- (calendar). Pending first, then newest first.
CREATE OR REPLACE FUNCTION public.leave_requests_list(
  p_year integer DEFAULT NULL, p_status text DEFAULT NULL, p_employee uuid DEFAULT NULL,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL
)
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, employee_code text, department text, avatar_url text,
  leave_type_id uuid, type_name text, type_kind text, is_paid boolean,
  start_date date, end_date date, days_count numeric, reason text, status text, review_notes text,
  requested_via text, requester_name text, reviewer_name text, reviewed_at timestamptz,
  created_at timestamptz, locked boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, r.employee_id, e.name, e.employee_code, d.name, e.avatar_url,
         r.leave_type_id, t.name, t.type::text, t.is_paid,
         r.start_date, r.end_date, r.days_count, r.reason, r.status::text, r.review_notes,
         CASE WHEN r.requested_by IS NULL THEN 'portal' ELSE 'staff' END,
         NULLIF(btrim(concat_ws(' ', rq.first_name, rq.last_name)), ''),
         NULLIF(btrim(concat_ws(' ', rv.first_name, rv.last_name)), ''),
         r.reviewed_at, r.created_at,
         public._leave_locked_month(r.employee_id, r.start_date, r.end_date) IS NOT NULL
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.profiles rq ON rq.id = r.requested_by
  LEFT JOIN public.profiles rv ON rv.id = r.reviewed_by
  WHERE r.company_id = v_company
    AND (p_year IS NULL OR (r.start_date >= make_date(p_year, 1, 1) AND r.start_date < make_date(p_year + 1, 1, 1)))
    AND (p_status IS NULL OR r.status::text = p_status)
    AND (p_employee IS NULL OR r.employee_id = p_employee)
    AND (p_from IS NULL OR r.end_date >= p_from)
    AND (p_to IS NULL OR r.start_date <= p_to)
  ORDER BY (r.status = 'pending') DESC, r.created_at DESC
  LIMIT 2000;
END;
$$;

-- Working days a range would count for a person (live preview in the request form).
CREATE OR REPLACE FUNCTION public.leave_count_days(p_employee uuid, p_start date, p_end date)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end - p_start >= 200 THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p_employee AND e.company_id = public.auth_company_id()) THEN
    RETURN 0;
  END IF;
  RETURN cardinality(public._leave_working_dates(p_employee, p_start, p_end));
END;
$$;

-- Sidebar badges for HR: pending leave and pending overtime (zero for other roles).
CREATE OR REPLACE FUNCTION public.leave_badge_counts()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_hr() THEN
    RETURN json_build_object('leave', 0, 'overtime', 0);
  END IF;
  RETURN json_build_object(
    'leave', (SELECT count(*) FROM public.leave_requests r WHERE r.company_id = v_company AND r.status = 'pending'),
    'overtime', (SELECT count(*) FROM public.overtime_records o WHERE o.company_id = v_company AND o.status = 'pending')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Requests (owner / HR)
-- ---------------------------------------------------------------------------

-- HR files on behalf of anyone, optionally approving in the same step.
CREATE OR REPLACE FUNCTION public.leave_request_create(
  p_employee uuid, p_leave_type uuid, p_start date, p_end date, p_reason text DEFAULT NULL, p_approve_now boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v_row public.leave_requests;
  v_emp_name text;
  v_type_name text;
  v_when text;
  v_days integer;
  v_status text := 'pending';
  v_message text;
BEGIN
  v_row := public._leave_create(v_company, p_employee, p_leave_type, p_start, p_end, p_reason, auth.uid());
  SELECT e.name INTO v_emp_name FROM public.employees e WHERE e.id = v_row.employee_id;
  SELECT t.name INTO v_type_name FROM public.leave_types t WHERE t.id = v_row.leave_type_id;
  v_when := public._leave_when(v_row.start_date, v_row.end_date);

  PERFORM public.log_activity(
    'leave.requested',
    format('%s filed %s leave for %s, %s (%s)', public._leave_actor_name(), lower(v_type_name), v_emp_name, v_when, public._leave_day_word(v_row.days_count)),
    jsonb_build_object('id', v_row.id, 'start', v_row.start_date, 'end', v_row.end_date, 'days', v_row.days_count, 'type', v_type_name, 'reason', v_row.reason),
    v_row.employee_id
  );
  v_message := format('Request filed for %s, %s. It is pending until you approve it.', public._leave_day_word(v_row.days_count), v_when);

  IF COALESCE(p_approve_now, false) THEN
    BEGIN
      v_days := public._leave_set_status(v_row.id, 'approved', auth.uid(), NULL);
      PERFORM public._leave_after_approval(v_row.id, v_days, false);
      v_status := 'approved';
      v_message := format('Leave approved for %s: %s, %s, marked in attendance.', v_emp_name, public._leave_day_word(v_row.days_count), v_when);
    EXCEPTION WHEN raise_exception THEN
      v_message := format('Request filed but left pending: %s', SQLERRM);
    END;
  END IF;

  RETURN json_build_object('id', v_row.id, 'days', v_row.days_count, 'status', v_status, 'message', v_message);
END;
$$;

-- Approve or reject a pending request, with an optional note for the employee.
CREATE OR REPLACE FUNCTION public.leave_request_review(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
  v_days integer;
  v_when text;
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 300), '');
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Choose approve or reject.' USING ERRCODE = '22023';
  END IF;
  SELECT r.id, r.employee_id, r.status, r.start_date, r.end_date, r.days_count, e.name AS employee_name, t.name AS type_name
  INTO v
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id AND r.company_id = v_company
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been decided. Refresh to see its status.' USING ERRCODE = 'P0001';
  END IF;

  v_days := public._leave_set_status(p_id, p_decision::public.leave_status, auth.uid(), v_note);
  v_when := public._leave_when(v.start_date, v.end_date);

  IF p_decision = 'approved' THEN
    PERFORM public._leave_after_approval(p_id, v_days, false);
  ELSE
    PERFORM public.log_activity(
      'leave.rejected',
      format('%s rejected %s leave for %s, %s', public._leave_actor_name(), lower(v.type_name), v.employee_name, v_when),
      jsonb_build_object('id', p_id, 'start', v.start_date, 'end', v.end_date, 'days', v.days_count, 'note', v_note),
      v.employee_id
    );
    PERFORM public.notify_employee(
      v_company, v.employee_id, 'leave', 'Your leave was not approved',
      format('%s, %s%s', v.type_name, v_when, CASE WHEN v_note IS NOT NULL THEN format(' · HR: "%s"', left(v_note, 100)) ELSE '' END),
      '/portal/leave'
    );
  END IF;
  RETURN json_build_object('id', p_id, 'status', p_decision, 'attendance_days', v_days);
END;
$$;

-- Back to pending; attendance rows written on approval are removed, Finance hears about unpaid leave taken back.
CREATE OR REPLACE FUNCTION public.leave_request_undo(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
  v_days integer;
BEGIN
  SELECT r.id, r.employee_id, r.status, r.start_date, r.end_date, e.name AS employee_name, t.name AS type_name, t.is_paid
  INTO v
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id AND r.company_id = v_company
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Only an approved or rejected request can be moved back to pending.' USING ERRCODE = 'P0001';
  END IF;

  v_days := public._leave_set_status(p_id, 'pending', NULL, NULL);

  IF v.status = 'approved' AND NOT v.is_paid THEN
    PERFORM public._leave_pay_event(
      v_company, v.employee_id, 'unpaid_leave_undone',
      format('Unpaid leave taken back: %s', v.employee_name),
      format('%s from %s is no longer approved, so those days are paid again.', v.type_name, to_char(v.start_date, 'FMDD Mon YYYY')),
      v.start_date
    );
  END IF;
  PERFORM public.log_activity(
    'leave.undone',
    format('%s moved %s''s %s leave (%s) back to pending', public._leave_actor_name(), v.employee_name, lower(v.type_name), to_char(v.start_date, 'FMDD Mon YYYY')),
    jsonb_build_object('id', p_id, 'from', v.status, 'attendance_days_removed', v_days),
    v.employee_id
  );
  PERFORM public.notify_employee(
    v_company, v.employee_id, 'leave', 'Your leave is back under review',
    format('%s, %s', v.type_name, public._leave_when(v.start_date, v.end_date)),
    '/portal/leave'
  );
  RETURN json_build_object('id', p_id, 'status', 'pending', 'attendance_days', v_days);
END;
$$;

-- HR withdraws a pending request on someone's behalf.
CREATE OR REPLACE FUNCTION public.leave_request_cancel(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v record;
BEGIN
  SELECT r.id, r.employee_id, r.status, r.start_date, r.end_date, e.name AS employee_name, t.name AS type_name
  INTO v
  FROM public.leave_requests r
  JOIN public.employees e ON e.id = r.employee_id
  JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.id = p_id AND r.company_id = v_company
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending request can be cancelled.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._leave_set_status(p_id, 'cancelled', auth.uid(), 'Cancelled by HR');
  PERFORM public.log_activity(
    'leave.cancelled',
    format('%s cancelled %s''s %s leave request (%s)', public._leave_actor_name(), v.employee_name, lower(v.type_name), to_char(v.start_date, 'FMDD Mon YYYY')),
    jsonb_build_object('id', p_id),
    v.employee_id
  );
  PERFORM public.notify_employee(
    v_company, v.employee_id, 'leave', 'Your leave request was cancelled',
    format('%s, %s · cancelled by HR', v.type_name, public._leave_when(v.start_date, v.end_date)),
    '/portal/leave'
  );
  RETURN json_build_object('id', p_id, 'status', 'cancelled');
END;
$$;

-- ---------------------------------------------------------------------------
-- Leave types, allocations, settings (owner / HR)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_type_save(
  p_id uuid, p_name text, p_kind text, p_days_per_year integer, p_is_paid boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v_name text := left(btrim(COALESCE(p_name, '')), 60);
  v_kind public.leave_type_enum;
  v_id uuid;
BEGIN
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Give the leave type a name.' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    v_kind := p_kind::public.leave_type_enum;
  EXCEPTION WHEN invalid_text_representation THEN
    v_kind := NULL;
  END;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Pick a kind.' USING ERRCODE = 'P0001';
  END IF;
  IF p_days_per_year IS NULL OR p_days_per_year < 0 OR p_days_per_year > 366 THEN
    RAISE EXCEPTION 'Days per year must be a whole number from 0 to 366 (0 means no yearly limit).' USING ERRCODE = 'P0001';
  END IF;
  IF p_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leave_types t WHERE t.id = p_id AND t.company_id = v_company) THEN
    RAISE EXCEPTION 'That leave type no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leave_types t WHERE t.company_id = v_company AND lower(t.name) = lower(v_name) AND t.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'There is already a leave type called "%".', v_name USING ERRCODE = 'P0001';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.leave_types (company_id, name, type, days_per_year, is_paid, is_active)
    VALUES (v_company, v_name, v_kind, p_days_per_year, COALESCE(p_is_paid, true), true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.leave_types
    SET name = v_name, type = v_kind, days_per_year = p_days_per_year, is_paid = COALESCE(p_is_paid, true)
    WHERE id = p_id AND company_id = v_company
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.log_activity(
    'leave.type_saved',
    format('%s %s leave type %s (%s, %s)', public._leave_actor_name(), CASE WHEN p_id IS NULL THEN 'added' ELSE 'changed' END,
           v_name, CASE WHEN p_days_per_year = 0 THEN 'no yearly limit' ELSE p_days_per_year || ' days' END,
           CASE WHEN COALESCE(p_is_paid, true) THEN 'paid' ELSE 'unpaid' END),
    jsonb_build_object('id', v_id, 'name', v_name, 'kind', v_kind, 'days', p_days_per_year, 'paid', COALESCE(p_is_paid, true)),
    NULL
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_type_set_active(p_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v_name text;
BEGIN
  UPDATE public.leave_types SET is_active = COALESCE(p_active, false)
  WHERE id = p_id AND company_id = v_company
  RETURNING name INTO v_name;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'That leave type no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.log_activity(
    'leave.type_toggled',
    format('%s switched leave type %s %s', public._leave_actor_name(), v_name, CASE WHEN p_active THEN 'on' ELSE 'off' END),
    jsonb_build_object('id', p_id, 'active', COALESCE(p_active, false)),
    NULL
  );
END;
$$;

-- Adds the standard set when a company has no leave types yet. Returns how many were added.
CREATE OR REPLACE FUNCTION public.leave_types_seed_defaults()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.leave_types t WHERE t.company_id = v_company) THEN
    RETURN 0;
  END IF;
  INSERT INTO public.leave_types (company_id, name, type, days_per_year, is_paid, is_active)
  SELECT v_company, x.name, x.kind::public.leave_type_enum, x.days, x.paid, true
  FROM (VALUES
    ('Annual', 'annual', 14, true),
    ('Sick', 'sick', 8, true),
    ('Casual', 'casual', 10, true),
    ('Unpaid', 'unpaid', 0, false),
    ('Maternity', 'maternity', 90, true),
    ('Paternity', 'paternity', 7, true)
  ) AS x(name, kind, days, paid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_activity('leave.type_saved', format('%s added the standard leave types', public._leave_actor_name()),
                              jsonb_build_object('count', v_count), NULL);
  RETURN v_count;
END;
$$;

-- A person's allocation for a type and year. NULL days returns them to the type's default.
CREATE OR REPLACE FUNCTION public.leave_set_allocation(p_employee uuid, p_leave_type uuid, p_year integer, p_days numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
  v_emp_name text;
  v_type_name text;
BEGIN
  SELECT e.name INTO v_emp_name FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company;
  SELECT t.name INTO v_type_name FROM public.leave_types t WHERE t.id = p_leave_type AND t.company_id = v_company;
  IF v_emp_name IS NULL OR v_type_name IS NULL THEN
    RAISE EXCEPTION 'That employee or leave type no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Pick a year.' USING ERRCODE = 'P0001';
  END IF;
  IF p_days IS NOT NULL AND (p_days < 0 OR p_days > 366 OR p_days * 2 <> round(p_days * 2)) THEN
    RAISE EXCEPTION 'Allowance must be from 0 to 366 days, in halves.' USING ERRCODE = 'P0001';
  END IF;

  IF p_days IS NULL THEN
    DELETE FROM public.leave_balances b WHERE b.employee_id = p_employee AND b.leave_type_id = p_leave_type AND b.year = p_year;
  ELSE
    INSERT INTO public.leave_balances (employee_id, company_id, leave_type_id, year, total_days, used_days)
    VALUES (p_employee, v_company, p_leave_type, p_year, p_days, 0)
    ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE SET total_days = EXCLUDED.total_days, updated_at = now();
  END IF;

  PERFORM public.log_activity(
    'leave.allocation',
    CASE WHEN p_days IS NULL
      THEN format('%s reset %s''s %s allowance for %s to the default', public._leave_actor_name(), v_emp_name, lower(v_type_name), p_year)
      ELSE format('%s set %s''s %s allowance for %s to %s', public._leave_actor_name(), v_emp_name, lower(v_type_name), p_year, public._leave_day_word(p_days)) END,
    jsonb_build_object('leave_type_id', p_leave_type, 'year', p_year, 'days', p_days),
    p_employee
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_settings_save(p_requires_approval boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._leave_require_hr();
BEGIN
  INSERT INTO public.leave_settings (company_id, requires_approval, updated_by, updated_at)
  VALUES (v_company, COALESCE(p_requires_approval, true), auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE
    SET requires_approval = EXCLUDED.requires_approval, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.log_activity(
    'leave.settings',
    format('%s %s HR approval for leave requests', public._leave_actor_name(), CASE WHEN COALESCE(p_requires_approval, true) THEN 'switched on' ELSE 'switched off' END),
    jsonb_build_object('requires_approval', COALESCE(p_requires_approval, true)),
    NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.leave_balances(integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_requests_list(integer, text, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_count_days(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_badge_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_request_create(uuid, uuid, date, date, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_request_review(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_request_undo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_request_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_type_save(uuid, text, text, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_type_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_types_seed_defaults() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_set_allocation(uuid, uuid, integer, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_settings_save(boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.leave_balances(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_requests_list(integer, text, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_count_days(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_badge_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_request_create(uuid, uuid, date, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_request_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_request_undo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_request_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_type_save(uuid, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_type_set_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_types_seed_defaults() TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_set_allocation(uuid, uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_settings_save(boolean) TO authenticated;
