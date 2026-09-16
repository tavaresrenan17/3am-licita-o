# Bid Navigator

## Sincronização automática do PNCP

O workflow [`.github/workflows/sincronizacao-pncp.yml`](.github/workflows/sincronizacao-pncp.yml)
executa a descoberta de oportunidades abertas de SP e a atualização incremental
a cada três horas. Ele também pode ser iniciado manualmente na aba **Actions**
do GitHub.

Cadastre estes secrets no repositório em **Settings → Secrets and variables →
Actions**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

O workflow usa concorrência única, checkpoint no Supabase e limite de 150
minutos por comando. Se o PNCP ficar indisponível ou a janela terminar, a
execução falha de forma visível e o próximo agendamento retoma a página salva.
Os anexos não são baixados nessa rotina; o app mantém o link oficial do PNCP.

Quero criar uma aplicação web MVP para apoiar o departamento de licitações da minha empresa, que atua no setor de construção civil. Meu projeto se chamará: 3AM LICITAÇÃO.

A aplicação deve consultar dados do PNCP por meio de uma API, salvar as licitações e documentos no banco de dados, e depois permitir que minha equipe analise essas oportunidades usando filtros aplicados somente sobre os dados já salvos no banco.

Contexto:

Minha API consulta o PNCP e retorna licitações em aberto, junto com documentos publicados, como EDITAL, PROJETOS, ORÇAMENTOS, ANEXOS e outros. Quero que o app ajude a equipe a encontrar rapidamente as melhores oportunidades para construção civil.

Objetivo:

Criar uma versão mais otimizada, organizada e enxuta do meu projeto antigo, mantendo apenas as páginas essenciais da MVP.

Páginas da MVP:

- Dashboard

- Sincronização PNCP

- Licitações Salvas

- Detalhe da Licitação

- Configurações

Não criar nesta MVP:

- Históricos de contratos

- Portal de compras públicas separado

- Logs técnicos avançados

- Módulo comercial separado

- Páginas administrativas complexas

- Landing page ou página de marketing

Separação principal:

A aplicação deve separar claramente duas responsabilidades:

1. Sincronização PNCP:

Tela focada exclusivamente em consultar a API do PNCP, importar novas licitações e atualizar registros existentes no banco.

2. Licitações Salvas:

Tela focada exclusivamente em analisar, pesquisar e filtrar as licitações que já estão salvas no banco de dados.

A tela “Licitações Salvas” NÃO deve fazer requisições diretas ao PNCP. Ela deve consultar somente o banco de dados da aplicação.

Fluxo esperado:

1. O usuário acessa “Sincronização PNCP”.

2. Configura ou confirma os parâmetros de busca.

3. Clica em “Sincronizar PNCP”.

4. O sistema consulta a API do PNCP.

5. O sistema exibe uma barra de progresso da requisição/sincronização.

6. O sistema salva novas licitações e documentos no banco.

7. O sistema atualiza licitações já existentes quando houver mudanças.

8. O usuário acessa “Licitações Salvas”.

9. Ali ele filtra, analisa, prioriza e classifica oportunidades usando somente os dados do banco.

Tela Dashboard:

Mostrar uma visão geral com:

- Total de licitações salvas

- Novas licitações encontradas na última sincronização

- Licitações atualizadas na última sincronização

- Licitações com prazo próximo

- Valor estimado total das oportunidades

- Quantidade de oportunidades prioritárias

- Principais estados/municípios com oportunidades

- Data e hora da última sincronização

- Atalho para acessar “Sincronização PNCP”

- Atalho para acessar “Licitações Salvas”

Tela Sincronização PNCP:

Essa tela deve ser focada exclusivamente em importar e atualizar dados vindos da API do PNCP.

Deve conter:

- Botão “Sincronizar PNCP”

- Status da sincronização: nunca sincronizado, em andamento, concluído, concluído com erros ou falhou

- Data e hora da última sincronização

- Parâmetros da consulta à API

- Barra de progresso visual da sincronização

- Percentual de progresso

- Etapa atual da sincronização

- Quantidade de páginas consultadas

- Quantidade total estimada de páginas, quando disponível

- Quantidade de registros consultados na API

- Quantidade de novas licitações importadas

- Quantidade de licitações atualizadas

- Quantidade de documentos importados

- Quantidade de registros ignorados por duplicidade

- Tempo decorrido da sincronização

- Erros da última sincronização, se existirem

A barra de progresso deve funcionar durante a requisição da API e sincronização dos dados.

Quando a API permitir paginação, calcular o progresso com base nas páginas consultadas em relação ao total de páginas.

Quando o total não estiver disponível, usar progresso indeterminado, mas ainda mostrar a etapa atual, registros processados e tempo decorrido.

Etapas sugeridas da sincronização:

- Preparando consulta

- Consultando PNCP

- Processando licitações

- Baixando metadados dos documentos

- Salvando novas licitações

- Atualizando registros existentes

- Finalizando sincronização

Parâmetros configuráveis para busca no PNCP:

- Período de publicação

- UF

- Município

- Modalidade

- Situação da contratação

- Palavras-chave iniciais

- Buscar apenas licitações abertas

- Buscar documentos vinculados

Importante:

A tela “Sincronização PNCP” NÃO deve ser usada para análise comercial ou filtragem detalhada das oportunidades. Ela serve apenas para trazer dados novos para dentro do banco.

Tela Licitações Salvas:

Essa tela deve trabalhar apenas com dados já salvos no banco de dados.

Deve conter uma tabela organizada com:

- Órgão

- Município

- UF

- Objeto

- Valor estimado

- Data de publicação

- Data limite de proposta

- Modalidade

- Status PNCP

- Status interno

- Categoria

- Quantidade de documentos

- Indicador ou score de aderência à construção civil

- Prioridade

Filtros da tela Licitações Salvas:

- Palavra-chave no objeto

- UF

- Município

- Órgão

- Modalidade

- Valor mínimo e máximo

- Data de publicação

- Data limite de proposta

- Status interno

- Prioridade

- Categoria

- Com edital

- Com projeto

- Com orçamento

- Apenas oportunidades ainda não analisadas

- Apenas oportunidades recomendadas

Filtros padrão para construção civil:

Permitir salvar e editar palavras-chave como:

- obra

- construção

- reforma

- engenharia

- pavimentação

- drenagem

- manutenção predial

- infraestrutura

- escola

- hospital

- praça

- urbanização

- terraplenagem

- concreto

- cobertura

- elétrica

- hidráulica

Ações na tela Licitações Salvas:

- Abrir detalhe da licitação

- Marcar como nova

- Marcar como em análise

- Marcar como interessante

- Marcar como descartada

- Marcar como proposta enviada

- Marcar ou remover prioridade

- Adicionar observação interna rápida

- Ordenar por prazo, valor, publicação e score de aderência

Tela Detalhe da Licitação:

Ao clicar em uma licitação, abrir uma página com:

- Dados completos da licitação

- Objeto completo

- Órgão contratante

- CNPJ do órgão

- Município

- UF

- Valor estimado

- Data de publicação

- Data limite de proposta

- Modalidade

- Status PNCP

- Link original no PNCP

- Lista de documentos vinculados

- Documentos agrupados por tipo: edital, projeto, orçamento, anexos e outros

- Campo de status interno

- Campo de observações internas da equipe

- Botão para marcar como oportunidade prioritária

- Histórico simples de alterações internas, se possível

Tela Configurações:

Permitir configurar:

- URL base da minha API intermediária do PNCP

- Token/chave da API, se necessário

- Palavras-chave padrão para construção civil

- Filtros padrão de sincronização

- Preferências de exibição da tabela

- Quantidade de itens por página

- Regras básicas de score de aderência

Banco de dados:

Criar estrutura preparada para persistência permanente das licitações importadas.

Tabelas sugeridas:

- licitacoes

- documentos_licitacao

- sincronizacoes

- filtros_salvos

- observacoes_licitacao ou campos internos na própria tabela de licitações

Tabela licitacoes:

- id

- pncp_id ou chave única equivalente

- orgao

- cnpj_orgao

- municipio

- uf

- objeto

- valor_estimado

- data_publicacao

- data_limite_proposta

- modalidade

- status_pncp

- categoria

- url_pncp

- score_aderencia

- status_interno

- observacoes

- prioridade

- created_at

- updated_at

- synced_at

Tabela documentos_licitacao:

- id

- licitacao_id

- tipo_documento

- nome

- url

- data_publicacao

- created_at

Tabela sincronizacoes:

- id

- inicio_em

- finalizado_em

- status

- parametros_consulta

- total_registros_consultados

- total_novos

- total_atualizados

- total_documentos

- total_ignorados

- mensagem_erro

- created_at

Lógica de sincronização incremental:

- Salvar a data/hora da última sincronização concluída

- Nas próximas sincronizações, buscar apenas registros novos ou atualizados após a última sincronização

- Usar uma chave única da licitação vinda do PNCP para evitar duplicidade

- Se uma licitação já existir, atualizar somente os campos vindos do PNCP que mudaram

- Preservar campos internos da equipe, como status_interno, observacoes e prioridade

- Se a licitação for nova, inserir no banco

- Salvar documentos vinculados à licitação

- Evitar documentos duplicados usando uma chave única ou combinação de licitacao_id + url/nome/tipo

- Registrar cada sincronização na tabela sincronizacoes

Score de aderência:

Criar um cálculo simples para indicar se a licitação parece adequada para construção civil.

O score pode considerar:

- Palavras-chave no objeto

- Modalidade

- Valor estimado

- Existência de documentos de projeto/orçamento

- Categoria ou tipo de contratação

Design:

Criar uma interface profissional, escura, moderna e densa, parecida com um sistema interno de análise de dados.

Usar:

- Sidebar lateral

- Cards de métricas

- Tabelas amplas

- Filtros organizados

- Badges de status

- Ícones discretos

- Barra de progresso na sincronização

- Layout responsivo para desktop e notebook

A primeira tela deve ser útil de imediato, sem hero section, sem landing page e sem conteúdo de marketing.

Referência visual:

Usar como inspiração um dashboard escuro com menu lateral, cards de métricas e tabela central de licitações, mas reorganizar a experiência para ser mais limpa, objetiva e focada na MVP.

Dados mockados:

Enquanto a API real não estiver conectada, usar dados mockados realistas de licitações de construção civil, incluindo:

- Obras públicas

- Reformas

- Pavimentação

- Drenagem

- Infraestrutura urbana

- Construção de escolas, postos de saúde e praças

- Documentos simulados como edital, projeto básico, planilha orçamentária e anexos

Requisitos técnicos:

- Preparar o código para conectar minha API real do PNCP depois

- Separar bem a camada de consulta à API da camada de consulta ao banco

- Criar funções/serviços separados para sincronização PNCP

- Criar funções/serviços separados para filtros no banco

- Priorizar performance para muitas linhas

- A tabela deve permitir busca, filtros, ordenação e paginação

- Criar estados vazios, carregando, sucesso e erro

- Manter o código organizado e fácil de evoluir

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7f4b116e-ac4d-4015-a7f3-0e4a1d15977c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
