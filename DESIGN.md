---
name: 3AM Licitação
description: Sistema de design técnico e denso para portal de inteligência, triagem e análise de licitações públicas de construção civil
colors:
  primary: "oklch(0.43 0.08 225)"
  primary-foreground: "oklch(0.99 0 0)"
  background: "oklch(0.965 0.008 195)"
  foreground: "oklch(0.3 0.05 235)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.3 0.05 235)"
  secondary: "oklch(0.945 0.015 200)"
  secondary-foreground: "oklch(0.35 0.06 230)"
  muted: "oklch(0.955 0.01 200)"
  muted-foreground: "oklch(0.5 0.03 230)"
  accent: "oklch(0.94 0.02 195)"
  accent-foreground: "oklch(0.3 0.06 230)"
  destructive: "oklch(0.58 0.21 25)"
  destructive-foreground: "oklch(0.99 0 0)"
  success: "oklch(0.58 0.13 160)"
  success-foreground: "oklch(0.99 0 0)"
  warning: "oklch(0.64 0.15 60)"
  warning-foreground: "oklch(0.99 0 0)"
  info: "oklch(0.55 0.13 240)"
  info-foreground: "oklch(0.99 0 0)"
  brand: "oklch(0.5 0.2 305)"
  brand-foreground: "oklch(0.99 0 0)"
  highlight: "oklch(0.67 0.18 45)"
  highlight-foreground: "oklch(0.99 0 0)"
  teal: "oklch(0.68 0.13 175)"
  teal-foreground: "oklch(0.99 0 0)"
  border: "oklch(0.9 0.012 210)"
  input: "oklch(0.88 0.015 210)"
  sidebar: "oklch(0.34 0.07 225)"
  sidebar-foreground: "oklch(0.93 0.02 200)"
  sidebar-primary: "oklch(0.68 0.13 175)"
  sidebar-accent: "oklch(0.4 0.075 225)"
typography:
  display:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Lexend, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
  metadata:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  2xl: "calc(var(--radius) + 8px)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System — 3AM Licitação

## Overview

O **3AM Licitação** é uma ferramenta de trabalho de alta densidade voltada para engenheiros, orçamentistas e diretores de obras civis. A atmosfera visual combina a solidez técnica da engenharia civil pesada com a clareza de um dashboard executivo contemporâneo.

- **Voz e Tom Visual**: Sóbrio, técnico, confiável e ágil. Evita o visual genérico de SaaS corporativo de software (gradientes artificiais lilás/azul em excesso, excesso de cards aninhados).
- **Modo de Operação**: *Operate* (focado em execução de tarefas com clareza imediata, escaneabilidade e redução drástica da carga cognitiva do operador).
- **Duplo Tema (Bimodal)**:
  - **Modo Claro (Light)**: Fundo menta-acinzentado (`oklch(0.965 0.008 195)`), cartões brancos nítidos, texto ardósia escuro com alto contraste e bordas suaves. Transmite precisão e frescor para trabalho sob luz do dia.
  - **Modo Escuro (Dark)**: Fundo grafite-ardósia profundo (`oklch(0.17 0.015 240)`), cartões em camadas sutis de elevação tonal, contraste equilibrado sem cansar a visão em turnos noturnos.

## Colors

Todas as cores são especificadas no espaço perceptual **OKLCH** e expostas como tokens semânticos no Tailwind CSS v4 (`src/styles.css`).

### Paleta Primária e Neutros
- **Primary (`--color-primary`)**: Azul-petróleo industrial (`oklch(0.43 0.08 225)` no claro / `oklch(0.68 0.12 220)` no escuro). Usado em botões principais, links ativos, destaques de navegação e foco.
- **Background / Foreground**: Fundo menta-acinzentado suave com texto ardósia de alto contraste no claro; grafite escuro com texto off-white no escuro.
- **Card / Surface**: Superfícies de cartões e painéis (`oklch(1 0 0)` no claro / `oklch(0.21 0.018 240)` no escuro) com contorno semântico sutil (`--color-border`).

### Acentos Semânticos e Ações Especiais
- **Teal / Verde-água (`--color-teal`)**: Reservado para ações inteligentes, inteligência artificial e sincronizações do PNCP (`oklch(0.68 0.13 175)`).
- **Highlight / Laranja de Obra (`--color-highlight`)**: Usado no ícone da marca (capacete), licitações prioritárias e badges de alta relevância (`oklch(0.67 0.18 45)`).
- **Brand / Roxo (`--color-brand`)**: **Atenção — Não é cor de texto padrão**. Utilizado estritamente onde carrega significado funcional específico: status de *"Proposta enviada"*, cartões destacados de IA ou ícones de suporte específicos. Títulos e corpos sempre usam `--color-foreground`.
- **Status Funcionais**:
  - `success`: Verde para propostas ganhas, certames homologados e itens conformes (`oklch(0.58 0.13 160)`).
  - `warning`: Amarelo/âmbar para prazos curtos (menos de 3 dias), revisões pendentes e advertências (`oklch(0.64 0.15 60)`).
  - `destructive`: Vermelho para certames revogados, propostas perdidas ou erros operacionais (`oklch(0.58 0.21 25)`).
  - `info`: Azul para avisos neutros e informativos de processo.

## Typography

O sistema tipográfico utiliza duas famílias do Google Fonts carregadas via `@import` e configuradas no `@theme`:

1. **Interface e Títulos**: `Lexend`
   - Desenvolvida especificamente para facilitar e acelerar a velocidade de leitura.
   - Usada em títulos (`h1`, `h2`, `h3`), rótulos de navegação, descrições e botões.
   - Pesos: `400` (Regular), `500` (Medium), `600` (SemiBold), `700` (Bold).

2. **Dados e Números Operacionais**: `IBM Plex Mono`
   - Monoespaçada técnica de alta precisão.
   - Usada obrigatoriamente para:
     - Valores monetários em Reais (`R$ 1.250.000,00`).
     - Códigos de controle PNCP (`12345678000190-1-000001/2026`).
     - Datas e prazos (`24/09/2026 às 14:00`).
     - CNPJs, distâncias em km (`45 km`) e percentuais.
   - Suporte nativo a números tabulares (`font-feature-settings: "tnum" 1` e utilitário `num`).

## Layout

- **Estrutura Shell**:
  - `Sidebar` lateral retrátil (`w-60` expandida / `w-16` recolhida), persistida em `localStorage`.
  - `Header` fixo no topo com migalhas de pão contextuais, atalhos de teclado (`?`), seletor de tema e busca global por comando (`Ctrl+K` / `Cmd+K`).
  - Área principal com scroll independente, aproveitando largura estendida em telas ultrawide (`max-w-7xl` ou full width dependendo da tabela).
- **Listagens Híbridas (Grid / Tabela)**:
  - Alternância imediata entre visão em Grade (Cards com metadados destacados) e Tabela compacta para triagem em massa.
  - Barras de ação flutuantes em lote para seleção múltipla de certames.

## Elevation & Depth

- **Superfícies**: O sistema prioriza superfícies limpas com bordas nítidas de 1px (`--color-border`) sobre sombras pesadas.
- **Glassmorphism Funcional**:
  - Utilitário `glass-panel`: Cartões com leve transparência (`85%`) e desfoque de fundo (`backdrop-filter: blur(12px)`).
  - Utilitário `bento-card`: Gradiente suave nos cantos, efeito hover sutil com elevação e brilho controlado.
- **Sombras**:
  - `shadow-xs` e `shadow-sm` para botões e dropdowns.
  - `glow-amber` e `glow-emerald` para destacar certames prioritários ou aprovados.

## Shapes

- **Raio Base**: `--radius: 0.625rem` (10px).
- **Escala de Raios**:
  - `--radius-sm`: `6px` (badges, tags internas, inputs compactos).
  - `--radius-md`: `8px` (botões padrão, tooltips, itens de menu).
  - `--radius-lg`: `10px` (inputs normais, modais pequenos).
  - `--radius-xl`: `14px` (cards principais de licitação, gavetas, bento-cards).
  - `--radius-2xl`: `18px` (containers principais e modais executivos).
  - Pílulas (`rounded-full`): Utilizadas para contadores, status pills e seletores de visualização.

## Components

- **AppShell & Sidebar**: Navegação lateral com indicação do status da última sincronização com o PNCP e atalho para o seletor de tema.
- **LicitacaoCard**: Card estruturado com cabeçalho contendo órgão e município, badges de score e prazo, objeto destacado, valor estimado em fonte monoespaçada e botão de ação para análise com IA.
- **ScoreBadge**: Badge colorido indicando o score de aderência (0 a 100), com variação de cor verde (>75), âmbar (50-75) e neutro (<50).
- **StatusInternoBadge**: Indicador visual do estágio no funil comercial interno da empresa.
- **AnaliseLicitacaoSheet**: Painel lateral deslizante (Drawer) para exibição da análise de edital com IA, apresentando prazos, contatos, exigências de habilitação e requisitos de execução sem sair da listagem.
- **AtalhosModal**: Modal acionado por teclado (`?`) para consulta rápida de teclas de atalho da aplicação.

## Do's and Don'ts

### Do's (O que fazer)
- ✅ **Usar sempre `IBM Plex Mono`** para exibir valores em R$, datas, CNPJs, distâncias e códigos de licitação.
- ✅ **Usar tokens semânticos de cor** (`bg-card`, `text-muted-foreground`, `border-border`) para garantir consistência automática entre tema claro e escuro.
- ✅ **Priorizar escaneabilidade**: Valores, prazos e locais devem estar visíveis imediatamente, sem necessidade de rolagem ou cliques extras.
- ✅ **Tratar a cor roxa (`brand`) como funcional**: Usar apenas para estados específicos como proposta enviada e destaques de IA.

### Don'ts (O que evitar)
- ❌ **Não usar cores hexadecimais soltas** no código JSX/TSX. Toda cor deve vir do arquivo `styles.css`.
- ❌ **Não usar roxo como cor padrão de títulos ou textos corridos**. Títulos devem usar sempre a cor neutra principal do tema (`text-foreground`).
- ❌ **Não aninhar cartões dentro de cartões** sem necessidade hierárquica clara.
- ❌ **Não esconder informações críticas** (como prazo restante e valor total) dentro de abas secundárias.
