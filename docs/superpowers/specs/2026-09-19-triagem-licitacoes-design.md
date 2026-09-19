# Triagem de licitações: filtros completos e navegação por teclado — design

- **Data:** 2026-09-19
- **Status:** aprovado para implementação (abordagem A confirmada pelo solicitante)
- **Escopo:** tela `/licitacoes`, desktop apenas

## 1. O problema, medido

**Nove dos vinte filtros do backend não têm controle nenhum na tela:**

| filtro | o que faz | controle hoje |
|---|---|---|
| `com_edital`, `com_projeto`, `com_orcamento` | só licitações que têm aquele documento | nenhum |
| `limite_de`, `limite_ate` | faixa de prazo da proposta | nenhum |
| `recomendadas` | score acima do mínimo configurado | nenhum |
| `nao_analisadas` | ainda em `status_interno = 'nova'` | nenhum |
| `prioridade` | marcadas como prioritárias | nenhum |
| `criadas_de` | entraram no catálogo a partir de | nenhum |

Sete deles **já são aceitos pela URL** (`buscaSchema` na rota), então o Dashboard
abre a tela filtrada por "recomendadas" ou "não analisadas" — e o usuário, uma
vez lá, não vê nem consegue mexer nesse recorte. Fica preso num filtro invisível.

**E o número que define a prioridade real:** o catálogo tem **8.756 licitações**
e **3** marcadas como `interessante`. Não é falta de filtro; é que percorrer e
classificar é lento demais para compensar. O sistema já tem o vocabulário da
triagem (`nova → em_analise → interessante → descartada`, mais `prioridade`),
mas não tem a ergonomia: cada classificação exige mirar e clicar.

**Fora de escopo por decisão do solicitante:** mobile. O uso é desktop apenas,
então a `min-w-[1120px]` da tabela fica como está.

## 2. O que já funciona e não vamos mexer

- `placeholderData: (anterior) => anterior` na query da lista: trocar um filtro
  não pisca a tela. Já resolvido.
- Os chips de filtro ativo existem (11 no código atual) e só precisam cobrir os
  filtros novos.
- `useAtualizarInterno` já grava `status_interno` e `prioridade` com
  invalidação de cache. A triagem por teclado usa isso, não cria caminho novo.

## 3. Arquitetura

Três unidades independentes, cada uma testável sozinha.

### [A] `filtros.ts` — o vocabulário dos filtros, fora do componente

Hoje o painel de filtros é markup solto dentro de um arquivo de 886 linhas. A
primeira unidade extrai a **descrição** dos filtros para um módulo próprio:

```ts
type GrupoFiltro = "prazo" | "documentos" | "fluxo" | "local" | "valor";

interface DefinicaoFiltro {
  chave: keyof FiltrosLicitacoes;
  rotulo: string;
  grupo: GrupoFiltro;
  tipo: "texto" | "data" | "moeda" | "booleano" | "opcoes" | "tri";
  /** Como o chip de filtro ativo descreve o valor escolhido. */
  descrever: (valor: string | boolean) => string;
}
```

O painel e os chips passam a ser gerados a partir dessa lista. Acrescentar um
filtro vira acrescentar uma linha, e não editar três lugares — que é
exatamente por que nove deles nunca chegaram à tela.

**Agrupamento por intenção**, não por tipo de dado:

- **prazo** — `limite_de`, `limite_ate`, `publicacao_de`, `publicacao_ate`, `criadas_de`
- **documentos** — `com_edital`, `com_projeto`, `com_orcamento`
- **meu fluxo** — `nao_analisadas`, `recomendadas`, `prioridade`, `status_interno`
- **local** — `uf`, `municipio`, `orgao`
- **valor** — `valor_min`, `valor_max`, `modalidade`, `categoria`

Os grupos "prazo" e "meu fluxo" nascem abertos; os demais, recolhidos. É onde a
decisão de triagem acontece.

**Atalhos de prazo:** três botões que preenchem `limite_de`/`limite_ate` —
"encerra em 7 dias", "em 15 dias", "em 30 dias". Um caçador de licitação pensa
em "o que fecha essa semana", não em duas datas.

### [B] `teclado.ts` + `useTriagemTeclado` — navegação e classificação sem o mouse

**A decisão fica numa função pura, e não dentro do hook.** O projeto não tem
biblioteca de teste de componente, e o vitest roda em ambiente `node`, sem DOM.
Instalar `@testing-library/react` e trocar o ambiente seria infraestrutura nova
para testar o que, no fundo, é uma função:

```ts
interface EventoTecla {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /** Nome da tag do elemento focado, minúsculo. */
  alvoTag: string;
  alvoEditavel: boolean;
}

type AcaoTriagem =
  | { tipo: "mover"; delta: 1 | -1 }
  | { tipo: "abrir" }
  | { tipo: "classificar"; status: StatusInterno }
  | { tipo: "prioridade" }
  | { tipo: "ajuda" };

function decidirAcaoTecla(e: EventoTecla): AcaoTriagem | null;
```

`decidirAcaoTecla` é testada em node com objetos literais — sem DOM, sem
dependência nova. `useTriagemTeclado` só liga `window.addEventListener` a ela,
mantém o índice selecionado e chama as ações; é fino o bastante para a
verificação ser rodar o app.

O hook recebe a lista visível e as ações, e devolve o índice selecionado.

| tecla | ação |
|---|---|
| `j` / `↓` | próximo resultado |
| `k` / `↑` | anterior |
| `Enter` | abrir a licitação |
| `i` | marcar **i**nteressante |
| `a` | marcar em **a**nálise |
| `d` | **d**escartar |
| `p` | alternar **p**rioridade |
| `?` | mostrar a lista de atalhos |

Regras que o hook precisa garantir, e que os testes cobrem:

1. **Nenhum atalho dispara enquanto o foco está num campo de texto.** É o
   defeito clássico desse tipo de recurso: o usuário digita "edital" na busca e
   o "d" descarta uma licitação. O hook ignora o evento quando o alvo é
   `input`, `textarea`, `select` ou `contenteditable`.
2. **Nenhum atalho dispara com modificador** (Ctrl, Alt, Meta), para não
   sequestrar atalhos do navegador.
3. O índice selecionado **fica dentro dos limites** quando a lista muda de
   tamanho — trocar de página ou de filtro não deixa a seleção apontando para
   um item que não existe mais.
4. Classificar avança para o próximo item, porque o gesto real é "essa não,
   próxima".

A linha selecionada recebe destaque visível e `aria-selected`; a tabela ganha
`role="grid"` para que a navegação seja anunciada por leitor de tela.

### [C] Chips e link da busca

Os chips de filtro ativo passam a ser gerados de `filtros.ts`, cobrindo os
filtros novos, cada um removível.

**Um botão "copiar link desta busca".** O arquivo da rota documenta uma decisão
deliberada: mexer nos filtros **não** reescreve a URL, porque "a barra continua
sendo o link que trouxe você, não um espelho de cada clique". Este design
respeita isso. Em vez de transformar a URL num espelho, o botão monta a URL
correspondente ao recorte atual e copia — quem quiser compartilhar, compartilha,
e quem não quiser não tem o histórico do navegador poluído a cada tecla.

## 4. Fluxo de dados

Nada muda no servidor. Os nove filtros já existem no `buscar_licitacoes` e no
`buscar_licitacoes_hibrida`, e ambos foram verificados como idênticos filtro a
filtro. Esta é uma mudança de interface sobre um backend que já sabe responder.

## 5. Testes

- **`filtros.ts`** — unidade pura: cada definição descreve seu valor, o
  agrupamento não deixa filtro órfão, e toda chave de `FiltrosLicitacoes` tem
  definição (um teste que falha quando alguém acrescenta filtro no backend e
  esquece a tela — a regressão que este trabalho está consertando).
- **`decidirAcaoTecla`** — unidade pura em node, sem DOM e sem dependência
  nova: as regras 1 e 2 da §3[B], cada uma com seu teste. A regra 1 (foco em
  campo de texto) é a mais importante e ganha caso próprio para `input`,
  `textarea`, `select` e `contenteditable`. A regra 3 (índice dentro dos
  limites) também é pura e vira `limitarIndice(indice, tamanho)`.
- **`useTriagemTeclado`** — o fio condutor não ganha teste automatizado; é
  `tsc`, `lint` e execução real do app. Se ele crescer a ponto de precisar de
  teste, isso é sinal de que há lógica nele que deveria estar em `teclado.ts`.
- **A tela** — não tem teste hoje e não vamos criar infraestrutura de teste de
  componente para ela neste trabalho. A verificação é `tsc`, `lint` e execução
  real do app.

## 6. Riscos

| risco | mitigação |
|---|---|
| Atalho disparando durante digitação | Regra 1 do hook, com teste por tipo de campo |
| Painel de filtros virar um muro de controles | Agrupamento com recolhimento; só 2 grupos abertos |
| `filtros.ts` virar abstração vazia | Ele só descreve; quem renderiza continua sendo o componente |
| Regressão na lista atual | `placeholderData`, chips e ordenação existentes ficam como estão |

## 7. Fora de escopo

Mobile. Facetas com contagem (exigiriam agregação nova no banco). Busca
salva/assinatura. Alterar a decisão sobre a URL não ser espelho dos filtros.
Ligar a busca semântica — decisão separada, já calibrada e ainda desligada.
