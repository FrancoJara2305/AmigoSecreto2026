import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
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
  return { plugins: [react()] };
});
