import { unavailable } from '../_shared/unavailable.ts';

// Future: capability validation + shared quotas + SSRF-safe transport + bounded parser.
Deno.serve(unavailable);
