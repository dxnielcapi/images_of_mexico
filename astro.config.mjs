import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * Sitio estatico, sin adapter: las dos paginas se prerenderizan como HTML y
 * el motor de acuarela corre en el navegador (los `<script>` de los `.astro`
 * son client-only). Los datos se piden en runtime a Supabase desde el
 * cliente, asi que el HTML cacheado nunca queda viejo.
 *
 * Si algun dia el alta necesita pasar por un endpoint propio (rate limit,
 * captcha), se instala un adapter y se marca ESA sola ruta con
 * `export const prerender = false`. El resto sigue estatico.
 */
export default defineConfig({
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
