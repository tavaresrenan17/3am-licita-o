# QA e critérios de aceite — PNCP → Supabase

Escopo: editais e contratações, com prioridade para oportunidades em recebimento de propostas. Data da análise e das sondagens: **11/09/2026**. Este documento orienta a implementação e a homologação; nenhum backend, projeto Supabase ou teste de carga foi executado neste trabalho.

## 1. O que foi validado e o que ainda precisa ser testado

Foram examinados o [OpenAPI oficial vigente](https://pncp.gov.br/api/consulta/v3/api-docs), o [Swagger oficial](https://pncp.gov.br/api/consulta/swagger-ui/index.html) e o [Manual da API de Consultas 1.0](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file). O contrato vigente e a observação em produção divergem do manual em pontos importantes: o limite atual dos três endpoints de contratações é **50 registros por página**, e a modalidade é opcional em `/contratacoes/proposta`.

Houve seis requisições pequenas de verificação em produção, sem autenticação. Os resultados abaixo são observações pontuais, não uma avaliação de desempenho do PNCP, prova de completude nacional ou garantia de disponibilidade. As durações incluem as condições da conexão de teste.

Base comum: `https://pncp.gov.br/api/consulta/v1`. Todas as chamadas usaram `uf=DF`, `pagina=1`; o tamanho foi 10, exceto no teste de rejeição de 51.

| ID executado | Requisição/resumo | Resultado observado | Evidência e limite da conclusão |
|---|---|---|---|
| E01 | `/contratacoes/proposta?dataFinal=20261011`, sem modalidade | HTTP 200; 10 linhas; `totalRegistros=395`; `totalPaginas=40`; 19.646 ms | A omissão de modalidade funcionou. A resposta incluiu publicações de 2024 e 2025; limitar a ingestão inicial a publicações recentes perderia essas oportunidades. Apenas a página 1 foi consultada. |
| E02 | Mesma seleção de E01 com `tamanhoPagina=51` | HTTP 400; mensagem `Tamanho de página inválido`; 128 ms | A produção rejeitou 51 nesse endpoint. O OpenAPI estabelece 10–50 também para publicação e atualização. |
| E03 | `/contratacoes/publicacao?dataInicial=20260910&dataFinal=20260910`, sem modalidade | HTTP 400; modalidade requerida; 34 ms | Confirma a obrigatoriedade em publicação. A obrigatoriedade em atualização foi verificada no OpenAPI, sem chamada negativa adicional. |
| E04 | E03 com `codigoModalidadeContratacao=6` | HTTP 200; 10 linhas; 32 registros; 4 páginas; 1.538 ms | Consulta de publicação válida; apenas página 1. |
| E05 | `/contratacoes/atualizacao?dataInicial=20260910&dataFinal=20260910&codigoModalidadeContratacao=6` | HTTP 200; 10 linhas; 104 registros; 11 páginas; 749 ms | Consulta de atualização válida. O significado de atualização global vem do OpenAPI; a sondagem não cobriu toda a janela. |
| E06 | `/contratacoes/proposta?dataFinal=20260911`, sem modalidade | HTTP 200; 2 linhas; 1 página; 61 ms | As duas respostas tinham encerramento em 11/09/2026 às 14h, próximo do horário da consulta. Não prova a regra de inclusão em igualdade, o fuso de todos os registros ou o comportamento após o fechamento. |

A série foi concluída em `2026-09-11T16:59:54.088Z` — 13h59 em Brasília. Não houve execução de testes de RLS, Realtime, recuperação após falhas, banco, filtros compostos, concorrência, fronteiras de datas ou desempenho da futura aplicação. **Todas as matrizes a seguir são testes planejados.**

## 2. Critérios de liberação

Liberar a implementação somente quando:

1. Todos os casos P0 descritos abaixo passarem em ambiente isolado. Não aceitar duplicação canônica, perda silenciosa, vazamento entre usuários, progresso adiantado ao commit ou estado `completo_no_escopo` com lacuna conhecida.
2. Os testes P1 relativos às funcionalidades entregues passarem; documentar explicitamente funcionalidades ainda fora do escopo.
3. Existirem valores definidos para os parâmetros de desempenho e atualização da seção 8, acompanhados do ambiente, volume, resultado medido e justificativa. A falta desses números impede prometer um prazo ao usuário.
4. A interface exibir cobertura, instante da última consulta e estado parcial/desatualizado. “Nenhum resultado” deve distinguir ausência confirmada no recorte observado de coleta ou enriquecimento pendente.
5. Os filtros forem executados sobre todas as linhas elegíveis no banco, com paginação; jamais apenas sobre as linhas já baixadas no navegador.

`P0`: integridade, isolamento ou significado incorreto do resultado. `P1`: robustez, eficiência ou condição de uso que precisa ser homologada antes de habilitar a funcionalidade correspondente.

## 3. Contrato da API, filtros e cobertura

| ID | Prioridade | Cenário planejado | Critério de aceite |
|---|---|---|---|
| C01 | P0 | Gerar chamadas para publicação, proposta e atualização | Cada endpoint usa somente sua lista permitida de parâmetros. Datas no formato `AAAAMMDD`; paginação começa em 1; tamanho inteiro entre 10 e 50. Rejeitar valores inválidos antes da rede. |
| C02 | P0 | Obrigatoriedade por endpoint | Publicação e atualização exigem as duas datas e uma modalidade por requisição. Proposta exige `dataFinal` e aceita modalidade omitida. Não adicionar `dataInicial` ou `codigoModoDisputa` a proposta como se fossem filtros suportados. |
| C03 | P0 | Filtros que pertencem à fonte e filtros locais | UF, município, CNPJ, unidade, modalidade e sistema publicador são emitidos conforme o contrato do endpoint. Texto, faixa de valor, SRP, situação e atributos de itens permanecem locais/enriquecidos quando não constam no contrato. Nenhuma chave desconhecida é enviada esperando que a fonte a aplique. |
| C04 | P0 | `UF IN (SP,RJ)` e modalidade em duas opções | Produzir união das consultas necessárias, com AND entre dimensões dentro de cada alternativa, e deduplicar por `numeroControlePNCP`. Não enviar CSV, array ou parâmetro repetido supondo OR nativo sem contrato. No endpoint de propostas, modalidade omitida pode evitar a partição quando se deseja todas. |
| C05 | P0 | Expressão `(UF=SP OR CNPJ=X)` | Unir dois ramos independentes. Não transformar em uma única chamada com `uf=SP&cnpj=X`, que expressaria uma restrição conjunta. O conjunto final deve ser igual ao oráculo local da expressão original. |
| C06 | P0 | Empurrar parte de uma expressão OR para a fonte | O conjunto buscado deve ser um superconjunto de todos os resultados que podem satisfazer o filtro final. Exemplo: `texto contém hospital OR UF=SP` não pode buscar apenas SP. Cobertura e restrições devem ser explícitas. |
| C07 | P0 | UF, município e unidade incompatíveis; identificadores com zeros | Não “corrigir” silenciosamente a intenção do usuário. Validar inconsistências conhecidas ou retornar recorte vazio explicado. Preservar representação textual dos identificadores e usar parâmetros seguros. |
| C08 | P0 | Usuário amplia uma busca dentro/fora do catálogo coberto | Dentro da cobertura válida, executar somente consulta local. Fora dela, agendar segmentos ausentes. A interface retorna imediatamente o disponível com estado parcial e informa a dimensão ainda em coleta. |
| C09 | P0 | Texto ou faixa de valor não encontrados nas primeiras páginas | Não encerrar a ingestão apenas porque páginas iniciais não passam no filtro local. O job termina ao completar seu recorte da fonte; o filtro local não transforma páginas não lidas em páginas vazias. |
| C10 | P0 | Mesmos filtros em ordem diferente ou usuários simultâneos | A normalização de conjuntos e tipos gera o mesmo escopo canônico; reutiliza cobertura/coleta pública compatível, preservando a privacidade das buscas e dos usuários. Não há um download completo redundante por assinante. |
| C11 | P1 | Busca literal, palavras com acento, stemming, OR/AND de termos | O resultado coincide com a semântica anunciada para FTS/ILIKE. Documentar quando “comprador” não equivale a substring arbitrária. Usar um oráculo independente, e não repetir a implementação dentro do teste. |
| C12 | P0 | Horizonte curto em `/proposta` | Informar que o recorte considera o `dataFinal` solicitado; não rotular como todas as oportunidades futuras. Verificar que registros de publicação antiga elegíveis são aceitos. A interpretação exata da fronteira de `dataFinal` deve ser homologada antes de usar partições por essa data. |

**Teste de equivalência dos filtros:** preparar uma base pequena e conhecida com registros que entram e saem de cada ramo. Comparar, por conjunto de IDs, `predicado completo sobre a base` contra `união das respostas simuladas da fonte + predicado local`. Exigir diferença vazia nos dois sentidos. Acrescentar fixtures com registros duplicados entre ramos, valores nulos e escopos parcialmente coletados.

## 4. Paginação, retomada e sincronização

| ID | Prioridade | Falha/cenário planejado | Critério de aceite |
|---|---|---|---|
| I01 | P0 | Uma página, várias páginas, última página parcial, página cheia final | Todos os IDs do conjunto estático de referência são persistidos uma vez. Respeitar os metadados válidos do envelope; não usar paginação iniciada em zero nem presumir que uma página cheia encerra o recorte. |
| I02 | P0 | HTTP 204 sem corpo | Não executar `response.json()`. Registrar resultado sem conteúdo no segmento. Não apagar registros anteriores porque desapareceram dessa consulta, nem converter 204 em falha de parsing. |
| I03 | P0 | HTTP 200 com `data=[]`; metadados contraditórios; HTML no lugar de JSON | Vazio consistente encerra conforme o contrato. Inconsistência ou corpo inesperado é observável, limita repetição e mantém o job parcial; nunca produz conclusão silenciosa. |
| I04 | P0 | Processo morre depois da resposta HTTP, antes do commit | Checkpoint não avança. A página é reprocessada e todos os seus registros são recuperados. |
| I05 | P0 | Processo morre durante a gravação de uma página | Rollback de dados, checkpoint, contadores e outbox da unidade transacional. Se houver quarentena por registro, a cobertura continua parcial até solução ou exclusão explicitamente contabilizada. |
| I06 | P0 | Commit concluído, processo morre antes de confirmar a fila | Reentrega não duplica linhas, lote aplicado, contadores nem efeito de negócio. A confirmação ocorre depois do commit. |
| I07 | P0 | Dois workers recebem o mesmo segmento; lease expira; worker antigo volta | Somente a geração/token de posse vigente pode efetivar o commit do segmento. A validação do token precisa ocorrer na mesma transação do checkpoint. Um worker atrasado não sobrescreve progresso do sucessor; expiração de lease sozinha não basta. |
| I08 | P0 | Mesmo ID duas vezes no lote e em páginas diferentes | Deduplicar o lote antes do merge e usar restrição única canônica. A política de versão decide conflitos; contadores distinguem linhas recebidas, únicas, inseridas e alteradas. |
| I09 | P0 | Resposta antiga chega após resposta nova | O banco preserva a versão nova atomicamente. Mesma versão e mesmo hash não gera gravação de conteúdo desnecessária. Versão ausente/igual com conteúdo divergente leva a reconciliação, nunca à escolha cega pela ordem de chegada. |
| I10 | P0 | Retomada usa checkpoint criado com filtros, janela ou tamanho diferentes | O checkpoint pertence à assinatura do segmento e à geração. Mudança de contrato invalida/replaneja o segmento; não reutilizar número de página de outra consulta. |
| I11 | P0 | Incremental por atualização global com registro publicado há anos | O registro entra pela janela de `/atualizacao`, mesmo se a publicação for antiga. Não usar apenas `/publicacao` nem apenas `dataAtualizacao` do cabeçalho para concluir que nada mudou nos recursos vinculados. |
| I12 | P0 | Uma modalidade de um ciclo de atualização falha | O watermark global não ultrapassa a menor cobertura concluída das partições necessárias. Não declarar ciclo nacional/completo apenas porque uma modalidade terminou. Lista de modalidades é explícita, versionada e reconciliada com o domínio oficial. |
| I13 | P0 | Novas atualizações surgem enquanto o ciclo está rodando | Fixar o cutoff da rodada ao iniciar. Persistir por janela/partição; avançar a cobertura somente depois de todas as páginas necessárias. A rodada seguinte relê a sobreposição configurada, incluindo a fronteira de calendário. Não usar o relógio do final da execução como se todo o intervalo estivesse coletado. |
| I14 | P0 | Inserção, exclusão ou alteração desloca registros entre páginas | O simulador muda o conjunto entre páginas; a aplicação deduplica e registra a ausência de snapshot garantido. Nova varredura sobreposta/reconciliação recupera IDs omitidos no conjunto que se estabilizou. Não declarar que totalPaginas ou a contagem inicial provam completude exata sob mutação contínua. |
| I15 | P0 | Total de páginas aumenta/diminui durante uma rodada | Aplicar política de leitura finita e observável. Não entrar em loop sem limite nem marcar lacunas conhecidas como concluídas. Guardar contagens observadas e planejar reconciliação. Paralelismo deve ocorrer preferencialmente entre segmentos, não sobre um total de páginas tratado como snapshot. |
| I16 | P0 | Registro deixa o recorte por mudar UF, modalidade ou situação | Não interpretar ausência isolada como exclusão. Revalidar identidades acompanhadas e executar reconciliação mais abrangente conforme o plano; quando não houver cobertura para provar o novo estado, marcar observação antiga/desatualizada. |
| I17 | P1 | Cancelamento, reinício e fila com backlog | Cancelamento não avança cobertura pendente; commits concluídos são mantidos. Retomada usa estado persistido. Jobs prioritários de propostas não ficam indefinidamente atrás de enriquecimento/histórico. |
| I18 | P0 | Primeira aquisição sem cobertura incremental anterior e alteração durante a carga | `bootstrap_started_at` foi persistido antes do primeiro GET. O primeiro incremental relê desde a data inicial menos a sobreposição, por todas as modalidades necessárias, e recupera a mudança inserida pelo simulador durante a carga. Não inicializar o cursor no fim do bootstrap nem no maior timestamp recebido. |

O oráculo de completude do teste é o conjunto fixo do simulador. Em produção, “completo no escopo” significa que o plano de coleta observado foi percorrido sem lacunas conhecidas, com instante e limitações registrados. A API paginada examinada não oferece um identificador de snapshot que permita prometer uma fotografia exata durante alterações simultâneas.

## 5. Oportunidade aberta, datas e dados incompletos

| ID | Prioridade | Cenário planejado | Critério de aceite |
|---|---|---|---|
| D01 | P0 | Situação `Divulgada`, mas proposta ainda não abriu ou já encerrou | Não rotular apenas pela situação. Aplicar prazos, estado da contratação, atualidade e política de dados incompletos. Distinguir observação no endpoint de proposta da classificação temporal local. |
| D02 | P0 | Exatamente na abertura e no encerramento | Congelar relógio e testar 1 ms antes, igualdade e 1 ms depois de cada limite. Regra local sugerida: `abertura <= agora < encerramento`; tratá-la como decisão do produto, não fato comprovado sobre a igualdade na fonte. A tela e a consulta SQL devem concordar. |
| D03 | P0 | Encerramento passa sem nova atualização no PNCP ou evento Realtime | Ao vencer o prazo, próxima consulta já deixa de classificar como aberta; tela aberta reavalia/refaz consulta no limite configurado. Nenhuma oportunidade fica aberta indefinidamente por depender só de eventos de escrita. |
| D04 | P0 | Data/hora sem offset; navegador em outro fuso | Abertura e encerramento de propostas são descritos em horário de Brasília no Manual de Consultas, seção 6.4. Para esses campos sem offset, interpretar `America/Sao_Paulo`; preservar entrada e respeitar offset explícito quando houver. Não presumir UTC pelo parser da linguagem. Confrontar instantes UTC e relógio de servidor. Verificar separadamente o fuso de publicação, inclusão e atualização; a regra documentada para propostas não comprova o fuso de todos os campos de auditoria. |
| D05 | P0 | Virada de dia em Brasília, UTC em outro dia e datas históricas | Construção das janelas usa o calendário configurado, não `UTC.date()` por acidente. Incluir fixtures com virada de mês/ano, ano bissexto e offsets históricos da zona. Não substituir zona IANA por `-03:00` universal para todo o histórico. |
| D06 | P0 | Abertura/encerramento nulos, inválidos ou abertura posterior ao encerramento | Não preencher com agora/zero. Preservar informação e classificar como indeterminada/inconsistente segundo regra explícita; não afirmar aberta ou fechada com falsa certeza. Mostrar campos e restrições disponíveis. |
| D07 | P0 | Cancelamento, suspensão, anulação ou revogação com prazo futuro | Reavaliar elegibilidade com a situação oficial conhecida e sua versão. Prazo futuro sozinho não garante oportunidade disponível. Mudança deve refletir após a atualização/reconciliação. |
| D08 | P0 | Valor estimado zero, nulo ou orçamento sigiloso | Zero da fonte não vira automaticamente “gratuito” nem valor certo para faixa monetária. Preservar valor original e sinalizar desconhecido/sigiloso conforme dados disponíveis. Cabeçalho sem indicador não inventa a causa do zero; filtro de preço tem política explícita para valores desconhecidos. |
| D09 | P0 | Busca por item/benefício/catalogação antes de baixar todos os itens | “Não encontrado nos itens já recebidos” não equivale a “não existe”. Estado pendente/parcial permanece observável. Só classificar resultado negativo definitivo após enriquecimento completo relevante. |
| D10 | P0 | Uma versão de cabeçalho muda durante enriquecimento | Marcar enriquecimento antigo como potencialmente desatualizado; não misturar detalhes como se pertencessem necessariamente à versão nova. Preservar origem, versão e instante observado. |
| D11 | P1 | Campos novos, enums desconhecidos, número recebido como texto | Campos adicionais não derrubam o lote; chave obrigatória ausente exige tratamento explícito. Normalizar tipos somente por regra controlada. Enum novo permanece preservado e não cai silenciosamente em um estado conhecido. |

## 6. Resiliência HTTP, RLS e atualização da interface

| ID | Prioridade | Cenário planejado | Critério de aceite |
|---|---|---|---|
| R01 | P0 | HTTP 429 com `Retry-After` em segundos/data HTTP | Respeitar espera válida, reduzir pressão compartilhada e reagendar trabalho durável; nenhuma tentativa ocorre antes do instante permitido. Não manter uma função curta bloqueada durante toda a espera. |
| R02 | P1 | 429 sem cabeçalho válido, 503, timeout ou desconexão | Backoff exponencial com jitter, teto e orçamento finito de tentativas/tempo configurados. Não perder checkpoint. Exaustão gera estado parcial com motivo. A resposta 429 é cenário de robustez, não alegação de limite publicado pelo PNCP. |
| R03 | P0 | HTTP 400/422 por filtro inválido | Não insistir com a mesma requisição inválida. Apresentar erro sanitizado acionável e conservar progresso válido. Falha de contrato é distinguida de indisponibilidade transitória. |
| R04 | P1 | Rede lenta, resposta grande e banco lento | Timeouts de conexão/leitura e limites de bytes/memória impedem esgotamento. Concorrência e fila são limitadas; pressão do banco reduz consumo de novas páginas. |
| S01 | P0 | Usuários A, B e anônimo acessam tabelas/RPCs | Cada um vê apenas dados públicos deliberadamente expostos e seus dados privados autorizados. Testar buscas, favoritos, jobs e organização por API real do ambiente de homologação, não somente pelo console administrativo. |
| S02 | P0 | Cliente tenta inserir/alterar catálogo ou acessar payload bruto/fila | Acesso é negado conforme políticas. Chave administrativa/secret permanece no servidor; bundle, logs do navegador e respostas não a contêm. RPC não permite escapar do filtro de proprietário. |
| S03 | P0 | Usuário B assina tópico Realtime do job privado de A | Assinatura ou entrega é negada. Testar autorização de canais privados separadamente da RLS das tabelas; RLS de uma tabela não é presumida como proteção automática de qualquer tópico Broadcast. |
| S04 | P0 | Evento chega duplicado, fora de ordem ou é perdido em desconexão | Eventos pequenos de invalidação/progresso provocam reconsulta idempotente. Após reconectar, a tela refaz consulta e recupera o estado persistido. Evento não é a única cópia do dado nem prova de entrega de cada linha. |
| S05 | P0 | Filtro inclui registro que estava fora da página atual; registro muda e sai do filtro | Reconsulta no banco inclui/exclui corretamente. A tela não apenas acrescenta eventos à lista nem filtra uma amostra de 1.000 linhas como se fosse o catálogo inteiro. |
| S06 | P0 | Múltiplas páginas SQL com datas iguais e inserções concorrentes | Ordenação tem desempate único; cursor é compatível com filtro/ordem. Não prometer snapshot entre páginas; reconsulta trata alterações sem acumular duplicatas visuais. Testar todos os IDs de um conjunto estático maior que o limite da Data API. |
| S07 | P1 | Milhares de alterações em lote e muitos assinantes simulados | Eventos são agrupados, limitados e publicados após commit; consumo é proporcional à política de lotes, não um broadcast completo de cada payload PNCP para cada usuário. Medir atraso e capacidade no plano contratado. |

Referências para os casos Supabase: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [chaves de API](https://supabase.com/docs/guides/getting-started/api-keys), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Postgres Changes e escala](https://supabase.com/docs/guides/realtime/postgres-changes#scaling-postgres-changes). A configuração efetiva e os limites do projeto precisam ser verificados na implementação.

## 7. Estratégia de execução dos testes

1. **Unidade/puramente local:** compilação do plano de filtros, normalização, conversão de datas, elegibilidade, versão/hash e paginação. Fixtures pequenas e relógio controlável; incluir contraexemplos que falhariam em uma implementação ingênua.
2. **Integração isolada:** API PNCP simulada + banco com schema/políticas do projeto + fila. Injetar falhas nos pontos de I04–I09. Comparar estado final, coverage e outbox com o oráculo. Reexecutar a mesma coleta e exigir estabilidade dos registros de negócio.
3. **Homologação Supabase:** usuários distintos e cliente anônimo verificam Data API, RPC, Broadcast e reconexão. Usar dados sintéticos e ambiente separado; testar política com credencial administrativa não valida a proteção dos usuários finais.
4. **Smoke oficial limitado:** antes da implantação e após mudança relevante do contrato, executar um conjunto pequeno de GETs com recortes estreitos e orçamento definido. Salvar status, latência, tamanho, metadados e diferenças de contrato. Evitar sondagem periódica de parâmetros inválidos e usar fixtures para a regressão diária.
5. **Produção:** acompanhar erros, lag, cobertura e divergências por amostragem. Não executar teste de carga contra o PNCP. Medir a aplicação com respostas simuladas; qualquer benchmark externo mais amplo exige condições próprias acordadas com o provedor.

Preservar evidências de cada execução: commit/build, hash do OpenAPI usado, data, ambiente, parâmetros sanitizados, resultado esperado/obtido, quantidade de chamadas, seeds dos dados sintéticos e relatórios de falhas. Uma mudança incompatível no OpenAPI abre revisão; não deve atualizar o cliente automaticamente sem validar significado dos dados.

## 8. Benchmark e metas configuráveis

Não existe, nesta análise, SLA confirmado do PNCP nem tempo garantido para uma coleta nacional. Os seis tempos observados variaram de 61 ms a 19,646 s; não há amostra suficiente para percentis ou para projetar duração total. Separar **primeiros resultados úteis**, **conclusão do recorte** e **atualidade do catálogo**.

Antes do aceite de desempenho, registrar no projeto:

| Parâmetro a definir | Medição e condição de aprovação |
|---|---|
| `target_first_visible_warm_ms` | p95 da consulta ao catálogo coberto até renderização inicial ≤ meta definida, com volume, filtro e concorrência do cenário registrados. |
| `target_first_visible_cold_ms` | p95 da primeira página persistida/visível usando latências simuladas declaradas ≤ meta. Relatório distingue espera da fonte, processamento, commit e UI. Não extrapolar a meta do mock como promessa do PNCP. |
| `target_local_query_p95_ms` | Filtros representativos sobre o volume alvo cumprem o orçamento; analisar plano/índices e linhas examinadas em consultas lentas. |
| `max_source_concurrency`, `max_requests_per_interval` | Contadores instrumentados nunca excedem os limites configurados, incluindo múltiplos workers e retries. Limites são decisões iniciais da aplicação, ajustadas por observação, não cotas oficiais presumidas. |
| `max_worker_memory_mb`, `max_batch_bytes` | Pico de memória e lote permanecem abaixo dos limites em registros grandes; não acumular todas as páginas em memória. |
| `max_open_refresh_age`, `max_incremental_lag` | Idade/atraso são medidos por escopo; ultrapassar o orçamento sinaliza desatualização e alerta. Indisponibilidade externa não é escondida como dado fresco. |
| `overlap_window`, `reconciliation_interval` | Casos com atualização tardia dentro da janela são recuperados no teste. Limitação para atraso maior é explícita e mitigada pela reconciliação. |
| `max_realtime_ui_delay`, `max_expired_visible_delay` | Após commit e após vencimento de prazo sem evento, a tela converge no orçamento definido nos cenários controlados. |
| `retry_budget`, `request_timeout`, `lease_duration` | Falhas terminam/reagendam sem loop; lease suporta renovação/posse e impede commit obsoleto. Os valores são compatíveis com o runtime escolhido. |

Cenários mínimos de benchmark local, propostos para calibração:

- Catálogo de 10 mil, 100 mil e 1 milhão de cabeçalhos sintéticos, ou os volumes realistas menores/maiores definidos pelo projeto. Não é necessário executar o maior cenário se ele não faz parte do objetivo documentado.
- Fonte simulada com página de 50, distribuição de atrasos declarada, 0% e 20% de duplicatas entre recortes, respostas vazias e picos de 429/503. Usar seeds reprodutíveis.
- Uma consulta, 10 consultas e o pico simultâneo previsto; misturar cache coberto com recortes novos e enriquecimento pendente.
- Comparar configuração sequencial e pequenas concorrências limitadas; adotar a menor pressão que cumpra o objetivo medido. Repetir apenas para calibração ou regressão relevante.

Relatar: requisições feitas/evitadas, bytes, linhas recebidas/únicas/gravadas/alteradas, tempo de espera da fonte, tempo de banco, tamanho da fila, retries, p50/p95/p99 quando houver amostra suficiente, memória e atraso da UI. Para conjunto estático de `N` cabeçalhos, o orçamento de chamadas de listagem deriva da soma das páginas de cada segmento de 50; enriquecimento e reconciliação acrescentam chamadas e devem aparecer separadamente.

## 9. Definição de pronto para a LLM implementadora

- [ ] Registrar capacidades por endpoint e suas fontes; bloquear parâmetros inventados.
- [ ] Implementar filtros e seu teste de equivalência, incluindo OR, AND, nulos e cobertura parcial.
- [ ] Demonstrar todas as falhas de retomada críticas com banco/fila reais de homologação e PNCP simulado.
- [ ] Demonstrar atualização global com cutoff, modalidades, sobreposição e reconciliação.
- [ ] Demonstrar reclassificação de prazo sem depender de escrita na fonte.
- [ ] Demonstrar isolamento RLS/RPC/Broadcast com identidades diferentes.
- [ ] Registrar metas e benchmark do ambiente alvo; não prometer que a fonte devolverá tudo em tempo fixo.
- [ ] Exibir primeira página útil antes do término da coleta e explicar parcialidade/atualidade ao usuário.
- [ ] Entregar relatório que diferencie executado, aprovado, falhou e não executado. Nenhum item deste plano passa a “aprovado” por constar em documentação.

Ler em conjunto com os documentos de contrato, filtros, ingestão e [Supabase e consultas](04_SUPABASE_E_CONSULTAS.md). Em conflito, resolver a decisão e atualizar os testes; não manter duas semânticas incompatíveis para a mesma busca.
