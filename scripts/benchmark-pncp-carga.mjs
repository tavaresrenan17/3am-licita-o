import {readFileSync,writeFileSync} from 'node:fs';
const baseline=JSON.parse(readFileSync('logs/pncp-benchmark-primeira-amostra.json','utf8'));
const sample=baseline.results.find(x=>x.days===30);
const run={startedAt:new Date().toISOString(),days:30,dataFinal:sample.dataFinal,intervalMs:4000,pages:[],uniqueCount:0,complete:false};
const ids=new Set(); const start=performance.now(); let lastStart=-Infinity; let expected=sample.pages; let consecutiveErrors=0;
for(let page=1;page<=expected;page++) {
 if(performance.now()-start>900000){run.stopReason='Limite de 15 minutos';break;}
 await new Promise(r=>setTimeout(r,Math.max(0,4000-(performance.now()-lastStart))));
 const url=new URL(sample.url);url.searchParams.set('pagina',String(page));
 lastStart=performance.now();let result={page};
 try {
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(75000)});
  const body=await response.text();let json;try{json=JSON.parse(body)}catch{}
  result={...result,status:response.status,ms:Math.round(performance.now()-lastStart),bytes:Buffer.byteLength(body),received:json?.data?.length,total:json?.totalRegistros,pages:json?.totalPaginas};
  if(response.status===200&&Array.isArray(json?.data)){
   for(const item of json.data)ids.add(item.numeroControlePNCP);
   consecutiveErrors=0;
   if(page===1)expected=json.totalPaginas;
  }else{result.error=body.slice(0,300);consecutiveErrors++;}
 }catch(e){result={...result,ms:Math.round(performance.now()-lastStart),error:e.message};consecutiveErrors++;}
 run.pages.push(result);run.uniqueCount=ids.size;run.elapsedMs=Math.round(performance.now()-start);
 console.log(JSON.stringify({...result,elapsedMs:run.elapsedMs,uniqueCount:ids.size}));
 if(result.status===429||consecutiveErrors>=2){run.stopReason='Fonte limitou chamadas ou falhou consecutivamente';writeFileSync('logs/pncp-benchmark-carga-30-dias.json',JSON.stringify(run,null,2));break;}
 if(page===expected)run.complete=run.pages.every(p=>p.status===200);
 writeFileSync('logs/pncp-benchmark-carga-30-dias.json',JSON.stringify(run,null,2));
}
console.log(JSON.stringify({complete:run.complete,elapsedMs:run.elapsedMs,pages:run.pages.length,uniqueCount:run.uniqueCount,stopReason:run.stopReason}));

