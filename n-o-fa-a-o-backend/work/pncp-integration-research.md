# PNCP — pesquisa da API de Integração e enriquecimento

Verificação: 2026-09-11. Escopo confirmado: editais/contratações e oportunidades abertas. Documento de pesquisa para consolidação; as sugestões de arquitetura abaixo são recomendações de engenharia, não promessas do PNCP.

## 1. Inventário e precedência das fontes

1. [Página de manuais solicitada](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais): aberta seguindo o link Manuais de sua página filha. Lista **Manual de Integração**, direcionando ao HTML atual, e **Manual de Dados Abertos / API de Consultas v1.0**. Os erros transitórios de abertura direta não demonstram indisponibilidade permanente.
2. [Integração atual — índice](https://pncp.gov.br/manual/pt-br/latest/) e [HTML integral](https://pncp.gov.br/manual/pt-br/latest/singlehtml/): **v2.6, 31/08/2026**, conforme [Histórico de Versões](https://pncp.gov.br/manual/pt-br/latest/historico_de_versoes/index.html), seção 2.1. Inclui novos serviços IRP. A v2.5 introduziu adaptação de CNPJ alfanumérico. Guardar a versão e a data de leitura; `latest` é mutável.
3. [Manual API Consultas v1.0, PDF oficial](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file): **41 páginas**; contrato de consultas está sendo investigado pelo agente principal, inclusive diferenças diante do OpenAPI vivo.
4. [Página filha histórica de Integração](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/manual-de-integracao-pncp) ainda oferece [PDF v2.5](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/manual-de-integracao-pncp/@@display-file/file): **433 páginas, junho/2026**; capa e histórico confirmados. Não é a versão corrente apontada pelo índice atual.
5. [Arquivo HTML v2.5](https://pncp.gov.br/manual/pt-br/2.5/singlehtml/index.html) e [arquivo de versões anteriores](https://www.gov.br/pncp/pt-br/pncp/manuais/versoes-anteriores-do-manual-do-pncp): o arquivo de versões referencia v2.4, série 2.3.x e versões antigas. Úteis para evolução, não para substituir o contrato vigente. Não foram relidas integralmente todas as versões obsoletas.
6. [Índice legado /pncp/manuais](https://www.gov.br/pncp/pt-br/pncp/manuais) apareceu no resultado indexado ainda anunciando v2.3.11. Preferir os links ativos da página solicitada e o histórico corrente.

O manual atual cobre acesso, recomendações, domínios, usuários, PCA, IRP, contratações, atas, contratos/empenhos e órgãos. Para o projeto de leitura, manutenção de usuários, credenciamento, POST/PUT/PATCH/DELETE de publicação e demais fluxos de escrita estão fora do escopo. Não é necessário implementar tudo que o manual descreve para consumir oportunidades.

## 2. Duas APIs com papéis diferentes

[Acesso ao PNCP, seções 5.1–5.4](https://pncp.gov.br/manual/pt-br/latest/acesso_ao_pncp/index.html) fixa a base da Integração em `https://pncp.gov.br/api/pncp`; os serviços descritos usam `/v1/...`. O portal de consultas é público. Inserção, retificação e exclusão exigem credenciamento/autenticação. Exemplos GET de detalhes, itens e documentos não incluem Bearer.

- **API Consulta**: base `https://pncp.gov.br/api/consulta/v1`; descoberta em listas por critérios documentados no OpenAPI, tratada no trabalho principal.
- **API Integração**: base `https://pncp.gov.br/api/pncp/v1`; enriquecimento de um registro conhecido, seus dependentes e domínios. O nome Integração não significa que todos os GET precisem login, nem que essa API deva publicar dados em nome do usuário.
- Proibir por design métodos de escrita ao PNCP neste projeto. Escrever somente na base Supabase da aplicação.
- Os exemplos do manual usam `curl -k`; a implementação deve validar TLS normalmente. Não copiar a desativação da validação do certificado.

## 3. GET de enriquecimento verificados no manual atual

Nos caminhos abaixo, a base é `https://pncp.gov.br/api/pncp/v1`; `C = /orgaos/{cnpj}/compras/{ano}/{sequencial}`. Usar CNPJ/ano/sequencial retornados pelo PNCP, não `numeroCompra`, que é o número no sistema de origem.

| Recurso | Caminho GET após a base | Entrada adicional | Fonte |
|---|---|---|---|
| Detalhe da contratação | `C` | Nenhuma query documentada | [Manual integral §11.5](https://pncp.gov.br/manual/pt-br/latest/singlehtml/#consultar-uma-contratacao) |
| Lista de itens | `C/itens` | `pagina`, `tamanhoPagina` | [§11.13](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html) |
| Item específico | `C/itens/{numeroItem}` | Identificador do item | [§11.14](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_item_de_uma_contratacao.html) |
| Metadados dos documentos | `C/arquivos` | Sem paginação na tabela do manual | [Manual integral §11.8](https://pncp.gov.br/manual/pt-br/latest/singlehtml/#consultar-todos-documentos-de-uma-contratacao) |
| Baixar documento | `C/arquivos/{sequencialDocumento}` | Identificador do documento | [§11.9](https://pncp.gov.br/manual/pt-br/latest/contratacao/baixar_documento_de_uma_contratacao.html) |
| Resultados de um item | `C/itens/{numeroItem}/resultados` | Sem paginação na tabela do manual | [§11.17](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_resultados_de_item_de_uma_contratacao.html) |
| Resultado específico | `C/itens/{numeroItem}/resultados/{sequencialResultado}` | Identificador do resultado | [§11.18](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_um_resultado_especifico_de_item_de_uma_contratacao.html) |
| Eventos da contratação | `C/historico` | `pagina`, `tamanhoPagina` | [§11.19](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_historico_da_contratacao.html) |

As páginas paginadas de detalhe e lista de documentos deram 502 nesta sessão, mas os mesmos capítulos foram lidos no HTML integral oficial. O manual não especifica máximos/defaults de paginação para itens/histórico nessas tabelas: **não extrapolar os limites da API Consulta**. Confirmar o OpenAPI da Integração e um teste de contrato pequeno antes de implementar o adaptador. A representação de uma lista no texto do manual não prova que o JSON real tenha um envelope de mesmo nome; confirmar a resposta e preservar o payload original.

### Campos de maior impacto

- **Detalhe**: `numeroControlePNCP`, `anoCompra`, `numeroCompra`, `objetoCompra`, `informacaoComplementar`, `modalidadeId`, `modoDisputaId`, `situacaoCompraId`, `srp`, datas, órgão/unidade e `dataAtualizacaoGlobal`. Este último considera mudanças em itens, resultados, documentos e imagens. É marcador útil para invalidar enriquecimentos; não é, por si só, um filtro de entrada aceito em qualquer endpoint. [Manual integral §11.5](https://pncp.gov.br/manual/pt-br/latest/singlehtml/#consultar-uma-contratacao)
- **Itens**: descrição, material/serviço, categoria, catálogo/código do item, NCM/NBS, benefícios, critério, valores, situação, `temResultado`, `orcamentoSigiloso`, `dataAtualizacao`. Campos de saída não são filtros nativos automaticamente. Se `orcamentoSigiloso=true` e sem resultado, o manual prevê valores estimados/totais iguais a zero: tratar como valor não divulgado no filtro de preço. Valores/quantidades têm até quatro casas decimais; usar representação decimal. [§11.13](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html)
- **Documentos**: metadados trazem sequencial, URL, tipo, título, publicação. Guardar metadados primeiro; baixar e indexar conteúdo em fila separada quando o produto realmente pedir busca em arquivos. [Manual integral §11.8](https://pncp.gov.br/manual/pt-br/latest/singlehtml/#consultar-todos-documentos-de-uma-contratacao)
- **Resultados**: um item pode ter lista de resultados; preservar `sequencialResultado`. Há identificador de fornecedor (`niFornecedor`, podendo ser CNPJ/CPF/estrangeiro), situação, cancelamento, data de atualização, valores homologados e dados de reserva/remanescente. Evitar assumir fornecedor único e já disponível numa oportunidade recém-publicada. [§11.17](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_resultados_de_item_de_uma_contratacao.html)
- **Histórico**: por contratação, abrange itens/resultados/documentos. `tipoLogManutencao` distingue inclusão 0, retificação 1 e exclusão 2; `categoriaLogManutencao` identifica recurso; sequenciais permitem localizar dependentes. Não equivale a um feed global de mudanças. [§11.19](https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_historico_da_contratacao.html)

## 4. Situações e oportunidade aberta

[Situação da contratação §7.13](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/situacao_da_contratacao.html): 1 divulgada, 2 revogada, 3 anulada, 4 suspensa. Situação 1 **não significa** recebendo propostas agora. Definir estado de oportunidade combinando situação, início/fim do recebimento, instante de referência e qualidade das datas. Datas ausentes ou inválidas exigem estado desconhecido, não inventar abertura ou fechamento.

[Situação do item §7.14](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/situacao_do_item_da_contratacao.html): 1 andamento, 2 homologado, 3 anulado/revogado/cancelado, 4 deserto, 5 fracassado. Situação do item e situação global da contratação são eixos diferentes.

Uma oportunidade pode sair da listagem de propostas abertas pelo encerramento normal do prazo ou por retificação. Ausência dessa listagem não comprova exclusão. A atualização de status derivado ao passar do tempo deve funcionar mesmo quando não houver nova gravação externa no PNCP.

## 5. Modalidades: carregar da fonte, não congelar a lista

[Manual §7.6](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/consultar_modalidade_de_Contratacao.html): GET `/modalidades`, query opcional `statusAtivo` booleano. Retorna ID, nome, descrição, inclusão/atualização e atividade. Para ingestão histórica de todas as modalidades, não selecionar apenas as hoje ativas; incluir modalidades desativadas pertinentes ao período.

O [GET público de modalidades](https://pncp.gov.br/api/pncp/v1/modalidades) retornou **19 modalidades** em 11/09/2026:

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

Os nomes são dados de domínio; a chave deve ser o ID. A resposta também continha `irp`; aceitar novos campos, preservar JSON e alertar sobre mudanças importantes de esquema. Evitar `for id in 1..14`, pois já perderia cinco modalidades atuais.

O manual tem erro documental em [§7.9 Modos de Disputa](https://pncp.gov.br/manual/pt-br/latest/tabelas_de_dominio/consultar_modo_de_disputa.html): tabela de endpoint repete `/v1/tipos-instrumentos-convocatorios`, enquanto exemplos cURL usam `/v1/modos-disputas`. Não resolver a divergência cegamente; conferir OpenAPI da Integração. O parâmetro `statusAtivo` é descrito no capítulo. Instrumento convocatório, modalidade e modo de disputa não são intercambiáveis.

## 6. Identidade, mudanças e exclusões

[Recomendações §6.2–6.7](https://pncp.gov.br/manual/pt-br/latest/recomendacoes_iniciais/index.html): PNCP permite retificações e exclusões; número de controle identifica o registro. Para contratação, o identificador contém CNPJ, marcador 1, sequencial PNCP e ano; o sequencial recomeça a cada ano. Armazenar `numeroControlePNCP` original e ter unicidade também em `(cnpj, anoCompra, sequencialCompra)` quando disponíveis. Item: adicionar `numeroItem`; resultado: adicionar `sequencialResultado`.

O [PDF v2.5, página 2](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/manual-de-integracao-pncp/@@display-file/file) declara que a mudança de CNPJ alfanumérico abrange campos do portal e APIs. Não usar inteiro, remover letras com `\D`, nem restringir CNPJ a `^[0-9]{14}$`. Preservar identificadores como texto.

Recomendações técnicas decorrentes:

1. Publicações novas não bastam para manter a base atual: precisa do fluxo de atualização global documentado na API Consulta e de reconciliação dos registros relevantes.
2. Ao detectar mudança global, invalidar estados de enriquecimento. Não refazer automaticamente todos os anexos; priorizar recursos necessários e usar histórico quando ajudar a localizar alteração.
3. Uma falha temporária, 404 isolado ou lista vazia não deve apagar imediatamente o registro Supabase. Separar suspeita de ausência, verificação posterior e exclusão confirmada; tombstone mantém rastreabilidade.
4. Não assumir que o endpoint de atualizações divulgue tombstones de exclusão total sem verificar. O histórico por contratação fornece evidência localizada, mas sua disponibilidade depois da exclusão total não foi comprovada.
5. Não fazer N chamadas de detalhe para preencher campos já disponíveis na página de descoberta. Buscar dependentes sob demanda ou em filas de baixa prioridade; salvar resultados progressivamente.

## 7. Pontos pendentes para testes de contrato do projeto

- OpenAPI vivo da API Integração: verificar envelopes, limites/defaults de itens/histórico e nomes de campos não demonstrados por resposta real nesta pesquisa.
- Ordenação e estabilidade da paginação de itens/histórico sob retificação.
- Semântica de HTTP 204, 404 e lista vazia em cada endpoint.
- Evidência de exclusão total no fluxo incremental e histórico após exclusão.
- Origem/timezone dos timestamps sem offset; não converter silenciosamente como UTC.
- Valores nulos, zero sigiloso, documentos cancelados/removidos, sub-rogação de órgão e CNPJ alfanumérico.
- Limites de concorrência/SLA/rate limit não foram encontrados nos capítulos lidos. Escolher valores conservadores configuráveis e observar 429, Retry-After, latência e falhas; nunca apresentá-los como limite oficial.

Não foram executados testes de carga, consultas de escrita nem alterações no Supabase. Houve leitura da documentação e um GET público pequeno da tabela de modalidades.
