import { test,expect } from '@playwright/test';
import { mkdir,mkdtemp,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';

test('native Edge browser zoom doubles the page while preserving catalogue, profile and form actions',async({playwright,baseURL},info)=>{
  await mkdir('artifacts/a11y',{recursive:true});
  const profile=await mkdtemp(resolve('artifacts/a11y/zoom-profile-'));
  await mkdir(join(profile,'Default'));
  // Chromium's native zoom preference in an isolated profile, not a CSS transform or device emulation.
  await writeFile(join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}));
  const context=await playwright.chromium.launchPersistentContext(profile,{channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true,viewport:null,args:['--window-size=1280,900','--no-first-run','--disable-background-networking']});
  try{
    await context.route('**/*',(route)=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const page=await context.newPage();await page.goto(baseURL!);await expect(page.getByRole('list',{name:'Participantes',exact:true})).toBeVisible();
    const metrics=await page.evaluate(()=>({innerWidth,outerWidth,ratio:devicePixelRatio,rootSize:getComputedStyle(document.documentElement).fontSize}));
    expect(metrics.ratio).toBeCloseTo(2,1);expect(metrics.innerWidth).toBeLessThanOrEqual(metrics.outerWidth/1.9);expect(metrics.rootSize).toBe('16px');
    await writeFile(`artifacts/a11y/native-zoom-${info.project.name}.json`,JSON.stringify(metrics,null,2));
    for(const path of ['/','/participante/melyza','/diseno']){
      await page.goto(new URL(path,baseURL).href);await expect(page.getByRole('heading',{level:1})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    await page.getByLabel('Tu idea de regalo').fill('Texto ampliado');await page.getByRole('button',{name:'Probar guardado',exact:true}).click();await expect(page.getByText('Tu ejemplo está listo',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/a11y/native-zoom-200.png',fullPage:true});
  }finally{await context.close();}
});
