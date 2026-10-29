import { createServer } from 'node:http';
import { Readable } from 'node:stream';
export function webServer(handler) {
  return createServer(async(req,res)=>{
    const controller=new AbortController();req.on('aborted',()=>controller.abort());
    res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    try{
      const request=new Request(`http://localhost${req.url}`,{method:req.method,headers:req.headers,
        ...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'}),signal:controller.signal});
      const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{if(!res.headersSent)res.writeHead(503);res.end();}
  });
}
