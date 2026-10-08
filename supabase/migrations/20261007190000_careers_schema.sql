-- Careers module: company slugs, job postings, applications and the hiring notes timeline.
-- Depends on the foundation migrations (auth helpers, departments, tg_set_updated_at).
-- All writes go through SECURITY DEFINER RPCs (20261007190100); tables expose SELECT to HR/owner only.

-- ---------------------------------------------------------------------------
-- Slug helper (plain, immutable; used by triggers and RPCs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.careers_slugify(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(left(btrim(regexp_replace(lower(COALESCE(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-'), 60), '-');
$$;
REVOKE ALL ON FUNCTION public.careers_slugify(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.careers_slugify(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- companies.slug: public careers address (/careers/<slug>)
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text;

WITH raw AS (
  SELECT id, created_at, COALESCE(NULLIF(public.careers_slugify(name), ''), 'company') AS b0
  FROM public.companies
  WHERE slug IS NULL
), base AS (
  SELECT id,
         CASE WHEN length(b0) < 2 THEN b0 || '-co' ELSE b0 END AS b,
         row_number() OVER (PARTITION BY b0 ORDER BY created_at, id) AS rn
  FROM raw
)
UPDATE public.companies c
SET slug = CASE WHEN base.rn = 1 AND NOT EXISTS (SELECT 1 FROM public.companies o WHERE o.slug = base.b)
                THEN base.b
                ELSE rtrim(left(base.b, 52), '-') || '-' || left(replace(c.id::text, '-', ''), 6) END
FROM base
WHERE c.id = base.id;

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_uidx ON public.companies (slug);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_slug_chk' AND conrelid = 'public.companies'::regclass) THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_slug_chk
      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 60) NOT VALID;
    ALTER TABLE public.companies VALIDATE CONSTRAINT companies_slug_chk;
  END IF;
END $$;

-- New companies get a unique slug automatically.
CREATE OR REPLACE FUNCTION public.tg_companies_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_base text;
  v_try text;
  v_n integer := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND btrim(NEW.slug) <> '' THEN
    NEW.slug := lower(btrim(NEW.slug));
    RETURN NEW;
  END IF;
  v_base := COALESCE(NULLIF(public.careers_slugify(NEW.name), ''), 'company');
  IF length(v_base) < 2 THEN v_base := v_base || '-co'; END IF;
  v_try := v_base;
  WHILE EXISTS (SELECT 1 FROM public.companies c WHERE c.slug = v_try AND c.id IS DISTINCT FROM NEW.id) LOOP
    v_n := v_n + 1;
    v_try := rtrim(left(v_base, 55), '-') || '-' || v_n;
  END LOOP;
  NEW.slug := v_try;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_companies_slug() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS companies_slug ON public.companies;
CREATE TRIGGER companies_slug
  BEFORE INSERT OR UPDATE OF slug ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_companies_slug();

ALTER TABLE public.companies ALTER COLUMN slug SET NOT NULL;

-- ---------------------------------------------------------------------------
-- job_postings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  location text NOT NULL DEFAULT '',
  employment_type text NOT NULL DEFAULT 'full_time',
  workplace text NOT NULL DEFAULT 'onsite',
  openings integer NOT NULL DEFAULT 1,
  summary text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  closes_on date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_postings_company_slug_key UNIQUE (company_id, slug),
  CONSTRAINT job_postings_slug_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  CONSTRAINT job_postings_title_chk CHECK (length(btrim(title)) BETWEEN 3 AND 120),
  CONSTRAINT job_postings_location_chk CHECK (length(location) <= 80),
  CONSTRAINT job_postings_type_chk CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship', 'temporary')),
  CONSTRAINT job_postings_workplace_chk CHECK (workplace IN ('onsite', 'hybrid', 'remote')),
  CONSTRAINT job_postings_openings_chk CHECK (openings BETWEEN 1 AND 999),
  CONSTRAINT job_postings_text_chk CHECK (length(summary) <= 300 AND length(description) <= 8000 AND length(requirements) <= 4000),
  CONSTRAINT job_postings_status_chk CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_job_postings_company_status ON public.job_postings (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_department_id ON public.job_postings (department_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_created_by ON public.job_postings (created_by);

-- Department must belong to the posting's company.
CREATE OR REPLACE FUNCTION public.tg_job_postings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.department_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = NEW.department_id AND d.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Department does not belong to this company' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_job_postings_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_postings_guard ON public.job_postings;
CREATE TRIGGER job_postings_guard
  BEFORE INSERT OR UPDATE OF department_id, company_id ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.tg_job_postings_guard();

DROP TRIGGER IF EXISTS set_updated_at ON public.job_postings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- job_applications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  cover_letter text NOT NULL DEFAULT '',
  cv_path text,
  cv_name text,
  cv_size integer,
  status text NOT NULL DEFAULT 'new',
  rating smallint,
  ip_hash text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_applications_name_chk CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT job_applications_email_chk CHECK (length(email) BETWEEN 5 AND 120 AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  CONSTRAINT job_applications_text_chk CHECK (length(phone) <= 40 AND length(link) <= 300 AND length(cover_letter) <= 2000),
  CONSTRAINT job_applications_status_chk CHECK (status IN ('new', 'reviewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected')),
  CONSTRAINT job_applications_rating_chk CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT job_applications_cv_chk CHECK (cv_size IS NULL OR cv_size BETWEEN 1 AND 8388608)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_company_status ON public.job_applications (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON public.job_applications (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_employee_id ON public.job_applications (employee_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_ip_recent ON public.job_applications (ip_hash, created_at) WHERE ip_hash IS NOT NULL;
-- One application per e-mail per role.
CREATE UNIQUE INDEX IF NOT EXISTS job_applications_job_email_uidx ON public.job_applications (job_id, lower(email));

-- company_id always follows the job.
CREATE OR REPLACE FUNCTION public.tg_job_applications_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SELECT j.company_id INTO NEW.company_id FROM public.job_postings j WHERE j.id = NEW.job_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Unknown job' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_job_applications_company() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_applications_company ON public.job_applications;
CREATE TRIGGER job_applications_company
  BEFORE INSERT OR UPDATE OF job_id, company_id ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_job_applications_company();

DROP TRIGGER IF EXISTS set_updated_at ON public.job_applications;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- job_application_notes: notes and the status timeline per application
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_application_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'note',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_application_notes_kind_chk CHECK (kind IN ('note', 'status', 'hire')),
  CONSTRAINT job_application_notes_body_chk CHECK (length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_job_application_notes_application ON public.job_application_notes (application_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_application_notes_company_created ON public.job_application_notes (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_application_notes_author_id ON public.job_application_notes (author_id);

-- ---------------------------------------------------------------------------
-- RLS: HR and owner read their company's rows; every write is an RPC.
-- ---------------------------------------------------------------------------
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_application_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_postings_select ON public.job_postings;
CREATE POLICY job_postings_select ON public.job_postings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

DROP POLICY IF EXISTS job_applications_select ON public.job_applications;
CREATE POLICY job_applications_select ON public.job_applications FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

DROP POLICY IF EXISTS job_application_notes_select ON public.job_application_notes;
CREATE POLICY job_application_notes_select ON public.job_application_notes FOR SELECT TO authenticated
  USING (company_id = (SELECT public.auth_company_id()) AND (SELECT public.auth_is_hr()));

REVOKE ALL ON public.job_postings, public.job_applications, public.job_application_notes FROM anon, authenticated;
GRANT SELECT ON public.job_postings, public.job_applications, public.job_application_notes TO authenticated;
GRANT ALL ON public.job_postings, public.job_applications, public.job_application_notes TO service_role;
