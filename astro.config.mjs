import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * Sitio estatico, sin adapter: la pagina se prerenderiza como HTML y el motor
 * de acuarela corre en el navegador (los `<script>` de los `.astro` son
 * client-only). Los datos se piden en runtime a Supabase desde el cliente,
 * asi que el HTML cacheado nunca queda viejo.
 *
 * Si algun dia el alta necesita pasar por un endpoint propio (rate limit,
 * captcha), se instala un adapter y se marca ESA sola ruta con
 * `export const prerender = false`. El resto sigue estatico.
 */

/**
 * Para mostrar el mural fuera de esta maquina (celular en la misma red, o un
 * tunel de cloudflared) el dev server tiene que dejar de ser privado en dos
 * sentidos distintos:
 *
 *   - `server.host: true` lo pone a escuchar en todas las interfaces. Por
 *     default queda solo en loopback y ademas solo en IPv6 (`[::1]:4321`),
 *     asi que `cloudflared --url http://localhost:4321` ---que resuelve a
 *     127.0.0.1--- no se podia conectar.
 *   - `vite.server.allowedHosts` desbloquea el `Host` con el que entra el
 *     tunel. Vite rechaza hosts que no conoce (defensa contra DNS rebinding)
 *     y respondia "Blocked request" en vez de la pagina.
 *
 * Esto es solo para `astro dev`; el build sale estatico y no lleva server.
 */
export default defineConfig({
  output: 'static',
  server: { host: true },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // El punto inicial cubre cualquier subdominio: los tuneles rapidos
      // estrenan nombre en cada arranque.
      allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.loca.lt'],
    },
  },
});
