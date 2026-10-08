-- Timeline paging: the cursor was the last entry's timestamp alone, and the next page asked for
-- entries strictly older than it. When several entries share a timestamp (bulk actions write many
-- rows at once) and the page ends inside that group, the rest of the group was skipped and never
-- shown. The cursor is now (created_at, id), matching the feed's order; p_before alone still works.

DROP FUNCTION IF EXISTS public.platform_activity_feed(timestamptz, text, uuid, uuid, date, date, text, integer);

CREATE FUNCTION public.platform_activity_feed(
  p_before timestamptz DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_employee uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_before_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_company uuid := public._platform_assert(ARRAY['owner', 'hr', 'finance']);
  v_fin boolean := public.auth_is_finance();
  v_tz text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_area text := NULLIF(lower(btrim(COALESCE(p_area, ''))), '');
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_items jsonb;
  v_count integer;
BEGIN
  IF v_area = 'payroll' AND NOT v_fin THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'next_before', NULL, 'next_before_id', NULL);
  END IF;
  SELECT COALESCE(c.timezone, 'UTC') INTO v_tz FROM public.companies c WHERE c.id = v_company;
  IF v_search IS NOT NULL THEN
    v_search := '%' || replace(replace(replace(left(v_search, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH page AS (
    SELECT l.id, l.action_type, l.description, l.details, l.created_at, l.user_id, l.employee_id
    FROM public.activity_logs l
    WHERE l.company_id = v_company
      AND (v_fin OR l.action_type NOT LIKE 'payroll.%')
      AND (
        p_before IS NULL
        OR (p_before_id IS NULL AND l.created_at < p_before)
        OR (p_before_id IS NOT NULL AND (l.created_at, l.id) < (p_before, p_before_id))
      )
      AND (v_area IS NULL OR public.activity_area(l.action_type) = v_area)
      AND (p_employee IS NULL OR l.employee_id = p_employee OR (l.details ->> 'employee_id') = p_employee::text)
      AND (p_actor IS NULL OR l.user_id = p_actor)
      AND (p_from IS NULL OR l.created_at >= (p_from::timestamp AT TIME ZONE v_tz))
      AND (p_to IS NULL OR l.created_at < ((p_to + 1)::timestamp AT TIME ZONE v_tz))
      AND (v_search IS NULL OR l.description ILIKE v_search)
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'action', p.action_type,
      'area', public.activity_area(p.action_type),
      'description', p.description,
      'details', CASE WHEN v_fin THEN COALESCE(p.details, '{}'::jsonb) ELSE public._platform_strip_money(COALESCE(p.details, '{}'::jsonb)) END,
      'created_at', p.created_at,
      'actor', CASE WHEN p.user_id IS NULL THEN NULL
                    ELSE jsonb_build_object('id', p.user_id, 'name', public._platform_person(p.user_id)) END,
      'employee', CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object('id', e.id, 'name', e.name) END
    ) ORDER BY p.created_at DESC, p.id DESC) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
    count(*)
  INTO v_items, v_count
  FROM (SELECT page.*, row_number() OVER (ORDER BY page.created_at DESC, page.id DESC) AS rn FROM page) p
  LEFT JOIN public.employees e ON e.id = p.employee_id AND e.company_id = v_company;

  RETURN jsonb_build_object(
    'items', v_items,
    'next_before', CASE WHEN v_count > v_limit THEN (v_items -> (v_limit - 1) ->> 'created_at') END,
    'next_before_id', CASE WHEN v_count > v_limit THEN (v_items -> (v_limit - 1) ->> 'id') END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_activity_feed(timestamptz, text, uuid, uuid, date, date, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_activity_feed(timestamptz, text, uuid, uuid, date, date, text, integer, uuid) TO authenticated;
