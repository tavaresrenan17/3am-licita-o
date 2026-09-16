const fs = require('fs');
const cases = [
 ['proposta_sem_modalidade', '/v1/contratacoes/proposta', {dataFinal:'20261011',uf:'DF',pagina:1,tamanhoPagina:10}],
 ['proposta_limite_51', '/v1/contratacoes/proposta', {dataFinal:'20261011',uf:'DF',pagina:1,tamanhoPagina:51}],
 ['publicacao_sem_modalidade', '/v1/contratacoes/publicacao', {dataInicial:'20260910',dataFinal:'20260910',uf:'DF',pagina:1,tamanhoPagina:10}],
 ['publicacao_valida', '/v1/contratacoes/publicacao', {dataInicial:'20260910',dataFinal:'20260910',codigoModalidadeContratacao:6,uf:'DF',pagina:1,tamanhoPagina:10}],
 ['atualizacao_valida', '/v1/contratacoes/atualizacao', {dataInicial:'20260910',dataFinal:'20260910',codigoModalidadeContratacao:6,uf:'DF',pagina:1,tamanhoPagina:10}],
 ['proposta_datafinal_hoje', '/v1/contratacoes/proposta', {dataFinal:'20260911',uf:'DF',pagina:1,tamanhoPagina:10}],
];
(async () => {
 const out = [];
 for (const [name,path,params] of cases) {
  const url = 'https://pncp.gov.br/api/consulta'+path+'?'+new URLSearchParams(params);
  const start = performance.now();
  try {
   const r = await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(25000)});
   const body = await r.text();
   fs.writeFileSync('work/probe-'+name+'.json',body);
   let j; try{j=JSON.parse(body)}catch{}
   const result = {name,url,status:r.status,elapsedMs:Math.round(performance.now()-start),bytes:Buffer.byteLength(body),contentType:r.headers.get('content-type'),totalRegistros:j?.totalRegistros,totalPaginas:j?.totalPaginas,numeroPagina:j?.numeroPagina,count:j?.data?.length,empty:j?.empty,error:r.ok?undefined:j??body.slice(0,300),sample:j?.data?.slice(0,2).map(x=>({id:x.numeroControlePNCP,abertura:x.dataAberturaProposta,encerramento:x.dataEncerramentoProposta,publicacao:x.dataPublicacaoPncp,atualizacao:x.dataAtualizacaoGlobal,modalidade:x.modalidadeId,situacao:x.situacaoCompraId,uf:x.unidadeOrgao?.ufSigla}))};
   out.push(result);console.log(JSON.stringify(result));
  }catch(e){const result={name,url,error:String(e),elapsedMs:Math.round(performance.now()-start)};out.push(result);console.log(JSON.stringify(result))}
 }
 fs.writeFileSync('work/probe-results.json',JSON.stringify({executedAt:new Date().toISOString(),cases:out},null,2));
})();
