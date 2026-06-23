import { createClient } from "@supabase/supabase-js";

// Cliente SERVICE ROLE — SOLO en server (Server Actions / Route Handlers).
// NUNCA exponer al cliente ni a Edge. Schema por defecto: vecino.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: { schema: "vecino" },
    auth: { persistSession: false, autoRefreshToken: false },
  }
);
