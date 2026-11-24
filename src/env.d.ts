/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Si el mural se llena con el banco simulado (ver `mural/cartel`). */
  readonly PUBLIC_DATOS_SIMULADOS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
