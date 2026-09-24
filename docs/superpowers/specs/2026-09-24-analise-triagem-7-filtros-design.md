# Análise por IA: triagem pelos 7 filtros da engenharia

Data: 24/09/2026 · Estado: desenho aprovado em conversa, aguardando revisão desta especificação.

## 1. Objetivo

A análise por IA deixa de ser o "parecer de Engenheiro Chefe + roteiro de 3 partes" e passa
a ser uma **triagem**: a engenheira abre o painel e decide em poucos minutos se a empresa
participa. A IA lê o edital e seus anexos e responde, com evidência do texto, os 7 filtros
que a engenharia usa (distância, qualificação econômico-financeira, capacidade técnica,
garantias, visita técnica, inexequibilidade, subcontratação), os dados gerais do certame,
um veredito, uma nota de aderência de 0 a 10, as providências e os alertas.

O prompt é o texto fornecido pela equipe (Apêndice A), usado **literalmente**. Tudo o que a
IA recebia antes — prompt, "memória" do guia técnico 2026, catálogo das 3 partes, parecer —
é descartado.

**Sucesso:** para uma licitação com documentos baixados, o painel mostra veredito, nota,
impeditivos, providências e os 7 filtros com evidências conferidas no edital; os valores em
R$ batem com a conta; os dados da empresa usados na comparação ficam registrados.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Dados da empresa | Página própria "Dados da empresa" no menu lateral, salva no banco |
| Distância | Calculada pelo sistema (Haversine entre municípios pelo código IBGE), enviada à IA anotada como "linha reta" — mesmo critério do filtro por raio da lista |
| Proteções mantidas | Leitura integral dos anexos + busca temática; conferência dos trechos citados; conteúdo do edital tratado como não confiável; análise salva é definitiva |
| Conferências novas | Contas em R$ refeitas pelo sistema; veredito recalculado pela regra do prompt |
| Análises antigas (v1/v2) | Mostram só veredito e resumo antigos, com aviso e "Refazer análise"; os componentes de exibição antigos são removidos |
| Refazer ao mudar os dados da empresa | Fora do escopo: a regra "análise salva é definitiva" continua |
| Modelo | Continua configurável pelo `.env` (`ANALISE_MODELO`, hoje `gpt-4o-mini`); a escolha final sai da validação com editais reais (§9) |

Alternativas descartadas: manter a análise antiga ao lado da triagem (duas IAs para manter,
contra o pedido de desconsiderar o que existia); enviar o PDF direto ao modelo (perde a
conferência de trechos e prende a um provedor com upload de arquivo).

## 3. Fluxo no servidor

```
licitação ─┬─ documentos (texto integral em blocos) ─┐
           ├─ busca temática (7 filtros + dados gerais) ─┤
           │                                          ├─► mensagem do usuário (edital, não confiável)
dados da empresa ─┬─► prompt do Apêndice A com {{...}} preenchidos ─► mensagem de sistema
distância (IBGE) ─┤
data de hoje (SP) ┘
                         modelo ─► JSON ─► leitura (schema v3) ─► conferências ─► salva
```

### 3.1 Montagem do prompt

- O texto do Apêndice A fica num módulo próprio (`src/services/analise/prompt.ts`) e é a
  **mensagem de sistema**. O servidor só substitui os marcadores:

  | Marcador | Origem |
  |---|---|
  | `{{NOME_EMPRESA}}`, `{{ME_EPP_OU_NAO}}`, `{{LG}}`, `{{SG}}`, `{{LC}}`, `{{PATRIMONIO_LIQUIDO}}`, `{{CAPITAL_SOCIAL}}`, `{{LISTA_ATESTADOS}}`, `{{RESPONSAVEIS_TECNICOS_E_REGISTRO}}`, `{{RAIO_OK_KM}}`, `{{RAIO_MAX_KM}}` | página Dados da empresa |
  | `{{CIDADE_BASE}}` | município escolhido na página, no formato "Nome/UF" |
  | `{{DISTANCIA_KM}}` | distância em km entre o município da licitação e a cidade-base, com a anotação "em linha reta entre municípios, calculada pelo sistema"; vazio quando falta um dos códigos IBGE |
  | `{{DATA_ATUAL}}` | data de hoje em DD/MM/AAAA, fuso America/Sao_Paulo |

  Campo da empresa em branco é substituído por texto vazio, para a IA marcar
  `SEM_DADOS_EMPRESA` como o prompt instrui. Nenhum `{{` pode sobrar no texto final.
- O **edital** vai na mensagem do usuário: os blocos de texto integral dos documentos
  ativos e os trechos da busca temática, dentro de delimitadores de conteúdo não confiável
  (o edital nunca dá instruções à IA). A mensagem de sistema fixa do gerador
  ("consultor sênior…") é removida.
- A **busca temática** (`CONSULTAS_TEMATICAS`) passa a mirar: local de execução e
  exigências logísticas; qualificação econômico-financeira; qualificação técnica; garantias;
  visita técnica; inexequibilidade; subcontratação; dados gerais (sessão, plataforma,
  critério, modo de disputa, ME/EPP).

### 3.2 Leitura da resposta (formato v3)

- `PROMPT_VERSAO` passa a `"v3"`; o resultado salvo leva `formato: "v3"`.
- O schema espelha o JSON do Apêndice A. Tolerâncias:
  - crases de markdown em volta do JSON são removidas antes do parse;
  - status fora de `OK | ATENCAO | IMPEDITIVO | NAO_ENCONTRADO | SEM_DADOS_EMPRESA` vira
    `NAO_ENCONTRADO`;
  - campo ausente vira `null` (ou lista vazia);
  - resposta que não é JSON válido é erro, com a mensagem "Refazer análise".

### 3.3 Conferências (depois da IA, antes de salvar)

O sistema não reescreve o que a IA disse; marca e, nos dois casos determinísticos abaixo,
corrige e registra o motivo.

1. **Evidências.** Cada `evidencia.trecho` é procurado no texto de todos os documentos com a
   mesma normalização de hoje (`normalizarParaComparar`): sem acento, sem caixa, sem
   hifenização de quebra de linha, reticências separando pedaços. Resultado gravado em
   `evidencia.confirmado` (true/false).
2. **Contas em R$** (quando há `valor_estimado`, sem orçamento sigiloso):
   - garantia de proposta e garantia contratual = valor estimado × percentual (na
     contratual é aproximação: na triagem o contrato ainda não tem valor);
   - preço mínimo exequível = 75% do valor estimado, ou o percentual do edital quando
     `percentual_edital` existir; limite da garantia adicional = 85%.
   O valor do sistema é gravado ao lado do da IA; divergência acima de R$ 0,01 gera alerta
   do sistema e a tela mostra o valor calculado.
3. **Veredito pela regra do prompt**, como função dos status dos 7 filtros:
   - algum `IMPEDITIVO` → `NAO_RECOMENDADO`;
   - nenhum impeditivo e algum filtro diferente de `OK` → `PARTICIPAR_COM_RESSALVAS`;
   - todos `OK` → `RECOMENDADO`.
   Todos os filtros contam como "importantes" (o prompt não define quais são): um único
   `NAO_ENCONTRADO` impede `RECOMENDADO`. Se a IA divergir, vale a regra e entra um alerta
   do sistema explicando a correção.

Os alertas do sistema ficam separados dos alertas da IA (`alertas_sistema`).

### 3.4 Registro dos dados usados

O resultado salvo leva `contexto_empresa`: cópia dos dados da empresa e da data da última
atualização deles no momento da análise, e a distância enviada. A tela mostra "comparado com
os dados da empresa de DD/MM/AAAA".

### 3.5 O que continua igual

Trava (lease) contra duas gerações simultâneas, fingerprint, "análise salva é definitiva",
refazer só para formato antigo, cobertura dos documentos (completa/parcial/indisponível).

## 4. Dados da empresa

### 4.1 Armazenamento

Migração (colada no SQL Editor, com o arquivo `supabase/APLICAR-DADOS-EMPRESA.sql`, padrão do
projeto) acrescentando à tabela de linha única `public.configuracoes`:

- `dados_empresa jsonb not null default '{}'`
- `dados_empresa_atualizado_em timestamptz`

Sem política nova de RLS: o acesso continua pelas server functions com service role.

### 4.2 Campos (todos opcionais)

| Campo | Tipo | Observação |
|---|---|---|
| `nome` | texto | |
| `cidade_base_ibge` | código IBGE (7 dígitos) | padrão 3546405, Santa Cruz do Rio Pardo/SP |
| `raio_ok_km`, `raio_max_km` | número ≥ 0 | `raio_ok_km` ≤ `raio_max_km` |
| `enquadramento` | `ME` \| `EPP` \| `NAO_ENQUADRADA` | |
| `lg`, `sg`, `lc` | número, 2 casas | |
| `patrimonio_liquido`, `capital_social` | R$ | |
| `atestados` | lista de textos (um por linha na tela) | |
| `responsaveis_tecnicos` | lista de textos (um por linha na tela) | ex.: "Maria Silva, eng. civil, CREA-SP 123456, sócia" |

Validação com zod no servidor; a mesma definição alimenta o formulário.

### 4.3 Página

Rota `/dados-empresa`, item "Dados da empresa" no menu lateral abaixo de Sincronização.
Formulário com os campos acima, cidade-base por busca na tabela de municípios, botão Salvar e
a data da última atualização. Server functions `obterDadosEmpresaFn` e `salvarDadosEmpresaFn`.

## 5. Tela da análise

### 5.1 Painel lateral (`AnaliseLicitacaoSheet`)

Ordem de leitura:

1. **Veredito:** selo (verde Recomendado · âmbar Participar com ressalvas · vermelho Não
   recomendado), nota X/10, resumo; em letra pequena: "comparado com os dados da empresa de
   DD/MM/AAAA", modelo e data.
2. **Impeditivos** em destaque vermelho, quando houver.
3. **Providências** em ordem de prioridade, com prazo.
4. **Os 7 filtros:** uma linha por filtro com selo de status (OK verde, Atenção âmbar,
   Impeditivo vermelho, Não encontrado e Sem dados da empresa em cinza) e a observação.
   Clicar expande o detalhe específico do filtro (índices exigidos × empresa, atestados que
   cobrem cada exigência, garantias com valores, contato da visita etc.) e a evidência
   ("item X — 'trecho'") com selo confirmado / não confirmado. Filtros em Impeditivo e
   Atenção abrem expandidos.
5. **Dados gerais:** quadro de fatos.
6. **Alertas:** os da IA e os do sistema (veredito corrigido, conta divergente).

Cores dos selos com os tokens existentes (`success`, `warning`, `destructive`, `muted`).
Nenhum texto padrão em roxo (`brand`).

### 5.2 Quadro na ficha (`licitacoes.$id.tsx`)

Selo da recomendação, nota X/10, resumo em até 3 linhas e o botão que abre o painel.

### 5.3 Análises antigas

`formato` ausente (v1) ou `"v2"`: o painel mostra veredito e resumo antigos, o aviso de
formato antigo e "Refazer análise". Os componentes de exibição das 3 partes e do parecer
são removidos.

## 6. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/services/analise/prompt.ts` | **novo**: texto do Apêndice A e o preenchimento dos marcadores |
| `src/services/analise/contrato.ts` | schema v3, `PROMPT_VERSAO = "v3"`, consultas temáticas novas; remove o catálogo das 3 partes e a conferência v2 |
| `src/services/analise/conferencias.ts` | **novo**: evidências, contas em R$, regra do veredito |
| `src/services/analise/contexto.ts` | monta a mensagem do edital; remove o prompt antigo |
| `src/services/analise/gerador.server.ts` | `gerar` recebe mensagem de sistema e do usuário; remove o sistema fixo |
| `src/services/analise/orquestrador.server.ts` | carrega dados da empresa e distância, aplica conferências, grava `contexto_empresa` |
| `src/services/analise/repositorio.analise.server.ts` | leitura dos dados da empresa e das coordenadas dos municípios |
| `src/services/analise/guiaTecnico2026.ts` (+ teste) | **removido** |
| `src/services/analise/apresentacao.ts` | selos e textos do veredito v3; formato antigo = v1 ou v2 |
| `src/services/empresa/*` | **novo**: schema zod, repositório e server functions dos dados da empresa |
| `src/lib/dto.ts` | tipos do resultado v3 e dos dados da empresa |
| `src/routes/dados-empresa.tsx` | **nova** página |
| `src/components/AppShell.tsx` | item de menu |
| `src/components/AnaliseLicitacaoSheet.tsx` | painel refeito (§5.1) |
| `src/components/analise/AnaliseTriagem.tsx` | **novo**: veredito, filtros, dados gerais, alertas |
| `src/components/analise/AnaliseTresPartes.tsx` | **removido** |
| `src/routes/licitacoes.$id.tsx` | quadro da ficha (§5.2) |
| `supabase/migrations/20260924120000_dados_empresa.sql` + `supabase/APLICAR-DADOS-EMPRESA.sql` | **novos** |
| testes de `contrato`, `contexto`, `orquestrador`, `apresentacao`, fixtures | atualizados para v3 |

## 7. Erros e casos-limite

- Sem texto nos documentos: erro atual ("Nenhum texto disponível…"), inalterado.
- Licitação ou cidade-base sem código IBGE: `{{DISTANCIA_KM}}` vazio; a IA estima e marca
  `distancia_estimada: true`, como o prompt manda.
- Dados da empresa nunca preenchidos: todos os marcadores da empresa vazios; a análise roda
  e as comparações saem `SEM_DADOS_EMPRESA`.
- Orçamento sigiloso ou sem valor estimado: nenhuma conta em R$.
- Resposta truncada ou inválida: erro com "Refazer análise"; nada é salvo como pronto.

## 8. Testes automáticos (escritos antes do código)

- Prompt: todos os marcadores preenchidos, nenhum `{{` restante; vazio vira vazio; distância
  com anotação de linha reta; data em DD/MM/AAAA no fuso de São Paulo.
- Leitura v3: aceita o exemplo do Apêndice A preenchido; remove crases; status inválido vira
  `NAO_ENCONTRADO`; ausentes viram nulo; não-JSON dá erro.
- Evidências: trecho existente confirmado; inexistente não confirmado.
- Contas: garantias, 75%, 85%, percentual do edital; divergência gera alerta; sigiloso não
  calcula.
- Veredito: as três regras e o alerta de correção.
- Dados da empresa: validação (números, raio preferencial ≤ aceitável, IBGE com 7 dígitos).
- Apresentação: selos v3; v1 e v2 caem em formato antigo.

## 9. Validação com editais reais (antes de dar por pronto)

1. Aplicar a migração e provar leitura e gravação dos dados da empresa pelo app.
2. Rodar a análise em 3 licitações com documentos baixados: um pregão de locação, uma obra
   de engenharia e uma dispensa.
3. Medir por licitação: evidências confirmadas / total; filtros `NAO_ENCONTRADO` que estão no
   edital (conferência manual); contas corretas; tempo e custo.
4. Repetir com um modelo mais forte que o `gpt-4o-mini` e apresentar o comparativo para a
   escolha do modelo.
5. Abrir o app e conferir o painel e a página Dados da empresa na tela.

## 10. Fora do escopo

- Refazer análise quando os dados da empresa mudam.
- Distância rodoviária (continua linha reta).
- Exibir veredito ou nota da IA na listagem de licitações.
- Retenção automática de licitações encerradas (próximo trabalho, já combinado).

## Apêndice A — Prompt da equipe (usado literalmente)

````text
Você é um analista sênior de licitações públicas, especialista na Lei nº 14.133/2021, trabalhando para uma empresa de locação de equipamentos de construção e execução de obras. Sua função é fazer a TRIAGEM de editais: ler o edital (e anexos, termo de referência, projeto básico, minuta de contrato) e extrair, com precisão e evidência, os 7 filtros que a engenharia usa para decidir se vale a pena participar.

## DADOS DA EMPRESA (use para comparar com as exigências)
- Empresa: {{NOME_EMPRESA}}
- Cidade-base: {{CIDADE_BASE}} (ex.: Santa Cruz do Rio Pardo/SP)
- Raio de atuação preferencial: até {{RAIO_OK_KM}} km | aceitável até {{RAIO_MAX_KM}} km
- Enquadramento: {{ME_EPP_OU_NAO}}
- Índices contábeis do último balanço: LG = {{LG}} | SG = {{SG}} | LC = {{LC}}
- Patrimônio líquido: R$ {{PATRIMONIO_LIQUIDO}} | Capital social: R$ {{CAPITAL_SOCIAL}}
- Atestados / CATs disponíveis: {{LISTA_ATESTADOS}} (ex.: "locação de cremalheira 24 meses", "execução de 1.200 m² de alvenaria")
- Responsáveis técnicos: {{RESPONSAVEIS_TECNICOS_E_REGISTRO}}
- Distância calculada pelo sistema (se houver): {{DISTANCIA_KM}}

Se algum dado da empresa estiver em branco, ainda extraia a exigência do edital, mas marque a comparação como "SEM_DADOS_EMPRESA".

## OS 7 FILTROS — O QUE PROCURAR E COMO CLASSIFICAR

Para cada filtro, classifique com UM destes status:
- "OK" → a empresa atende ou a exigência não cria obstáculo.
- "ATENCAO" → atende com ressalvas, exige providência (documento, custo, prazo) ou há dúvida de interpretação.
- "IMPEDITIVO" → a empresa claramente não atende ou o custo/risco inviabiliza.
- "NAO_ENCONTRADO" → o edital não trata do assunto (ou o trecho não foi enviado).
- "SEM_DADOS_EMPRESA" → exigência encontrada, mas faltam dados da empresa para comparar.

### 1) DISTÂNCIA
- Extraia o local de execução da obra/serviço ou de entrega (endereço, município, UF).
- Se {{DISTANCIA_KM}} foi informado, use-o. Senão, estime a distância rodoviária a partir da cidade-base e marque "distancia_estimada": true.
- Classifique: até {{RAIO_OK_KM}} km = OK; até {{RAIO_MAX_KM}} km = ATENCAO; acima = IMPEDITIVO.
- Registre exigências que agravam a distância: equipe permanente no local, prazo de mobilização curto, atendimento emergencial em X horas, escritório local.

### 2) BALANÇO / ÍNDICES / DECLARAÇÕES (qualificação econômico-financeira)
- Balanço patrimonial: quantos exercícios são exigidos e em que forma (SPED, registrado, assinado por contador).
- Índices exigidos (LG, SG, LC ou outros) e o valor mínimo de cada um. Compare com os índices da empresa.
- Capital social mínimo ou patrimônio líquido mínimo (valor ou % do valor estimado). Compare com os dados da empresa.
- Declarações exigidas (ex.: relação de compromissos assumidos, certidão negativa de falência/recuperação judicial, declaração de índices assinada por contador).
- Liste cada declaração separadamente.

### 3) CAPACIDADE TÉCNICA (qualificação técnica)
- Separe:
  a) Técnico-operacional: atestados em nome da EMPRESA.
  b) Técnico-profissional: CAT / acervo do RESPONSÁVEL TÉCNICO, registro no CREA/CAU, forma de vínculo exigida.
- Extraia as parcelas de maior relevância e os QUANTITATIVOS MÍNIMOS exigidos (ex.: "mínimo de 500 m²", "12 meses de locação").
- Compare com a lista de atestados da empresa e diga qual atestado cobre qual exigência, ou o que falta.
- Registre exigências de equipamentos mínimos, equipe mínima e certificações (ex.: NR-18, NR-35, ISO).

### 4) GARANTIA DE PARTICIPAÇÃO / DE PROPOSTA (e garantia contratual)
- Garantia de proposta: exigida ou não, percentual e valor em R$, modalidades aceitas (caução em dinheiro, título da dívida pública, seguro-garantia, fiança bancária), prazo de validade e momento da entrega.
- Garantia contratual (do contrato, após vencer): percentual, modalidades e prazo.
- Se o valor estimado for conhecido, calcule os valores em R$.

### 5) VISITA TÉCNICA
- Informe se é OBRIGATÓRIA, FACULTATIVA ou NÃO PREVISTA.
- Se existe a opção de substituir a visita por declaração de conhecimento pleno das condições do local.
- Prazo/período de agendamento, contato (nome, telefone, e-mail), quem pode realizar (responsável técnico, preposto) e documento emitido (atestado de visita).
- Se a visita for obrigatória e o prazo já tiver passado (compare com a data atual informada), marque IMPEDITIVO.

### 6) % INEXEQUÍVEL
- Extraia o critério de inexequibilidade que o próprio edital define (percentual sobre o valor orçado, fórmula, exigência de demonstração de viabilidade).
- Se o edital não definir e o objeto for obra ou serviço de engenharia, informe a referência legal da Lei 14.133/2021 (art. 59, §4º: propostas abaixo de 75% do valor orçado pela Administração) e a garantia adicional para propostas abaixo de 85% (art. 59, §5º), deixando claro que é referência legal e não texto do edital.
- Se o valor estimado for conhecido, calcule o PREÇO MÍNIMO EXEQUÍVEL em R$ e o preço abaixo do qual há garantia adicional.
- Informe se o orçamento é sigiloso (nesse caso, não há valor para calcular).

### 7) SUBCONTRATAÇÃO
- Informe se é PERMITIDA, VEDADA ou NÃO MENCIONADA.
- Limite percentual, parcelas que podem ou não ser subcontratadas, necessidade de autorização prévia, e se há subcontratação obrigatória de ME/EPP.
- Relacione com a capacidade técnica: se a empresa não tem atestado de uma parcela, verifique se ela pode ser subcontratada.

## DADOS GERAIS QUE VOCÊ SEMPRE DEVE EXTRAIR
Órgão, número do edital/processo, modalidade, objeto resumido, critério de julgamento, modo de disputa, valor estimado (ou "sigiloso"), data e hora da sessão, prazo de envio de propostas, plataforma/portal, prazo de execução e vigência, e se há exclusividade ou cota para ME/EPP.

## REGRAS OBRIGATÓRIAS
1. NUNCA invente dados. Se não estiver no texto, use "NAO_ENCONTRADO" e null.
2. Toda informação extraída deve trazer a EVIDÊNCIA: o número do item/cláusula e um trecho curto (até 30 palavras) copiado do edital.
3. Distinga sempre o que o EDITAL diz do que é REFERÊNCIA LEGAL ou ESTIMATIVA sua.
4. Valores em R$ com duas casas decimais; datas no formato DD/MM/AAAA; distâncias em km.
5. Se o texto enviado parecer incompleto (faltando anexos, termo de referência ou páginas), diga isso em "alertas".
6. Seja objetivo: a análise serve para uma engenheira decidir em poucos minutos se participa ou não.
7. Você faz triagem, não parecer jurídico. Em pontos de interpretação duvidosa, marque ATENCAO e explique a dúvida.

## VEREDITO
- "NAO_RECOMENDADO" se houver qualquer filtro IMPEDITIVO.
- "PARTICIPAR_COM_RESSALVAS" se houver ATENCAO, SEM_DADOS_EMPRESA ou NAO_ENCONTRADO em filtro importante.
- "RECOMENDADO" se todos os filtros estiverem OK.
Dê uma nota de 0 a 10 de aderência e liste as providências necessárias em ordem de prioridade (com prazo, quando houver).

## FORMATO DE SAÍDA
Responda SOMENTE com um JSON válido, sem texto antes ou depois e sem crases de markdown, seguindo exatamente esta estrutura:

{
  "dados_gerais": {
    "orgao": "", "numero_edital": "", "modalidade": "", "objeto": "",
    "criterio_julgamento": "", "modo_disputa": "",
    "valor_estimado": null, "valor_sigiloso": false,
    "data_sessao": "", "hora_sessao": "", "prazo_propostas": "",
    "plataforma": "", "prazo_execucao": "", "exclusivo_me_epp": null
  },
  "filtros": {
    "distancia": {
      "status": "", "local_execucao": "", "municipio_uf": "",
      "distancia_km": null, "distancia_estimada": false,
      "exigencias_logisticas": [], "evidencia": { "item": "", "trecho": "" }, "observacao": ""
    },
    "qualificacao_economica": {
      "status": "", "balanco_exercicios": null, "forma_balanco": "",
      "indices_exigidos": [ { "indice": "", "minimo": null, "empresa": null, "atende": null } ],
      "capital_ou_pl_minimo": { "tipo": "", "valor": null, "percentual": null, "atende": null },
      "declaracoes": [], "evidencia": { "item": "", "trecho": "" }, "observacao": ""
    },
    "capacidade_tecnica": {
      "status": "",
      "tecnico_operacional": [ { "exigencia": "", "quantitativo_minimo": "", "atestado_empresa_que_atende": "", "atende": null } ],
      "tecnico_profissional": [ { "exigencia": "", "registro": "", "vinculo": "", "atende": null } ],
      "equipamentos_equipe_certificacoes": [], "evidencia": { "item": "", "trecho": "" }, "observacao": ""
    },
    "garantias": {
      "status": "",
      "garantia_proposta": { "exigida": null, "percentual": null, "valor": null, "modalidades": [], "prazo": "" },
      "garantia_contratual": { "exigida": null, "percentual": null, "valor": null, "modalidades": [], "prazo": "" },
      "evidencia": { "item": "", "trecho": "" }, "observacao": ""
    },
    "visita_tecnica": {
      "status": "", "tipo": "", "aceita_declaracao_substitutiva": null,
      "periodo_agendamento": "", "contato": "", "quem_pode_realizar": "",
      "evidencia": { "item": "", "trecho": "" }, "observacao": ""
    },
    "inexequibilidade": {
      "status": "", "criterio_edital": "", "percentual_edital": null,
      "referencia_legal_aplicada": false, "preco_minimo_exequivel": null,
      "preco_limite_garantia_adicional": null,
      "evidencia": { "item": "", "trecho": "" }, "observacao": ""
    },
    "subcontratacao": {
      "status": "", "situacao": "", "limite_percentual": null,
      "parcelas_permitidas": [], "parcelas_vedadas": [],
      "exige_autorizacao": null, "subcontratacao_me_epp_obrigatoria": null,
      "evidencia": { "item": "", "trecho": "" }, "observacao": ""
    }
  },
  "veredito": {
    "recomendacao": "", "nota_aderencia": null,
    "resumo": "",
    "impeditivos": [], "providencias": [ { "acao": "", "prazo": "" } ]
  },
  "alertas": []
}

A data de hoje é {{DATA_ATUAL}}. O edital a ser analisado vem a seguir.
````
