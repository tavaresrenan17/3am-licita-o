# 08 — Detalhes, domínios e limites de interpretação do PNCP

**Verificado em 11/09/2026.** Escopo: leitura de editais/contratações e oportunidades abertas. As rotas e campos abaixo foram conferidos em fontes oficiais. As decisões sobre filas, cache e reconciliação são recomendações de engenharia. Este documento especifica a integração; não contém implementação de backend.

## 1. Fontes que devem orientar a implementação

| Fonte oficial | Situação na verificação | Uso |
|---|---|---|
| [Página de manuais solicitada](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais) | Lista Integração e API de Consultas | Ponto de entrada oficial |
| [Manual de Integração atual](https://pncp.gov.br/manual/pt-br/latest/) | v2.6; data 31/08/2026 no [histórico](https://pncp.gov.br/manual/pt-br/latest/historico_de_versoes/index.html) | Detalhes, dependentes, identidade, domínios e manutenção |
| [Manual de Integração em página única](https://pncp.gov.br/manual/pt-br/latest/singlehtml/) | Mesmo conteúdo v2.6 | Consulta dos capítulos quando a página individual falhar |
| [Manual API de Consultas v1.0](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file) | 41 páginas | Descrições e semântica, confrontadas com OpenAPI atual |
| [Swagger de Consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html) | Contrato vivo inspecionado nesta pesquisa | Rotas, nomes, obrigatoriedade e limites de consulta |
| [PDF de Integração ainda acessível na página filha](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/manual-de-integracao-pncp/@@display-file/file) | v2.5, junho/2026, 433 páginas | Histórico; não substituir v2.6 por esse PDF |
| [Arquivo HTML v2.5](https://pncp.gov.br/manual/pt-br/2.5/singlehtml/index.html) e [versões anteriores](https://www.gov.br/pncp/pt-br/pncp/manuais/versoes-anteriores-do-manual-do-pncp) | Versões arquivadas | Comparação de mudanças quando necessária |

O índice corrente aponta para o HTML v2.6. Resultados de busca e páginas legadas podem apresentar v2.3.11 ou PDF v2.5. Registrar versão, URL e data da especificação usada e rever divergências; `latest` pode mudar.

O manual inteiro inclui usuários, credenciamento, PCA, IRP, atas, contratos/empenhos e órgãos. Esses assuntos foram inventariados; implementar todos esses fluxos não é necessário para o escopo atual. Versões obsoletas não foram relidas integralmente.

## 2. Separar as bases da Consulta e da Integração

| Base | Papel no projeto |
|---|---|
| `https://pncp.gov.br/api/consulta/v1` | Descoberta por publicação, propostas e atualização; também oferece detalhe por identificador no OpenAPI atual |
| `https://pncp.gov.br/api/pncp/v1` | Detalhes e dependentes documentados no Manual de Integração, além de tabelas de domínio |

O [manual de acesso, seção 5](https://pncp.gov.br/manual/pt-br/latest/acesso_ao_pncp/index.html) separa consultas públicas de inserção/retificação/exclusão autenticadas. Os exemplos de leitura de contratação, itens e documentos não incluem Bearer. Este projeto não precisa se credenciar para publicar dados em nome de órgãos; seu tráfego PNCP deve ser GET. A gravação pretendida é no Supabase.

Não presumir que as duas APIs tenham rotas filhas ou envelopes idênticos. O detalhe conhecido em ambas as bases não implica que `/api/consulta/v1/.../itens` exista. Configurar clientes separados, validando TLS; não copiar o `-k` presente em alguns exemplos do manual.

## 3. Rotas de enriquecimento

Para a tabela, **`B = https://pncp.gov.br/api/pncp/v1`** e **`C = /orgaos/{cnpj}/compras/{ano}/{sequencial}`**. Todos são GET.

| Recurso | URL expressa com B e C | Entrada adicional documentada | Fonte |
|---|---|---|---|
| Contratação | `B + C` | Somente os três identificadores no caminho | [Manual §11.5, página única](https://pncp.gov.br/manual/pt-br/latest/singlehtml/) |
| Itens | `B + C + /itens` | `pagina`, `tamanhoPagina` | [§11.13](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html) |
| Um item | `B + C + /itens/{numeroItem}` | Identificador do item | [§11.14](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_item_de_uma_contratacao.html) |
| Metadados dos documentos | `B + C + /arquivos` | Sem query na tabela do manual | [Manual §11.8, página única](https://pncp.gov.br/manual/pt-br/latest/singlehtml/) |
| Um documento | `B + C + /arquivos/{sequencialDocumento}` | Identificador do documento | [§11.9](https://pncp.gov.br/manual/pt-br/latest/contratacao/baixar_documento_de_uma_contratacao.html) |
| Resultados de um item | `B + C + /itens/{numeroItem}/resultados` | Sem query na tabela do manual | [§11.17](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_resultados_de_item_de_uma_contratacao.html) |
| Um resultado | `B + C + /itens/{numeroItem}/resultados/{sequencialResultado}` | Identificador do resultado | [§11.18](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_um_resultado_especifico_de_item_de_uma_contratacao.html) |
| Histórico de eventos | `B + C + /historico` | `pagina`, `tamanhoPagina` | [§11.19](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_historico_da_contratacao.html) |

O [OpenAPI de Consulta](https://pncp.gov.br/api/consulta/swagger-ui/index.html) também documenta `GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}` sobre a base `/api/consulta`; `sequencial` tem mínimo 1. Retorna um detalhe, não uma página de resultados. Não chamar os dois detalhes para cada registro: escolher o necessário e reaproveitar campos já retornados na descoberta.

### Limites que precisam de confirmação no adaptador

**Grau de verificação:** as rotas de enriquecimento acima foram conferidas no Manual de Integração v2.6. O [Swagger de Integração](https://pncp.gov.br/api/pncp/swagger-ui/index.html?configUrl=/pncp-api/v3/api-docs/swagger-config) abriu como página, mas não foi possível obter seu OpenAPI nesta sessão; o cliente local recebeu bloqueio de rede e a leitura web não disponibilizou o JSON. Portanto, este documento não afirma que envelopes, paginação e limites de todos os dependentes tenham sido validados contra o contrato vivo. A verificação real de domínio foi o GET de modalidades descrito na seção 7. Não houve consulta de amostra dos dependentes.

- Itens e histórico têm paginação no manual, mas as tabelas desses capítulos não fixam máximos/defaults. Não transportar o limite da API Consulta para a Integração; verificar o Swagger correspondente e um teste de contrato pequeno.
- “Lista de itens”, “documentos” e “listaResultados” na documentação descrevem conteúdo. Validar o envelope JSON real antes de codificar sua leitura.
- Ausência de query no manual não comprova paginação ilimitada em todas as versões. Conferir o contrato ativo antes de declarar completude de dependentes.
- As páginas individuais §11.5 e §11.8 tiveram falha transitória na pesquisa; o conteúdo foi conferido no HTML integral oficial.

## 4. Enriquecer conforme a necessidade do filtro

1. Persistir os metadados da página de descoberta e liberá-los para pesquisa imediatamente.
2. Filtrar na base os campos já disponíveis: objeto, valores gerais, situação, datas, órgão/unidade e demais campos documentados da descoberta.
3. Se o usuário exigir material/serviço, categoria, catálogo, NCM/NBS, descrição de item, benefício ou critério de julgamento do item, coletar as páginas de itens dos candidatos. **Esses campos de saída não se tornam parâmetros nativos de busca.**
4. Resultados só entram quando o produto precisar de fornecedor ou valores homologados por item. Usar `temResultado` para evitar chamadas sabidamente desnecessárias, respeitando atualização posterior.
5. Coletar metadados dos documentos antes do download. Download, extração/OCR e indexação textual devem ter fila própria e só bloquear a conclusão da pesquisa quando o usuário tiver exigido busca no conteúdo desses arquivos.

Esse desenho reduz chamadas por contratação e transferência de arquivos. Se o filtro depender de itens ou documentos ainda não coletados, manter o resultado como **pendente de enriquecimento**. Nunca transformar “não coletado” em “não corresponde ao filtro”.

### Campos que exigem interpretação cuidadosa

| Dado | Tratamento |
|---|---|
| Valores sigilosos | Em itens sem resultado e `orcamentoSigiloso=true`, o manual prevê valores estimados/totais zero. Preservar o valor original, mas apresentar e filtrar como não divulgado; não classificar como barato ou gratuito. [§11.13](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html) |
| Valores e quantidades | O manual admite até quatro casas decimais nos itens/resultados; usar decimal, evitando perda por ponto flutuante. [§11.14](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_item_de_uma_contratacao.html) |
| Resultado do item | Preservar todos os `sequencialResultado`; não pressupor um único fornecedor ou vencedor por item. `niFornecedor` pode representar pessoa jurídica, física ou estrangeira. [§11.17](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_resultados_de_item_de_uma_contratacao.html) |
| Atualização global | `dataAtualizacaoGlobal` da contratação considera itens, resultados, documentos e imagens. Usar para invalidar enriquecimento; o campo na resposta não autoriza inventar query de mesmo nome. [Manual §11.5](https://pncp.gov.br/manual/pt-br/latest/singlehtml/) |
| Horário das propostas | O Manual API Consultas v1.0 descreve abertura/encerramento em horário de Brasília: página impressa 26, página física 27 do PDF. Para esses campos sem offset, documentar essa interpretação. Se vier offset explícito, preservá-lo. Não generalizar automaticamente para qualquer timestamp de qualquer recurso. [Manual de Consultas](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file) |

## 5. Situação não equivale a prazo aberto

[Situação da contratação, §7.13](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/situacao_da_contratacao.html):

| Código | Situação |
|---|---|
| 1 | Divulgada no PNCP |
| 2 | Revogada |
| 3 | Anulada |
| 4 | Suspensa |

A situação 1 não informa sozinha se propostas podem ser enviadas agora. Definir oportunidade aberta combinando situação, abertura, encerramento e instante de referência; manter estado desconhecido quando faltarem datas necessárias. Estado derivado de tempo precisa ser recalculado mesmo quando não houver nova gravação no PNCP.

[Situação do item, §7.14](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/situacao_do_item_da_contratacao.html): 1 andamento, 2 homologado, 3 anulado/revogado/cancelado, 4 deserto e 5 fracassado. Esse estado é independente da situação global.

## 6. Identidade e CNPJ alfanumérico

Usar `numeroControlePNCP` como identificador externo preservado. Guardar também órgão originário, `anoCompra` e `sequencialCompra`; `numeroCompra` pertence ao sistema de origem e não substitui o sequencial PNCP. A composição e reinício anual do sequencial estão nas [recomendações §6.3–6.7](https://pncp.gov.br/manual/pt-br/latest/recomendacoes_iniciais/index.html).

Chaves de unicidade recomendadas:

- Contratação: `(cnpj_orgao_originario, ano_compra, sequencial_compra)` e número de controle original.
- Item: contratação + `numeroItem`.
- Resultado: item + `sequencialResultado`.
- Documento: contratação + `sequencialDocumento`.

O [histórico atual](https://pncp.gov.br/manual/pt-br/latest/historico_de_versoes/index.html) registra a adaptação para CNPJ alfanumérico na v2.5. O [PDF v2.5, página 2](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/manual-de-integracao-pncp/@@display-file/file) informa que ela abrange campos do portal e APIs. Armazenar CNPJ como texto; preservar zeros e letras, sem remover letras com `\D`, converter para número ou validar exclusivamente com `^[0-9]{14}$`.

Preservar órgão/unidade originários e sub-rogados em campos diferentes. A sub-rogação não autoriza recompor a chave original com o novo órgão.

## 7. Modalidades devem vir do domínio atual

[Manual §7.6](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/consultar_modalidade_de_Contratacao.html): `GET https://pncp.gov.br/api/pncp/v1/modalidades`, com `statusAtivo` booleano opcional. Carregar e armazenar o domínio com data de atualização. Para histórico completo, considerar modalidades inativas pertinentes ao período; filtrar só as ativas pode omitir registros antigos.

O [GET de modalidades](https://pncp.gov.br/api/pncp/v1/modalidades) respondeu com **19 modalidades** em 11/09/2026:

| ID | Nome |
|---|---|
| 1 | Leilão - Eletrônico |
| 2 | Diálogo Competitivo |
| 3 | Concurso |
| 4 | Concorrência - Eletrônica |
| 5 | Concorrência - Presencial |
| 6 | Pregão - Eletrônico |
| 7 | Pregão - Presencial |
| 8 | Dispensa |
| 9 | Inexigibilidade |
| 10 | Manifestação de Interesse |
| 11 | Pré-qualificação |
| 12 | Credenciamento |
| 13 | Leilão - Presencial |
| 14 | Inaplicabilidade da Licitação |
| 15 | Chamada pública |
| 16 | Concorrência – Eletrônica Internacional |
| 17 | Concorrência – Presencial Internacional |
| 18 | Pregão – Eletrônico Internacional |
| 19 | Pregão – Presencial Internacional |

Essa tabela é uma fotografia, não uma lista fechada para o código. Não usar enum fixo de 1 a 14. Se um domínio novo aparecer, preservar o dado, atualizar o catálogo e registrar a mudança. Usar ID como chave; nomes podem mudar.

### Divergência documental a resolver antes de usar modos de disputa

No [manual §7.9](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/consultar_modo_de_disputa.html), a tabela de endpoint repete `/v1/tipos-instrumentos-convocatorios`, enquanto os exemplos de consulta de modos usam `/v1/modos-disputas`. A tentativa de leitura web desse GET também não disponibilizou a resposta nesta sessão; isso não comprova inexistência ou indisponibilidade geral do endpoint. Confirmar no Swagger da Integração e com um GET pequeno antes de implementar esse carregamento. Instrumento convocatório, modalidade e modo de disputa são domínios diferentes.

## 8. Atualizações, exclusões e reconciliação

O PNCP permite retificação e exclusão de metadados, conforme [recomendações §6.2](https://pncp.gov.br/manual/pt-br/latest/recomendacoes_iniciais/index.html). Ingestão somente por publicação não acompanha todas as mudanças.

O [histórico por contratação §11.19](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_historico_da_contratacao.html) informa eventos sobre contratação e dependentes; `tipoLogManutencao` distingue inclusão 0, retificação 1 e exclusão 2. Tipo do recurso e seus sequenciais ajudam a identificar o que precisa ser atualizado. Esse recurso não é um feed global de mudanças.

Requisitos de projeto:

1. Combinar ingestão incremental documentada, reconciliação de registros relevantes e comparação de atualização global.
2. Ao mudar um registro global, invalidar dependentes necessários e reprocessá-los em fila. Usar histórico quando permitir evitar coleta de tudo novamente.
3. Não apagar uma contratação porque ela saiu da listagem de propostas abertas: pode apenas ter encerrado o prazo.
4. Não interpretar erro transitório, resposta vazia ou 404 isolado como exclusão confirmada. Registrar ausência suspeita, verificar depois e manter tombstone quando houver evidência suficiente.
5. A disponibilidade de histórico após exclusão total e a representação de exclusões no fluxo incremental precisam de teste específico. Não prometer que todo desaparecimento será informado como tombstone pela API.
6. Não concluir a busca integral de itens/documentos antes de terminar todas as páginas necessárias, mesmo que a lista principal já esteja pronta.

Não foram encontrados limites oficiais de concorrência ou SLA nos capítulos utilizados. Valores de concorrência, retry e tempo de resposta definidos no plano são configurações iniciais ajustáveis, não garantias do serviço. A validação operacional deve continuar com poucos GETs de contrato e dados locais; não realizar teste de carga no PNCP de produção.
