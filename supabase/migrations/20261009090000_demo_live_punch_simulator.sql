-- Demo only: keeps the Nexus Orbits showcase account "live" by adding realistic time-clock punches as the
-- day goes on (every 2 minutes via pg_cron), and heartbeating its two office clocks.
-- Each employee gets a deterministic plan per work day (arrival, optional lunch taps, departure), so re-runs
-- never duplicate a punch. Days before 2026-10-09 are seeded history and are never touched.
-- Turn it off:  SELECT cron.unschedule('nexus-live-punches');

CREATE OR REPLACE FUNCTION public._demo_live_punches(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_company constant uuid := 'bc8defea-829f-4eeb-b210-6918e88e3019';
  c_main constant uuid := 'a718f36a-dcf4-40e2-a9f5-618c984d4d7a';
  c_floor3 constant uuid := '4b937c40-7880-4e01-91b3-735b7a6fe2ce';
  c_first_day constant date := '2026-10-09';
  v_cfg public.time_settings;
  v_tz text;
  v_local timestamp;
  v_added integer := 0;
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = c_company) THEN
    RETURN 0;
  END IF;
  v_cfg := public._time_settings(c_company);
  v_tz := COALESCE(v_cfg.timezone, 'Asia/Karachi');
  v_local := p_now AT TIME ZONE v_tz;

  CREATE TEMP TABLE IF NOT EXISTS _demo_plan (
    employee_id uuid, pin text, device uuid, direction text, at timestamptz, work_date date
  ) ON COMMIT DROP;
  TRUNCATE pg_temp._demo_plan;

  -- Today's work date (and yesterday's for the night shift that is still running).
  FOR r IN
    SELECT e.id, e.employee_code, COALESCE(e.shift_type, 'morning') AS shift, l.device_user_id AS pin, w.d,
           abs(hashtext(e.employee_code || ':' || w.d::text)) AS h
    FROM public.employees e
    JOIN public.time_terminal_links l ON l.employee_id = e.id AND l.company_id = c_company
    CROSS JOIN LATERAL (VALUES (v_local::date), ((v_local - interval '12 hours')::date)) AS w(d)
    WHERE e.company_id = c_company
      AND e.status = 'active'
      AND w.d >= c_first_day
      AND (e.joining_date IS NULL OR e.joining_date <= w.d)
      AND (e.separation_date IS NULL OR e.separation_date >= w.d)
      AND (COALESCE(e.shift_type, 'morning') = 'night' OR w.d = v_local::date)
      AND (COALESCE(e.shift_type, 'morning') <> 'night' OR w.d = (v_local - interval '12 hours')::date)
      AND EXISTS (SELECT 1 FROM public.working_dates(c_company, w.d, w.d, e.id))
      AND NOT public._time_on_leave(e.id, w.d)
  LOOP
    CONTINUE WHEN r.h % 100 < 3;  -- about 3% do not come in

    DECLARE
      v_start timestamp := r.d + public._time_shift_start(v_cfg, r.shift);
      v_dev uuid := CASE WHEN r.h % 3 = 0 THEN c_floor3 ELSE c_main END;
      v_in timestamp;
      v_out timestamp;
      v_bucket integer := r.h % 100;
    BEGIN
      v_in := CASE
        WHEN v_bucket BETWEEN 3 AND 11 THEN v_start + interval '46 minutes' + (r.h % 29) * interval '1 minute'   -- late
        ELSE v_start - interval '20 minutes' + (r.h % 33) * interval '1 minute'
      END + (r.h % 57) * interval '1 second';
      v_out := CASE
        WHEN v_bucket BETWEEN 12 AND 15 THEN v_start + interval '7 hours 5 minutes' + (r.h % 41) * interval '1 minute'  -- leaves early
        WHEN v_bucket BETWEEN 3 AND 11 THEN v_in + interval '8 hours' + (r.h % 37) * interval '1 minute'               -- late, stays late
        ELSE v_start + interval '8 hours' + (r.h % 131) * interval '1 minute'
      END + (r.h % 43) * interval '1 second';

      INSERT INTO pg_temp._demo_plan VALUES (r.id, r.pin, v_dev, 'in', v_in AT TIME ZONE v_tz, r.d);
      IF r.h % 23 = 0 THEN  -- an accidental double tap
        INSERT INTO pg_temp._demo_plan VALUES (r.id, r.pin, v_dev, 'in', (v_in + interval '19 seconds') AT TIME ZONE v_tz, r.d);
      END IF;
      IF r.shift = 'morning' AND r.h % 10 < 3 THEN  -- lunch out and back
        INSERT INTO pg_temp._demo_plan VALUES
          (r.id, r.pin, c_main, 'out', (r.d + time '13:02' + (r.h % 37) * interval '1 minute') AT TIME ZONE v_tz, r.d),
          (r.id, r.pin, c_main, 'in', (r.d + time '13:44' + (r.h % 29) * interval '1 minute') AT TIME ZONE v_tz, r.d);
      END IF;
      IF v_bucket NOT IN (97, 98) THEN  -- about 2% forget to check out
        INSERT INTO pg_temp._demo_plan VALUES (r.id, r.pin, v_dev, 'out', v_out AT TIME ZONE v_tz, r.d);
      END IF;
    END;
  END LOOP;

  WITH ins AS (
    INSERT INTO public.time_punches (company_id, employee_id, device_id, device_ref, device_user_id, punch_at, punch_date, direction, verify_type, source)
    SELECT c_company, p.employee_id, p.device, p.device::text, p.pin, p.at, (p.at AT TIME ZONE v_tz)::date, p.direction,
           CASE WHEN abs(hashtext(p.pin)) % 5 = 0 THEN 'card' ELSE 'fingerprint' END, 'live'
    FROM pg_temp._demo_plan p
    WHERE p.at <= p_now
    ON CONFLICT (company_id, device_ref, device_user_id, punch_at) DO NOTHING
    RETURNING employee_id
  )
  SELECT count(*) INTO v_added FROM ins;

  IF v_cfg.auto_present THEN
    PERFORM public._time_auto_present(c_company, p.employee_id, p.work_date)
    FROM (SELECT DISTINCT employee_id, work_date FROM pg_temp._demo_plan WHERE direction = 'in' AND at <= p_now) p;
  END IF;

  -- Office clocks check in every run; the warehouse gate stays offline (shows the device-error state).
  UPDATE public.time_devices d SET
    last_seen_at = p_now,
    last_punch_at = GREATEST(d.last_punch_at, (SELECT max(p.at) FROM pg_temp._demo_plan p WHERE p.device = d.id AND p.at <= p_now))
  WHERE d.id IN (c_main, c_floor3) AND d.is_active;

  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public._demo_live_punches(timestamptz) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nexus-live-punches';
SELECT cron.schedule('nexus-live-punches', '*/2 * * * *', 'SELECT public._demo_live_punches()');
