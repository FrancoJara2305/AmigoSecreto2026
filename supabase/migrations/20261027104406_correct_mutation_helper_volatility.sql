-- JSON construction routines used by this helper are classified STABLE by PostgreSQL.
-- Keep the applied T08 migration intact and align the helper's declared volatility.
alter function private.normalize_mutation_payload(text,jsonb) stable;
