import test from 'node:test';
import assert from 'node:assert/strict';
import { draftFromGift } from '../../src/domain/gift-editor.ts';
import { parseImportResult,defaultImportSelection,applyImportFields,importPriceIssue,type ImportMetadata } from '../../src/domain/product-import.ts';
import { sendProductImport,ProductLookupError } from '../../src/services/product-import.ts';
import { createPrivateSession } from '../../src/services/private-session.ts';
import type { AccessScope } from '../../src/domain/private-access.ts';

const token='A'.repeat(43),owner='11111111-1111-4111-8111-000000000001';
const config={supabaseUrl:'http://127.0.0.1:54321',publishableKey:'sb_publishable_test_only',appUrl:'http://127.0.0.1:5173'};
const metadata:ImportMetadata={fields:{title:'Una taza',description:'Para el café',reference_price:'29.90',currency:'USD',image_url:'https://shop.example.com/image.png',brand:'Tazas',model:'M1',color:'Verde',material:'Cerámica'},sources:{title:'json-ld',description:'open-graph',reference_price:'json-ld',currency:'json-ld',image_url:'html',brand:'json-ld',model:'json-ld',color:'json-ld',material:'json-ld'},warnings:[],final_url:'https://shop.example.com/product'};
const wire={status:'ok',metadata};
const scope:AccessScope={tokenId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accessType:'participant',participantId:owner,participantSlug:'melyza',expiresAt:null};

test('only empty fields default to selected; image paths and inactive detail drafts are preserved until explicit application',()=>{
  const draft=draftFromGift(null);draft.title='Mi título';draft.imageSource='existing';draft.existingPath='own/gift/image.webp';draft.object.brand='Mi marca';draft.clothing={size:'M',fit:'Holgado'};
  const selected=new Set(defaultImportSelection(draft,metadata));
  for(const field of ['title','currency','image_url','brand'] as const)assert.equal(selected.has(field),false);
  selected.delete('reference_price');
  const next=applyImportFields(draft,metadata,selected);
  assert.equal(next.title,'Mi título');assert.equal(next.existingPath,draft.existingPath);assert.deepEqual(next.clothing,draft.clothing);assert.equal(next.object.model,'M1');
  assert.equal(draft.object.model,undefined);assert.equal(draft.description,'');
  const image=applyImportFields(draft,metadata,new Set(['image_url']));assert.equal(image.imageSource,'url');assert.equal(image.existingPath,null);
});
test('USD prices cannot silently use default PEN; missing currency requires deliberate confirmation and price zero is retained',()=>{
  const draft=draftFromGift(null);
  assert.match(importPriceIssue(draft,metadata,new Set(['reference_price']),false),/USD/);
  assert.throws(()=>applyImportFields(draft,metadata,new Set(['reference_price'])));
  const applied=applyImportFields(draft,metadata,new Set(['reference_price','currency']));assert.equal(applied.reference_price,'29.90');assert.equal(applied.currency,'USD');
  const noCurrency={...metadata,fields:{title:'Gratis',reference_price:'0.00'}};
  assert.equal(defaultImportSelection(draft,noCurrency).includes('reference_price'),false);
  assert.throws(()=>applyImportFields(draft,noCurrency,new Set(['reference_price'])));
  assert.equal(applyImportFields(draft,noCurrency,new Set(['reference_price']),true).reference_price,'0.00');
});
test('generic details only target supported active type; imports never infer size, fit, gift type or replace product URL',()=>{
  const draft=draftFromGift(null);draft.gift_type='clothing';draft.product_url='https://shop.example.com/original';draft.clothing={size:'42',size_system:'EU',fit:'Ancho'};draft.object={model:'Mi modelo'};
  const next=applyImportFields(draft,metadata,new Set(['brand','model','color','material']));
  assert.deepEqual(next.clothing,{size:'42',size_system:'EU',fit:'Ancho',brand:'Tazas',color:'Verde',material:'Cerámica'});
  assert.deepEqual(next.object,draft.object);assert.equal(next.gift_type,'clothing');assert.equal(next.product_url,draft.product_url);
});
test('bounded response contract rejects unknown fields, invalid URLs, amounts, sources and warning shapes',()=>{
  assert.deepEqual(parseImportResult(wire),wire);
  for(const fields of [{...metadata.fields,size:'L'},{...metadata.fields,image_url:'javascript:alert(1)'},{...metadata.fields,reference_price:'1,234.56'},{...metadata.fields,currency:'PENUSD'},{...metadata.fields,title:'x'.repeat(121)}])assert.throws(()=>parseImportResult({...wire,metadata:{...metadata,fields}}));
  assert.throws(()=>parseImportResult({...wire,metadata:{...metadata,sources:{title:'unknown'}}}));
  assert.throws(()=>parseImportResult({...wire,metadata:{...metadata,warnings:['<b>warning</b>']}}));
  assert.deepEqual(parseImportResult({status:'manual',reason:'NO_USABLE_METADATA',message:'discard provider text'}),{status:'manual',reason:'NO_USABLE_METADATA'});
});
test('product lookup uses capability only in header, canonical URL, fixed endpoint and never retries failures',async()=>{
  const result=await sendProductImport(token,owner,' https://shop.example.com/product#details ',new AbortController().signal,config,async(url,init)=>{
    assert.equal(String(url),`${config.supabaseUrl}/functions/v1/product-metadata`);
    const headers=new Headers(init?.headers);assert.equal(headers.get('X-Edit-Token'),token);assert.equal(headers.get('Authorization'),null);assert.equal(headers.get('apikey'),config.publishableKey);
    assert.deepEqual(JSON.parse(String(init?.body)),{participant_id:owner,url:'https://shop.example.com/product'});assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');assert.equal(init?.referrerPolicy,'no-referrer');
    return Response.json(wire);
  });assert.equal(result.status,'ok');
  for(const [status,kind] of [[401,'access'],[403,'access'],[422,'invalid'],[429,'rate'],[503,'unavailable']] as const){let calls=0;
    await assert.rejects(sendProductImport(token,owner,metadata.final_url,new AbortController().signal,config,async()=>{calls++;return new Response('private SQL detail',{status,headers:{'Retry-After':'2400'}});}),
      (error:unknown)=>error instanceof ProductLookupError&&error.kind===kind&&!error.message.includes('SQL')&&(kind!=='rate'||error.retryAfter===2400));assert.equal(calls,1);
  }
});
test('invalid URLs do not reach server; oversized and stalled bodies terminate without producing suggestions',async()=>{
  let calls=0;
  await assert.rejects(sendProductImport(token,owner,'http://127.0.0.1/private',new AbortController().signal,config,async()=>{calls++;return Response.json(wire);}),ProductLookupError);assert.equal(calls,0);
  await assert.rejects(sendProductImport(token,owner,metadata.final_url,new AbortController().signal,config,async()=>new Response('x'.repeat(33000))),ProductLookupError);
  const abort=new AbortController();let cancelled=false;
  const pending=sendProductImport(token,owner,metadata.final_url,abort.signal,config,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}})));
  await new Promise((resolve)=>setTimeout(resolve,10));abort.abort();await assert.rejects(pending,ProductLookupError);assert.equal(cancelled,true);
});
test('private session prevents foreign/duplicate imports, aborts on close and discards late responses after token replacement',async(t)=>{
  let done!:(value:ReturnType<typeof parseImportResult>)=>void,signal:AbortSignal|undefined,calls=0;
  const session=createPrivateSession(async()=>scope,undefined,undefined,async(secret,id,_url,s)=>{calls++;assert.equal(secret,token);assert.equal(id,owner);signal=s;return new Promise((resolve)=>{done=resolve;});});
  t.after(()=>session.close());const abort=new AbortController().signal;
  await assert.rejects(session.importProduct(owner,metadata.final_url,abort),ProductLookupError);
  session.begin(token,'participant');await session.verify();
  await assert.rejects(session.importProduct('other',metadata.final_url,abort),ProductLookupError);
  const pending=session.importProduct(owner,metadata.final_url,abort);await assert.rejects(session.importProduct(owner,metadata.final_url,abort),ProductLookupError);
  session.begin('B'.repeat(42)+'A','participant');assert.equal(signal?.aborted,true);done(parseImportResult(wire));await assert.rejects(pending,ProductLookupError);assert.equal(calls,1);assert.equal(session.snapshot().status,'pending');
});
test('organizer may import for selected participant and server denial revokes capability',async(t)=>{
  const session=createPrivateSession(async()=>({...scope,accessType:'organizer',participantId:null,participantSlug:null}),undefined,undefined,async()=>{throw new ProductLookupError('access');});t.after(()=>session.close());
  session.begin(token,'organizer');await session.verify();await assert.rejects(session.importProduct(owner,metadata.final_url,new AbortController().signal),ProductLookupError);assert.equal(session.snapshot().status,'unavailable');
});
