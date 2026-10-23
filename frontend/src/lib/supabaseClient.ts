import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy frontend/.env.example to frontend/.env and fill them in.',
  );
}

// Singleton Supabase client. Manages its own session persistence (localStorage)
// and auto-refresh — no hand-rolled JWT storage needed.
export const supabase = createClient(url, anonKey);

// Supabase's API gateway requires this on every direct REST/Functions call to
// identify the calling project, separately from the caller's own Authorization
// token. supabase-js attaches it internally; edgeClient.ts's hand-rolled fetch
// wrapper needs it explicitly.
export const SUPABASE_ANON_KEY = anonKey;

// Edge Functions live at <project-url>/functions/v1/<function-name>. Allow an
// explicit override for local `supabase functions serve` during development,
// otherwise derive from the project URL.
export const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ?? `${url}/functions/v1`;
