-- Time module 4/4: time-clock devices and ingest, terminal-ID links, punch corrections, portal RPCs.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Parse a device timestamp: ISO with offset/Z as-is, otherwise wall-clock time in the company zone.
CREATE OR REPLACE FUNCTION public._time_parse_ts(p_ts text, p_tz text)
RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_ts IS NULL OR char_length(p_ts) > 40 THEN
    RETURN NULL;
  END IF;
  IF p_ts ~ '(Z|z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN
    RETURN p_ts::timestamptz;
  END IF;
  RETURN (p_ts::timestamp) AT TIME ZONE p_tz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- New device key: shown once, stored as a SHA-256 hash.
CREATE OR REPLACE FUNCTION public._time_new_device_key(p_device uuid, p_company uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text := 'adk_' || encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  INSERT INTO public.time_device_keys (device_id, company_id, key_hash)
  VALUES (p_device, p_company, extensions.digest(v_key, 'sha256'))
  ON CONFLICT (device_id) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = now();
  UPDATE public.time_devices SET key_prefix = left(v_key, 12), updated_at = now() WHERE id = p_device;
  RETURN v_key;
END;
$$;

-- Work date of a punch for an employee (night shift: before noon belongs to the previous evening).
CREATE OR REPLACE FUNCTION public._time_work_date(p_company uuid, p_employee uuid, p_at timestamptz)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN (SELECT e.shift_type FROM public.employees e WHERE e.id = p_employee) = 'night'
              THEN ((p_at AT TIME ZONE public._time_tz(p_company)) - interval '12 hours')::date
              ELSE (p_at AT TIME ZONE public._time_tz(p_company))::date END;
$$;

-- Activity entry without a staff actor (device bridge, portal).
CREATE OR REPLACE FUNCTION public._time_log(p_company uuid, p_action text, p_description text, p_details jsonb, p_employee uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.activity_logs (action_type, description, details, user_id, company_id, employee_id)
  VALUES (left(p_action, 100), left(p_description, 1000), COALESCE(p_details, '{}'::jsonb), NULL, p_company, p_employee);
$$;

REVOKE ALL ON FUNCTION public._time_parse_ts(text, text), public._time_new_device_key(uuid, uuid),
  public._time_work_date(uuid, uuid, timestamptz), public._time_log(uuid, text, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Devices (HR / owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_save_device(
  p_id uuid, p_name text, p_serial text DEFAULT NULL, p_location text DEFAULT NULL,
  p_direction text DEFAULT 'both', p_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_name text := btrim(COALESCE(p_name, ''));
  v_id uuid;
  v_key text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage time clocks' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Give the device a name (2 to 80 characters)' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_direction, 'both') NOT IN ('in', 'out', 'both') THEN
    RAISE EXCEPTION 'Direction must be in, out or both' USING ERRCODE = '22023';
  END IF;

  BEGIN
    IF p_id IS NULL THEN
      IF (SELECT count(*) FROM public.time_devices WHERE company_id = v_company) >= 50 THEN
        RAISE EXCEPTION 'A company can have at most 50 time clocks' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.time_devices (company_id, name, serial, location, direction, is_active, key_prefix, created_by)
      VALUES (v_company, v_name, NULLIF(btrim(p_serial), ''), NULLIF(btrim(p_location), ''), COALESCE(p_direction, 'both'),
              COALESCE(p_active, true), 'adk_', auth.uid())
      RETURNING id INTO v_id;
      v_key := public._time_new_device_key(v_id, v_company);
      PERFORM public.log_activity('biometric.device_added', format('Added time clock "%s"', v_name), jsonb_build_object('device_id', v_id));
    ELSE
      UPDATE public.time_devices SET name = v_name, serial = NULLIF(btrim(p_serial), ''), location = NULLIF(btrim(p_location), ''),
        direction = COALESCE(p_direction, 'both'), is_active = COALESCE(p_active, true), updated_at = now()
      WHERE id = p_id AND company_id = v_company
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Time clock not found' USING ERRCODE = 'P0002';
      END IF;
      PERFORM public.log_activity('biometric.device_updated', format('Updated time clock "%s"', v_name),
        jsonb_build_object('device_id', v_id, 'active', COALESCE(p_active, true), 'direction', p_direction));
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Another time clock already uses this serial number' USING ERRCODE = '23505';
  END;
  RETURN jsonb_build_object('id', v_id, 'key', v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.time_rotate_device_key(p_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_name text;
  v_key text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage time clocks' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM public.time_devices WHERE id = p_id AND company_id = v_company;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Time clock not found' USING ERRCODE = 'P0002';
  END IF;
  v_key := public._time_new_device_key(p_id, v_company);
  PERFORM public.log_activity('biometric.key', format('Issued a new key for "%s"; the old key stopped working', v_name), jsonb_build_object('device_id', p_id));
  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.time_delete_device(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_name text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can manage time clocks' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.time_devices WHERE id = p_id AND company_id = v_company RETURNING name INTO v_name;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Time clock not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_activity('biometric.device_removed', format('Removed time clock "%s"; its punches are kept', v_name), jsonb_build_object('device_id', p_id));
END;
$$;

-- ---------------------------------------------------------------------------
-- Ingest from a device bridge (anon key + device key). Body:
--   p_device_key: 'adk_…' secret of the device
--   p_punches: [{ "user_id": "17", "ts": "2026-10-07T09:02:11+05:00" | "2026-10-07 09:02:11", "state": 0, "verify": "finger", "source": "live"|"sync" }]
--   p_device: { "firmware": "...", "error": "..." } (optional heartbeat details)
-- Resends are harmless (unique on device, user, timestamp). Unlinked IDs are kept and count once linked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_ingest_punches(p_device_key text, p_punches jsonb DEFAULT '[]'::jsonb, p_device jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
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
    v_ip := left(split_part(COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), 64);
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
$$;

-- ---------------------------------------------------------------------------
-- Terminal-ID links (HR / owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_terminal_ids()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'linked', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'device_user_id', l.device_user_id, 'employee_id', l.employee_id, 'name', e.name, 'code', e.employee_code,
        'auto', l.auto, 'linked_at', l.created_at,
        'last_punch', (SELECT max(tp.punch_at) FROM public.time_punches tp WHERE tp.company_id = v_company AND tp.device_user_id = l.device_user_id)
      ) ORDER BY e.name)
      FROM public.time_terminal_links l JOIN public.employees e ON e.id = l.employee_id
      WHERE l.company_id = v_company
    ), '[]'::jsonb),
    'unmatched', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'device_user_id', u.pin, 'punches', u.n, 'last_punch', u.last_at,
        'suggestion', (
          SELECT jsonb_build_object('employee_id', e.id, 'name', e.name, 'code', e.employee_code)
          FROM public.employees e
          WHERE e.company_id = v_company AND e.status IN ('active', 'on_leave')
            AND (lower(e.employee_code) = lower(u.pin) OR regexp_replace(COALESCE(e.cnic, ''), '\D', '', 'g') = u.pin)
            AND NOT EXISTS (SELECT 1 FROM public.time_terminal_links l2 WHERE l2.employee_id = e.id)
          LIMIT 1)
      ) ORDER BY u.last_at DESC)
      FROM (
        SELECT tp.device_user_id AS pin, count(*)::int AS n, max(tp.punch_at) AS last_at
        FROM public.time_punches tp
        WHERE tp.company_id = v_company AND tp.employee_id IS NULL AND tp.source <> 'correction'
        GROUP BY tp.device_user_id
      ) u
    ), '[]'::jsonb),
    'not_linked', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('employee_id', e.id, 'name', e.name, 'code', e.employee_code) ORDER BY e.name)
      FROM public.employees e
      WHERE e.company_id = v_company AND e.status IN ('active', 'on_leave')
        AND NOT EXISTS (SELECT 1 FROM public.time_terminal_links l WHERE l.employee_id = e.id)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.time_link_terminal(p_device_user_id text, p_employee uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_pin text := btrim(COALESCE(p_device_user_id, ''));
  v_name text;
  v_old_emp uuid;
  v_old_pin text;
  v_moved integer;
  v_cfg public.time_settings;
  r record;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can link terminal IDs' USING ERRCODE = '42501';
  END IF;
  IF v_pin !~ '^[A-Za-z0-9_.-]{1,32}$' THEN
    RAISE EXCEPTION 'Terminal IDs use letters, digits, dot, dash or underscore (up to 32)' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO v_name FROM public.employees WHERE id = p_employee AND company_id = v_company;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT employee_id INTO v_old_emp FROM public.time_terminal_links WHERE company_id = v_company AND device_user_id = v_pin;
  IF v_old_emp = p_employee THEN
    RETURN 0;
  END IF;
  IF v_old_emp IS NOT NULL THEN
    PERFORM public.time_unlink_terminal(v_pin);
  END IF;
  SELECT device_user_id INTO v_old_pin FROM public.time_terminal_links WHERE company_id = v_company AND employee_id = p_employee;
  IF v_old_pin IS NOT NULL THEN
    PERFORM public.time_unlink_terminal(v_old_pin);
  END IF;

  INSERT INTO public.time_terminal_links (company_id, device_user_id, employee_id, linked_by)
  VALUES (v_company, v_pin, p_employee, auth.uid());
  UPDATE public.time_punches SET employee_id = p_employee
  WHERE company_id = v_company AND device_user_id = v_pin AND source <> 'correction';
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  v_cfg := public._time_settings(v_company);
  IF v_cfg.auto_present THEN
    FOR r IN
      SELECT DISTINCT public._time_work_date(v_company, p_employee, tp.punch_at) AS d
      FROM public.time_punches tp
      WHERE tp.company_id = v_company AND tp.device_user_id = v_pin AND tp.punch_at > now() - interval '120 days'
    LOOP
      PERFORM public._time_auto_present(v_company, p_employee, r.d);
    END LOOP;
  END IF;

  PERFORM public.log_activity('biometric.linked', format('Linked terminal ID %s to %s', v_pin, v_name),
    jsonb_build_object('device_user_id', v_pin, 'punches', v_moved), p_employee);
  RETURN v_moved;
END;
$$;

-- Unlink: punches become unmatched again and days auto-marked from them are cleared (not in locked months).
CREATE OR REPLACE FUNCTION public.time_unlink_terminal(p_device_user_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_emp uuid;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can link terminal IDs' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.time_terminal_links WHERE company_id = v_company AND device_user_id = p_device_user_id
  RETURNING employee_id INTO v_emp;
  IF v_emp IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.attendance a
  WHERE a.employee_id = v_emp AND a.source = 'biometric'
    AND a.date IN (SELECT DISTINCT public._time_work_date(v_company, v_emp, tp.punch_at)
                   FROM public.time_punches tp
                   WHERE tp.company_id = v_company AND tp.device_user_id = p_device_user_id AND tp.employee_id = v_emp)
    AND NOT public._time_locked(v_company, v_emp, a.date);
  UPDATE public.time_punches SET employee_id = NULL
  WHERE company_id = v_company AND device_user_id = p_device_user_id AND source <> 'correction';
  PERFORM public.log_activity('biometric.unlinked', format('Unlinked terminal ID %s', p_device_user_id),
    jsonb_build_object('device_user_id', p_device_user_id), v_emp);
END;
$$;

-- Fill the register from stored punches (present only where nothing is marked).
CREATE OR REPLACE FUNCTION public.time_fill_from_punches(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_count integer := 0;
  r record;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can mark attendance' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 92 THEN
    RAISE EXCEPTION 'Pick a range of at most 93 days' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT DISTINCT dp.employee_id, dp.work_date FROM public._time_day_punches(v_company, p_from, p_to) dp LOOP
    IF public._time_auto_present(v_company, r.employee_id, r.work_date) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  PERFORM public.log_activity('biometric.filled', format('Filled %s register days from stored punches (%s to %s)', v_count,
    to_char(p_from, 'FMDD Mon'), to_char(p_to, 'FMDD Mon YYYY')), jsonb_build_object('from', p_from, 'to', p_to, 'marked', v_count));
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Punch corrections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._time_kind_label(p_kind text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_kind WHEN 'missed_in' THEN 'Missed check-in' WHEN 'missed_out' THEN 'Missed check-out'
                     WHEN 'missed_both' THEN 'Missed both punches' WHEN 'wrong_time' THEN 'Wrong time recorded' ELSE p_kind END;
$$;
REVOKE ALL ON FUNCTION public._time_kind_label(text) FROM PUBLIC, anon, authenticated;

-- Shared validation for request and review; returns the parsed times.
CREATE OR REPLACE FUNCTION public._time_check_correction(p_kind text, p_in text, p_out text, OUT v_in time, OUT v_out time)
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('missed_in', 'missed_out', 'missed_both', 'wrong_time') THEN
    RAISE EXCEPTION 'Pick what went wrong' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_in, '') IS NOT NULL AND p_in !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Times use HH:MM' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_out, '') IS NOT NULL AND p_out !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Times use HH:MM' USING ERRCODE = '22023';
  END IF;
  v_in := CASE WHEN p_kind IN ('missed_in', 'missed_both', 'wrong_time') THEN NULLIF(p_in, '')::time END;
  v_out := CASE WHEN p_kind IN ('missed_out', 'missed_both', 'wrong_time') THEN NULLIF(p_out, '')::time END;
  IF p_kind IN ('missed_in', 'missed_both') AND v_in IS NULL THEN
    RAISE EXCEPTION 'Enter the time you arrived' USING ERRCODE = '22023';
  END IF;
  IF p_kind IN ('missed_out', 'missed_both') AND v_out IS NULL THEN
    RAISE EXCEPTION 'Enter the time you left' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'missed_both' AND v_out <= v_in THEN
    RAISE EXCEPTION 'The time you left must be after the time you arrived' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'wrong_time' AND v_in IS NULL AND v_out IS NULL THEN
    RAISE EXCEPTION 'Enter the correct arrival or leaving time' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._time_check_correction(text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_request_correction(
  p_token text, p_date date, p_kind text, p_time_in text DEFAULT NULL, p_time_out text DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.employees := public._portal_employee(p_token);
  v_today date;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_in time;
  v_out time;
  v_id uuid;
BEGIN
  v_today := public._time_today(e.company_id);
  IF p_date IS NULL OR p_date > v_today THEN
    RETURN jsonb_build_object('error', 'Pick today or an earlier day');
  END IF;
  IF p_date < v_today - 30 THEN
    RETURN jsonb_build_object('error', 'Corrections can go back at most 30 days');
  END IF;
  IF char_length(v_reason) < 5 OR char_length(v_reason) > 500 THEN
    RETURN jsonb_build_object('error', 'Tell HR what happened (at least 5 characters)');
  END IF;
  IF (e.joining_date IS NOT NULL AND p_date < e.joining_date) OR (e.separation_date IS NOT NULL AND p_date > e.separation_date) THEN
    RETURN jsonb_build_object('error', 'That day is outside your employment');
  END IF;
  IF public._time_locked(e.company_id, e.id, p_date) THEN
    RETURN jsonb_build_object('error', 'That month is closed for changes');
  END IF;
  SELECT c.v_in, c.v_out INTO v_in, v_out FROM public._time_check_correction(p_kind, p_time_in, p_time_out) c;

  BEGIN
    INSERT INTO public.punch_corrections (company_id, employee_id, date, kind, time_in, time_out, reason)
    VALUES (e.company_id, e.id, p_date, p_kind, v_in, v_out, v_reason)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'You already have a pending request for that day');
  END;

  PERFORM public.notify_roles(e.company_id, ARRAY['hr'], 'time.correction', format('%s missed a punch', e.name),
    format('%s on %s: %s', public._time_kind_label(p_kind), to_char(p_date, 'FMDD Mon YYYY'), left(v_reason, 160)),
    '/attendance/corrections');
  PERFORM public._time_log(e.company_id, 'correction.requested',
    format('%s asked to correct %s (%s)', e.name, to_char(p_date, 'FMDD Mon YYYY'), public._time_kind_label(p_kind)),
    jsonb_build_object('correction_id', v_id, 'date', p_date, 'kind', p_kind), e.id);
  RETURN jsonb_build_object('id', v_id);
EXCEPTION WHEN sqlstate '22023' THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_withdraw_correction(p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.employees := public._portal_employee(p_token);
  v_date date;
BEGIN
  UPDATE public.punch_corrections SET status = 'withdrawn', updated_at = now()
  WHERE id = p_id AND employee_id = e.id AND company_id = e.company_id AND status = 'pending'
  RETURNING date INTO v_date;
  IF v_date IS NULL THEN
    RETURN jsonb_build_object('error', 'Only pending requests can be withdrawn');
  END IF;
  PERFORM public._time_log(e.company_id, 'correction.cancelled', format('%s withdrew the correction for %s', e.name, to_char(v_date, 'FMDD Mon YYYY')),
    jsonb_build_object('correction_id', p_id), e.id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_my_corrections(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.employees := public._portal_employee(p_token);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'date', c.date, 'kind', c.kind, 'time_in', to_char(c.time_in, 'HH24:MI'), 'time_out', to_char(c.time_out, 'HH24:MI'),
      'reason', c.reason, 'status', c.status, 'review_note', c.review_note, 'reviewed_at', c.reviewed_at, 'created_at', c.created_at
    ) ORDER BY c.created_at DESC)
    FROM (SELECT * FROM public.punch_corrections pc WHERE pc.employee_id = e.id AND pc.company_id = e.company_id
          ORDER BY pc.created_at DESC LIMIT 60) c
  ), '[]'::jsonb);
END;
$$;

-- HR review: approve (optionally with edited times) or reject with a note.
CREATE OR REPLACE FUNCTION public.time_review_correction(
  p_id uuid, p_decision text, p_time_in text DEFAULT NULL, p_time_out text DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  c public.punch_corrections;
  e public.employees;
  v_in time;
  v_out time;
  v_note text := left(NULLIF(btrim(p_note), ''), 300);
  v_tz text;
  v_pin text;
  v_at timestamptz;
  v_marked boolean := false;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'Only HR can review punch corrections' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decide approve or reject' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM public.punch_corrections WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already %', c.status USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM public.employees WHERE id = c.employee_id;

  IF p_decision = 'reject' THEN
    UPDATE public.punch_corrections SET status = 'rejected', review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = c.id;
    PERFORM public.notify_employee(v_company, e.id, 'time.correction', 'Punch correction not approved',
      format('%s on %s%s', public._time_kind_label(c.kind), to_char(c.date, 'FMDD Mon YYYY'), COALESCE(': ' || v_note, '')),
      '/portal/attendance');
    PERFORM public.log_activity('correction.rejected', format('Rejected the punch correction of %s for %s', e.name, to_char(c.date, 'FMDD Mon YYYY')),
      jsonb_build_object('correction_id', c.id, 'note', v_note), e.id);
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF public._time_locked(v_company, e.id, c.date) THEN
    RAISE EXCEPTION 'That month is locked; unlock it before approving' USING ERRCODE = '22023';
  END IF;
  SELECT x.v_in, x.v_out INTO v_in, v_out
  FROM public._time_check_correction(c.kind,
         COALESCE(NULLIF(p_time_in, ''), to_char(c.time_in, 'HH24:MI')),
         COALESCE(NULLIF(p_time_out, ''), to_char(c.time_out, 'HH24:MI'))) x;

  v_tz := public._time_tz(v_company);
  SELECT l.device_user_id INTO v_pin FROM public.time_terminal_links l WHERE l.employee_id = e.id;
  v_pin := COALESCE(v_pin, 'EMP-' || left(replace(e.id::text, '-', ''), 12));

  IF v_in IS NOT NULL THEN
    v_at := ((c.date + v_in) AT TIME ZONE v_tz);
    INSERT INTO public.time_punches (company_id, employee_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source, correction_id)
    VALUES (v_company, e.id, 'CORRECTION', v_pin, v_at, (v_at AT TIME ZONE v_tz)::date, 'in', 'correction', 'correction', c.id)
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_out IS NOT NULL THEN
    v_at := ((c.date + v_out) AT TIME ZONE v_tz);
    IF e.shift_type = 'night' AND v_out < '12:00'::time THEN
      v_at := v_at + interval '1 day';
    END IF;
    INSERT INTO public.time_punches (company_id, employee_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source, correction_id)
    VALUES (v_company, e.id, 'CORRECTION', v_pin, v_at, (v_at AT TIME ZONE v_tz)::date, 'out', 'correction', 'correction', c.id)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.punch_corrections SET status = 'approved', time_in = v_in, time_out = v_out, review_note = v_note,
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = c.id;

  IF (public._time_cfg(v_company)).auto_present THEN
    v_marked := public._time_auto_present(v_company, e.id, c.date, 'correction');
  END IF;

  PERFORM public.notify_employee(v_company, e.id, 'time.correction', 'Punch correction approved',
    format('%s on %s%s', public._time_kind_label(c.kind), to_char(c.date, 'FMDD Mon YYYY'), COALESCE(': ' || v_note, '')),
    '/portal/attendance');
  PERFORM public.log_activity('correction.approved', format('Approved the punch correction of %s for %s', e.name, to_char(c.date, 'FMDD Mon YYYY')),
    jsonb_build_object('correction_id', c.id, 'time_in', v_in, 'time_out', v_out, 'marked_present', v_marked), e.id);
  RETURN jsonb_build_object('status', 'approved', 'marked_present', v_marked);
END;
$$;

-- What the terminals recorded for a person on a day (review context).
CREATE OR REPLACE FUNCTION public.time_day_punches(p_employee uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid := public.auth_company_id();
  v_tz text;
BEGIN
  IF v_company IS NULL OR NOT public.auth_is_hr() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  v_tz := public._time_tz(v_company);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'punch_at', tp.punch_at, 'local_time', to_char(tp.punch_at AT TIME ZONE v_tz, 'HH24:MI:SS'), 'direction', tp.direction,
      'verify_type', tp.verify_type, 'source', tp.source, 'device', d.name
    ) ORDER BY tp.punch_at)
    FROM public.time_punches tp
    LEFT JOIN public.time_devices d ON d.id = tp.device_id
    WHERE tp.company_id = v_company AND tp.employee_id = p_employee
      AND tp.punch_date BETWEEN p_date - 1 AND p_date + 1
      AND public._time_work_date(v_company, p_employee, tp.punch_at) = p_date
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- Portal: my attendance and my hours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_my_attendance(p_token text, p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.employees := public._portal_employee(p_token);
  v_tz text := public._time_tz(e.company_id);
  v_today date := public._time_today(e.company_id);
  v_month jsonb;
  v_strip jsonb;
BEGIN
  v_month := public._time_employee_month(e.company_id, e.id, COALESCE(p_month, v_today));

  -- 90-day strip: one square per day (status or day off), for the streak view.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'date', g.d,
           'working', EXISTS (SELECT 1 FROM public.working_dates(e.company_id, g.d, g.d, e.id)),
           'status', CASE WHEN public._time_on_leave(e.id, g.d) THEN 'leave' ELSE a.status END
         ) ORDER BY g.d), '[]'::jsonb)
  INTO v_strip
  FROM (SELECT gs::date AS d FROM generate_series(v_today - 89, v_today, interval '1 day') gs) g
  LEFT JOIN public.attendance a ON a.employee_id = e.id AND a.date = g.d;

  RETURN v_month || jsonb_build_object(
    'strip', v_strip,
    'today_punches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('time', to_char(tp.punch_at AT TIME ZONE v_tz, 'HH24:MI'), 'direction', tp.direction,
                                          'verify_type', tp.verify_type, 'source', tp.source) ORDER BY tp.punch_at)
      FROM public.time_punches tp
      WHERE tp.employee_id = e.id AND tp.company_id = e.company_id
        AND public._time_work_date(e.company_id, e.id, tp.punch_at) = v_today
        AND tp.punch_date BETWEEN v_today - 1 AND v_today + 1
    ), '[]'::jsonb),
    'pending_corrections', (SELECT count(*) FROM public.punch_corrections pc WHERE pc.employee_id = e.id AND pc.status = 'pending')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_my_hours(p_token text, p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  e public.employees := public._portal_employee(p_token);
  v_today date := public._time_today(e.company_id);
  v_m0 date := date_trunc('month', COALESCE(p_month, v_today))::date;
  v_hi date;
  v_cfg public.time_settings := public._time_cfg(e.company_id);
BEGIN
  v_hi := LEAST((v_m0 + interval '1 month - 1 day')::date, v_today);
  IF v_m0 > v_today THEN
    RETURN jsonb_build_object('month', v_m0, 'threshold', v_cfg.hours_threshold_pct, 'summary', NULL, 'days', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'month', v_m0,
    'today', v_today,
    'timezone', v_cfg.timezone,
    'threshold', v_cfg.hours_threshold_pct,
    'grace_minutes', v_cfg.grace_minutes,
    'summary', (SELECT to_jsonb(h) FROM public._time_hours(e.company_id, v_m0, e.id) h LIMIT 1),
    'days', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', d.work_date, 'working', d.working, 'kind', d.kind, 'register', d.register,
        'first_in', d.first_in, 'last_out', d.last_out, 'target_minutes', d.target_minutes,
        'worked_minutes', d.worked_minutes, 'late_minutes', d.late_minutes,
        'early_minutes', CASE WHEN d.early_minutes > v_cfg.grace_minutes THEN d.early_minutes ELSE 0 END,
        'half', d.half, 'corrected', d.corrected
      ) ORDER BY d.work_date DESC)
      FROM public._time_days(e.company_id, v_m0, v_hi, e.id) d
      WHERE d.working OR d.punches > 0
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.time_save_device(uuid, text, text, text, text, boolean), public.time_rotate_device_key(uuid),
  public.time_delete_device(uuid), public.time_terminal_ids(), public.time_link_terminal(text, uuid),
  public.time_unlink_terminal(text), public.time_fill_from_punches(date, date),
  public.time_review_correction(uuid, text, text, text, text), public.time_day_punches(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.time_save_device(uuid, text, text, text, text, boolean), public.time_rotate_device_key(uuid),
  public.time_delete_device(uuid), public.time_terminal_ids(), public.time_link_terminal(text, uuid),
  public.time_unlink_terminal(text), public.time_fill_from_punches(date, date),
  public.time_review_correction(uuid, text, text, text, text), public.time_day_punches(uuid, date)
  TO authenticated;

REVOKE ALL ON FUNCTION public.time_ingest_punches(text, jsonb, jsonb),
  public.portal_request_correction(text, date, text, text, text, text), public.portal_withdraw_correction(text, uuid),
  public.portal_my_corrections(text), public.portal_my_attendance(text, date), public.portal_my_hours(text, date)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.time_ingest_punches(text, jsonb, jsonb),
  public.portal_request_correction(text, date, text, text, text, text), public.portal_withdraw_correction(text, uuid),
  public.portal_my_corrections(text), public.portal_my_attendance(text, date), public.portal_my_hours(text, date)
  TO anon, authenticated;
