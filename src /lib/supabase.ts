import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "chave-nao-configurada";

export const supabase = createClient(url, chave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const supabaseConfigurado = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
