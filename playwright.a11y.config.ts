import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Downloaded test engines stay in the ignored workspace, away from user browsers.
process.env.PLAYWRIGHT_BROWSERS_PATH??=resolve('artifacts/playwright-browsers');
const sharedUse={...base.use};delete sharedUse.channel;
export default defineConfig({
  ...base,
  use:sharedUse,
  testDir:'./tests',
  testMatch:['**/ui/accessibility.spec.ts','**/a11y/native-zoom.spec.ts'],
  timeout:60000,
  projects:[
    {name:'a11y-edge',use:{browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',viewport:{width:1280,height:900}}},
    {name:'a11y-edge-touch',testIgnore:'**/native-zoom.spec.ts',use:{browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
    {name:'a11y-firefox',testIgnore:'**/native-zoom.spec.ts',use:{browserName:'firefox',channel:undefined,viewport:{width:1280,height:900}}},
    {name:'a11y-webkit',testIgnore:'**/native-zoom.spec.ts',use:{browserName:'webkit',channel:undefined,viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
  ],
});
