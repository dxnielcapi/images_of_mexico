import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Dos paginas: la app completa (index) y la pantalla de registro (registro).
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        registro: 'registro.html',
      },
    },
  },
});
