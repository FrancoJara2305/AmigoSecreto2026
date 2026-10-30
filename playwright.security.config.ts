import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Dedicated pair: never reuse or stop the user's preview on 4173/4174.
process.env.APP_SECURITY_UI_TEST='1';
export default defineConfig({...base,testMatch:'security.spec.ts',use:{...base.use,baseURL:'http://127.0.0.1:4183'},
  webServer:{...base.webServer,command:'npm run preview:local -- --port 4183',url:'http://127.0.0.1:4183',env:{APP_LOCAL_UI_TEST:'1'},reuseExistingServer:false}});
