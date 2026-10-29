// Local Docker fixture only. Never copied into supabase/functions or deployed.
const worker=await EdgeRuntime.userWorkers.create({servicePath:'/probe/user',memoryLimitMb:256,
  workerTimeoutMs:10000,cpuTimeSoftLimitMs:1000,cpuTimeHardLimitMs:2000,noModuleCache:true,noNpm:true,envVars:[['PROBE_CA',await Deno.readTextFile('/tls/ca.pem')]]});
Deno.serve({port:9000},(request)=>new URL(request.url).pathname==='/tls-fixture'?new Response('fixture'):worker.fetch(request));
const response=await fetch('http://127.0.0.1:9000');
console.log('PROBE_RESULT:'+JSON.stringify(await response.json()));
