# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Equipe de engenharia, orçamentistas e analistas de licitação da **3AM Licitação** (empresa atuante em construção civil, obras de infraestrutura e locação de equipamentos). Operam em rotina de triagem de alta velocidade e tomada de decisão: precisam avaliar se a empresa tem capacidade técnica, financeira e logística para participar de certames públicos antes do término dos prazos de proposta ou impugnação.

## Product Purpose

Portal centralizado para monitoramento, triagem inteligente, análise aprofundada de editais e acompanhamento de oportunidades públicas de construção civil obtidas diretamente da API do Portal Nacional de Contratações Públicas (PNCP). O objetivo de sucesso é filtrar rapidamente o ruído de milhares de compras públicas, identificar licitações aderentes à capacidade da empresa e fornecer uma análise fidedigna com evidências extraídas dos documentos oficiais.

## Positioning

Diferente de portais generalistas de licitação que apenas listam resumos superficiais ou exigem leitura manual exaustiva de dezenas de anexos em PDF, a **3AM Licitação** oferece:
- Filtro verticalizado e calibrado para engenharia e construção civil.
- Score algorítmico de aderência ao perfil da empresa.
- Cálculo determinístico de distância geográfica real em linha reta entre municípios via coordenadas IBGE.
- Análise com IA baseada em extração estrita de evidências dos documentos oficiais, separando fatos calculados pelo sistema (situação do certame, prazos, valores) de requisitos contratuais e habilitação.

## Operating Context

- Acompanhamento diário e contínuo de editais publicados por prefeituras, governos estaduais e autarquias públicas federais.
- Análise de editais extensos, memoriais descritivos, termos de referência, projetos básicos e planilhas orçamentárias.
- Prazos legais rígidos da Lei nº 14.133/2021 para pedidos de esclarecimento, impugnações e submissão de propostas.
- Pipeline operacional interno de licitações: Triagem -> Em Análise -> Proposta Enviada -> Ganha / Perdida / Descartada.

## Capabilities and Constraints

- **Dashboard Executivo**: Métricas de valor total acumulado, contagem de certames abertos, avisos de sincronização e destaques de alta aderência com prazo próximo.
- **Catálogo de Licitações**: Listagem em grade (cards) e tabela com filtros facetados (UF, município, modalidade, status PNCP, faixa de valor, categoria, score de aderência e raio em km).
- **Minhas Licitações**: Gestão do pipeline interno da empresa com notas, histórico de alterações e ações em lote.
- **Sincronização PNCP**: Painel de controle de rotinas de ingestão e atualização contínua, telemetria e health check da API oficial do governo.
- **Análise com IA em Ficha Técnica (Drawer/Sheet)**:
  - Fatos do certame e situação jurídica calculados pelo sistema.
  - Prazos de impugnação, proposta e contatos oficiais.
  - Requisitos documentais de habilitação (jurídica, técnica, fiscal e econômico-financeira).
  - Requisitos operacionais e endereços de entrega/execução com indicação precisa dos documentos-fonte.
- **Restrições Técnicas**:
  - Aplicação construída sobre TanStack Start (SSR) com React 19, Vite, Tailwind CSS v4 e Supabase (PostgreSQL).
  - Dados oficiais de documentos e certames são tratados como não confiáveis para injeção de prompt; citações exigem trechos literais rastreáveis.

## Brand Commitments

- **Nome**: 3AM LICITAÇÃO (Construção civil).
- **Identidade Visual**: Tema sóbrio e técnico. Paleta semântica em OKLCH com primária azul-petróleo, fundo menta-acinzentado no modo claro, grafite-ardósia no modo escuro, verde-água para ações de IA e destaque laranja para alertas e status prioritários. O roxo de marca é restrito a estados específicos (proposta enviada, destaques de IA), nunca texto padrão.
- **Tipografia**: `Lexend` para títulos e corpo; `IBM Plex Mono` para números, valores monetários (R$), datas, CNPJs e códigos de controle.
- **Voz**: Direta, técnica, profissional, objetiva e orientada a dados concretos de engenharia.

## Evidence on Hand

- Banco de dados Supabase em produção com licitações reais sincronizadas do PNCP (`licitacoes`, `documentos_licitacao`, `licitacoes_analises`).
- Histórico de versões e fixtures de editais reais validados (ex: Pregão de Ibitinga, Cesário Lange, Pompéia).
- Suíte automatizada com mais de 450 testes cobrindo cálculos de distância IBGE, pontuação de relevância, sanitização de texto e análise.

## Product Principles

1. **Evidência sobre Opinião**: A decisão de participar de um certame de obras envolve risco financeiro real. Cada exigência e prazo deve apontar para o trecho exato do edital ou ser rotulada como não informada.
2. **Triagem em Segundos, Profundidade sob Demanda**: O analista deve entender o objeto, prazo, valor, distância e impeditivos em menos de 10 segundos no painel antes de aprofundar nos anexos.
3. **Fatos Calculados pelo Sistema**: Prazos legais, vencimentos, valores totais e distâncias são calculados de forma determinística por código; a IA é empregada para compreensão de texto desestruturado, nunca para adivinhar contas.
4. **Densidade com Clareza Visual**: Alta densidade de informações sem sensação de sobrecarga. Uso criterioso de contraste, tipografia monoespaçada para valores e indicadores visuais de status com padrão acessível.

## Accessibility & Inclusion

- Suporte completo a temas Claro e Escuro com transição suave e persistência em localStorage.
- Navegação otimizada por teclado com atalhos acessíveis (`?` para mapa de atalhos, `/` para busca global).
- Tabelas roláveis horizontalmente com cabeçalhos legíveis e áreas de clique confortáveis em ações operacionais.
