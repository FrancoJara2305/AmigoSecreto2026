import { uiOrigin } from './origins';
import { expect,type Page } from '@playwright/test';
import { api,fixtureCredential,fixtureOwner } from './gift-editor';
import type { ImportMetadata } from '../../../src/domain/product-import';
export function sampleMetadata():ImportMetadata {
  return {fields:{title:'Taza de café',description:'Cerámica para las mañanas',reference_price:'29.90',currency:'USD',image_url:'https://shop.example.com/image.png',brand:'Casa',model:'M1',color:'Verde',material:'Cerámica'},
    sources:{title:'json-ld',description:'json-ld',reference_price:'json-ld',currency:'json-ld',image_url:'open-graph',brand:'json-ld',model:'json-ld',color:'json-ld',material:'json-ld'},warnings:[],final_url:'https://shop.example.com/product'};
}
export async function importFixture(page:Page) {
  const state={metadata:sampleMetadata(),requests:[] as Record<string,unknown>[],status:200,manual:'',delay:0,retryAfter:'1',networkFailure:false};
  await page.route(`${api}/functions/v1/product-metadata`,async(route)=>{
    const cors={'Access-Control-Allow-Origin':uiOrigin,'Access-Control-Expose-Headers':'Retry-After','Cache-Control':'no-store'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'content-type,apikey,x-edit-token'}});
    const body=route.request().postDataJSON();state.requests.push(body);
    expect(route.request().headers()['x-edit-token']).toBe(fixtureCredential);expect(body).toEqual({participant_id:fixtureOwner,url:'https://shop.example.com/product'});
    expect(route.request().headers().authorization).toBeUndefined();expect(JSON.stringify(body)).not.toContain(fixtureCredential);
    const status=state.status,manual=state.manual,metadata=structuredClone(state.metadata),networkFailure=state.networkFailure;
    if(state.delay)await new Promise((resolve)=>setTimeout(resolve,state.delay));
    if(networkFailure)return route.abort('failed');
    return route.fulfill({status,json:status!==200?{error:{message:'private provider detail'}}:manual?{status:'manual',reason:manual}:{status:metadata.warnings.length?'partial':'ok',metadata},headers:{...cors,...(status===429?{'Retry-After':state.retryAfter}:{})}});
  });
  return state;
}
