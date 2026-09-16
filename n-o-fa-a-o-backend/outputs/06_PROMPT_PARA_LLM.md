# Instrução para integrar o plano ao projeto

Use o texto abaixo como pedido para a LLM que tem acesso ao repositório. Coloque os nove arquivos deste pacote no contexto ou em uma pasta de documentação do projeto. Esta instrução é para uma etapa futura de implementação; o trabalho que gerou o pacote entregou somente documentação.

---

Atue como engenheiro sênior de backend e QA. Integre ao projeto existente a consulta de editais e contratações do PNCP, priorizando oportunidades com recebimento de propostas aberto e persistindo no Supabase. Use como especificação os arquivos 00 a 08 deste pacote, verificados em 11/09/2026. Revalide o contrato oficial antes de codificar, porque ele pode mudar.

Primeiro examine o repositório, instruções locais, stack, modelo Supabase, autenticação, jobs existentes, interfaces de busca e testes. Aproveite a arquitetura existente. Não invente credenciais, tabelas já existentes, requisitos de produto ou resultado de testes. Não substitua a stack sem necessidade demonstrada. Identifique conflitos reais entre esta especificação e o projeto e resolva-os explicitamente.

O resultado esperado é uma busca que retorna imediatamente as páginas já salvas, informa cobertura/atualidade e continua coletando os segmentos faltantes por tarefas duráveis. Filtros locais são executados no Postgres sobre todo o catálogo permitido antes de paginar, inclusive linhas fora da primeira página ou acima do limite da Data API. Não carregar todas as linhas no navegador para filtrar.

Implemente por etapas verificáveis, preservando estes requisitos:

1. Capacidades por endpoint derivadas do OpenAPI: `/contratacoes/proposta` tem modalidade opcional e não admite `dataInicial` nem `codigoModoDisputa`; publicação/atualização exigem modalidade e duas datas. As três listagens têm `pagina>=1` e `tamanhoPagina` de 10 a 50 no contrato verificado. Revalidar antes de alterar esse limite. Rejeitar parâmetros desconhecidos; não inventar filtro nativo de texto/preço/status.
2. Escopo normalizado, parâmetros escalares, OR como união planejada e deduplicada, AND com semântica explícita. Usar o catálogo atual de modalidades, incluindo códigos novos; CNPJ é texto e pode ter letras.
3. Coleta inicial de propostas abertas com horizonte explícito. Não obter abertas só por publicações recentes. Não rotular horizonte de 30 dias como todas as abertas. A semântica temporal exata da fonte ainda exige testes de fronteira.
4. Manter cabeçalhos do recorte nativo mesmo quando não correspondem à palavra-chave/filtro local atual. Não produzir falsos negativos descartando candidatos antes de obter os itens/documentos exigidos pelo filtro.
5. Catálogo canônico por `numeroControlePNCP`, campos tipados, referência à origem, observação de versão e JSON bruto separado. Preservar identidades do órgão originário e sub-rogado. Valores decimais, desconhecidos e sigilosos têm semântica explícita.
6. Fila durável, segmento com assinatura/versionamento, posse com fencing, checkpoint e gravação do lote na mesma transação, confirmação de fila após commit, merge idempotente e contadores sem duplicação. Proteção atômica contra regressão por resposta atrasada. Não manter transação aberta durante GET externo.
7. Paginação robusta a 204 sem JSON, corpos inválidos, totais mutáveis, falhas e retomadas. A API não oferece snapshot garantido: sobreposição e reconciliação precisam fazer parte da estratégia. Duplicação corrigida não prova ausência de lacunas.
8. Incremental pelo endpoint de atualização global, por modalidades e recortes cobertos, com datas fixadas por rodada, sobreposição e data corrente provisória. Persistir o início do bootstrap antes da primeira chamada, iniciar o primeiro incremental nessa data menos a sobreposição e recuperar as mudanças ocorridas durante a carga. Não avançar cobertura agregada além de partições pendentes. Registrar e tratar mudanças que retiram registros de um filtro e exclusões sem feed garantido.
9. Concorrência e limite de taxa compartilhados por workers, filas e retries. Backoff com jitter, Retry-After respeitado, timeouts, limite de tentativas/bytes/memória e prioridade que preserve descoberta/sincronização. Não afirmar quota PNCP não documentada.
10. Supabase com índices orientados às consultas, FTS distinto de substring, cursor que preserva horário e desempate único, colunas de exibição explícitas e contagem sob demanda. Não criar índice parcial com `now()`; aberta é condição temporal reavaliada.
11. Realtime com aviso pequeno de progresso/invalidação por lote, preferencialmente Broadcast autorizado, consulta após commit e recuperação na reconexão. Não emitir cada payload bruto para todos os assinantes. Prazos vencem mesmo sem evento e a tela precisa atualizar.
12. RLS, RPC e tópicos privados testados com usuários distintos. Segredos administrativos ficam no servidor. O catálogo público deliberado pode ser compartilhado; jobs, favoritos e filtros privados devem respeitar o isolamento. O projeto só lê no PNCP.
13. Estado de cobertura explícito por cabeçalhos/itens/documentos. Resultados vazios em coleta parcial não significam ausência de oportunidades. Mostrar o instante da última observação, horizonte e falhas relevantes.

Antes de executar migrações, adaptar exemplos SQL aos tipos e convenções do repositório; os trechos do pacote são referências, não migrações completas. Definir plano de migração compatível, rollback e índices sem sobrecarregar produção. Quando faltarem segredos ou acesso, concluir o trabalho que pode ser feito e informar precisamente o bloqueio. Não criar tabelas/RLS amplamente permissivas para contornar acesso.

Execute os testes aplicáveis de 05_QA_E_CRITERIOS_DE_ACEITE.md. Priorize provas de completude em um simulador com conjunto conhecido, falhas entre resposta/commit/ACK, reentrega, worker obsoleto, janela parcial, alteração durante paginação, expiração de prazo e isolamento. Use poucas consultas oficiais para confirmar contrato; não faça teste de carga no PNCP.

Defina metas de desempenho do projeto com volume e concorrência explícitos e faça benchmark usando fonte simulada. Separe primeira página, consulta local, conclusão de cabeçalhos e enriquecimento. Não prometa segundos para importação nacional com base em uma amostra pequena.

Entregue ao final: comportamento implementado; arquivos/migrações alterados; mapeamento PNCP→banco; configurações e segredos necessários; testes executados com resultados; testes pendentes; medições e limitações de cobertura; instruções para executar worker e interface no ambiente do projeto. Não declarar itens aprovados sem executar as verificações correspondentes.

---

Referências principais para revalidação: [OpenAPI Consulta](https://pncp.gov.br/api/consulta/v3/api-docs), [Swagger Consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html), [Manual Integração atual](https://pncp.gov.br/manual/pt-br/latest/), [Supabase](https://supabase.com/docs).
