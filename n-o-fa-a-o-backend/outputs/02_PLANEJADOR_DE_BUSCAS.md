# Planejador de buscas e semântica dos filtros

## 1. Contrato interno independente do PNCP

Separar o pedido do produto, o plano de coleta e a consulta local. Nomes deste exemplo pertencem ao projeto; não são parâmetros PNCP. O contrato da fonte está no [arquivo 01](01_PNCP_CONTRATO_E_FILTROS.md).

```json
{
  "intent": "open_opportunities",
  "sourceScope": {
    "ufs": ["SP", "MG"],
    "municipalities": [],
    "modalities": [6, 8],
    "organizationCnpjs": [],
    "administrativeUnits": [],
    "publisherIds": [],
    "proposalHorizonEnd": "2026-10-11"
  },
  "localFilters": {
    "text": "equipamento hospitalar",
    "textMode": "full_text",
    "searchIn": ["object"],
    "estimatedValueMin": null,
    "estimatedValueMax": null,
    "srp": null,
    "disputeModeIds": [],
    "includeUnknown": true
  },
  "sort": "proposal_deadline_asc",
  "pageSize": 50
}
```

Datas são exemplos fixos para documentação. Em execução, derivar o horizonte do relógio do servidor e do filtro escolhido, com calendário de Brasília. Não reutilizar a data de setembro de 2026 indefinidamente.

`sourceScope` delimita o universo a manter. `localFilters` seleciona linhas já salvas dentro dele. Um filtro nativo pode reduzir a primeira aquisição quando delimita o pedido, mas alterações posteriores que ampliem esse universo podem exigir novas coletas. A interface deve tornar essa diferença observável.

## 2. Escolher o endpoint pela pergunta

| Pergunta | Fonte inicial | Condição de uso |
|---|---|---|
| Quais oportunidades têm recebimento de propostas aberto no recorte? | `/v1/contratacoes/proposta` | Melhor ponto de partida; validar horizonte e estado local. |
| Quais contratações foram publicadas em determinado período? | `/v1/contratacoes/publicacao` | Datas se referem a publicação; não a abertura ou encerramento. |
| O que mudou em contratações no período? | `/v1/contratacoes/atualizacao` | Datas de atualização global; serve à sincronização. |
| Qual é o estado atual de uma contratação identificada? | `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}` | GET de detalhe disponível também na API de consulta atual. |
| O objeto não basta; preciso de descrição/código de itens | API de integração, consulta de itens | Enriquecer com cobertura explícita; ver arquivo 08. |

Base das quatro primeiras rotas: `https://pncp.gov.br/api/consulta`. Contratos assinados e atas não são a listagem primária de oportunidades abertas. O nome “contratações” não deve ser confundido com “contratos”. [OpenAPI PNCP](https://pncp.gov.br/api/consulta/v3/api-docs).

## 3. Data final de propostas e a palavra “todas”

O manual v1.0 descreve `dataFinal` genericamente como fim do período e o OpenAPI a define como string obrigatória, sem formalizar todos os limites temporais. Não documentam `dataInicial` para essa rota. Nas sondagens de 11/09/2026, DF até 11/10/2026 retornou um total informado de 395 registros; DF até 11/09/2026 retornou 2, ambos encerrando no próprio dia às 14h, após o instante daquela consulta. Isso é compatível com um horizonte de encerramento de propostas abertas; é evidência amostral, não prova de todos os casos de fronteira. [Manual, seção 6.4](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file), [evidências](07_FONTES_E_VALIDACOES.md).

Regra de produto: expor “recebimento aberto, com encerramento até D” e validar a correspondência nas respostas. Não usar `dataFinal=hoje` para pedir todas as propostas abertas, pois isso exclui prazos futuros na observação feita. Não chamar “todas as abertas” um horizonte padrão de 30/90/365 dias.

Proposta operacional inicial: oferecer um horizonte explícito de 30 dias, ajustável, para dar utilidade rápida. Esse valor é recomendação de produto, não requisito da API. Se o produto exigir prazos indefinidos/futuros arbitrários, descobrir e testar a maior data aceita, comparar amostras de credenciamentos longos e datas nulas e documentar o universo que o endpoint consegue representar. Se a fonte não oferecer cobertura comprovada, complementar o catálogo por publicação/atualização e manter a limitação visível. Não inventar um endpoint nacional sem limite temporal.

Evitar repetir `/proposta` com data final de amanhã, depois de depois de amanhã, etc., como se fossem janelas independentes. Como não há data inicial, os resultados podem se sobrepor amplamente. Para essa rota, particionar por UF, município, órgão ou modalidade apenas quando isso for útil e controlar a união.

## 4. AND, OR e parâmetros escalares

Filtros de dimensões diferentes normalmente compõem uma interseção: `uf=SP` e `codigoModalidadeContratacao=6` pedem a modalidade selecionada em SP. Confirmar comportamento no teste de contrato. A especificação define parâmetros escalares, não listas.

Para `(SP OU MG) E (6 OU 8)`, existem duas estratégias corretas:

1. Quatro segmentos nativos: SP/6, SP/8, MG/6, MG/8; unir por `numeroControlePNCP`.
2. Dois segmentos de UF sem modalidade em `/proposta`, salvar o conjunto mais amplo e filtrar modalidade no Supabase. Só escolher isso se o custo adicional de transferência for aceitável e esse universo for útil ao catálogo.

Não enviar `uf=SP,MG`, `codigoModalidadeContratacao=6,8`, múltiplos parâmetros homônimos, `0` ou `todos` como se a API documentasse esses recursos. Em publicação/atualização, quando a intenção é todas as modalidades, obter o domínio atual e criar um segmento por código; não omitir a modalidade obrigatória e não fixar a lista antiga de 1 a 14.

Respeitar a árvore das localidades. Se SP inteira já está coberta, não criar segmentos redundantes por todos os municípios de SP. Se o pedido é “São Paulo capital OU Minas Gerais inteira”, criar o segmento do município e o da UF MG; não aplicar simultaneamente município paulista e UF MG. Unidades administrativas devem ser vinculadas ao CNPJ do órgão, porque um código isolado não deve ser presumido globalmente único.

## 5. Escolher o plano pelo custo e pela completude

O objetivo é reduzir o número total de chamadas e bytes sem eliminar candidatos válidos. “Aplicar o máximo de filtros” não significa multiplicar todas as dimensões em um produto cartesiano. Um recorte com milhares de combinações vazias pode ser mais lento que poucos segmentos mais amplos.

Usar estimativas de coletas anteriores e, para segmentos necessários, os totais da primeira página. Comparar custo previsto, reaproveitamento e o objetivo de cobertura. Não fazer chamadas de contagem para cada combinação possível se o custo da sondagem já ultrapassa a coleta.

Normalizar o escopo: ordenação de listas, remoção de duplicados, códigos de domínio validados, UF em maiúsculas, CNPJ como texto que preserva letras/zeros, datas e endpoint. Calcular uma chave estável da coleta incluindo horizonte, versão do planejador e escopo. O job do usuário é privado; o segmento de aquisição pode ser reaproveitado por outros pedidos autorizados. Não compartilhar buscas privadas em eventos globais.

## 6. Filtros locais e enriquecimento

| Filtro do produto | Fonte de dados | Regra |
|---|---|---|
| Palavras no objeto | `objetoCompra` | FTS/substring no banco; declarar a semântica. |
| Faixa de valor | `valorTotalEstimado` e condição de sigilo | Não confundir estimado com homologado, total com valor unitário ou zero sigiloso com preço conhecido. |
| SRP, situação, esfera, poder, amparo legal, tipo de instrumento | Cabeçalho | Aplicar no banco se não houver parâmetro correspondente na listagem escolhida. |
| Modo de disputa em proposta | `modoDisputaId` | Local nessa rota; nativo em publicação/atualização. |
| Descrição, material/serviço, benefício ou código de item | Itens | Consultar itens de todos os candidatos necessários à afirmação de completude. |
| Expressão no texto do edital | Documento | Obter e indexar texto, eventualmente OCR, com fila e status separados. |

Não inferir CNAE, CATMAT/CATSER, categoria ou tipo de objeto pelo título para descartar definitivamente registros. Classificações por LLM podem ajudar ranking, mas não substituem filtro exato documentado.

Quando `searchIn` inclui itens, não descartar previamente um cabeçalho só porque o termo não aparece no objeto: pode aparecer apenas no item. Priorizar prováveis correspondências é possível, desde que o restante permaneça pendente. O mesmo vale para documentos. Exibir “nenhuma correspondência entre os dados processados; itens pendentes: N” quando aplicável.

## 7. Oportunidade aberta é um estado temporal

Guardar separadamente:

- `observed_in_proposal_endpoint_at`: última observação na fonte;
- `situacao_compra_id`: valor de domínio da fonte;
- `data_abertura_proposta`, `data_encerramento_proposta` e respectivos valores brutos;
- estado de atualização e de verificação de detalhes.

Uma política local inicial para “recebimento aberto agora” pode exigir situação 1, abertura conhecida `<= agora` e encerramento conhecido `> agora`. Tratar o instante exato de encerramento como fechado é uma regra explícita do produto, a validar. Datas ausentes, contraditórias ou situações desconhecidas formam “a verificar”. Uma contratação pode estar divulgada e ainda não aceitar propostas; classificar como “abertura futura” separadamente se necessário. [Domínio de situações e detalhes](https://pncp.gov.br/manual/pt-br/latest/contratacao/index.html).

O manual identifica os horários de proposta como horário de Brasília. Converter datas sem offset por `America/Sao_Paulo`, preservando a entrada; respeitar offset explícito quando existir. Não concatenar `Z` a um horário local. Campos de auditoria devem ter interpretação verificada separadamente. [Manual de consultas, dados de retorno da seção 6.4](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file).

Um prazo pode vencer sem atualização do registro e sem evento Realtime. Reavaliar no servidor a cada busca; na tela agendar uma atualização quando o próximo prazo expirar. Nunca depender somente de um booleano materializado por ingestão.

## 8. Exemplos válidos de requisição

Filtros são query parameters na URL, não cabeçalhos HTTP personalizados e não body GET. Usar codificador de URL da linguagem. `Accept` é cabeçalho. Não reproduzir `curl -k` do manual: manter verificação TLS habilitada.

```http
GET https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261011&uf=SP&codigoModalidadeContratacao=6&pagina=1&tamanhoPagina=50
Accept: application/json
```

```http
GET https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?dataFinal=20261011&uf=SP&codigoMunicipioIbge=3550308&pagina=1&tamanhoPagina=50
Accept: application/json
```

```http
GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=20260901&dataFinal=20260907&codigoModalidadeContratacao=6&uf=SP&pagina=1&tamanhoPagina=50
Accept: application/json
```

```http
GET https://pncp.gov.br/api/consulta/v1/contratacoes/atualizacao?dataInicial=20260910&dataFinal=20260911&codigoModalidadeContratacao=6&uf=SP&pagina=1&tamanhoPagina=50
Accept: application/json
```

Esses exemplos foram conferidos contra parâmetros do OpenAPI. As URLs SP acima são exemplos de montagem, não uma afirmação de que todas foram executadas nesta análise. As sondagens efetivamente executadas usaram DF e estão no arquivo 07.

## 9. Contrato de retorno do projeto

```json
{
  "items": [],
  "nextCursor": null,
  "coverage": {
    "status": "collecting",
    "scopeHash": "hash_do_escopo_normalizado",
    "proposalHorizonEnd": "2026-10-11",
    "completedSegments": 1,
    "plannedSegments": 4,
    "headersComplete": false,
    "itemsComplete": false,
    "sourceObservedAt": "2026-09-11T17:00:00Z"
  },
  "jobId": "identificador_local"
}
```

`items=[]` com `collecting` é diferente de ausência confirmada. A página local pode terminar antes da coleta. Totais da fonte não devem ser somados como oportunidades únicas quando há sobreposição, nem usados como total após aplicar palavra-chave local. Mostrar progresso por segmentos/páginas efetivamente persistidos; contagens filtradas referem-se ao catálogo disponível.

## 10. Validação obrigatória na fronteira

Rejeitar propriedades desconhecidas do pedido e parâmetros fora da lista permitida para cada endpoint antes de chamar o PNCP. Nunca deixar a LLM inventar `q`, `palavraChave`, `valorMinimo`, `status`, `offset`, `sort` ou `limit` na API de consulta. Um servidor pode ignorar parâmetros desconhecidos; HTTP 200 não comprova que o filtro foi aplicado. A confirmação exige contrato e asserções nos registros retornados.
