# Especificação de Funcionalidades de Engenharia de Licitações

**Data:** 2026-09-21  
**Autor:** Antigravity AI (Persona: Engenheiro Orçamentista Senior de Obras Públicas)  
**Status:** Aprovado para Implementação  
**Escopo:** Frontend & UX de Análise Técnica de Licitações de Obras

---

## 1. Diagnóstico do Ponto de Vista do Engenheiro de Obras

Após os testes realizados no sistema simulando uma construtora buscando editais no estado de SP:

1. **Filtro de Ruído & Foco em Obras**:
   - Termos amplos como "reforma" capturam itens não-civis (ex.: reforma de estofados de frota escolar).
   - Necessidade de um filtro toggle no explorador: *"Apenas Obras e Serviços de Engenharia"*, além de chips de refinamento rápido.
2. **Checklist de Documentos Técnicos Essenciais**:
   - Para precificar uma obra pública, o engenheiro precisa urgentemente de 4 peças:
     1. Edital / Minuta Contratual
     2. Planilha Orçamentária e Cronograma Físico-Financeiro
     3. Projetos Básicos / Executivos
     4. Memorial Descritivo e Caderno de Encargos
   - Exibir um Checklist Visual de Prontidão Documental com badges claros na página de detalhe da licitação.
3. **Cronograma Legal da Licitação (Lei 14.133/2021)**:
   - Apresentar cálculo do prazo limite para **Pedidos de Esclarecimento e Impugnação** (3 dias úteis antes do encerramento das propostas) e alerta sobre **Visita Técnica**.
4. **Matriz de Decisão GO / NO-GO (Motivos de Descarte e Interesse)**:
   - Permitir registrar motivos pré-definidos ao descartar ou marcar interesse em uma licitação (ex.: Falta de Acervo Técnico/CAT, Margem Baixa/Inexequível, Raio Geográfico Inviável, Prazo Incompatível).
5. **Funil de Triagem de Obras no Dashboard**:
   - Exibir a esteira de oportunidades da construtora por status interno (Nova -> Em Análise -> Interessante -> Proposta Enviada) para acompanhamento da diretoria de engenharia.

---

## 2. Arquitetura das Soluções Propostas

### 2.1. Filtro de Obras e Engenharia Civil (`src/routes/licitacoes.index.tsx`)
- Adicionar chave de filtro inteligente no topo da pesquisa: `apenas_obras` (que filtra licitações pertencentes às categorias civis: Pavimentação, Drenagem, Infraestrutura urbana, Manutenção predial, Serviços de engenharia, Reforma, Obra nova, ou score ≥ 40).
- Destacar a categoria técnica no card/tabela.

### 2.2. Checklist Documental e Cronograma Legal (`src/routes/licitacoes.$id.tsx`)
- Criar componente de cronograma com:
  - Data de Publicação
  - Prazo Limite para Impugnação/Esclarecimento (estimado D-3 úteis)
  - Data Limite para Envio da Proposta com contador regressivo
  - Orientações sobre Visita Técnica / Atestado de Vistoria
- Criar painel de prontidão documental verificando a presença de Edital, Orçamento, Projetos e Memorial.

### 2.3. Tags de Motivo de Descarte e Decisão GO / NO-GO (`src/routes/licitacoes.$id.tsx` e modal)
- Tags rápidas de descarte:
  - *Falta de Acervo Técnico (CAT)*
  - *Preço Inexequível / Margem Baixa*
  - *Prazo de Execução Curto*
  - *Distância / Logística Inviável*
  - *Exigências Restritivas no Edital*
- Ao clicar em uma tag, ela é automaticamente apensada às observações internas e salva no histórico com 1 clique.

### 2.4. Funil de Triagem de Engenharia no Dashboard (`src/routes/index.tsx`)
- Mini funil visual com as contagens de licitações em cada status interno (`nova`, `em_analise`, `interessante`, `proposta_enviada`, `descartada`) com links diretos para cada lista.

---

## 3. Critérios de Aceite
1. Busca filtrável por "Apenas Obras e Engenharia" sem ruído de materiais genéricos.
2. Checklist de documentos e cronograma legal com cálculo de prazo de impugnação renderizados na página de detalhe.
3. Tags de motivo de descarte/interesse funcionais com gravação em observações e histórico.
4. Funil de triagem renderizado no Dashboard com dados reais do banco.
5. 100% dos testes unitários da aplicação aprovados.
