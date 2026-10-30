import { test } from '@playwright/test';
import { organizerFixture,openOrganizer } from '../ui/fixtures/organizer';
import { importFixture } from '../ui/fixtures/product-import';

test('isolated surface for a human screen reader review; close its browser to finish',async({page})=>{
  await organizerFixture(page);await importFixture(page);await openOrganizer(page);
  console.log('Revisión local preparada con datos sintéticos. Cierra la ventana de prueba para terminar. Esta salida no certifica la revisión con lector.');
  await page.waitForEvent('close',{timeout:0});
});
