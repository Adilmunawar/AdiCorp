-- Foundation 3/7: in-app notifications (staff + portal), activity log helper.

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,       -- staff recipient (auth user id)
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,  -- portal recipient
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_one_recipient_chk CHECK ((user_id IS NOT NULL) <> (employee_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_employee_created ON public.notifications (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company_created ON public.notifications (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE read_at IS NULL;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Clients may read, mark read (read_at only) and dismiss their own rows; inserts go through notify_*.
REVOKE INSERT, UPDATE, TRUNCATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Internal guard shared by the notify_* helpers. Authenticated callers may only
-- notify inside their own company; definer callers without a JWT (portal RPCs,
-- service role) are trusted because anon cannot execute the helpers directly.
CREATE OR REPLACE FUNCTION public._notify_assert_company(p_company uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (p_company IS DISTINCT FROM public.auth_company_id() OR NOT public.auth_is_staff()) THEN
    RAISE EXCEPTION 'Cannot send notifications outside your company' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._notify_assert_company(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_user(
  p_company uuid, p_user uuid, p_kind text, p_title text, p_body text DEFAULT NULL, p_href text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_company IS NULL OR p_user IS NULL OR NULLIF(btrim(p_title), '') IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public._notify_assert_company(p_company);
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user AND p.company_id = p_company) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (company_id, user_id, kind, title, body, href)
  VALUES (p_company, p_user, left(COALESCE(NULLIF(btrim(p_kind), ''), 'general'), 64), left(btrim(p_title), 200),
          left(p_body, 2000), CASE WHEN p_href LIKE '/%' THEN left(p_href, 500) END)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Fan-out to every staff profile of the company holding one of p_roles.
-- 'owner' is always included when 'hr' or 'finance' is. The acting user is skipped.
CREATE OR REPLACE FUNCTION public.notify_roles(
  p_company uuid, p_roles text[], p_kind text, p_title text, p_body text DEFAULT NULL, p_href text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_roles text[] := COALESCE(p_roles, '{}'::text[]);
  v_count integer := 0;
BEGIN
  IF p_company IS NULL OR NULLIF(btrim(p_title), '') IS NULL OR cardinality(v_roles) = 0 THEN
    RETURN 0;
  END IF;
  PERFORM public._notify_assert_company(p_company);
  IF v_roles && ARRAY['hr', 'finance'] AND NOT ('owner' = ANY (v_roles)) THEN
    v_roles := v_roles || 'owner'::text;
  END IF;

  INSERT INTO public.notifications (company_id, user_id, kind, title, body, href)
  SELECT p_company, p.id, left(COALESCE(NULLIF(btrim(p_kind), ''), 'general'), 64), left(btrim(p_title), 200),
         left(p_body, 2000), CASE WHEN p_href LIKE '/%' THEN left(p_href, 500) END
  FROM public.profiles p
  WHERE p.company_id = p_company
    AND p.role = ANY (v_roles)
    AND p.id IS DISTINCT FROM auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_employee(
  p_company uuid, p_employee uuid, p_kind text, p_title text, p_body text DEFAULT NULL, p_href text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_company IS NULL OR p_employee IS NULL OR NULLIF(btrim(p_title), '') IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public._notify_assert_company(p_company);
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p_employee AND e.company_id = p_company) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (company_id, employee_id, kind, title, body, href)
  VALUES (p_company, p_employee, left(COALESCE(NULLIF(btrim(p_kind), ''), 'general'), 64), left(btrim(p_title), 200),
          left(p_body, 2000), CASE WHEN p_href LIKE '/%' THEN left(p_href, 500) END)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_roles(uuid, text[], text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_employee(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_roles(uuid, text[], text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_employee(uuid, uuid, text, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- activity_logs: employee subject, portal actors, log_activity()
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
-- Portal-originated entries (written by definer RPCs) have an employee actor and no staff user.
ALTER TABLE public.activity_logs ALTER COLUMN user_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_actor_chk' AND conrelid = 'public.activity_logs'::regclass) THEN
    ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_actor_chk
      CHECK (user_id IS NOT NULL OR employee_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.activity_logs VALIDATE CONSTRAINT activity_logs_actor_chk;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created ON public.activity_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_employee_created ON public.activity_logs (employee_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_activity_logs_company_id;   -- covered by (company_id, created_at)
DROP INDEX IF EXISTS public.idx_activity_logs_created_at;   -- every read is company-scoped
DROP INDEX IF EXISTS public.idx_activity_logs_action_type;  -- unused

CREATE OR REPLACE FUNCTION public.log_activity(
  p_action text, p_description text, p_details jsonb DEFAULT '{}'::jsonb, p_employee uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.auth_company_id();
  v_action text := btrim(COALESCE(p_action, ''));
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL OR NOT public.auth_is_staff() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_action = '' THEN
    RAISE EXCEPTION 'Activity action is required' USING ERRCODE = '22023';
  END IF;
  IF v_action LIKE 'payroll.%' AND NOT public.auth_is_finance() THEN
    RAISE EXCEPTION 'Only Finance can write payroll activity' USING ERRCODE = '42501';
  END IF;
  IF p_employee IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p_employee AND e.company_id = v_company) THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES (left(v_action, 100), left(COALESCE(p_description, ''), 1000), COALESCE(p_details, '{}'::jsonb), v_uid, v_company, p_employee)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_activity(text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_activity(text, text, jsonb, uuid) TO authenticated;
