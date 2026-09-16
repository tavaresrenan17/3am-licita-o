# Plano de integração PNCP → Supabase

O projeto deve atender buscas de editais e contratações, com prioridade para oportunidades abertas. A solução recomendada combina **filtros nativos no PNCP, catálogo persistido e indexado no Supabase, coleta incremental e exibição progressiva**. Uma nova busca não deve provocar uma nova importação de todo o histórico.

Este pacote é uma especificação para integração por uma LLM. Contém decisões, contratos, exemplos, riscos de incompletude e critérios de teste. Não contém backend implementado nem alterações em um banco. Verificação das fontes e pequenas consultas de leitura: 11/09/2026.

## Ordem de leitura

| Arquivo | Finalidade |
|---|---|
| [01_PNCP_CONTRATO_E_FILTROS.md](01_PNCP_CONTRATO_E_FILTROS.md) | Matriz exata de filtros, limites e inventário de todos os 12 GETs do OpenAPI de consulta verificado. |
| [02_PLANEJADOR_DE_BUSCAS.md](02_PLANEJADOR_DE_BUSCAS.md) | Traduzir os filtros do produto em requisições corretas; exemplos; cobertura e oportunidades abertas. |
| [03_INGESTAO_E_DESEMPENHO.md](03_INGESTAO_E_DESEMPENHO.md) | Coleta inicial, incremental, paginação, retomada, concorrência, cálculo de custo e operação. |
| [04_SUPABASE_E_CONSULTAS.md](04_SUPABASE_E_CONSULTAS.md) | Persistência, índices, filtros no servidor, paginação da tela e Realtime. |
| [05_QA_E_CRITERIOS_DE_ACEITE.md](05_QA_E_CRITERIOS_DE_ACEITE.md) | Testes funcionais, consistência, falhas, segurança e desempenho. |
| [06_PROMPT_PARA_LLM.md](06_PROMPT_PARA_LLM.md) | Instrução pronta para a LLM adaptar o plano ao repositório existente. |
| [07_FONTES_E_VALIDACOES.md](07_FONTES_E_VALIDACOES.md) | Fontes, divergências e resultados das verificações reais, com limites da evidência. |
| [08_DETALHAMENTO_E_DOMINIOS.md](08_DETALHAMENTO_E_DOMINIOS.md) | Itens, documentos, histórico, tabelas de domínio e manual de integração. |

## Respostas às decisões principais

**Como reduzir o tempo?** Começar pelo universo de propostas abertas do recorte escolhido; gravar e mostrar cada página assim que chegar; reutilizar o que já foi coletado; atualizar alterações pela rota de atualização global; enriquecer itens e documentos em fila separada. Filtros da tela devem consultar índices no Supabase. Nenhuma dessas medidas elimina o tempo necessário para transferir um universo grande ainda não coletado.

**Quais filtros vão à fonte?** Em `/contratacoes/proposta`: data final, modalidade opcional, UF, município IBGE, CNPJ, unidade administrativa e identificador do portal publicador. Em publicação/atualização: também data inicial e modo de disputa, com modalidade obrigatória. Os nomes e diferenças exatos estão no arquivo 01. Fonte: [OpenAPI atual](https://pncp.gov.br/api/consulta/v3/api-docs).

**Palavra-chave e faixa de valor podem reduzir a listagem na fonte?** Não há parâmetros documentados para isso nesses endpoints. Coletar os cabeçalhos do recorte nativo e aplicar tais filtros no banco. Busca em descrição de item precisa dos itens; busca em anexo precisa do conteúdo do documento. Ausência desses dados não prova que a oportunidade não corresponde.

**É possível garantir todas as oportunidades em segundos?** Não há base para essa promessa. Uma consulta restrita pode ter poucas páginas; uma busca nacional extensa pode precisar de milhares. A tela pode responder rapidamente com dados salvos, mas deve informar a cobertura e quando a fonte foi consultada. Nas sondagens desta análise, uma primeira página de propostas levou cerca de 19,6 segundos; isso demonstra a necessidade de desacoplar a interface da fonte, e não constitui benchmark.

## Cinco regras que a implementação não pode violar

1. `tamanhoPagina` das três listagens de contratações é de **10 a 50** no OpenAPI atual. Não usar 500 nesses endpoints.
2. `/contratacoes/proposta` não recebe `dataInicial` nem `codigoModoDisputa`. Modalidade pode ser omitida nesse endpoint; nas rotas de publicação/atualização é obrigatória.
3. Situação “Divulgada no PNCP” não significa automaticamente recebimento de propostas aberto. Prazos, situação e atualidade precisam ser considerados.
4. Não filtrar a importação permanentemente por palavras-chave ou preço: isso impede a aplicação posterior de outros filtros sobre todo o recorte.
5. “Todas” sempre precisa indicar o escopo: localidade, modalidades, horizonte, nível de detalhe e coleta concluída. Horizonte de 30 dias não representa todas as oportunidades abertas.

## Escopo documental

Foram examinados o manual de consultas v1.0 completo, o contrato OpenAPI de consulta, o índice do manual de integração v2.6 e as seções de consulta e domínios relevantes para o consumo. O manual de integração também contém operações de publicação, retificação e exclusão destinadas aos fornecedores de dados do PNCP; elas foram identificadas para compreender o ciclo dos registros, sem propor que este projeto escreva no PNCP. Não é necessário implementar todos os módulos, versões históricas ou operações de manutenção para consultar oportunidades.

A [página de manuais solicitada](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais) direciona ao [manual atual de integração](https://pncp.gov.br/manual/pt-br/latest/). O endereço do Swagger fornecido tinha dois pontos extras no final; o endereço funcional é o [Swagger da API de consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html).
