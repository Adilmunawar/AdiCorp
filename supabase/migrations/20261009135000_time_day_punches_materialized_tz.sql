-- 1. _time_day_punches: the timezone CTE was inlined, so _time_tz() ran four times per punch row
--    (~85% of _time_days' cost). MATERIALIZED evaluates it once. Output is unchanged.
-- 2. time_ingest_punches: read the LAST x-forwarded-for hop (the proxy's), not the first (client-controlled).

CREATE OR REPLACE FUNCTION public._time_day_punches(p_company uuid, p_from date, p_to date, p_employee uuid DEFAULT NULL::uuid)
 RETURNS TABLE(employee_id uuid, work_date date, first_in timestamp with time zone, last_out timestamp with time zone, punches integer, corrected boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  WITH z AS MATERIALIZED (SELECT public._time_tz(p_company) AS tz),
  p AS (
    -- The same person on two clocks within the same second is one punch (the unique index only
    -- dedupes per device). A correction punch at that second wins over the clock.
    SELECT DISTINCT ON (tp.employee_id, date_trunc('second', tp.punch_at))
           tp.employee_id, tp.punch_at, tp.direction, tp.source,
           CASE WHEN e.shift_type = 'night'
                THEN ((tp.punch_at AT TIME ZONE z.tz) - interval '12 hours')::date
                ELSE (tp.punch_at AT TIME ZONE z.tz)::date END AS work_date
    FROM public.time_punches tp
    JOIN public.employees e ON e.id = tp.employee_id
    CROSS JOIN z
    WHERE tp.company_id = p_company
      AND tp.employee_id IS NOT NULL
      AND (p_employee IS NULL OR tp.employee_id = p_employee)
      AND tp.punch_date BETWEEN p_from - 1 AND p_to + 1
    ORDER BY tp.employee_id, date_trunc('second', tp.punch_at), (tp.source = 'correction') DESC, tp.direction, tp.id
  ),
  a AS (
    SELECT p.employee_id, p.work_date,
           -- An approved correction is the agreed time: it replaces what the clock recorded in that direction.
           COALESCE(min(p.punch_at) FILTER (WHERE p.source = 'correction' AND p.direction = 'in'),
                    min(p.punch_at) FILTER (WHERE p.direction <> 'out')) AS first_in,
           COALESCE(max(p.punch_at) FILTER (WHERE p.source = 'correction' AND p.direction = 'out'),
                    max(p.punch_at) FILTER (WHERE p.direction <> 'in')) AS last_any,
           count(*)::integer AS punches,
           bool_or(p.source = 'correction') AS corrected
    FROM p
    WHERE p.work_date BETWEEN p_from AND p_to
    GROUP BY p.employee_id, p.work_date
  )
  SELECT a.employee_id, a.work_date, a.first_in,
         CASE WHEN a.first_in IS NOT NULL AND a.last_any > a.first_in THEN a.last_any END,
         a.punches, a.corrected
  FROM a;
$function$;

CREATE OR REPLACE FUNCTION public.time_ingest_punches(p_device_key text, p_punches jsonb DEFAULT '[]'::jsonb, p_device jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  dev public.time_devices;
  v_cfg public.time_settings;
  v_tz text;
  v_total integer;
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_unmatched integer := 0;
  v_marked integer := 0;
  v_ip text;
  r record;
  v_match uuid;
BEGIN
  IF p_device_key IS NULL OR p_device_key !~ '^adk_[0-9a-f]{48}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device key');
  END IF;
  SELECT d.* INTO dev
  FROM public.time_device_keys k JOIN public.time_devices d ON d.id = k.device_id
  WHERE k.key_hash = extensions.digest(p_device_key, 'sha256');
  IF dev.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid device key');
  END IF;
  IF NOT dev.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device disabled');
  END IF;
  IF p_punches IS NULL OR jsonb_typeof(p_punches) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'punches must be a list');
  END IF;
  v_total := jsonb_array_length(p_punches);
  IF v_total > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'send at most 2000 punches per request');
  END IF;

  v_cfg := public._time_settings(dev.company_id);
  v_tz := v_cfg.timezone;
  BEGIN
    -- Last hop of x-forwarded-for: the one the gateway appended. Earlier hops are client-supplied.
    v_ip := left(btrim(regexp_replace(COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), '^.*,', '')), 64);
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  CREATE TEMP TABLE IF NOT EXISTS _time_ingest (
    pin text, pat timestamptz, direction text, verify text, src text
  ) ON COMMIT DROP;
  TRUNCATE pg_temp._time_ingest;

  INSERT INTO pg_temp._time_ingest (pin, pat, direction, verify, src)
  SELECT btrim(x ->> 'user_id'),
         public._time_parse_ts(x ->> 'ts', v_tz),
         CASE WHEN dev.direction IN ('in', 'out') THEN dev.direction
              WHEN (x ->> 'state') IN ('0', '3', '4') THEN 'in'
              WHEN (x ->> 'state') IN ('1', '2', '5') THEN 'out'
              WHEN lower(x ->> 'direction') IN ('in', 'out') THEN lower(x ->> 'direction')
              ELSE 'unknown' END,
         left(NULLIF(btrim(x ->> 'verify'), ''), 32),
         CASE WHEN x ->> 'source' = 'sync' THEN 'sync' ELSE 'live' END
  FROM jsonb_array_elements(p_punches) AS x;

  DELETE FROM pg_temp._time_ingest
  WHERE pin IS NULL OR pin !~ '^[A-Za-z0-9_.-]{1,32}$'
     OR pat IS NULL OR pat < '2015-01-01'::timestamptz OR pat > now() + interval '1 day';
  GET DIAGNOSTICS v_rejected = ROW_COUNT;

  -- Auto-link unknown IDs that match exactly one unlinked employee by employee code or CNIC digits.
  FOR r IN
    SELECT DISTINCT i.pin FROM pg_temp._time_ingest i
    WHERE NOT EXISTS (SELECT 1 FROM public.time_terminal_links l WHERE l.company_id = dev.company_id AND l.device_user_id = i.pin)
  LOOP
    SELECT CASE WHEN count(*) = 1 THEN min(e.id::text)::uuid END INTO v_match
    FROM public.employees e
    WHERE e.company_id = dev.company_id AND e.status IN ('active', 'on_leave')
      AND (lower(e.employee_code) = lower(r.pin) OR regexp_replace(COALESCE(e.cnic, ''), '\D', '', 'g') = r.pin)
      AND NOT EXISTS (SELECT 1 FROM public.time_terminal_links l WHERE l.employee_id = e.id);
    IF v_match IS NOT NULL THEN
      INSERT INTO public.time_terminal_links (company_id, device_user_id, employee_id, auto)
      VALUES (dev.company_id, r.pin, v_match, true)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        UPDATE public.time_punches SET employee_id = v_match
        WHERE company_id = dev.company_id AND device_user_id = r.pin AND employee_id IS NULL;
        PERFORM public._time_log(dev.company_id, 'biometric.linked', format('Terminal ID %s linked automatically', r.pin),
          jsonb_build_object('device_user_id', r.pin, 'auto', true), v_match);
      END IF;
    END IF;
  END LOOP;

  WITH ins AS (
    INSERT INTO public.time_punches (company_id, employee_id, device_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source)
    SELECT dev.company_id, l.employee_id, dev.id, dev.id::text, i.pin, i.pat, (i.pat AT TIME ZONE v_tz)::date, i.direction, i.verify, i.src
    FROM (SELECT DISTINCT ON (t.pin, t.pat) t.* FROM pg_temp._time_ingest t ORDER BY t.pin, t.pat) i
    LEFT JOIN public.time_terminal_links l ON l.company_id = dev.company_id AND l.device_user_id = i.pin
    ON CONFLICT (company_id, device_ref, device_user_id, punch_at) DO NOTHING
    RETURNING employee_id, punch_at
  )
  SELECT count(*)::int, count(*) FILTER (WHERE employee_id IS NULL)::int INTO v_accepted, v_unmatched FROM ins;

  IF v_cfg.auto_present AND v_accepted > 0 THEN
    FOR r IN
      SELECT DISTINCT l.employee_id, public._time_work_date(dev.company_id, l.employee_id, i.pat) AS d
      FROM pg_temp._time_ingest i
      JOIN public.time_terminal_links l ON l.company_id = dev.company_id AND l.device_user_id = i.pin
    LOOP
      IF public._time_auto_present(dev.company_id, r.employee_id, r.d) THEN
        v_marked := v_marked + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.time_devices SET
    last_seen_at = now(),
    last_punch_at = GREATEST(last_punch_at, (SELECT max(t.pat) FROM pg_temp._time_ingest t)),
    last_ip = COALESCE(NULLIF(v_ip, ''), last_ip),
    firmware = COALESCE(left(NULLIF(btrim(p_device ->> 'firmware'), ''), 64), firmware),
    last_error = left(NULLIF(btrim(p_device ->> 'error'), ''), 300)
  WHERE id = dev.id;

  RETURN jsonb_build_object(
    'ok', true, 'device', dev.name, 'received', v_total, 'accepted', v_accepted,
    'duplicates', v_total - v_rejected - v_accepted, 'unmatched', v_unmatched,
    'rejected', v_rejected, 'marked_present', v_marked, 'server_time', now()
  );
END;
$function$;
