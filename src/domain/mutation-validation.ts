// Shared pure business rules. This module has no server client, secrets, env or I/O.
export { normalizePrice, normalizeHttpsUrl, validateMutation } from '../../supabase/functions/_shared/mutation-validation.ts';
export type { MutationAction, MutationValidation } from '../../supabase/functions/_shared/mutation-validation.ts';
