import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const target=new URL('../tests/fixtures/images/',import.meta.url);
await mkdir(target,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
try {
  const page=await browser.newPage();
  for (const [name,mime,width,height] of [
    ['small.jpg','image/jpeg',96,64],['small.png','image/png',96,64],['small.webp','image/webp',96,64],
    ['large.jpg','image/jpeg',4000,4000],['large.png','image/png',4000,4000],['large.webp','image/webp',4000,4000],
  ]) {
    const base64=await page.evaluate(({mime,width,height})=>{
      const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const ctx=canvas.getContext('2d'); const g=ctx.createLinearGradient(0,0,width,height);
      g.addColorStop(0,'#9e1539'); g.addColorStop(.5,'#f6c844'); g.addColorStop(1,'#154a40');
      ctx.fillStyle=mime==='image/png'?'#9e1539':g; ctx.fillRect(0,0,width,height);
      for (let y=0;y<height;y+=61) {ctx.fillStyle=y%2?'#123456':'#abcdef'; ctx.fillRect(0,y,width,2);}
      return canvas.toDataURL(mime,.82).split(',')[1];
    },{mime,width,height});
    const bytes=Buffer.from(base64,'base64');
    if (bytes.length>3145728) throw new Error('Fixture exceeds input contract');
    await writeFile(new URL(name,target),bytes); console.log(name,bytes.length);
  }
} finally {await browser.close();}
// Synthetic RGBA16 PNG at the same 16 MP ceiling; compressible and within 3 MiB.
function crc(bytes) {let c=0xffffffff; for(const v of bytes) {c^=v; for(let n=0;n<8;n++) c=(c>>>1)^((c&1)?0xedb88320:0);} return (c^0xffffffff)>>>0;}
function chunk(kind,data) {const length=Buffer.alloc(4); length.writeUInt32BE(data.length); const middle=Buffer.concat([Buffer.from(kind),data]); const checksum=Buffer.alloc(4); checksum.writeUInt32BE(crc(middle)); return Buffer.concat([length,middle,checksum]);}
const width=4000,height=4000,row=1+width*8,raw=Buffer.alloc(row*height);
for(let y=0;y<height;y++) raw.fill(Buffer.from('123456789abcffff','hex'),y*row+1,(y+1)*row);
const header=Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height,4); header[8]=16; header[9]=6;
const png16=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
await writeFile(new URL('large16.png',target),png16); console.log('large16.png',png16.length);
