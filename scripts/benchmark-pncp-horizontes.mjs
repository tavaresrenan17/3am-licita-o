import { writeFileSync } from 'node:fs';
const results=[];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
for(const days of [5,15,30]) {
 const end=new Date(today+'T12:00:00Z'); end.setUTCDate(end.getUTCDate()+days);
 const dataFinal=end.toISOString().slice(0,10).replaceAll('-','');
 const url=new URL('https://pncp.gov.br/api/consulta/v1/contratacoes/proposta');
 url.search=new URLSearchParams({uf:'SP',dataFinal,pagina:'1',tamanhoPagina:'50'});
 const startedAt=new Date().toISOString(); const t=performance.now();
 let result={days,dataFinal,url:String(url),startedAt};
 try {
  const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(75000)});
  const body=await r.text(); let json; try{json=JSON.parse(body)}catch{}
  result={...result,status:r.status,ms:Math.round(performance.now()-t),bytes:Buffer.byteLength(body),total:json?.totalRegistros,pages:json?.totalPaginas,received:json?.data?.length,ufValues:[...new Set((json?.data??[]).map(x=>x.unidadeOrgao?.ufSigla))],error:r.ok?undefined:body.slice(0,450)};
 } catch(e) {result={...result,ms:Math.round(performance.now()-t),error:e.message,cause:e.cause?.code};}
 results.push(result); console.log(JSON.stringify(result));
 writeFileSync('logs/pncp-benchmark-horizontes.json',JSON.stringify({today,results},null,2));
 if(days!==30) await new Promise(r=>setTimeout(r,5000));
}
if (process.argv.includes('--carga-completa')) await import('./benchmark-pncp-carga.mjs');
