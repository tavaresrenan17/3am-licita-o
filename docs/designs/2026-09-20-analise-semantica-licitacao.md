# Análise semântica de licitação — design aprovado

## Entendimento confirmado

- Adicionar um botão **Análise** no detalhe de cada licitação, voltado à equipe interna de licitações.
- Transformar dados cadastrais, documentos extraídos e evidências vetoriais em uma leitura executiva útil para decisão.
- Entregar resumo, pontos importantes, exigências, prazos, riscos, ressalvas, próximos passos e recomendação.
- Consultar somente o banco da aplicação; a ação não chama o PNCP.
- Cada conclusão relevante deve ser rastreável a um documento e trecho, sem inventar conteúdo ausente.
- A análise deve ser gerada sob demanda, persistida e reutilizada até as fontes mudarem.
- Não fazem parte desta entrega OCR, correção da coleta histórica dos 889 arquivos em erro nem uma tela administrativa de IA.

O usuário autorizou explicitamente resolver dúvidas por inspeção, aprovar o plano e executar sem nova rodada de perguntas. Este documento registra essa confirmação prévia como o *Understanding Lock* do trabalho.

## Premissas

- “Toda a licitação” significa todo o texto disponível em `documentos_arquivo.texto`, complementado pelos dados estruturados da contratação. Arquivos não coletados, sem camada textual, grandes demais ou com erro serão declarados como lacunas de cobertura.
- O ambiente de execução fornecerá um endpoint de chat compatível com OpenAI por `ANALISE_API_URL`, modelo por `ANALISE_MODELO` e, quando necessário, segredo por `ANALISE_API_KEY`. Ollama local pode servir o mesmo contrato `/v1` em desenvolvimento.
- O `bge-m3` existente continua responsável somente por embeddings; um modelo de chat separado produz a redação.
- A aplicação permanece de uso interno. O endpoint terá cache, lease/single-flight, cooldown e limite de contexto; autenticação global da aplicação é uma iniciativa separada, pois exigir sessão apenas neste botão quebraria o fluxo atual sem login explícito.
- Escala atual: 8.792 licitações, 10.424 chunks, 1.425 arquivos processados e no máximo poucas gerações concorrentes. O caminho de detalhe não pode ficar mais lento antes do clique.

## Requisitos não funcionais

- **Desempenho:** abrir o detalhe não inicia IA. Cache pronto deve responder em uma consulta; geração pode levar até 180 segundos e exibe progresso indeterminado.
- **Escala/custo:** uma geração por licitação/fingerprint; cliques concorrentes compartilham lease. Contexto e número de chamadas têm tetos explícitos.
- **Segurança/privacidade:** chaves e chamadas do modelo ficam no servidor; documentos são tratados como dados não confiáveis e não podem dar instruções ao modelo; o modelo não recebe ferramentas.
- **Confiabilidade:** resultado só vira `pronta` depois de validar o JSON; falhas preservam a análise anterior e permitem tentar novamente; ausência de cobertura vira estado explícito.
- **Manutenção:** prompt, modelo, algoritmo e fingerprint são versionados. A implementação usa portas injetáveis para testes sem rede.

## Abordagens consideradas

### 1. Somente top-K vetorial

É simples e barato, mas pode omitir garantias, sanções ou anexos pouco semelhantes às perguntas. Rejeitada porque não sustenta “toda a licitação”.

### 2. Enviar todos os documentos em uma chamada

Tem implementação curta, porém estoura contexto em editais longos, aumenta custo e não produz cobertura verificável. Rejeitada.

### 3. Cobertura integral + busca semântica + síntese (aprovada)

O texto integral é dividido em blocos de análise e cada bloco produz fatos compactos com evidências. Em paralelo lógico, consultas vetoriais temáticas recuperam os trechos mais relevantes sobre escopo, habilitação, qualificação técnica, prazos, julgamento, garantias, sanções, pagamento, visita, consórcio e subcontratação. Uma síntese final recebe os fatos de cobertura, os trechos semânticos e os metadados, valida um JSON estruturado e grava o resultado com fingerprint. É mais custosa na primeira execução, mas completa, rastreável e cacheável.

## Arquitetura

### Persistência e recuperação

Uma migração cria `licitacoes_analises`, com uma linha por licitação: estado, resultado JSON, fontes JSON, cobertura JSON, fingerprint, versões de prompt/algoritmo, modelo, timestamps, lease e erro. RLS permanece ativa sem política pública; o servidor acessa pela service role, como o restante do repositório.

A função `buscar_chunks_analise` recebe licitação, embedding, modelo e limite. Ela filtra a licitação e documentos ativos **antes** da distância vetorial, retorna nome/tipo/ordem/trecho/distância e só pode ser executada por `service_role`. Uma segunda leitura server-only obtém os textos integrais e estados dos arquivos para calcular cobertura e map-reduce.

O fingerprint combina versão do algoritmo/prompt, modelo, `updated_at` da licitação e hashes/estados dos documentos ativos. Cache só é reutilizado quando a assinatura coincide.

### Serviço de análise

`src/services/analise` conterá quatro partes:

1. contratos e esquemas Zod da resposta;
2. seleção de contexto, consultas temáticas, deduplicação e cálculo de cobertura;
3. cliente de chat compatível com OpenAI, configurado somente no servidor;
4. orquestrador que adquire lease, mapeia todo o texto extraído em blocos, faz recuperação vetorial temática, sintetiza, valida e persiste.

O prompt separa instruções de conteúdo, declara os documentos como não confiáveis, proíbe seguir instruções encontradas neles e exige `fonteId` em riscos, requisitos e pontos importantes. O parse rejeita JSON inválido ou citações inexistentes.

### Fluxo de interface

O botão **Análise** fica nas ações do detalhe e abre um `Sheet` responsivo. O painel consulta o cache ao abrir; se não houver resultado válido, mostra a apresentação e um botão **Gerar análise**. Durante a geração, bloqueia cliques duplicados e mostra estado de processamento.

O resultado exibe: veredito e confiança, resumo executivo, pontos importantes, prazos, habilitação/qualificação, riscos e ressalvas, próximos passos, cobertura e evidências expansíveis. **Regenerar** força uma nova execução; uma análise obsoleta pode continuar visível com aviso enquanto a nova é produzida.

Estados: nunca gerada, indisponível sem texto, processando, pronta, parcial, desatualizada e erro recuperável.

## Tratamento de erros e bordas

- Sem chunks, mas com texto integral: gera por cobertura e informa que a recuperação vetorial não estava disponível.
- Com chunks, mas sem texto integral: gera uma análise parcial a partir das evidências vetoriais.
- Sem qualquer texto: não chama o modelo; explica a falta de conteúdo e aponta os estados dos arquivos.
- Documento retirado não entra; documento escaneado/erro entra apenas na lista de lacunas.
- Timeout, HTTP inválido ou JSON inválido grava erro sanitizado e libera o lease.
- Lease abandonado expira; outro pedido pode retomar.
- Conteúdo do edital nunca pode alterar o formato, o sistema ou solicitar ferramentas/segredos.

## Estratégia de testes

- Unidade: consultas temáticas, blocos integrais, orçamento de contexto, deduplicação, cobertura, fingerprint, prompt injection, parse e validação de citações.
- Repositório/RPC: filtro estrito por licitação, somente documentos ativos, cache válido/obsoleto, lease e persistência de erro/sucesso.
- Server function: UUID, cache, força regeneração, indisponível, concorrência e falha do provedor com dependências falsas.
- UI: extrair modelo de apresentação testável em Node e validar os estados; inspeção real pelo navegador para layout e acessibilidade.
- Gates: testes direcionados, suíte completa, TypeScript, ESLint/Prettier apenas nos arquivos tocados e build. O lint global já falha no baseline por 183 erros preexistentes.

## Decision log

| Decisão | Alternativas | Motivo |
|---|---|---|
| Map-reduce integral + vetorial temático | top-K; contexto único | Cobrir cláusulas raras e manter rastreabilidade |
| Geração sob demanda com cache | gerar na sincronização | Não atrasar ingestão nem gastar com licitações nunca abertas |
| JSON validado e fontes obrigatórias | Markdown livre | UI previsível e menor risco de alucinação |
| Provedor OpenAI-compatible configurável | SDK proprietário; Ollama fixo | Funciona com hospedado ou Ollama sem acoplar o domínio |
| `Sheet` lateral | modal curto; nova rota | Mantém contexto da ficha e acomoda conteúdo longo |
| Cobertura honesta | esconder arquivos faltantes | 889 arquivos estão hoje em erro; silêncio seria falsa completude |
| Cooldown + lease no banco | apenas estado React | Evita custo duplicado entre processos/abas |
| Sem autenticação isolada nesta feature | middleware somente aqui | O app atual não tem fluxo de login; segurança global deve ser coerente |

## Riscos reconhecidos

- A produção precisa configurar um modelo de chat acessível ao runtime; `127.0.0.1` não funciona no Lovable Cloud.
- A qualidade está limitada pela coleta: hoje só 257 licitações têm chunks e 889 arquivos estão em erro.
- Modelos generativos podem errar; por isso cobertura, evidências e linguagem de confiança são parte do contrato.
- A primeira análise de um edital grande pode levar dezenas de segundos e várias chamadas; cache e limites controlam o custo.

