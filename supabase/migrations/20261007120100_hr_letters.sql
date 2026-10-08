-- Policies module 2/2: letters from HR to one employee.
--
-- Kinds: explanation (needs a reply-by date), warning, final warning, appreciation,
-- appointment, confirmation, promotion, increment (never carries amounts: HR does
-- not see pay), transfer, experience, relieving and general. Each letter gets a
-- per-company, per-year reference such as NOP/HR/2026/0001 and, once issued, never
-- changes. The employee is notified, reads it in the portal, acknowledges it and may
-- reply once. HR can withdraw a letter issued in error; it stays on record, marked
-- withdrawn. Writes only through the SECURITY DEFINER RPCs below.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.letter_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  ref_prefix text NOT NULL CHECK (ref_prefix ~ '^[A-Z0-9]{2,8}$'),
  signatory_name text NOT NULL DEFAULT '' CHECK (char_length(signatory_name) <= 80),
  signatory_title text NOT NULL DEFAULT 'Human Resources' CHECK (char_length(signatory_title) <= 80),
  ref_year integer NOT NULL DEFAULT 0,
  ref_seq integer NOT NULL DEFAULT 0 CHECK (ref_seq >= 0),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_letter_settings_updated_by ON public.letter_settings (updated_by);

CREATE TABLE IF NOT EXISTS public.hr_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  ref text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('explanation', 'warning', 'final', 'appreciation', 'appointment', 'confirmation',
                                     'promotion', 'increment', 'transfer', 'experience', 'relieving', 'general')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 160),
  body text NOT NULL CHECK (char_length(body) BETWEEN 40 AND 20000),
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  period date,
  reply_by date,
  signatory_name text NOT NULL CHECK (char_length(signatory_name) BETWEEN 2 AND 80),
  signatory_title text NOT NULL CHECK (char_length(signatory_title) BETWEEN 2 AND 80),
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_by_name text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  reply text NOT NULL DEFAULT '' CHECK (char_length(reply) <= 5000),
  replied_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  withdrawn_by_name text,
  withdraw_reason text NOT NULL DEFAULT '' CHECK (char_length(withdraw_reason) <= 500),
  CONSTRAINT hr_letters_company_ref_key UNIQUE (company_id, ref),
  CONSTRAINT hr_letters_explanation_reply_by_chk CHECK (kind <> 'explanation' OR reply_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_hr_letters_company_issued ON public.hr_letters (company_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_letters_employee_issued ON public.hr_letters (employee_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_letters_issued_by ON public.hr_letters (issued_by);
CREATE INDEX IF NOT EXISTS idx_hr_letters_withdrawn_by ON public.hr_letters (withdrawn_by);

-- ---------------------------------------------------------------------------
-- RLS: HR/owner of the company read; nobody writes directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.letter_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_letters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.letter_settings, public.hr_letters FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.letter_settings, public.hr_letters FROM authenticated;
GRANT SELECT ON public.letter_settings, public.hr_letters TO authenticated;

DROP POLICY IF EXISTS letter_settings_select ON public.letter_settings;
CREATE POLICY letter_settings_select ON public.letter_settings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

DROP POLICY IF EXISTS hr_letters_select ON public.hr_letters;
CREATE POLICY hr_letters_select ON public.hr_letters FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._letters_label(p_kind text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_kind
    WHEN 'explanation' THEN 'Explanation letter'
    WHEN 'warning' THEN 'Warning letter'
    WHEN 'final' THEN 'Final warning'
    WHEN 'appreciation' THEN 'Appreciation letter'
    WHEN 'appointment' THEN 'Appointment letter'
    WHEN 'confirmation' THEN 'Confirmation letter'
    WHEN 'promotion' THEN 'Promotion letter'
    WHEN 'increment' THEN 'Increment letter'
    WHEN 'transfer' THEN 'Transfer letter'
    WHEN 'experience' THEN 'Experience certificate'
    WHEN 'relieving' THEN 'Relieving letter'
    ELSE 'Letter'
  END
$$;
REVOKE ALL ON FUNCTION public._letters_label(text) FROM PUBLIC, anon, authenticated;

-- Default reference prefix from the company name: initials of up to 3 words, or the
-- first 3 letters of a one-word name ("Nexus Orbits Pakistan" -> "NOP").
CREATE OR REPLACE FUNCTION public._letters_default_prefix(p_company uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_words text[];
  v_prefix text := '';
  i integer;
BEGIN
  SELECT array_remove(regexp_split_to_array(btrim(upper(regexp_replace(COALESCE(c.name, ''), '[^A-Za-z0-9 ]+', ' ', 'g'))), '\s+'), '')
  INTO v_words
  FROM public.companies c WHERE c.id = p_company;
  IF v_words IS NULL OR cardinality(v_words) = 0 THEN
    RETURN 'CO';
  END IF;
  IF cardinality(v_words) = 1 THEN
    v_prefix := left(v_words[1], 3);
  ELSE
    FOR i IN 1 .. least(cardinality(v_words), 3) LOOP
      v_prefix := v_prefix || left(v_words[i], 1);
    END LOOP;
  END IF;
  IF char_length(v_prefix) < 2 THEN
    v_prefix := rpad(v_prefix, 2, 'X');
  END IF;
  RETURN v_prefix;
END;
$$;
REVOKE ALL ON FUNCTION public._letters_default_prefix(uuid) FROM PUBLIC, anon, authenticated;

-- Is this a company working day (weekends per company settings, holiday/off-day events)?
CREATE OR REPLACE FUNCTION public._letters_is_workday(p_company uuid, p_day date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT (extract(dow FROM p_day) = 6 AND COALESCE(s.weekend_saturday, false))
     AND NOT (extract(dow FROM p_day) = 0 AND COALESCE(s.weekend_sunday, true))
     AND NOT EXISTS (
       SELECT 1 FROM public.events ev
       WHERE ev.company_id = p_company AND ev.date = p_day
         AND ev.affects_attendance AND ev.type IN ('holiday', 'off_day'))
  FROM (SELECT 1) AS one
  LEFT JOIN public.company_working_settings s ON s.company_id = p_company
$$;
REVOKE ALL ON FUNCTION public._letters_is_workday(uuid, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff RPCs (HR / owner)
-- ---------------------------------------------------------------------------

-- Reference prefix, remembered signatory and the next reference number.
CREATE OR REPLACE FUNCTION public.letter_settings_get()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_row public.letter_settings;
  v_prefix text;
  v_year integer := extract(year FROM now())::integer;
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
$$;

CREATE OR REPLACE FUNCTION public.letter_settings_save(p_ref_prefix text, p_signatory_name text, p_signatory_title text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_prefix text := upper(btrim(COALESCE(p_ref_prefix, '')));
  v_name text := left(btrim(regexp_replace(COALESCE(p_signatory_name, ''), '\s+', ' ', 'g')), 80);
  v_title text := left(btrim(regexp_replace(COALESCE(p_signatory_title, ''), '\s+', ' ', 'g')), 80);
BEGIN
  IF v_prefix !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'The reference prefix should be 2 to 8 letters or digits, like NOP.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'Say who signs letters: a name and a title.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.letter_settings (company_id, ref_prefix, signatory_name, signatory_title, updated_by, updated_at)
  VALUES (v_company, v_prefix, v_name, v_title, auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE
    SET ref_prefix = EXCLUDED.ref_prefix, signatory_name = EXCLUDED.signatory_name,
        signatory_title = EXCLUDED.signatory_title, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.log_activity('letter.settings_updated',
    public._policies_actor_name() || ' updated the letter settings (prefix ' || v_prefix || ')',
    jsonb_build_object('ref_prefix', v_prefix));
END;
$$;

-- Reply-by date: p_days company working days counted from tomorrow.
CREATE OR REPLACE FUNCTION public.letter_default_reply_by(p_days integer DEFAULT 3)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_day date := current_date;
  v_left integer := greatest(1, least(COALESCE(p_days, 3), 30));
  v_guard integer := 0;
BEGIN
  WHILE v_left > 0 AND v_guard < 120 LOOP
    v_day := v_day + 1;
    v_guard := v_guard + 1;
    IF public._letters_is_workday(v_company, v_day) THEN
      v_left := v_left - 1;
    END IF;
  END LOOP;
  RETURN v_day;
END;
$$;

CREATE OR REPLACE FUNCTION public.letter_issue(
  p_employee uuid,
  p_kind text,
  p_subject text,
  p_body text,
  p_reply_by date DEFAULT NULL,
  p_signatory_name text DEFAULT NULL,
  p_signatory_title text DEFAULT NULL,
  p_period date DEFAULT NULL,
  p_facts jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_emp record;
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_subject text := btrim(regexp_replace(COALESCE(p_subject, ''), '\s+', ' ', 'g'));
  v_body text := regexp_replace(COALESCE(p_body, ''), '^\s+|\s+$', '', 'g');
  v_name text := left(btrim(regexp_replace(COALESCE(p_signatory_name, ''), '\s+', ' ', 'g')), 80);
  v_title text := left(btrim(regexp_replace(COALESCE(p_signatory_title, ''), '\s+', ' ', 'g')), 80);
  v_blanks text[];
  v_settings public.letter_settings;
  v_year integer := extract(year FROM now())::integer;
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
  IF v_kind = 'explanation' AND (p_reply_by IS NULL OR p_reply_by < current_date) THEN
    RAISE EXCEPTION 'An explanation letter needs a date to reply by, today or later.' USING ERRCODE = '22023';
  END IF;
  IF p_reply_by IS NOT NULL AND p_reply_by < current_date THEN
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
$$;

-- Issued in error: it stays on record, marked withdrawn, and the employee is told.
CREATE OR REPLACE FUNCTION public.letter_withdraw(p_letter uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_letter record;
  v_reason text := left(btrim(COALESCE(p_reason, '')), 500);
  v_actor text := public._policies_actor_name();
BEGIN
  SELECT l.id, l.ref, l.employee_id, l.withdrawn_at, e.name AS employee_name
  INTO v_letter
  FROM public.hr_letters l JOIN public.employees e ON e.id = l.employee_id
  WHERE l.id = p_letter AND l.company_id = v_company
  FOR UPDATE OF l;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That letter was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_letter.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'It is already withdrawn.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Say why it is withdrawn (at least 5 characters).' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hr_letters
  SET withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawn_by_name = v_actor, withdraw_reason = v_reason
  WHERE id = p_letter;

  PERFORM public.notify_employee(v_company, v_letter.employee_id, 'letter',
    'A letter from HR was withdrawn (' || v_letter.ref || ')', NULL, '/portal/letters/' || p_letter);
  PERFORM public.log_activity('letter.withdrawn',
    v_actor || ' withdrew ' || v_letter.ref || ' (' || v_letter.employee_name || '): ' || left(v_reason, 120),
    jsonb_build_object('letter_id', p_letter, 'ref', v_letter.ref),
    v_letter.employee_id);
END;
$$;

REVOKE ALL ON FUNCTION public.letter_settings_get() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.letter_settings_save(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.letter_default_reply_by(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.letter_issue(uuid, text, text, text, date, text, text, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.letter_withdraw(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.letter_settings_get() TO authenticated;
GRANT EXECUTE ON FUNCTION public.letter_settings_save(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.letter_default_reply_by(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.letter_issue(uuid, text, text, text, date, text, text, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.letter_withdraw(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Portal RPCs (anon key + employee session token)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_letters(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
             'id', l.id, 'ref', l.ref, 'kind', l.kind, 'subject', l.subject, 'issued_at', l.issued_at,
             'reply_by', l.reply_by, 'acknowledged_at', l.acknowledged_at, 'replied_at', l.replied_at,
             'withdrawn_at', l.withdrawn_at)
           ORDER BY l.issued_at DESC)
    FROM public.hr_letters l
    WHERE l.employee_id = v_emp.id AND l.company_id = v_emp.company_id
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_letter(p_token text, p_letter uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_result json;
BEGIN
  SELECT json_build_object(
           'id', l.id, 'ref', l.ref, 'kind', l.kind, 'subject', l.subject, 'body', l.body, 'facts', l.facts,
           'period', l.period, 'reply_by', l.reply_by, 'signatory_name', l.signatory_name,
           'signatory_title', l.signatory_title, 'issued_at', l.issued_at, 'acknowledged_at', l.acknowledged_at,
           'reply', l.reply, 'replied_at', l.replied_at, 'withdrawn_at', l.withdrawn_at,
           'withdraw_reason', l.withdraw_reason,
           'employee_name', v_emp.name, 'employee_code', v_emp.employee_code, 'rank', v_emp.rank,
           'department', d.name)
  INTO v_result
  FROM public.hr_letters l
  LEFT JOIN public.departments d ON d.id = v_emp.department_id
  WHERE l.id = p_letter AND l.employee_id = v_emp.id AND l.company_id = v_emp.company_id;
  IF v_result IS NULL THEN
    RETURN json_build_object('error', 'That letter was not found.');
  END IF;
  RETURN v_result;
END;
$$;

-- The employee confirms they received it. Only their own, and not a withdrawn one.
CREATE OR REPLACE FUNCTION public.portal_acknowledge_letter(p_token text, p_letter uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_ref text;
  v_at timestamptz;
BEGIN
  UPDATE public.hr_letters
  SET acknowledged_at = now()
  WHERE id = p_letter AND employee_id = v_emp.id AND company_id = v_emp.company_id
    AND acknowledged_at IS NULL AND withdrawn_at IS NULL
  RETURNING ref, acknowledged_at INTO v_ref, v_at;
  IF v_ref IS NULL THEN
    SELECT l.acknowledged_at INTO v_at FROM public.hr_letters l
    WHERE l.id = p_letter AND l.employee_id = v_emp.id AND l.withdrawn_at IS NULL;
    IF v_at IS NULL THEN
      RETURN json_build_object('error', 'This letter cannot be acknowledged.');
    END IF;
    RETURN json_build_object('acknowledged_at', v_at, 'already', true);
  END IF;
  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES ('letter.acknowledged', v_emp.name || ' acknowledged ' || v_ref,
          jsonb_build_object('letter_id', p_letter, 'ref', v_ref), NULL, v_emp.company_id, v_emp.id);
  RETURN json_build_object('acknowledged_at', v_at, 'already', false);
END;
$$;

-- The employee's reply, once (it also acknowledges the letter); HR is told.
CREATE OR REPLACE FUNCTION public.portal_reply_letter(p_token text, p_letter uuid, p_reply text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_letter public.hr_letters;
  v_reply text := regexp_replace(COALESCE(p_reply, ''), '^\s+|\s+$', '', 'g');
  v_recent integer;
BEGIN
  SELECT * INTO v_letter FROM public.hr_letters
  WHERE id = p_letter AND employee_id = v_emp.id AND company_id = v_emp.company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'That letter was not found.');
  END IF;
  IF v_letter.withdrawn_at IS NOT NULL THEN
    RETURN json_build_object('error', 'This letter was withdrawn.');
  END IF;
  IF v_letter.replied_at IS NOT NULL THEN
    RETURN json_build_object('error', 'You have already replied to this letter.');
  END IF;
  IF char_length(v_reply) < 5 THEN
    RETURN json_build_object('error', 'Write your reply first.');
  END IF;
  IF char_length(v_reply) > 5000 THEN
    RETURN json_build_object('error', 'Keep the reply under 5,000 characters.');
  END IF;
  SELECT count(*)::integer INTO v_recent FROM public.hr_letters l
  WHERE l.employee_id = v_emp.id AND l.replied_at > now() - interval '1 hour';
  IF v_recent >= 10 THEN
    RETURN json_build_object('error', 'Too many replies in a short time. Try again later.');
  END IF;

  UPDATE public.hr_letters
  SET reply = v_reply, replied_at = now(), acknowledged_at = COALESCE(acknowledged_at, now())
  WHERE id = p_letter;

  PERFORM public.notify_roles(v_emp.company_id, ARRAY['hr'], 'letter',
    v_emp.name || ' replied to ' || v_letter.ref, left(v_reply, 140), '/letters/' || p_letter);
  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES ('letter.replied', v_emp.name || ' replied to ' || v_letter.ref,
          jsonb_build_object('letter_id', p_letter, 'ref', v_letter.ref), NULL, v_emp.company_id, v_emp.id);
  RETURN json_build_object('replied_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.portal_letters(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_letter(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_acknowledge_letter(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_reply_letter(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_letters(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_letter(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_acknowledge_letter(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_reply_letter(text, uuid, text) TO anon, authenticated;
