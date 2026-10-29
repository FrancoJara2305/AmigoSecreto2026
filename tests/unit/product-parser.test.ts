import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductMetadata } from '../../supabase/functions/_shared/product-parser.ts';
const final='https://shop.example.com/catalog/product';
const ld=(value:unknown)=>`<script type="application/ld+json">${JSON.stringify(value).replace(/<\/script/gi,'<\\/script')}</script>`;
test('JSON-LD Product/Offer wins over OG, entities become plain text and price retains currency',()=>{
  const result=parseProductMetadata(ld({'@context':'https://schema.org','@graph':[{'@type':['Thing','Product'],name:'Zapatos &amp; paseo',description:'Para <b>caminar</b>.',image:'/images/shoe.webp',brand:{'@type':'Brand',name:'Marca'},color:'Azul',offers:{'@type':'Offer',price:'39.90',priceCurrency:'USD'}}]})+'<meta property="og:title" content="Otro título"><meta property="product:price:amount" content="99">',final);
  assert.equal(result.fields.title,'Zapatos & paseo');assert.equal(result.fields.description,'Para caminar.');assert.equal(result.fields.reference_price,'39.90');assert.equal(result.fields.currency,'USD');assert.equal(result.fields.brand,'Marca');
  assert.equal(result.fields.image_url,'https://shop.example.com/images/shoe.webp');assert.equal(result.sources.title,'json-ld');assert.ok(!('size' in result.fields));
});
test('arrays/graph work; AggregateOffer, variants and multiple products never invent exact prices',()=>{
  for(const value of [
    {'@type':'Product',name:'Variantes',offers:{'@type':'AggregateOffer',lowPrice:20,highPrice:40,priceCurrency:'PEN'}},
    {'@type':'Product',name:'Variantes',offers:[{'@type':'Offer',price:20},{'@type':'Offer',price:40}]},
    [{'@type':'Product',name:'Uno',offers:{price:20}},{'@type':'Product',name:'Dos',offers:{price:40}}],
  ]){const r=parseProductMetadata(ld(value)+'<meta property="og:title" content="Catálogo"><meta property="product:price:amount" content="10">',final);assert.equal(r.fields.reference_price,undefined);assert.ok(r.warnings.includes('PRICE_AMBIGUOUS')||r.warnings.includes('MULTIPLE_PRODUCTS'));}
});
test('OG then standard metadata/title fallbacks, relative images use final URL and ignore HTML base',()=>{
  const r=parseProductMetadata('<base href="http://127.0.0.1/"><title>Último recurso</title><meta property="og:title" content="Taza &amp; café"><meta name="description" content="Para cada día"><meta property="og:image" content="../cup.jpg"><meta property="product:price:amount" content="0"><meta property="product:price:currency" content="EUR">',final);
  assert.equal(r.fields.title,'Taza & café');assert.equal(r.fields.image_url,'https://shop.example.com/cup.jpg');assert.equal(r.fields.reference_price,'0.00');assert.equal(r.fields.currency,'EUR');assert.equal(r.sources.description,'html');
});
test('missing/ambiguous price and currency remain absent; no PEN default or conversion',()=>{
  const r=parseProductMetadata(ld({'@type':'Product',name:'Objeto',offers:{'@type':'Offer',price:'19,50'}}),final);
  assert.equal(r.fields.reference_price,'19.50');assert.equal(r.fields.currency,undefined);assert.ok(r.warnings.includes('CURRENCY_MISSING'));
  for(const price of ['S/ 20','1,299.00','1.999',-1,'NaN'])assert.equal(parseProductMetadata(ld({'@type':'Product',name:'Objeto',offers:{price}}),final).fields.reference_price,undefined);
});
test('malformed/deep/oversized JSON-LD and remote contexts do not execute or follow references',()=>{
  const deep='['.repeat(30)+'{}'+']'.repeat(30);
  for(const content of ['not json',deep,JSON.stringify({'@context':'http://127.0.0.1/context',name:'x'.repeat(140000)})]){
    const r=parseProductMetadata(`<script type="application/ld+json">${content}</script><title>Completar a mano</title>`,final);assert.equal(r.fields.title,'Completar a mano');assert.ok(r.warnings.some((w)=>w.startsWith('JSON_LD_')));
  }
});
test('HTML/JS and unsafe image sources are removed, fields bounded and challenge/dynamic pages fall back',()=>{
  const r=parseProductMetadata(ld({'@type':'Product',name:'x'.repeat(500),description:'<script>alert(1)</script><p>Texto seguro</p>',image:'http://127.0.0.1/x'}),final);
  assert.equal(r.fields.title?.length,120);assert.equal(r.fields.description,'Texto seguro');assert.equal(r.fields.image_url,undefined);
  assert.equal(parseProductMetadata('<title>Just a moment...</title><script>location.href="/challenge"</script>',final).fields.title,undefined);
  assert.equal(parseProductMetadata('<div id="app"></div><script>window.data={name:"JS only"}</script>',final).fields.title,undefined);
  assert.throws(()=>parseProductMetadata('x'.repeat(1048577),final));
});
