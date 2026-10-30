import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readPublicConfig } from './src/services/public-config.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Fail before bundling if a privileged credential is accidentally put in public config.
  // Do not include any values in error messages.
  for (const [name, value] of Object.entries(env)) {
    if (/(SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN)/i.test(name) || value.startsWith('sb_secret_')) {
      throw new Error('No se permiten secretos en variables VITE_. Revisa la configuración local.');
    }
  }
  // APP_URL can follow the browser origin at runtime; use an inert local origin for build validation.
  if (Object.keys(env).length > 0) readPublicConfig({ ...env, VITE_APP_URL: env.VITE_APP_URL || 'http://localhost:5173' });
  return {
    plugins: [react(), tailwindcss()],
    // Automated runs must not reload after a capability has been consumed. Manual
    // reload still clears access; normal development keeps its watcher and HMR.
    server: process.env.APP_LOCAL_UI_TEST === '1' || process.env.APP_LOCAL_IMPORT_TEST === '1' || process.env.APP_LOCAL_PROFILE_TEST === '1'
      ? { watch: null, hmr: false } : undefined,
    // Independent previews use different public destinations. Sharing optimizer caches can
    // trigger a reload, which correctly erases the capability kept only in memory.
    cacheDir: process.env.APP_LOCAL_UI_TEST === '1' ? 'node_modules/.vite-ui-test' :
      process.env.APP_LOCAL_PREVIEW === '1' ? 'node_modules/.vite-preview' :
      process.env.APP_LOCAL_MEDIA_TEST === '1' ? 'node_modules/.vite-media-test' :
      process.env.APP_LOCAL_IMPORT_TEST === '1' ? 'node_modules/.vite-import-test' :
      process.env.APP_LOCAL_PROFILE_TEST === '1' ? 'node_modules/.vite-profile-test' : 'node_modules/.vite',
    optimizeDeps: { include: ['react','react/jsx-runtime','react-dom','react-dom/client','react-router','lucide-react','@supabase/supabase-js'] },
  };
});
