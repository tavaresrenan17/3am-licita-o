# 06. Guia e Prompt de Implantação para LLM

Este documento contém o **Prompt Mestre de Implantação** que você deve copiar e colar ao abrir qualquer assistente de Inteligência Artificial (LLM) em um novo repositório.

---

## 📋 PROMPT MESTRE PARA COPIAR E COLAR NA LLM

> **Copie o bloco de texto abaixo e envie para a LLM do seu novo repositório:**

```text
Olá! Preciso que você implante a funcionalidade de FILTRO POR RAIO GEOGRÁFICO neste repositório.

A documentação técnica com os algoritmos, dados de cidades, funções de cálculo e componentes de interface está localizada na pasta:
`skills/filtro-por-raio/`

Por favor, siga este protocolo de implantação passo a passo:

1. LEITURA DA DOCUMENTAÇÃO:
   - Leia `skills/filtro-por-raio/SKILL.md` e compreenda a arquitetura.
   - Consulte os arquivos `01_ARQUITETURA_E_CONCEITOS.md`, `02_DADOS_CIDADES_E_COORDENADAS.md`, `03_ALGORITMOS_E_CALCULOS.md`, `04_INTEGRACAO_BANCO_DE_DADOS.md` e `05_INTERFACE_E_COMPONENTES_UI.md`.

2. ANÁLISE DO PROJETO ATUAL:
   - Identifique a stack do repositório (React, Next.js, Vue, Node.js, Python, Supabase, etc.).
   - Localize a tela ou rota onde os itens/registros são exibidos e filtrados.
   - Identifique como as cidades ou coordenadas (latitude/longitude) estão armazenadas nos registros.

3. IMPLANTAÇÃO BACKEND / CÁLCULO DE DISTÂNCIA:
   - Adicione a função de cálculo Haversine (copie de `03_ALGORITMOS_E_CALCULOS.md`).
   - Importe ou utilize a tabela/dicionário de coordenadas de cidades de `02_DADOS_CIDADES_E_COORDENADAS.md`.
   - Adicione o atributo `distancia_km` ao tipo/interface do registro.

4. IMPLANTAÇÃO FRONTEND / INTERFACE:
   - Adicione o componente de controle de raio (Slider de KM e Seletor de Cidade de Origem) na barra de filtros.
   - Aplique o filtro dinâmico: exibir apenas registros com `distancia_km <= raio_selecionado_km` (quando raio > 0).
   - Adicione uma Badge com a distância calculada em cada card/linha da lista.

5. VALIDAÇÃO:
   - Teste selecionando diferentes raios (ex: 50km, 150km, 300km) e alterando a cidade de origem.
   - Garanta que o botão "Limpar filtro" resete o raio para 0 (sem limite).

Por favor, apresente um plano rápido de onde você fará as alterações e em seguida aplique os códigos.
```

---

## 🛠️ Checklist de Verificação da Implantação

Quando a LLM terminar a implantação, você pode validar se tudo funcionou com este checklist:

- [ ] **Mapeamento de Origem**: É possível definir uma cidade de origem/sede (via `.env` ou dropdown de cidades).
- [ ] **Mapeamento dos Registros**: Todos os registros exibidos possuem coordenadas ou são associados a uma cidade pré-mapeada.
- [ ] **Slider de Raio**: O controle deslizante permite selecionar de $0\text{ km}$ até $500\text{ km}$.
- [ ] **Cálculo Preciso**: A distância exibida em cada card reflete a distância aproximada em km até a origem selecionada.
- [ ] **Performance**: A filtragem roda instantaneamente na interface ou no banco sem travar a tela.
- [ ] **Reset**: Ao clicar em "Limpar Filtro" ou definir raio 0, todos os registros voltam a ser exibidos sem restrição geográfica.
