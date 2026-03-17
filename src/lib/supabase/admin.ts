import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS. Use only in API routes, cron, and admin operations.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
