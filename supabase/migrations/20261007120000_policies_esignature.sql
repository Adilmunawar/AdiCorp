-- Policies module 1/2: company policies with versioning and employee e-signatures.
--
-- A policy has numbered versions. HR edits one draft at a time; publishing it makes
-- it the version every active employee must read and sign (the previous published
-- version is superseded and keeps its signatures). Published text never changes and
-- is fingerprinted with SHA-256. A signature stores the typed name, the drawn PNG,
-- the fingerprint of the text shown, the time, the IP and the user agent.
--
-- Writes happen only through the SECURITY DEFINER RPCs below. HR/owner read the
-- tables directly under RLS; employees read through portal_* RPCs (token sessions).
-- Depends on the foundation migrations (auth_* helpers, notify_*, log_activity,
-- _portal_employee, departments, activity_logs.employee_id).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 500),
  requires_signature boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_policies_company_created ON public.policies (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_policies_created_by ON public.policies (created_by);

CREATE TABLE IF NOT EXISTS public.policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 60000),
  body_sha256 text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded')),
  change_note text NOT NULL DEFAULT '' CHECK (char_length(change_note) <= 300),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by_name text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_versions_policy_version_key UNIQUE (policy_id, version),
  CONSTRAINT policy_versions_published_chk CHECK (status = 'draft' OR (body_sha256 IS NOT NULL AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_versions_one_draft ON public.policy_versions (policy_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_versions_one_published ON public.policy_versions (policy_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_policy_versions_company_status ON public.policy_versions (company_id, status);
CREATE INDEX IF NOT EXISTS idx_policy_versions_created_by ON public.policy_versions (created_by);
CREATE INDEX IF NOT EXISTS idx_policy_versions_published_by ON public.policy_versions (published_by);

CREATE TABLE IF NOT EXISTS public.policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.policy_versions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  signed_name text NOT NULL CHECK (char_length(signed_name) BETWEEN 2 AND 120),
  signature_png text NOT NULL,             -- data:image/png;base64,...
  signature_bytes integer NOT NULL CHECK (signature_bytes > 0),
  body_sha256 text NOT NULL,
  ip text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_signatures_version_employee_key UNIQUE (version_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_policy_signatures_employee_signed ON public.policy_signatures (employee_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_signatures_policy ON public.policy_signatures (policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_signatures_company_signed ON public.policy_signatures (company_id, signed_at DESC);

-- updated_at maintenance (foundation helper)
DROP TRIGGER IF EXISTS trg_policies_updated_at ON public.policies;
CREATE TRIGGER trg_policies_updated_at BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_policy_versions_updated_at ON public.policy_versions;
CREATE TRIGGER trg_policy_versions_updated_at BEFORE UPDATE ON public.policy_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: HR/owner of the company read; nobody writes directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_signatures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.policies, public.policy_versions, public.policy_signatures FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.policies, public.policy_versions, public.policy_signatures FROM authenticated;
GRANT SELECT ON public.policies, public.policy_versions, public.policy_signatures TO authenticated;

DROP POLICY IF EXISTS policies_select ON public.policies;
CREATE POLICY policies_select ON public.policies FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

DROP POLICY IF EXISTS policy_versions_select ON public.policy_versions;
CREATE POLICY policy_versions_select ON public.policy_versions FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

DROP POLICY IF EXISTS policy_signatures_select ON public.policy_signatures;
CREATE POLICY policy_signatures_select ON public.policy_signatures FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._policies_hr_company()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can do this' USING ERRCODE = '42501';
  END IF;
  RETURN v_company;
END;
$$;
REVOKE ALL ON FUNCTION public._policies_hr_company() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._policies_actor_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') FROM public.profiles p WHERE p.id = auth.uid()),
    'HR'
  )
$$;
REVOKE ALL ON FUNCTION public._policies_actor_name() FROM PUBLIC, anon, authenticated;

-- "[Name, designation]" style placeholders still waiting to be filled in.
CREATE OR REPLACE FUNCTION public._policies_placeholders(p_text text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT m[1]), '{}'::text[])
  FROM regexp_matches(COALESCE(p_text, ''), '(\[[^\]\n]{1,80}\])', 'g') AS m
$$;
REVOKE ALL ON FUNCTION public._policies_placeholders(text) FROM PUBLIC, anon, authenticated;

-- Letters only, lower case, single spaces: "Muhammad  Ali-Khan" = "muhammad ali khan".
CREATE OR REPLACE FUNCTION public._policies_norm_name(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(lower(COALESCE(p_name, '')), '[^[:alpha:]]+', ' ', 'g'))
$$;
REVOKE ALL ON FUNCTION public._policies_norm_name(text) FROM PUBLIC, anon, authenticated;

-- First address in X-Forwarded-For of the current PostgREST request (null outside one).
CREATE OR REPLACE FUNCTION public._policies_request_ip()
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_headers json;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN left(NULLIF(btrim(split_part(COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), ''), 64);
END;
$$;
REVOKE ALL ON FUNCTION public._policies_request_ip() FROM PUBLIC, anon, authenticated;

-- Why a text cannot be published yet, or NULL when it can.
CREATE OR REPLACE FUNCTION public._policies_publish_problem(p_body text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text text := regexp_replace(COALESCE(p_body, ''), '^\s+|\s+$', '', 'g');
  v_left text[];
BEGIN
  IF char_length(v_text) < 200 THEN
    RETURN 'The text is too short to publish. Write the whole policy first (at least 200 characters).';
  END IF;
  IF char_length(v_text) > 60000 THEN
    RETURN 'The text is longer than 60,000 characters.';
  END IF;
  v_left := public._policies_placeholders(v_text);
  IF cardinality(v_left) > 0 THEN
    RETURN 'Fill in everything in square brackets first: '
      || array_to_string(v_left[1:4], ', ')
      || CASE WHEN cardinality(v_left) > 4 THEN ' and ' || (cardinality(v_left) - 4) || ' more' ELSE '' END || '.';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._policies_publish_problem(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff RPCs (HR / owner)
-- ---------------------------------------------------------------------------

-- Policies with their current and draft versions and signature progress.
CREATE OR REPLACE FUNCTION public.policies_list(p_archived boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_active integer;
BEGIN
  SELECT count(*)::integer INTO v_active
  FROM public.employees e WHERE e.company_id = v_company AND e.status = 'active';

  RETURN COALESCE((
    SELECT json_agg(row_to_json(x) ORDER BY x.created_at)
    FROM (
      SELECT p.id, p.title, p.summary, p.requires_signature, p.archived_at, p.created_at, p.updated_at,
             cur.id AS current_version_id, cur.version AS current_version, cur.published_at,
             dr.id AS draft_version_id, dr.version AS draft_version, dr.updated_at AS draft_updated_at,
             CASE WHEN p.requires_signature THEN v_active ELSE 0 END AS required,
             COALESCE(sig.n, 0) AS signed
      FROM public.policies p
      LEFT JOIN public.policy_versions cur ON cur.policy_id = p.id AND cur.status = 'published'
      LEFT JOIN public.policy_versions dr ON dr.policy_id = p.id AND dr.status = 'draft'
      LEFT JOIN LATERAL (
        SELECT count(*)::integer AS n
        FROM public.policy_signatures s
        JOIN public.employees e ON e.id = s.employee_id AND e.status = 'active'
        WHERE s.version_id = cur.id
      ) sig ON true
      WHERE p.company_id = v_company
        AND (p.archived_at IS NOT NULL) = COALESCE(p_archived, false)
    ) x
  ), '[]'::json);
END;
$$;

-- Outstanding signatures across all live policies (sidebar badge). 0 for non-HR callers.
CREATE OR REPLACE FUNCTION public.policies_unsigned_count()
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_count integer;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RETURN 0;
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM public.policy_versions v
  JOIN public.policies p ON p.id = v.policy_id
  JOIN public.employees e ON e.company_id = v.company_id AND e.status = 'active'
  WHERE v.company_id = v_company
    AND v.status = 'published'
    AND p.requires_signature
    AND p.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.policy_signatures s WHERE s.version_id = v.id AND s.employee_id = e.id);
  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.policy_create(
  p_title text, p_summary text DEFAULT '', p_requires_signature boolean DEFAULT true, p_body text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_title text := btrim(regexp_replace(COALESCE(p_title, ''), '\s+', ' ', 'g'));
  v_summary text := btrim(COALESCE(p_summary, ''));
  v_body text := COALESCE(p_body, '');
  v_id uuid;
BEGIN
  IF char_length(v_title) < 2 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'Give the policy a title of 2 to 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_summary) > 500 THEN
    RAISE EXCEPTION 'Keep the summary under 500 characters.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 60000 THEN
    RAISE EXCEPTION 'The text is longer than 60,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.policies p WHERE p.company_id = v_company AND lower(p.title) = lower(v_title) AND p.archived_at IS NULL) THEN
    RAISE EXCEPTION 'A policy called "%" already exists.', v_title USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.policies (company_id, title, summary, requires_signature, created_by)
  VALUES (v_company, v_title, v_summary, COALESCE(p_requires_signature, true), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.policy_versions (company_id, policy_id, version, body, status, created_by)
  VALUES (v_company, v_id, 1, v_body, 'draft', auth.uid());

  PERFORM public.log_activity('policy.created',
    public._policies_actor_name() || ' created the policy ' || v_title,
    jsonb_build_object('policy_id', v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.policy_update_info(
  p_policy uuid, p_title text, p_summary text, p_requires_signature boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_title text := btrim(regexp_replace(COALESCE(p_title, ''), '\s+', ' ', 'g'));
  v_summary text := btrim(COALESCE(p_summary, ''));
BEGIN
  IF char_length(v_title) < 2 OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'Give the policy a title of 2 to 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_summary) > 500 THEN
    RAISE EXCEPTION 'Keep the summary under 500 characters.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.policies p WHERE p.company_id = v_company AND p.id <> p_policy
               AND lower(p.title) = lower(v_title) AND p.archived_at IS NULL) THEN
    RAISE EXCEPTION 'A policy called "%" already exists.', v_title USING ERRCODE = '23505';
  END IF;

  UPDATE public.policies
  SET title = v_title, summary = v_summary, requires_signature = COALESCE(p_requires_signature, requires_signature)
  WHERE id = p_policy AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That policy was not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_activity('policy.updated',
    public._policies_actor_name() || ' updated the details of ' || v_title,
    jsonb_build_object('policy_id', p_policy));
END;
$$;

-- Saves the text as the policy's draft: the open draft is updated, or a new version
-- is started after the published one.
CREATE OR REPLACE FUNCTION public.policy_save_draft(p_policy uuid, p_body text, p_change_note text DEFAULT '')
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_policy public.policies;
  v_draft public.policy_versions;
  v_body text := COALESCE(p_body, '');
  v_note text := left(btrim(COALESCE(p_change_note, '')), 300);
  v_next integer;
BEGIN
  SELECT * INTO v_policy FROM public.policies WHERE id = p_policy AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That policy was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_policy.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restore the policy before editing it.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 60000 THEN
    RAISE EXCEPTION 'The text is longer than 60,000 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_draft FROM public.policy_versions WHERE policy_id = p_policy AND status = 'draft';
  IF FOUND THEN
    UPDATE public.policy_versions SET body = v_body, change_note = v_note WHERE id = v_draft.id;
    RETURN json_build_object('id', v_draft.id, 'version', v_draft.version, 'created', false);
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO v_next FROM public.policy_versions WHERE policy_id = p_policy;
  INSERT INTO public.policy_versions (company_id, policy_id, version, body, change_note, status, created_by)
  VALUES (v_company, p_policy, v_next, v_body, v_note, 'draft', auth.uid())
  RETURNING * INTO v_draft;

  PERFORM public.log_activity('policy.updated',
    public._policies_actor_name() || ' started version ' || v_next || ' of ' || v_policy.title,
    jsonb_build_object('policy_id', p_policy, 'version_id', v_draft.id, 'version', v_next));
  RETURN json_build_object('id', v_draft.id, 'version', v_draft.version, 'created', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.policy_discard_draft(p_policy uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_title text;
  v_version integer;
BEGIN
  SELECT p.title INTO v_title FROM public.policies p WHERE p.id = p_policy AND p.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That policy was not found.' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.policy_versions WHERE policy_id = p_policy AND status = 'draft'
  RETURNING version INTO v_version;
  IF v_version IS NULL THEN
    RETURN false;
  END IF;
  PERFORM public.log_activity('policy.draft_discarded',
    public._policies_actor_name() || ' discarded the draft of ' || v_title || ' (version ' || v_version || ')',
    jsonb_build_object('policy_id', p_policy, 'version', v_version));
  RETURN true;
END;
$$;

-- Publishes the draft: it becomes the version everyone signs, the previous one is
-- superseded, and every active employee is asked to sign (when signing is required).
CREATE OR REPLACE FUNCTION public.policy_publish(p_policy uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_policy public.policies;
  v_draft public.policy_versions;
  v_body text;
  v_sha text;
  v_problem text;
  v_actor text := public._policies_actor_name();
  v_asked integer := 0;
  v_emp record;
BEGIN
  SELECT * INTO v_policy FROM public.policies WHERE id = p_policy AND company_id = v_company FOR UPDATE;
  IF NOT FOUND OR v_policy.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'That policy no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_draft FROM public.policy_versions WHERE policy_id = p_policy AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no draft to publish.' USING ERRCODE = '22023';
  END IF;
  v_problem := public._policies_publish_problem(v_draft.body);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '22023';
  END IF;

  v_body := regexp_replace(v_draft.body, '^\s+|\s+$', '', 'g');
  v_sha := encode(extensions.digest(convert_to(v_body, 'UTF8'), 'sha256'), 'hex');

  UPDATE public.policy_versions SET status = 'superseded' WHERE policy_id = p_policy AND status = 'published';
  UPDATE public.policy_versions
  SET status = 'published', body = v_body, body_sha256 = v_sha, published_at = now(),
      published_by = auth.uid(), published_by_name = v_actor
  WHERE id = v_draft.id;
  UPDATE public.policies SET updated_at = now() WHERE id = p_policy;

  IF v_policy.requires_signature THEN
    FOR v_emp IN SELECT e.id FROM public.employees e WHERE e.company_id = v_company AND e.status = 'active' LOOP
      PERFORM public.notify_employee(v_company, v_emp.id, 'policy',
        'Please read and sign: ' || v_policy.title,
        CASE WHEN v_draft.version > 1
          THEN 'Version ' || v_draft.version || ' replaces the one you signed before.'
          ELSE 'Everyone at the company signs it once, in the portal.' END,
        '/portal/policies/sign/' || v_draft.id);
      v_asked := v_asked + 1;
    END LOOP;
  END IF;

  PERFORM public.log_activity('policy.published',
    v_actor || ' published ' || v_policy.title || ', version ' || v_draft.version
      || CASE WHEN v_asked > 0 THEN '; ' || v_asked || CASE WHEN v_asked = 1 THEN ' person was' ELSE ' people were' END || ' asked to sign it' ELSE '' END,
    jsonb_build_object('policy_id', p_policy, 'version_id', v_draft.id, 'version', v_draft.version, 'sha256', v_sha));

  RETURN json_build_object('version_id', v_draft.id, 'version', v_draft.version, 'asked', v_asked, 'sha256', v_sha);
END;
$$;

CREATE OR REPLACE FUNCTION public.policy_set_archived(p_policy uuid, p_archived boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_title text;
BEGIN
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
$$;

-- Everyone who must sign this version (active employees), signed or not, plus anyone
-- who signed it and has since left. Unsigned first.
CREATE OR REPLACE FUNCTION public.policy_signers(p_version uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.policy_versions v WHERE v.id = p_version AND v.company_id = v_company) THEN
    RAISE EXCEPTION 'That version was not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE((
    SELECT json_agg(row_to_json(x) ORDER BY (x.signed_at IS NOT NULL), x.name)
    FROM (
      SELECT e.id AS employee_id, e.name, e.employee_code, e.rank, d.name AS department, e.status,
             (e.status = 'active') AS required,
             s.id AS signature_id, s.signed_at, s.signed_name
      FROM public.employees e
      LEFT JOIN public.departments d ON d.id = e.department_id
      LEFT JOIN public.policy_signatures s ON s.version_id = p_version AND s.employee_id = e.id
      WHERE e.company_id = v_company
        AND (e.status = 'active' OR s.id IS NOT NULL)
    ) x
  ), '[]'::json);
END;
$$;

-- Nudges everyone who still has to sign this version (at most 3 rounds an hour).
CREATE OR REPLACE FUNCTION public.policy_remind_unsigned(p_version uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public._policies_hr_company();
  v_row record;
  v_recent integer;
  v_count integer := 0;
  v_emp record;
BEGIN
  SELECT v.id, v.version, v.status, p.title, p.requires_signature, p.archived_at, p.id AS policy_id
  INTO v_row
  FROM public.policy_versions v JOIN public.policies p ON p.id = v.policy_id
  WHERE v.id = p_version AND v.company_id = v_company;
  IF NOT FOUND OR v_row.status <> 'published' OR v_row.archived_at IS NOT NULL OR NOT v_row.requires_signature THEN
    RAISE EXCEPTION 'Only the current version of a live policy can be signed.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_recent
  FROM public.activity_logs a
  WHERE a.company_id = v_company AND a.action_type = 'policy.reminded'
    AND a.details ->> 'version_id' = p_version::text
    AND a.created_at > now() - interval '1 hour';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Reminders for this policy were already sent 3 times in the last hour. Try again later.' USING ERRCODE = '54000';
  END IF;

  FOR v_emp IN
    SELECT e.id FROM public.employees e
    WHERE e.company_id = v_company AND e.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.policy_signatures s WHERE s.version_id = p_version AND s.employee_id = e.id)
  LOOP
    PERFORM public.notify_employee(v_company, v_emp.id, 'policy',
      'Reminder: please sign ' || v_row.title,
      'Open it in the portal, read it and sign. It takes a few minutes.',
      '/portal/policies/sign/' || p_version);
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    PERFORM public.log_activity('policy.reminded',
      public._policies_actor_name() || ' reminded ' || v_count || CASE WHEN v_count = 1 THEN ' person' ELSE ' people' END
        || ' to sign ' || v_row.title || ', version ' || v_row.version,
      jsonb_build_object('policy_id', v_row.policy_id, 'version_id', p_version, 'count', v_count));
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.policies_list(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policies_unsigned_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_create(text, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_update_info(uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_save_draft(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_discard_draft(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_publish(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_set_archived(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_signers(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.policy_remind_unsigned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.policies_list(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policies_unsigned_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_create(text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_update_info(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_save_draft(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_discard_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_set_archived(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_signers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_remind_unsigned(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Portal RPCs (anon key + employee session token)
-- ---------------------------------------------------------------------------

-- Published versions this employee still has to sign, in the order the policies were made.
CREATE OR REPLACE FUNCTION public.portal_pending_signatures(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
             'version_id', v.id, 'policy_id', p.id, 'title', p.title, 'summary', p.summary,
             'version', v.version, 'published_at', v.published_at)
           ORDER BY p.created_at)
    FROM public.policy_versions v
    JOIN public.policies p ON p.id = v.policy_id
    WHERE v.company_id = v_emp.company_id
      AND v.status = 'published'
      AND p.requires_signature
      AND p.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.policy_signatures s WHERE s.version_id = v.id AND s.employee_id = v_emp.id)
  ), '[]'::json);
END;
$$;

-- Live policies with this employee's signature on the current version and earlier signatures.
CREATE OR REPLACE FUNCTION public.portal_policies(p_token text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
             'policy_id', p.id, 'title', p.title, 'summary', p.summary,
             'requires_signature', p.requires_signature,
             'version_id', v.id, 'version', v.version, 'published_at', v.published_at,
             'signature_id', s.id, 'signed_at', s.signed_at,
             'earlier', COALESCE((
               SELECT json_agg(json_build_object('signature_id', s2.id, 'version_id', v2.id, 'version', v2.version, 'signed_at', s2.signed_at)
                               ORDER BY v2.version DESC)
               FROM public.policy_signatures s2
               JOIN public.policy_versions v2 ON v2.id = s2.version_id
               WHERE s2.policy_id = p.id AND s2.employee_id = v_emp.id AND v2.id <> v.id
             ), '[]'::json))
           ORDER BY (s.id IS NOT NULL OR NOT p.requires_signature), p.created_at)
    FROM public.policies p
    JOIN public.policy_versions v ON v.policy_id = p.id AND v.status = 'published'
    LEFT JOIN public.policy_signatures s ON s.version_id = v.id AND s.employee_id = v_emp.id
    WHERE p.company_id = v_emp.company_id AND p.archived_at IS NULL
  ), '[]'::json);
END;
$$;

-- One version's text: the current version of a live policy, or one this employee signed.
CREATE OR REPLACE FUNCTION public.portal_policy_version(p_token text, p_version uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_result json;
BEGIN
  SELECT json_build_object(
           'version_id', v.id, 'policy_id', p.id, 'title', p.title, 'summary', p.summary,
           'requires_signature', p.requires_signature, 'version', v.version, 'status', v.status,
           'body', v.body, 'body_sha256', v.body_sha256, 'published_at', v.published_at,
           'signature_id', s.id, 'signed_at', s.signed_at,
           'employee_name', v_emp.name)
  INTO v_result
  FROM public.policy_versions v
  JOIN public.policies p ON p.id = v.policy_id
  LEFT JOIN public.policy_signatures s ON s.version_id = v.id AND s.employee_id = v_emp.id
  WHERE v.id = p_version
    AND v.company_id = v_emp.company_id
    AND ((v.status = 'published' AND p.archived_at IS NULL) OR s.id IS NOT NULL);
  IF v_result IS NULL THEN
    RETURN json_build_object('error', 'This policy is not available. Open Policies to see the current ones.');
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_sign_policy(
  p_token text, p_version uuid, p_typed_name text, p_agreed boolean, p_signature_png text, p_user_agent text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_row record;
  v_existing uuid;
  v_png bytea;
  v_w integer;
  v_h integer;
  v_name text := btrim(regexp_replace(COALESCE(p_typed_name, ''), '\s+', ' ', 'g'));
  v_recent integer;
  v_id uuid;
  v_next uuid;
BEGIN
  SELECT v.id, v.version, v.status, v.body_sha256, p.id AS policy_id, p.title, p.requires_signature, p.archived_at
  INTO v_row
  FROM public.policy_versions v JOIN public.policies p ON p.id = v.policy_id
  WHERE v.id = p_version AND v.company_id = v_emp.company_id;
  IF NOT FOUND OR v_row.status <> 'published' OR v_row.archived_at IS NOT NULL OR NOT v_row.requires_signature THEN
    RETURN json_build_object('error', 'This version is no longer the one to sign. Open Policies to see the current one.');
  END IF;

  SELECT s.id INTO v_existing FROM public.policy_signatures s WHERE s.version_id = p_version AND s.employee_id = v_emp.id;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('id', v_existing, 'already', true);
  END IF;

  SELECT count(*)::integer INTO v_recent FROM public.policy_signatures s
  WHERE s.employee_id = v_emp.id AND s.signed_at > now() - interval '10 minutes';
  IF v_recent >= 20 THEN
    RETURN json_build_object('error', 'Too many signatures in a short time. Wait a few minutes and try again.');
  END IF;

  IF NOT COALESCE(p_agreed, false) THEN
    RETURN json_build_object('error', 'Tick the box to confirm you have read it and agree.');
  END IF;
  IF char_length(public._policies_norm_name(v_name)) < 2
     OR public._policies_norm_name(v_name) <> public._policies_norm_name(v_emp.name) THEN
    RETURN json_build_object('error', 'Type your full name as HR has it on record: ' || v_emp.name || '.');
  END IF;

  IF p_signature_png IS NULL OR left(p_signature_png, 22) <> 'data:image/png;base64,' THEN
    RETURN json_build_object('error', 'Sign in the box with your finger or mouse.');
  END IF;
  BEGIN
    v_png := decode(substr(p_signature_png, 23), 'base64');
  EXCEPTION WHEN others THEN
    RETURN json_build_object('error', 'That signature could not be read. Clear it and sign again.');
  END;
  IF length(v_png) > 250000 THEN
    RETURN json_build_object('error', 'That signature image is too large. Clear it and sign again.');
  END IF;
  IF length(v_png) < 24 OR substring(v_png FROM 1 FOR 8) <> '\x89504e470d0a1a0a'::bytea THEN
    RETURN json_build_object('error', 'That signature could not be read. Clear it and sign again.');
  END IF;
  v_w := (get_byte(v_png, 16) << 24) | (get_byte(v_png, 17) << 16) | (get_byte(v_png, 18) << 8) | get_byte(v_png, 19);
  v_h := (get_byte(v_png, 20) << 24) | (get_byte(v_png, 21) << 16) | (get_byte(v_png, 22) << 8) | get_byte(v_png, 23);
  IF v_w < 100 OR v_w > 2400 OR v_h < 40 OR v_h > 1200 THEN
    RETURN json_build_object('error', 'That signature has an unexpected size. Clear it and sign again.');
  END IF;

  INSERT INTO public.policy_signatures (company_id, policy_id, version_id, employee_id, signed_name, signature_png,
                                        signature_bytes, body_sha256, ip, user_agent)
  VALUES (v_emp.company_id, v_row.policy_id, p_version, v_emp.id, left(v_name, 120), p_signature_png,
          length(v_png), v_row.body_sha256, public._policies_request_ip(), left(NULLIF(btrim(COALESCE(p_user_agent, '')), ''), 300))
  ON CONFLICT (version_id, employee_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT s.id INTO v_id FROM public.policy_signatures s WHERE s.version_id = p_version AND s.employee_id = v_emp.id;
    RETURN json_build_object('id', v_id, 'already', true);
  END IF;

  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES ('policy.signed', v_emp.name || ' signed ' || v_row.title || ', version ' || v_row.version,
          jsonb_build_object('policy_id', v_row.policy_id, 'version_id', p_version, 'signature_id', v_id, 'sha256', v_row.body_sha256),
          NULL, v_emp.company_id, v_emp.id);

  SELECT v.id INTO v_next
  FROM public.policy_versions v JOIN public.policies p ON p.id = v.policy_id
  WHERE v.company_id = v_emp.company_id AND v.status = 'published' AND p.requires_signature AND p.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.policy_signatures s WHERE s.version_id = v.id AND s.employee_id = v_emp.id)
  ORDER BY p.created_at
  LIMIT 1;

  RETURN json_build_object('id', v_id, 'already', false, 'next_version_id', v_next);
END;
$$;

-- The employee's own signed copy (text, drawn signature, fingerprint, time, IP, browser).
CREATE OR REPLACE FUNCTION public.portal_policy_signature(p_token text, p_signature uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_result json;
BEGIN
  SELECT json_build_object(
           'id', s.id, 'policy_id', s.policy_id, 'version_id', s.version_id, 'title', p.title,
           'version', v.version, 'body', v.body, 'version_sha256', v.body_sha256, 'published_at', v.published_at,
           'signed_name', s.signed_name, 'signature_png', s.signature_png, 'body_sha256', s.body_sha256,
           'ip', s.ip, 'user_agent', s.user_agent, 'signed_at', s.signed_at,
           'employee_name', v_emp.name, 'employee_code', v_emp.employee_code, 'rank', v_emp.rank, 'cnic', v_emp.cnic)
  INTO v_result
  FROM public.policy_signatures s
  JOIN public.policy_versions v ON v.id = s.version_id
  JOIN public.policies p ON p.id = s.policy_id
  WHERE s.id = p_signature AND s.employee_id = v_emp.id;
  IF v_result IS NULL THEN
    RETURN json_build_object('error', 'That signature was not found.');
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_pending_signatures(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_policies(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_policy_version(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_sign_policy(text, uuid, text, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_policy_signature(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_pending_signatures(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_policies(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_policy_version(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_sign_policy(text, uuid, text, boolean, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_policy_signature(text, uuid) TO anon, authenticated;
