import { createClient } from "@supabase/supabase-js";

// Cliente de navegador: usa ANON KEY + JWT del usuario. Schema por defecto: vecino.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    db: { schema: "vecino" },
    auth: { persistSession: true, autoRefreshToken: true },
  }
);
