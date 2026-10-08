-- Letters and policies: dates in the company's own calendar.
--
-- 1. letter_default_reply_by counted from current_date (UTC), so between 00:00 and 05:00 in
--    Karachi it started from yesterday and proposed a reply-by date one working day short.
--    It also ignored multi-day holidays (end_date), Saturday patterns and extra working days.
--    It now counts company working days (public.working_dates) from the company's today.
-- 2. letter_issue compared reply_by with current_date (UTC): a reply-by date of yesterday
--    (company time) was accepted after midnight. Reference numbers took the UTC year, so on
--    1 January before 05:00 a letter was numbered in the previous year's series.
-- 3. letter_settings_get showed the next reference with the UTC year.
-- 4. policy_set_archived restored a policy even when a live policy now has the same title,
--    leaving two live policies with one name (policy_create and policy_update_info refuse that).

CREATE OR REPLACE FUNCTION public._letters_is_workday(p_company uuid, p_day date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.working_dates(p_company, p_day, p_day))
$function$;

CREATE OR REPLACE FUNCTION public.letter_default_reply_by(p_days integer DEFAULT 3)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_today date := public.company_today(v_company);
  v_left integer := greatest(1, least(COALESCE(p_days, 3), 30));
  v_day date;
BEGIN
  SELECT d INTO v_day
  FROM public.working_dates(v_company, v_today + 1, v_today + 120) AS d
  ORDER BY d
  OFFSET v_left - 1
  LIMIT 1;
  RETURN COALESCE(v_day, v_today + v_left);
END;
$function$;

CREATE OR REPLACE FUNCTION public.letter_issue(p_employee uuid, p_kind text, p_subject text, p_body text, p_reply_by date DEFAULT NULL::date, p_signatory_name text DEFAULT NULL::text, p_signatory_title text DEFAULT NULL::text, p_period date DEFAULT NULL::date, p_facts jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_today date := public.company_today(v_company);
  v_emp record;
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_subject text := btrim(regexp_replace(COALESCE(p_subject, ''), '\s+', ' ', 'g'));
  v_body text := regexp_replace(COALESCE(p_body, ''), '^\s+|\s+$', '', 'g');
  v_name text := left(btrim(regexp_replace(COALESCE(p_signatory_name, ''), '\s+', ' ', 'g')), 80);
  v_title text := left(btrim(regexp_replace(COALESCE(p_signatory_title, ''), '\s+', ' ', 'g')), 80);
  v_blanks text[];
  v_settings public.letter_settings;
  v_year integer := extract(year FROM v_today)::integer;
  v_seq integer;
  v_ref text;
  v_id uuid;
  v_actor text := public._policies_actor_name();
BEGIN
  IF v_kind NOT IN ('explanation', 'warning', 'final', 'appreciation', 'appointment', 'confirmation',
                    'promotion', 'increment', 'transfer', 'experience', 'relieving', 'general') THEN
    RAISE EXCEPTION 'Choose what kind of letter this is.' USING ERRCODE = '22023';
  END IF;
  SELECT e.id, e.name, e.status INTO v_emp FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That employee was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_emp.status IS DISTINCT FROM 'active' AND v_kind NOT IN ('experience', 'relieving') THEN
    RAISE EXCEPTION 'Letters go to active employees only (experience and relieving letters excepted).' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_subject) < 5 OR char_length(v_subject) > 160 THEN
    RAISE EXCEPTION 'The subject should be between 5 and 160 characters.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) < 40 THEN
    RAISE EXCEPTION 'Write the letter first (at least a few sentences).' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 20000 THEN
    RAISE EXCEPTION 'Keep the letter under 20,000 characters.' USING ERRCODE = '22023';
  END IF;
  v_blanks := public._policies_placeholders(v_subject || E'\n' || v_body);
  IF cardinality(v_blanks) > 0 THEN
    RAISE EXCEPTION 'Fill in everything in square brackets first: %.', array_to_string(v_blanks[1:3], ', ') USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'explanation' AND (p_reply_by IS NULL OR p_reply_by < v_today) THEN
    RAISE EXCEPTION 'An explanation letter needs a date to reply by, today or later.' USING ERRCODE = '22023';
  END IF;
  IF p_reply_by IS NOT NULL AND p_reply_by < v_today THEN
    RAISE EXCEPTION 'The reply-by date cannot be in the past.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'Say who signs the letter: a name and a title.' USING ERRCODE = '22023';
  END IF;

  -- Reference number: lock the company's settings row so concurrent issues never collide.
  INSERT INTO public.letter_settings (company_id, ref_prefix, signatory_name, signatory_title)
  VALUES (v_company, public._letters_default_prefix(v_company), v_name, v_title)
  ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO v_settings FROM public.letter_settings WHERE company_id = v_company FOR UPDATE;
  v_seq := CASE WHEN v_settings.ref_year = v_year THEN v_settings.ref_seq ELSE 0 END;
  LOOP
    v_seq := v_seq + 1;
    v_ref := v_settings.ref_prefix || '/HR/' || v_year || '/' || lpad(v_seq::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.hr_letters l WHERE l.company_id = v_company AND l.ref = v_ref);
  END LOOP;
  UPDATE public.letter_settings
  SET ref_year = v_year, ref_seq = v_seq, signatory_name = v_name, signatory_title = v_title
  WHERE company_id = v_company;

  INSERT INTO public.hr_letters (company_id, employee_id, ref, kind, subject, body, facts, period, reply_by,
                                 signatory_name, signatory_title, issued_by, issued_by_name)
  VALUES (v_company, p_employee, v_ref, v_kind, v_subject, v_body, COALESCE(p_facts, '{}'::jsonb),
          CASE WHEN p_period IS NULL THEN NULL ELSE date_trunc('month', p_period)::date END,
          p_reply_by, v_name, v_title, auth.uid(), v_actor)
  RETURNING id INTO v_id;

  PERFORM public.notify_employee(v_company, p_employee, 'letter', 'You have a letter from HR',
    public._letters_label(v_kind) || ': ' || v_subject, '/portal/letters/' || v_id);
  PERFORM public.log_activity('letter.issued',
    v_actor || ' issued ' || CASE WHEN v_kind IN ('appreciation', 'appointment', 'experience', 'explanation', 'increment') THEN 'an ' ELSE 'a ' END
      || lower(public._letters_label(v_kind)) || ' to ' || v_emp.name || ' (' || v_ref || ')',
    jsonb_build_object('letter_id', v_id, 'ref', v_ref, 'kind', v_kind, 'period', p_period),
    p_employee);

  RETURN json_build_object('id', v_id, 'ref', v_ref);
END;
$function$;

CREATE OR REPLACE FUNCTION public.letter_settings_get()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_row public.letter_settings;
  v_prefix text;
  v_year integer := extract(year FROM public.company_today(v_company))::integer;
  v_seq integer;
BEGIN
  SELECT * INTO v_row FROM public.letter_settings WHERE company_id = v_company;
  v_prefix := COALESCE(v_row.ref_prefix, public._letters_default_prefix(v_company));
  v_seq := CASE WHEN v_row.ref_year = v_year THEN v_row.ref_seq ELSE 0 END + 1;
  RETURN json_build_object(
    'ref_prefix', v_prefix,
    'default_prefix', public._letters_default_prefix(v_company),
    'signatory_name', COALESCE(NULLIF(v_row.signatory_name, ''), public._policies_actor_name()),
    'signatory_title', COALESCE(NULLIF(v_row.signatory_title, ''), 'Human Resources'),
    'next_ref', v_prefix || '/HR/' || v_year || '/' || lpad(v_seq::text, 4, '0'),
    'saved', v_row.company_id IS NOT NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.policy_set_archived(p_policy uuid, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_title text;
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
  PERFORM public.log_activity(CASE WHEN p_archived THEN 'policy.archived' ELSE 'policy.restored' END,
    public._policies_actor_name() || CASE WHEN p_archived THEN ' archived ' ELSE ' restored ' END || v_title,
    jsonb_build_object('policy_id', p_policy));
END;
$function$;
