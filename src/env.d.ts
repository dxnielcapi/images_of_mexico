/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Si el mural se llena con el banco simulado (ver `mural/cartel`). */
  readonly PUBLIC_DATOS_SIMULADOS?: string;
  /** URL del proyecto de Supabase (ver `data/repo/supabaseRepo`). */
  readonly PUBLIC_SUPABASE_URL?: string;
  /** Llave publica (Publishable / anon) de Supabase. */
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
