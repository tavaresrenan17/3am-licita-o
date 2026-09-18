# Desempenho PNCP e estratégia de busca

## Objetivo

Medir separadamente o tempo gasto na API do PNCP, na transformação e no Supabase; tornar o diagnóstico repetível; e decidir com evidência se busca vetorial melhora o produto.

## Diagnóstico

- O projeto não possui banco vetorial: não há `pgvector`, embeddings, coluna `vector` nem índice HNSW/IVFFlat.
- A busca atual combina `tsvector` em português e trigramas. Isso atende diretamente aos filtros pedidos pelo produto: palavras-chave, modalidade, UF, município, publicação e faixa de valor.
- Em execuções reais saudáveis, a API do PNCP consumiu de 74% a 83% do tempo total. Em degradação, consumiu 94,4% sem entregar páginas.
- O worker mede a duração HTTP, mas não isola transformação, persistência do payload bruto e merge no catálogo.
- O benchmark atual usa uma amostra por cenário. Ele não calcula p50/p95/p99 nem produz um resultado estável para comparar versões.
- A última função de busca recriou funções `security definer` sem `search_path` fixo e filtra modalidade por nome, enquanto parte dos índices favorece o identificador.

## Alternativas avaliadas

### Adotar pgvector agora

Permitiria busca semântica, mas exigiria um provedor de embeddings, reprocessamento quando o texto mudar, índice vetorial, testes de recall e operação adicional. Não reduz o tempo da sincronização com o PNCP e não acelera filtros exatos. Sem um conjunto de consultas e resultados esperados, não há como provar que a relevância melhorou.

### Manter apenas a implementação atual

Evita complexidade, porém preserva pontos cegos de telemetria, benchmarks frágeis e índices desalinhados com alguns filtros.

### Melhorar a busca lexical e criar um portão de decisão para vetores

É a opção escolhida. Primeiro medimos e corrigimos o caminho que o usuário realmente usa. A busca vetorial fica condicionada a um experimento offline com consultas reais, cobertura de embeddings, recall@10 e latência sob filtros.

## Solução aprovada

1. Criar um benchmark reproduzível com aquecimento, várias amostras, ordem variável, p50/p95/p99 e saída JSON. Ele medirá PNCP e RPC de busca separadamente e não alterará dados.
2. Instrumentar o worker por fase: espera do limitador, HTTP, transformação, payload bruto, merge e administração do segmento. Persistir os acumulados junto às métricas do job.
3. Alinhar índices aos filtros públicos e fixar o `search_path` das funções privilegiadas alteradas recentemente.
4. Corrigir a suíte do worker para refletir os parâmetros vigentes e manter cenários com parâmetros explícitos determinísticos.
5. Registrar um protocolo para pgvector. A implementação só será ativada quando a busca lexical falhar num conjunto de relevância e a abordagem híbrida superar o baseline sem violar os limites de latência.

## Critérios

- Testes unitários, lint e build devem passar.
- O benchmark deve reportar cada cenário com amostras, sucessos, falhas, p50, p95 e p99.
- Nenhum benchmark pode criar, alterar ou apagar licitações.
- As métricas devem continuar compatíveis durante a aplicação gradual da migração.
- Funções `security definer` tocadas pela mudança devem usar `set search_path = public, extensions, pg_temp` ou um caminho ainda mais restrito.
- A recomendação sobre vetores deve ser verificável: cobertura mínima de embeddings de 99%, recall@10 contra busca exata e comparação de p95 com e sem filtros.

## Premissas decididas

- O foco inicial continua sendo SP e licitações abertas com prazo disponível.
- Instabilidade do PNCP será tratada com timeout, retry, cooldown e retomada; não com aumento indiscriminado de concorrência.
- O banco relacional é a fonte da busca do app. Vetores, se aprovados no futuro, serão uma camada híbrida de ordenação, não uma substituição dos filtros relacionais.
