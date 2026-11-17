import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
// Vite builds only the integration Worker and copies Expo's already-built web assets.
export default defineConfig({
  publicDir: 'dist',
  plugins: [cloudflare()],
  build: { emptyOutDir: true },
});
