-- People 5/5: employee portal RPCs for documents and equipment (token sessions).
-- Each resolves the employee and company from p_token only and returns explicit
-- column lists. Profile-change requests are owned by the portal module
-- (portal_request_profile_update / portal_profile_requests / portal_withdraw_profile_request);
-- HR reviews them with people_review_update_request.

-- My documents.
CREATE OR REPLACE FUNCTION public.portal_my_documents(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', d.id,
      'document_name', d.document_name,
      'document_type', d.document_type,
      'file_name', d.file_name,
      'file_path', d.file_path,
      'file_size', d.file_size,
      'mime_type', d.mime_type,
      'expires_on', d.expires_on,
      'created_at', d.created_at,
      'uploaded_by_me', d.uploaded_by IS NULL
    ) ORDER BY d.created_at DESC)
    FROM public.employee_documents d
    WHERE d.employee_id = v_emp.id AND d.company_id = v_emp.company_id
  ), '[]'::json);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_my_documents(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_my_documents(text) TO anon, authenticated;

-- Register a file the employee uploaded through the portal-files Edge Function
-- (path <company>/<employee>/<type>/<file>; the object must exist).
CREATE OR REPLACE FUNCTION public.portal_add_document(
  p_token text, p_path text, p_name text, p_type text, p_file_name text DEFAULT NULL, p_size integer DEFAULT NULL, p_mime text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
  v_name text := NULLIF(regexp_replace(btrim(COALESCE(p_name, '')), '\s+', ' ', 'g'), '');
  v_prefix text := v_emp.company_id::text || '/' || v_emp.id::text || '/';
  v_id uuid;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('id_copy', 'contract', 'certificate', 'resume', 'other') THEN
    RETURN json_build_object('error', 'Choose a document type.');
  END IF;
  IF p_path IS NULL OR left(p_path, length(v_prefix)) <> v_prefix
     OR p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z][a-z0-9_-]{1,31}/[A-Za-z0-9._-]{1,128}$' THEN
    RETURN json_build_object('error', 'Invalid file.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'employee-documents' AND o.name = p_path) THEN
    RETURN json_build_object('error', 'The upload did not finish. Please try again.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.employee_documents d WHERE d.file_path = p_path) THEN
    RETURN json_build_object('error', 'This file is already on your record.');
  END IF;
  IF (SELECT count(*) FROM public.employee_documents d WHERE d.employee_id = v_emp.id) >= 40 THEN
    RETURN json_build_object('error', 'Your record already holds 40 documents. Ask HR to remove old ones.');
  END IF;
  IF v_name IS NULL OR length(v_name) > 120 THEN
    v_name := initcap(replace(p_type, '_', ' '));
  END IF;

  INSERT INTO public.employee_documents (employee_id, company_id, document_type, document_name, file_name, file_path, file_size, mime_type, uploaded_by)
  VALUES (v_emp.id, v_emp.company_id, p_type::public.document_type, v_name,
          left(COALESCE(NULLIF(btrim(p_file_name), ''), split_part(p_path, '/', 4)), 200), p_path,
          CASE WHEN p_size BETWEEN 0 AND 8388608 THEN p_size END, left(p_mime, 100), NULL)
  RETURNING id INTO v_id;

  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES ('document.added', format('%s uploaded %s', v_emp.name, v_name),
          jsonb_build_object('document_id', v_id, 'type', p_type, 'source', 'portal'), NULL, v_emp.company_id, v_emp.id);

  PERFORM public.notify_roles(v_emp.company_id, ARRAY['hr'], 'people.document', 'New document uploaded',
    format('%s added "%s" to their record.', v_emp.name, v_name), '/employees/' || v_emp.id || '?tab=documents');

  RETURN json_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_add_document(text, text, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_add_document(text, text, text, text, text, integer, text) TO anon, authenticated;

-- My equipment: what I hold now and what I held before.
CREATE OR REPLACE FUNCTION public.portal_my_assets(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees := public._portal_employee(p_token);
BEGIN
  RETURN json_build_object(
    'current', COALESCE((
      SELECT json_agg(json_build_object(
        'id', a.id, 'tag', a.tag, 'name', a.name, 'category', a.category, 'brand', a.brand, 'model', a.model,
        'serial_number', a.serial_number, 'condition', a.condition, 'assigned_on', a.assigned_on, 'warranty_until', a.warranty_until
      ) ORDER BY a.assigned_on DESC NULLS LAST)
      FROM public.assets a
      WHERE a.employee_id = v_emp.id AND a.company_id = v_emp.company_id AND a.status = 'assigned'
    ), '[]'::json),
    'history', COALESCE((
      SELECT json_agg(json_build_object(
        'id', x.id, 'tag', a.tag, 'name', a.name, 'category', a.category,
        'assigned_on', x.assigned_on, 'returned_on', x.returned_on, 'condition_out', x.condition_out, 'condition_in', x.condition_in
      ) ORDER BY x.assigned_on DESC)
      FROM public.asset_assignments x
      JOIN public.assets a ON a.id = x.asset_id
      WHERE x.employee_id = v_emp.id AND x.company_id = v_emp.company_id AND x.returned_on IS NOT NULL
    ), '[]'::json)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.portal_my_assets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_my_assets(text) TO anon, authenticated;
