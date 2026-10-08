-- Careers: careers_slugify folds accents the same way as slugify() in src/modules/careers/lib/model.ts.
--
-- 20261009190000 folded accents with a fixed translate() table of Latin-1/Latin Extended-A letters.
-- Every other accented letter was still dropped, while the browser (NFKD) kept its base letter, so
-- the web address previewed in the job editor and in the careers-address dialog was not the one
-- that got saved:
--   'Kỹ sư phần mềm'  editor ky-su-phan-mem   saved k-s-ph-n-m-m   (Vietnamese)
--   'Șef de echipă'   editor sef-de-echipa    saved ef-de-echipa   (Romanian comma-below)
--   'ﬁnance', 'Ｒｅａｃｔ', '½'  were dropped instead of folded to 'finance', 'react', '1-2'
-- Now both sides do the same steps: lower-case, fold the letters NFKD cannot decompose
-- (ß æ œ þ ĳ ø đ ð ħ ı ł ŧ ŀ ŉ ĸ), NFKD, drop combining marks (U+0300-U+036F), then dashes,
-- 60 characters, no edge dashes. Existing slugs are already plain [a-z0-9-] and map to themselves.

CREATE OR REPLACE FUNCTION public.careers_slugify(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT btrim(left(btrim(regexp_replace(
    regexp_replace(
      normalize(
        translate(
          replace(replace(replace(replace(replace(lower(COALESCE(p_text, '')),
            'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'þ', 'th'), 'ĳ', 'ij'),
          'øđðħıłŧŀŉĸ', 'oddhiltlnk'),
        NFKD),
      '[̀-ͯ]', '', 'g'),
    '[^a-z0-9]+', '-', 'g'), '-'), 60), '-');
$function$;
