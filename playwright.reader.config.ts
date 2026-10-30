import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Explicitly invoked review surface; never part of the automated passing count.
export default defineConfig({
  ...base,
  testDir:'./tests/a11y',testMatch:'reader-review.spec.ts',timeout:0,
  workers:1,retries:0,
  use:{...base.use,headless:false,trace:'off',screenshot:'off',viewport:{width:1280,height:900}},
  projects:[{name:'reader-review-local'}],
});
