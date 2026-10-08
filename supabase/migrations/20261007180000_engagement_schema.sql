-- Engagement 1/4: schema for announcements, polls, complaints, HR <-> employee messages,
-- celebrations and web push subscriptions.
-- Depends on the foundation migrations (20261007100000..100600): auth_* helpers,
-- departments, notifications, tg_set_updated_at().

-- ---------------------------------------------------------------------------
-- announcements: pinned flag, audience (everyone or one department), edit stamps
-- ---------------------------------------------------------------------------
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.announcements SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.announcements ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.announcements ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'announcements_audience_chk' AND conrelid = 'public.announcements'::regclass) THEN
    -- A department audience whose department was deleted (department_id SET NULL) is shown to no employee.
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_audience_chk CHECK (audience IN ('all', 'department')) NOT VALID;
    ALTER TABLE public.announcements VALIDATE CONSTRAINT announcements_audience_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'announcements_length_chk' AND conrelid = 'public.announcements'::regclass) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_length_chk
      CHECK (char_length(title) <= 200 AND char_length(content) <= 8000) NOT VALID;
    ALTER TABLE public.announcements VALIDATE CONSTRAINT announcements_length_chk;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcements_company_created ON public.announcements (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements (created_by);
CREATE INDEX IF NOT EXISTS idx_announcements_department ON public.announcements (department_id);
CREATE INDEX IF NOT EXISTS idx_announcements_updated_by ON public.announcements (updated_by);

-- ---------------------------------------------------------------------------
-- polls: description, closed stamp; options keep their order
-- ---------------------------------------------------------------------------
ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.polls SET status = 'active' WHERE status IS NULL;
ALTER TABLE public.polls ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.polls ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polls_length_chk' AND conrelid = 'public.polls'::regclass) THEN
    ALTER TABLE public.polls ADD CONSTRAINT polls_length_chk
      CHECK (char_length(question) <= 300 AND (description IS NULL OR char_length(description) <= 2000)) NOT VALID;
    ALTER TABLE public.polls VALIDATE CONSTRAINT polls_length_chk;
  END IF;
END $$;

ALTER TABLE public.poll_options ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
WITH ordered AS (
  SELECT o.id, (row_number() OVER (PARTITION BY o.poll_id ORDER BY o.created_at, o.id) - 1)::int AS pos
  FROM public.poll_options o
)
UPDATE public.poll_options o SET position = ordered.pos
FROM ordered
WHERE ordered.id = o.id AND o.position = 0 AND ordered.pos <> 0;

CREATE INDEX IF NOT EXISTS idx_polls_company_created ON public.polls (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_polls_created_by ON public.polls (created_by);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options (poll_id, position);
CREATE INDEX IF NOT EXISTS idx_poll_votes_employee ON public.poll_votes (employee_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option_poll ON public.poll_votes (option_id, poll_id);

-- ---------------------------------------------------------------------------
-- complaints: HR response and who gave it
-- ---------------------------------------------------------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS response text,
  ADD COLUMN IF NOT EXISTS responded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.complaints SET status = 'pending' WHERE status IS NULL;
UPDATE public.complaints SET is_anonymous = false WHERE is_anonymous IS NULL;
ALTER TABLE public.complaints ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.complaints ALTER COLUMN is_anonymous SET NOT NULL;
ALTER TABLE public.complaints ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  -- Nothing in an anonymous complaint may point back at the person.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_anonymous_chk' AND conrelid = 'public.complaints'::regclass) THEN
    ALTER TABLE public.complaints ADD CONSTRAINT complaints_anonymous_chk CHECK (NOT is_anonymous OR employee_id IS NULL) NOT VALID;
    ALTER TABLE public.complaints VALIDATE CONSTRAINT complaints_anonymous_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_length_chk' AND conrelid = 'public.complaints'::regclass) THEN
    ALTER TABLE public.complaints ADD CONSTRAINT complaints_length_chk
      CHECK (char_length(subject) <= 200 AND char_length(description) <= 5000 AND (response IS NULL OR char_length(response) <= 2000)) NOT VALID;
    ALTER TABLE public.complaints VALIDATE CONSTRAINT complaints_length_chk;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_complaints_company_created ON public.complaints (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_company_status ON public.complaints (company_id, status);
CREATE INDEX IF NOT EXISTS idx_complaints_employee ON public.complaints (employee_id);
CREATE INDEX IF NOT EXISTS idx_complaints_responded_by ON public.complaints (responded_by);

-- updated_at maintenance (tg_set_updated_at comes from the foundation)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['announcements', 'polls', 'complaints'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- messages: one thread per employee with HR, typed sender.
-- Legacy rows used sender_id / receiver_id that mixed profile ids and employee ids.
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sender_kind text,
  ADD COLUMN IF NOT EXISTS sender_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Every legacy policy goes first: some reference the columns dropped below.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages' LOOP
    EXECUTE format('DROP POLICY %I ON public.messages', r.policyname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'sender_id') THEN
    -- Staff -> employee
    EXECUTE $sql$
      UPDATE public.messages m
      SET employee_id = m.receiver_id,
          sender_kind = 'staff',
          sender_user_id = m.sender_id,
          read_at = CASE WHEN COALESCE(m.is_read, false) THEN m.created_at END
      WHERE m.sender_kind IS NULL
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.sender_id)
        AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.receiver_id AND e.company_id = m.company_id)
    $sql$;
    -- Employee -> staff
    EXECUTE $sql$
      UPDATE public.messages m
      SET employee_id = m.sender_id,
          sender_kind = 'employee',
          sender_user_id = NULL,
          read_at = CASE WHEN COALESCE(m.is_read, false) THEN m.created_at END
      WHERE m.sender_kind IS NULL
        AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.sender_id AND e.company_id = m.company_id)
    $sql$;
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_messages_pair_created;
DROP INDEX IF EXISTS public.idx_messages_pair;
DROP INDEX IF EXISTS public.idx_messages_receiver_unread;

ALTER TABLE public.messages DROP COLUMN IF EXISTS sender_id;
ALTER TABLE public.messages DROP COLUMN IF EXISTS receiver_id;
ALTER TABLE public.messages DROP COLUMN IF EXISTS is_read;

ALTER TABLE public.messages ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN sender_kind SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_kind_chk' AND conrelid = 'public.messages'::regclass) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_sender_kind_chk
      CHECK (sender_kind IN ('staff', 'employee') AND (sender_kind = 'staff' OR sender_user_id IS NULL)) NOT VALID;
    ALTER TABLE public.messages VALIDATE CONSTRAINT messages_sender_kind_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_content_chk' AND conrelid = 'public.messages'::regclass) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_content_chk
      CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000) NOT VALID;
    ALTER TABLE public.messages VALIDATE CONSTRAINT messages_content_chk;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_company_created ON public.messages (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_employee_created ON public.messages (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_user ON public.messages (sender_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread_for_staff ON public.messages (company_id) WHERE sender_kind = 'employee' AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_unread_for_employee ON public.messages (employee_id) WHERE sender_kind = 'staff' AND read_at IS NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
-- HR and the owner share one inbox; writes go through engagement_* / portal_* RPCs only.
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.messages FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

-- Old ID-based chat / poll / complaint RPCs: superseded by engagement_* and portal_* (and already revoked).
DROP FUNCTION IF EXISTS public.employee_get_admin_id(uuid);
DROP FUNCTION IF EXISTS public.employee_get_announcements(uuid);
DROP FUNCTION IF EXISTS public.employee_get_polls(uuid);
DROP FUNCTION IF EXISTS public.employee_cast_vote(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.employee_get_chat(uuid, uuid);
DROP FUNCTION IF EXISTS public.employee_send_message(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.employee_mark_chat_read(uuid, uuid);
DROP FUNCTION IF EXISTS public.employee_get_unread_counts(uuid);
DROP FUNCTION IF EXISTS public.employee_get_complaints(uuid);
DROP FUNCTION IF EXISTS public.employee_submit_complaint(uuid, uuid, text, text, boolean);

-- ---------------------------------------------------------------------------
-- celebrations: birthday privacy, colleagues' wishes, morning greeting log
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS share_birthday boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.celebration_wishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,  -- the person celebrating
  kind text NOT NULL CONSTRAINT celebration_wishes_kind_chk CHECK (kind IN ('birthday', 'anniversary', 'welcome')),
  occasion_date date NOT NULL,
  from_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,          -- staff sender
  from_employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,     -- colleague sender (portal)
  message text CONSTRAINT celebration_wishes_message_chk CHECK (message IS NULL OR char_length(message) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT celebration_wishes_one_sender_chk CHECK ((from_user_id IS NOT NULL) <> (from_employee_id IS NOT NULL)),
  CONSTRAINT celebration_wishes_not_self_chk CHECK (from_employee_id IS DISTINCT FROM employee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS celebration_wishes_staff_uidx
  ON public.celebration_wishes (employee_id, kind, occasion_date, from_user_id) WHERE from_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS celebration_wishes_employee_uidx
  ON public.celebration_wishes (employee_id, kind, occasion_date, from_employee_id) WHERE from_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_celebration_wishes_company_date ON public.celebration_wishes (company_id, occasion_date DESC);
CREATE INDEX IF NOT EXISTS idx_celebration_wishes_employee ON public.celebration_wishes (employee_id, occasion_date DESC);
CREATE INDEX IF NOT EXISTS idx_celebration_wishes_from_user ON public.celebration_wishes (from_user_id);
CREATE INDEX IF NOT EXISTS idx_celebration_wishes_from_employee ON public.celebration_wishes (from_employee_id);
ALTER TABLE public.celebration_wishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS celebration_wishes_select ON public.celebration_wishes;
CREATE POLICY celebration_wishes_select ON public.celebration_wishes FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.celebration_wishes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.celebration_greetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT celebration_greetings_kind_chk CHECK (kind IN ('birthday', 'anniversary', 'welcome')),
  occasion_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT celebration_greetings_once_key UNIQUE (employee_id, kind, occasion_date)
);
CREATE INDEX IF NOT EXISTS idx_celebration_greetings_company_date ON public.celebration_greetings (company_id, occasion_date DESC);
ALTER TABLE public.celebration_greetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS celebration_greetings_select ON public.celebration_greetings;
CREATE POLICY celebration_greetings_select ON public.celebration_greetings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.celebration_greetings FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- push_subscriptions: browsers that receive web push, for a staff user or an employee
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  endpoint text NOT NULL CONSTRAINT push_subscriptions_endpoint_key UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device text NOT NULL DEFAULT 'Browser',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz,
  last_error text,
  failures integer NOT NULL DEFAULT 0,
  CONSTRAINT push_subscriptions_one_recipient_chk CHECK ((user_id IS NOT NULL) <> (employee_id IS NOT NULL)),
  CONSTRAINT push_subscriptions_endpoint_chk CHECK (char_length(endpoint) BETWEEN 20 AND 2048 AND endpoint LIKE 'https://%'),
  CONSTRAINT push_subscriptions_device_chk CHECK (char_length(device) <= 80)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_company_created ON public.push_subscriptions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_employee ON public.push_subscriptions (employee_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.push_subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.push_subscriptions FROM authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;
