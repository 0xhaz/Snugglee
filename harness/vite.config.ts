import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

import { apiMiddleware } from './proxy/index.ts';

/**
 * Vendor keys are loaded with `loadEnv` (Node side) rather than `import.meta.env`
 * so they are never inlined into the client bundle. Only VITE_-prefixed
 * variables reach the browser, and none of ours are.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // loadEnv does not populate process.env. Mirror it across so Node-side
  // modules can read optional overrides (e.g. MINIMAX_BASE_URL) directly.
  // Dev-only, and never reaches the browser.
  Object.assign(process.env, env);

  const vendorProxy: PluginOption = {
    name: 'snugglee-vendor-proxy',
    configureServer(server) {
      server.middlewares.use(apiMiddleware(env));
    },
  };

  return {
    plugins: [react(), vendorProxy],
    server: { port: 5273 },
  };
});
