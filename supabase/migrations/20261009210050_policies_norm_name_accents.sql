-- Policy signing: the typed name is compared with the name HR has on record.
-- The portal checks it as you type (src/modules/policies/lib/richText.ts normalizeName:
-- NFKD, combining marks removed, lower case, anything but letters becomes one space), so
-- the server must compare the same way. Before, the server kept accents: for a record
-- name "José" the portal accepted "Jose" and then the server refused the signature.
-- Only portal_sign_policy uses this function.
CREATE OR REPLACE FUNCTION public._policies_norm_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT btrim(regexp_replace(
           regexp_replace(normalize(lower(COALESCE(p_name, '')), NFKD),
                          '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-ً︯-ٰٟۖ-ۭ]', '', 'g'),
           '[^[:alpha:]]+', ' ', 'g'))
$function$;
