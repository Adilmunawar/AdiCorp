-- Foundation 6/7: storage buckets and tenant-scoped storage policies.
-- Every object path starts with '<company_id>/'. Conventions:
--   employee-documents : <company_id>/<employee_id>/<kind>/<file>   (legacy: <company_id>/<employee_id>-<file>)
--   avatars            : <company_id>/<employee_id|staff>/<file>    (public read)
--   expense-files      : <company_id>/<quote|receipt|certificate>/<employee_id|company>/<file>
--   cvs                : <company_id>/applications/<file>           (public careers uploads)
--   company-files      : <company_id>/<area>/...; '<company_id>/shared/...' and
--                        '<company_id>/employees/<employee_id>/...' are readable from the portal
--   logos              : <uid>-<ts>.<ext> at the root (public read; onboarding happens before a company exists)
-- Portal employees never use these policies; they go through the 'portal-files' Edge Function.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('employee-documents', 'employee-documents', false, 8388608, ARRAY[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('avatars', 'avatars', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('expense-files', 'expense-files', false, 8388608, ARRAY[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('cvs', 'cvs', false, 8388608, ARRAY[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('company-files', 'company-files', false, 8388608, ARRAY[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Old policies: no tenant scoping; any user could overwrite or delete any tenant's logos.
DROP POLICY IF EXISTS "Users can view documents in their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their documents" ON storage.objects;
DROP POLICY IF EXISTS anyone_can_view_logos ON storage.objects;
DROP POLICY IF EXISTS anyone_can_upload_logos ON storage.objects;
DROP POLICY IF EXISTS anyone_can_update_logos ON storage.objects;
DROP POLICY IF EXISTS anyone_can_delete_logos ON storage.objects;

DROP POLICY IF EXISTS tenant_objects_select ON storage.objects;
DROP POLICY IF EXISTS tenant_objects_insert ON storage.objects;
DROP POLICY IF EXISTS tenant_objects_update ON storage.objects;
DROP POLICY IF EXISTS tenant_objects_delete ON storage.objects;
DROP POLICY IF EXISTS public_cv_upload ON storage.objects;

-- Read
CREATE POLICY tenant_objects_select ON storage.objects FOR SELECT TO authenticated
USING (
  (bucket_id = 'logos')
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id IN ('employee-documents', 'avatars', 'company-files') AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files' AND (
            (SELECT public.auth_is_finance())
            OR ((SELECT public.auth_is_hr()) AND (storage.foldername(name))[2] IN ('quote', 'certificate'))))
      OR (bucket_id = 'cvs' AND (SELECT public.auth_is_hr()))
    )
  )
);

-- Upload
CREATE POLICY tenant_objects_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  (bucket_id = 'logos')
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id IN ('employee-documents', 'cvs') AND (SELECT public.auth_is_hr()))
      OR (bucket_id IN ('avatars', 'company-files') AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files' AND (
            (SELECT public.auth_is_finance())
            OR ((SELECT public.auth_is_hr()) AND (storage.foldername(name))[2] IN ('quote', 'certificate'))))
    )
  )
);

-- Replace (upsert)
CREATE POLICY tenant_objects_update ON storage.objects FOR UPDATE TO authenticated
USING (
  (bucket_id = 'logos' AND (
     owner_id = (SELECT auth.uid())::text
     OR ((storage.foldername(name))[1] = (SELECT public.auth_company_id())::text AND (SELECT public.auth_is_owner()))))
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id IN ('employee-documents', 'cvs') AND (SELECT public.auth_is_hr()))
      OR (bucket_id IN ('avatars', 'company-files') AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files' AND (SELECT public.auth_is_finance()))
    )
  )
)
WITH CHECK (
  (bucket_id = 'logos')
  OR (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
);

-- Delete
CREATE POLICY tenant_objects_delete ON storage.objects FOR DELETE TO authenticated
USING (
  (bucket_id = 'logos' AND (
     owner_id = (SELECT auth.uid())::text
     OR ((storage.foldername(name))[1] = (SELECT public.auth_company_id())::text AND (SELECT public.auth_is_owner()))))
  OR (
    (storage.foldername(name))[1] = (SELECT public.auth_company_id())::text
    AND (
      (bucket_id IN ('employee-documents', 'cvs', 'company-files') AND (SELECT public.auth_is_hr()))
      OR (bucket_id = 'avatars' AND (SELECT public.auth_is_staff()))
      OR (bucket_id = 'expense-files' AND (SELECT public.auth_is_finance()))
    )
  )
);

-- Public careers page: anonymous CV upload only, only into '<company uuid>/applications/'
-- (bucket limits: 8 MB, pdf/doc/docx). No anonymous read, list, overwrite or delete.
-- The careers RPC that records the application validates the company and the path.
CREATE POLICY public_cv_upload ON storage.objects FOR INSERT TO anon
WITH CHECK (
  bucket_id = 'cvs'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] = 'applications'
  AND array_length(storage.foldername(name), 1) = 2
);
