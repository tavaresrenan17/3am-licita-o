# Remedição do limiar de distância — 20/09/2026

Reexecução da calibragem de 19/09 agora que os 509 editais estão vetorizados
(10.424 chunks). Pergunta: 0,40 continua certo quando o texto dos documentos
também disputa o ranking?

**Resposta curta: sim. Manter 0,40.**

## Como foi medido

- Varredura de `configuracao_busca.limiar_distancia` em 0,25 / 0,30 / 0,35 / 0,40 / 0,45.
- As mesmas 12 consultas semente, com vetores pré-computados (`scratch/vetores-consultas.json`, bge-m3).
- Por consulta e limiar: `buscar_licitacoes` (lexical, `p_limite:10`) contra
  `buscar_licitacoes_hibrida` (mesmo filtro + embedding).
- `hibrido_ativo` permaneceu `true` o tempo todo e não foi tocado.
  `limiar_distancia` foi restaurado para 0,40 no `finally` (confirmado:
  `{"limiar_distancia":0.4,"hibrido_ativo":true}`).

### Estado do catálogo no momento da medição

| | ontem | hoje |
|---|---|---|
| licitações | ~8.489 | 8.792 |
| licitações com embedding de objeto | ~8.489 | 8.792 (100%) |
| chunks de documento | 3.394 | 10.424 |
| documentos vetorizados | — | 509 |
| **licitações cobertas por chunks** | — | **257 (2,9%)** |

Esse último número condiciona tudo o que vem a seguir: o ramo de chunks só pode
falar sobre 2,9% do catálogo. Ele ainda não é o que move a inflação.

## 1. Tabela de inflação

Mesma forma da tabela de ontem, para comparação direta. "Inflação" = mediana de
`total_hibrido / total_lexical` sobre as 12 consultas; "sem ganho" =
`total_hibrido == total_lexical`.

| limiar | inflação mediana (hoje) | sem ganho (hoje) | inflação (ontem) | sem ganho (ontem) |
|---|---|---|---|---|
| 0,25 | 1,00x | 11 de 12 | 1,0x | 11–12 de 12 |
| 0,30 | 1,00x | 11 de 12 | 1,0x | 11–12 de 12 |
| 0,35 | 1,00x | 8 de 12 | 1,0x | 8 de 12 |
| **0,40** | **1,52x** | **5 de 12** | **1,5x** | **6 de 12** |
| 0,45 | 3,89x | 2 de 12 | 5,2x | 2 de 12 |

A curva reproduz a de ontem quase célula a célula. A única que se move é
"sem ganho" em 0,40 (6 → 5), e uma diferença de uma consulta está dentro da
deriva do catálogo (8.489 → 8.792 licitações); não a atribuo aos chunks.

### Total por consulta

| consulta | lexical | 0,25 | 0,30 | 0,35 | 0,40 | 0,45 |
|---|---|---|---|---|---|---|
| reforma de escola | 9 | 9 | 9 | 9 | 9 | 21 |
| pavimentacao asfaltica | 2 | 2 | 2 | 2 | 4 | 13 |
| pavimentação asfáltica | 20 | 20 | 20 | 20 | 21 | 39 |
| aquisicao de medicamentos | 23 | 29 | 45 | **166** | **223** | 256 |
| coleta de lixo urbano | 1 | 1 | 1 | 1 | 4 | **35** |
| merenda escolar | 22 | 22 | 22 | 22 | 22 | 24 |
| software de gestao | 2 | 2 | 2 | 2 | 2 | 2 |
| obra de drenagem | 9 | 9 | 9 | 10 | 21 | 49 |
| locacao de veiculos | 3 | 3 | 3 | 4 | 14 | 96 |
| servicos de vigilancia patrimonial | 0 | 0 | 0 | 1 | 4 | 15 |
| TR | 5895 | 5895 | 5895 | 5895 | 5895 | 5895 |
| reforma ou ampliacao | 2 | 2 | 2 | 2 | 2 | 3 |

Duas observações sobre a tabela:

- **"TR" nunca varia** porque `min_chars_semantico = 4` degrada a consulta para
  puramente lexical (`modo: "lexical"` confirmado na resposta). A guarda de
  ontem continua funcionando. Os "10 novos" que a instrumentação marca nessa
  linha são artefato de ordenação (o caminho degradado troca `relevancia` por
  `data_encerramento_proposta`), não efeito semântico.
- **"aquisicao de medicamentos" é o outlier real**: 23 → 166 em 0,35 e 23 → 223
  em 0,40, ou seja 9,7x. Não é efeito dos documentos: os itens envolvidos têm
  distância de *objeto* entre 0,332 e 0,335, muito abaixo de qualquer limiar
  testado. Como os vetores de objeto e o catálogo praticamente não mudaram desde
  ontem, esse estouro quase certamente já existia na medição anterior — a
  mediana simplesmente o esconde. Se 223 resultados para uma consulta que
  lexicalmente acha 23 é aceitável, é uma decisão à parte desta; não é uma
  regressão introduzida pelos editais.

## 2. Com que frequência um chunk de documento decide um resultado

`trecho` não-nulo significa apenas que *algum* chunk casou — não que o chunk foi
necessário. Em vários casos o vetor do objeto já teria trazido o item sozinho.
Para separar os dois, calculei a distância de cosseno entre a consulta e o
embedding de objeto de cada licitação com `trecho`, e chamo de **chunk-only** o
caso em que essa distância está **acima do limiar** — isto é, o objeto sozinho
não teria encontrado o item.

| limiar | itens no top-10 com `trecho` | destes, chunk-only | chunk-only **e** ausentes do top-10 lexical | consultas afetadas |
|---|---|---|---|---|
| 0,25 | 0 | 0 | 0 | 0 |
| 0,30 | 0 | 0 | 0 | 0 |
| 0,35 | 0 | 0 | 0 | 0 |
| 0,40 | 8 | 5 | 4 | 3 |
| 0,45 | 15 | 11 | 10 | 5 |

**Abaixo de 0,40 os documentos não contribuem com absolutamente nada.** Vetorizar
os editais só passa a ter efeito a partir de 0,40.

E em 0,40 o efeito é pequeno. Os 4 itens chunk-only novos são, na verdade,
**2 licitações distintas** (uma aparece nas duas grafias de "pavimentação
asfáltica"; a outra está duplicada no catálogo com dois `id` diferentes e
`objeto` idêntico).

### Caso A — ganho claro: "pavimentacao asfaltica" (distância de objeto 0,509)

O objeto não contém a palavra "asfáltica"; o edital contém.

- **objeto:** "CONCORRÊNCIA 008 2026 - CONTRATAÇÃO DE EMPRESA ESPECIALIZADA EM
  ENGENHARIA PARA EXECUÇÃO DAS OBRAS DE RECONSTRUÇÃO DO PAVIMENTO DA RUA ARISTEU
  VIEIRA VILELA, NO MUNICÍPIO DE POTIM – SP…"
- **trecho:** "…5.4 – Demolição Mecanizada de Pavimento Asfáltico. Os serviços de
  demolição mecanizada do pavimento asfáltico existente serão executados nos
  trechos definidos em projeto…"

Distância de objeto 0,509 — acima de todos os limiares testados. Nem em 0,45 o
vetor de objeto traria esta licitação. É o único resultado do conjunto de 12
consultas em que a vetorização dos editais comprou, sem ambiguidade, uma
licitação certa que não existia antes.

### Caso B — decisão do leitor: "obra de drenagem" (distância de objeto 0,542)

- **objeto:** "Contratação de empresa(s) especializada(s) execução de obras de
  reforma, revitalização e adequação de acessibilidade nas dependências do Clube
  Bandeirantes localizado no Distrito de Arcadas, Município de Amparo/SP…"
- **trecho:** "…de Drenagem: Locação, Escavação e Preenchimento Filtrante: A
  execução do sistema de drenagem tem início com a locação topográfica da rede de
  canalização, serviço medido por metro linear…"

O edital de fato contém um sistema de drenagem como item de planilha, mas a
licitação não é uma obra de drenagem — é uma reforma de clube. **Não julgo este
caso.** Depende de o usuário querer "licitações de drenagem" ou "licitações que
incluem serviço de drenagem", e as duas leituras são defensáveis. Anoto só que a
mesma licitação aparece duplicada, ocupando duas das dez posições.

### Caso C — o que acontece em 0,45 (ruído chunk-only)

Em 0,45 os hits chunk-only triplicam (11) e surgem casos em que o texto casado
não tem conteúdo temático nenhum:

- consulta **"coleta de lixo urbano"** → objeto "SERVIÇOS DE LIMPEZA MECANIZADA
  DE FOSSA…" (distância de objeto 0,472). O trecho que o trouxe é preâmbulo
  jurídico puro: "…realizará licitação, na modalidade PREGÃO, na forma
  ELETRÔNICA, nos termos da Lei nº 14.133, de 1º de abril de 2021, do Decreto
  Municipal nº 4.990…". Nada ali fala de coleta de lixo.
- consulta **"coleta de lixo urbano"** → a reforma do Clube Bandeirantes
  (distância de objeto 0,622), via trecho sobre carregar entulho até a caçamba.
- consulta **"locacao de veiculos"** → "Contratação de serviços de Locação de
  Espaço Físico para os Eventos Institucionais (Auditório, Salas e Área para
  Coffee Break)" (distância de objeto 0,459), via trecho sobre locação de
  auditório. Sentido errado de "locação".

O primeiro é o achado que mais importa para o futuro: **editais compartilham
enormes blocos de preâmbulo legal idêntico**, e um chunk de boilerplate casa com
qualquer coisa. Com 2,9% de cobertura isso aparece só em 0,45. Conforme a
cobertura crescer, esse modo de falha cresce junto.

## 3. Os dois casos que decidiram 0,40 ontem

### "servicos de vigilancia patrimonial" — o ganho: sobrevive intacto

Lexical devolve 0 em qualquer cenário.

| limiar | total híbrido | leitura |
|---|---|---|
| 0,25 | 0 | sem ganho |
| 0,30 | 0 | sem ganho |
| 0,35 | 1 | "Prestação de serviços de vigilância e segurança patrimonial, armada e desarmada (monitoramento)…" — o certo |
| **0,40** | **4** | todos os 4 são vigilância/segurança patrimonial explícita. Topo idêntico ao de ontem. |
| 0,45 | 15 | top-10 ainda coerente; o 10º é "implantação e locação de sistema de VÍDEOMONITORAMENTO (VMS)" — adjacente, mas já não é vigilância patrimonial com posto de serviço |

**Nenhum** desses resultados é dirigido por chunk — todos vêm do vetor de objeto.
O caso que decidiu a calibragem de ontem não foi afetado pela vetorização dos
editais, nem para melhor nem para pior.

### "coleta de lixo urbano" — o ruído: continua limpo em 0,40, quebra em 0,45

Lexical devolve 1.

Em **0,40** o resultado é 4, exatamente o mesmo de ontem, e **zero** itens
dirigidos por chunk:

1. "…COLETA E TRANSPORTE DE LIXO DOMICILIAR ATÉ O ATERRO SANITÁRIO…" (lexical)
2. "…COOPERATIVAS E/OU ASSOCIAÇÕES DE CATADORES DE MATERIAIS RECICLÁVEIS E REUTILIZÁVEIS…"
3. "AQUISIÇÃO DE SACO DE LIXO PRETO PARA RESÍDUO COMUM…"
4. "…prestação contínua de serviços de coleta, transporte e contenção de resíduos sólidos urbanos…"

Em **0,45** o total salta para 35 e entram os dois casos chunk-only descritos
acima (limpeza de fossa por preâmbulo legal; entulho de obra por caçamba). Não é
"KIT PARA COLETA DE URINA", mas é a mesma classe de erro, e agora chega **um
limiar mais cedo do que ontem** — porque é o ramo de chunks que a produz.

## 4. Recomendação

**Manter 0,40.** Nenhuma evidência sustenta mover.

O número que justifica: em **0,45**, "coleta de lixo urbano" vai de 1 para
**35 resultados (35x)** e 3 das 10 primeiras posições passam a ser hits
chunk-only cujo texto casado é fora de tema — incluindo um que casou apenas com
preâmbulo jurídico. Em 0,40 a mesma consulta devolve 4, todos pertinentes, e
nenhum vindo de documento.

Descer também não se sustenta: **abaixo de 0,40 o ramo de chunks contribui zero**
(0 itens com `trecho` em 0,25 / 0,30 / 0,35), e em 0,35 "vigilância patrimonial"
cai de 4 para 1. Descer desligaria na prática a vetorização dos editais que
acabou de ser feita.

### O que essa medição também diz, e que vale registrar

1. **A vetorização dos editais comprou pouco até agora**: 1 resultado novo
   inequivocamente certo (Potim) e 1 caso discutível (Clube Bandeirantes), em 12
   consultas. Isso não é um veredito sobre a ideia — é consequência de a
   cobertura ser 257 de 8.792 licitações (2,9%). O mecanismo funciona; falta
   catálogo.
2. **0,40 está calibrado contra 2,9% de cobertura documental.** O ruído do ramo
   de chunks escala com a cobertura, e o modo de falha por boilerplate já é
   visível em 0,45. Recalibrar quando a cobertura passar de algo como 20–25%, ou
   antes disso se o boilerplate começar a aparecer em 0,40.
3. **Sugestão fora de escopo, para consideração**: filtrar chunks de preâmbulo
   legal na ingestão (são quase idênticos entre editais e detectáveis por
   frequência) tenderia a melhorar a relação sinal/ruído mais do que qualquer
   ajuste de limiar.
4. **O estouro de "aquisicao de medicamentos" (23 → 223 em 0,40) é anterior a
   esta mudança e é dirigido pelo objeto, não pelos documentos.** Se a inflação
   da paginação incomoda, é ali que está o problema, e limiar não o resolve.

## Reprodutibilidade

Medição feita por script descartável, já removido. Nada sob `src/`, `supabase/`
ou `docs/` foi tocado.
