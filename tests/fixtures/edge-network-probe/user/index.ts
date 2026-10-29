// User-worker APIs, not the more privileged main service. The container has --network none.
Deno.serve(async()=>{
  const result: Record<string,unknown>={};
  result.startTls=typeof Deno.startTls;
  try {const socket=await Deno.connect({hostname:'127.0.0.1',port:19001});socket.close();result.connect='available';}
  catch(error){result.connect=error instanceof Error?error.name+': '+error.message:'failed';}
  let lookupCalled=false;
  result.https=await new Promise((resolve)=>{
    const moduleName='node:'+'https';
    import(moduleName).then(({default:https})=>{
    const request=https.get({hostname:'unresolvable.invalid',port:19001,path:'/',agent:false,
      lookup:(_host,_options,callback)=>{lookupCalled=true;callback(null,'127.0.0.1',4);},
      signal:AbortSignal.timeout(1500)},(response)=>{response.destroy();resolve('response');});
    request.on('error',(error)=>resolve(error.name+': '+error.message));
    }).catch((error)=>resolve(error.name+': '+error.message));
  }).catch((error)=>error instanceof Error?error.name+': '+error.message:'failed');
  result.lookupCalled=lookupCalled;
  result.pinnedServername=await new Promise((resolve)=>{
    const moduleName='node:'+'https';
    import(moduleName).then(({default:https})=>{
      const request=https.get({hostname:'127.0.0.1',servername:'shop.example.com',ca:Deno.env.get('PROBE_CA'),port:19001,path:'/tls-fixture',agent:false,
        signal:AbortSignal.timeout(1500)},(response)=>{response.destroy();resolve('response');});
      request.on('error',(error)=>resolve(error.name+': '+error.message));
    }).catch((error)=>resolve(error.name+': '+error.message));
  });
  try {const client=Deno.createHttpClient({});client.close();result.httpClient='available';}
  catch(error){result.httpClient=error instanceof Error?error.name+': '+error.message:'failed';}
  const client=Deno.createHttpClient({caCerts:[Deno.env.get('PROBE_CA')!]});
  try {const response=await fetch('https://127.0.0.1:19001/tls-fixture',{client,headers:{Host:'shop.example.com'}});result.fetchPinned=response.status;await response.body?.cancel();}
  catch(error){result.fetchPinned=error instanceof Error?error.name+': '+error.message:'failed';}
  finally{client.close();}
  return Response.json(result);
});
