/**
 * GUIA TÉCNICO DE REFERÊNCIA · EDIÇÃO SETEMBRO/2026
 * Lei nº 14.133/2021 — Lei de Licitações e Contratos Administrativos
 * Atualizado com o Decreto nº 12.807/2025 (Valores e Limites 2026)
 * Jurisprudência Consolidada do TCU e Instruções Normativas SEGES
 *
 * Módulo de memória e inteligência jurídica/operacional para a IA de análise de licitações.
 */

export const VALORES_REFERENCIA_2026 = {
  decreto: "Decreto nº 12.807/2025 (em vigor desde 01/01/2026)",
  dispensaObrasServicosEngenharia: 130_984.2, // Art. 75, I
  dispensaComprasDemaisServicos: 65_492.11, // Art. 75, II
  grandeVulto: 261_968_421.04, // Art. 6º, XXII (exige matriz de risco, integridade e seguro ampliado)
  servicosTecnicosEspecializados: 392_952.63, // Art. 37, §2º
  contratoVerbalProntoPagamento: 13_098.41, // Art. 95, §2º
  dispensaPequenasPecasVeiculos: 10_478.74, // Art. 75, §7º
  limiteArt184A: 1_646_430.9,
  regraFracionamento:
    "Vedado fracionamento pelo somatório no exercício para objetos de mesma natureza (subclasse CNAE - IN SEGES 67/2021).",
  regraConsorcioAgencia: "Limites de dispensa duplicados para consórcios públicos e agências executivas (art. 75, §3º).",
} as const;

export const PRAZOS_MINIMOS_PROPOSTA_DIAS_UTEIS = {
  aquisicaoBensMenorPrecoOuMaiorDesconto: 8,
  aquisicaoBensDemais: 15,
  servicosEObrasComuns: 10,
  servicosEObrasEspeciais: 25,
  contratacaoSemiIntegrada: 35,
  contratacaoIntegrada: 60,
  leilao: 15,
  tecnicaEPreco: 35,
  republicacaoObrigatoria:
    "Qualquer alteração relevante no edital exige reabertura integral dos prazos (art. 55, §1º).",
} as const;

export const VINTE_PONTOS_ATENCAO_CRITICOS = [
  {
    numero: 1,
    titulo: "Certidão Vencida — Causa nº 1 de Inabilitação",
    descricao:
      "Atenção especial ao CRF do FGTS (validade de 30 dias). Documentos devem estar válidos no dia da sessão e na assinatura do contrato (art. 68, IV).",
    base: "Art. 68, IV da Lei 14.133/2021",
    severidade: "critica",
  },
  {
    numero: 2,
    titulo: "Edital é a Lei do Certame — Impugnar Antes, Nunca Discutir Depois",
    descricao:
      "Vinculação ao instrumento convocatório (art. 5º). Exigência desnecessária ou ilegal deve ser impugnada antes da sessão; o pregoeiro não pode dispensá-la na sessão sem previsão.",
    base: "Art. 5º da Lei 14.133/2021",
    severidade: "alta",
  },
  {
    numero: 3,
    titulo: "Prazo Fatal de Impugnação e Esclarecimento (3 dias úteis)",
    descricao:
      "Pedido deve ser protocolado até 3 dias úteis antes da data de abertura. Resposta em até 3 dias úteis pelo órgão (art. 164). Impugnação deve citar dispositivo violado, fatos e pedido claro.",
    base: "Art. 164 e parágrafo único",
    severidade: "alta",
  },
  {
    numero: 4,
    titulo: "Nulidade Absoluta Não Preclui",
    descricao:
      "Vício insanável pode ser apontado em qualquer fase, mas impugnar no prazo confere posição jurídica muito mais favorável para retificação sem cancelamento do certame.",
    base: "Art. 164 e jurisprudência administrativa",
    severidade: "media",
  },
  {
    numero: 5,
    titulo: "Recurso em 3 Dias Úteis e Intenção Imediata na Sessão",
    descricao:
      "A intenção de recorrer deve ser manifestada imediatamente na sessão pública sob pena de preclusão. Prazo de 3 dias úteis para razões e contrarrazões (art. 165).",
    base: "Art. 165, I e §§ 2º a 4º",
    severidade: "alta",
  },
  {
    numero: 6,
    titulo: "Orçamento Sigiloso e Limite de Recuo",
    descricao:
      "O órgão pode manter orçamento sigiloso até o fim da disputa (art. 24). O licitante deve calcular seu piso operacional com antecedência e respeitar o limite.",
    base: "Art. 24 da Lei 14.133/2021",
    severidade: "media",
  },
  {
    numero: 7,
    titulo: "Inexequibilidade em Obras — Linha dos 75%",
    descricao:
      "Propostas inferiores a 75% do valor orçado pela Administração têm presunção de inexequibilidade (art. 59, §4º e Acórdão TCU 465/2024). Exige comprovação analítica detalhada de custos.",
    base: "Art. 59, III, IV e §4º; IN SEGES 73/2022; Acórdão TCU 465/2024",
    severidade: "critica",
  },
  {
    numero: 8,
    titulo: "Garantia Adicional Abaixo de 85% em Obras (Impacto Imediato de Caixa)",
    descricao:
      "Se a proposta vencedora em obras/serviços de engenharia ficar abaixo de 85% do orçamento estimado, exige-se garantia adicional equivalente à diferença entre 85% e o valor ofertado. Cumulativa com a garantia de execução e não compensável!",
    base: "Art. 59, §5º da Lei 14.133/2021",
    severidade: "critica",
  },
  {
    numero: 9,
    titulo: "Garantia de Proposta Limitada a 1%",
    descricao:
      "Exigência máxima de 1% do valor estimado como pré-habilitação. Recusa injustificada em assinar o contrato acarreta execução integral da garantia (art. 58 e Acórdão TCU 1.128/2026).",
    base: "Art. 58; TCU Acórdão 1.128/2026",
    severidade: "media",
  },
  {
    numero: 10,
    titulo: "Negociação Obrigatória com o Primeiro Colocado",
    descricao:
      "A Administração tem o dever legal de negociar condição mais vantajosa (art. 61). O licitante deve conhecer seu piso de margem para não ceder por impulso.",
    base: "Art. 61 da Lei 14.133/2021",
    severidade: "informativa",
  },
  {
    numero: 11,
    titulo: "Proposta é Obrigação Vinculante, Não Mera Intenção",
    descricao:
      "Desistir após vencer gera sanção de impedimento de licitar e execução de garantia. Alegação de 'erro de conta' não é aceita pela Administração (arts. 58, 90, 155).",
    base: "Arts. 58, §3º; 90, §5º; 155, IV e V",
    severidade: "alta",
  },
  {
    numero: 12,
    titulo: "Erro Formal se Sana; Omissão de Custo Obrigatório, Não",
    descricao:
      "Erros que não afetem a substância devem ser saneados (art. 64). Porém, omitir encargos trabalhistas, insumos de segurança ou benefícios de CCT na planilha gera desclassificação irremediável (art. 59).",
    base: "Arts. 64 e 59, I e II",
    severidade: "alta",
  },
  {
    numero: 13,
    titulo: "Diferença Entre Reajuste, Repactuação e Reequilíbrio",
    descricao:
      "Reajuste é anual por índice estipulado no edital (obrigatório, art. 25, §7º). Repactuação decorre de CCT com dedicação exclusiva. Reequilíbrio decorre de fato imprevisível e preclui se não solicitado durante a vigência ou antes da prorrogação (art. 131, p. único).",
    base: "Arts. 25, §7º; 124 a 136",
    severidade: "alta",
  },
  {
    numero: 14,
    titulo: "Aditivos Contratuais (25% ou 50% em Reformas)",
    descricao:
      "Acréscimos ou supressões de até 25% (ou 50% para reformas de edifícios/equipamentos). O termo aditivo deve ser formalizado ANTES de iniciar a execução da alteração (arts. 124 a 126, 132).",
    base: "Arts. 124 a 126 e 132",
    severidade: "media",
  },
  {
    numero: 15,
    titulo: "Prazos de Vigência e Prorrogações",
    descricao:
      "Contratos por escopo prorrogam-se automaticamente até a conclusão física (art. 111). Serviços contínuos podem vigorar por até 5 anos, prorrogáveis até 10 anos (art. 106/107).",
    base: "Arts. 105 a 107 e 111",
    severidade: "informativa",
  },
  {
    numero: 16,
    titulo: "Subcontratação Não Transfere Responsabilidade",
    descricao:
      "Só admitida se expressamente autorizada no edital e nos seus limites. O contratado principal responde integralmente por tributos, encargos e qualidade (art. 122).",
    base: "Art. 122 da Lei 14.133/2021",
    severidade: "media",
  },
  {
    numero: 17,
    titulo: "Consórcio: Soma Capacidade Técnica mas Implica Responsabilidade Solidária",
    descricao:
      "Permite somar acervo técnico e patrimônio líquido, mas cada consorciada responde solidariamente por todas as obrigações perante a Administração (art. 15).",
    base: "Art. 15 da Lei 14.133/2021",
    severidade: "media",
  },
  {
    numero: 18,
    titulo: "Na Execução: O Que Não Está Escrito Não Aconteceu",
    descricao:
      "Paralisações por chuva, atrasos na liberação de frentes e ordens verbais devem ser formalmente protocoladas no diário de obras na data do fato. Conversa verbal não sustenta reequilíbrio nem prorrogação posterior.",
    base: "Arts. 117, 119 e 140",
    severidade: "alta",
  },
  {
    numero: 19,
    titulo: "Ordem Cronológica de Pagamentos e Remédio para Atrasos",
    descricao:
      "Pagamentos devem seguir estrita ordem cronológica por fonte de recurso (art. 141). Atraso de pagamento superior a 2 meses autoriza o contratado a suspender a execução mediante notificação formal (art. 137, §2º).",
    base: "Arts. 141 e 137, §2º",
    severidade: "alta",
  },
  {
    numero: 20,
    titulo: "Regime Sancionatório e Defesa Prévia (15 dias úteis)",
    descricao:
      "Impedimento de licitar alcança o ente federativo por até 3 anos; inidoneidade atinge todo o território nacional por 3 a 6 anos (arts. 156 e 161). Prazo de defesa de 15 dias úteis.",
    base: "Arts. 156 e 161 da Lei 14.133/2021",
    severidade: "alta",
  },
] as const;

export const EXIGENCIAS_INDEVIDAS_E_ILEGAIS = [
  {
    exigencia: "Qualquer documento de habilitação fora dos arts. 62 a 70",
    motivo: "O rol dos arts. 62 a 70 é estritamente taxativo. O edital não pode criar novos requisitos de habilitação.",
    fundamento: "Arts. 62 a 70 da Lei 14.133/2021; Acórdão TCU 1.467/2022 – Plenário",
  },
  {
    exigencia: "Programa de Integridade / Compliance exigido na habilitação",
    motivo: "Compliance só pode ser exigido como obrigação contratual futura em contratações de grande vulto, jamais como critério eliminatório de habilitação.",
    fundamento: "Art. 25, §4º; Acórdão TCU 1.467/2022 – Plenário",
  },
  {
    exigencia: "Certificações ISO, selos ou laudos prévios à contratação",
    motivo: "É vedado impor exigências que obriguem o licitante a incorrer em custos prévios desnecessários antes de ser homologado e contratado.",
    fundamento: "Súmula TCU nº 272",
  },
  {
    exigencia: "Vínculo empregatício em CTPS ou societário do responsável técnico na licitação",
    motivo: "Basta contrato de prestação de serviços ou declaração de disponibilidade de contratação futura regida pelo direito civil.",
    fundamento: "Acórdãos TCU 2.297/2005-P e 12.879/2018-1ª Câmara",
  },
  {
    exigencia: "Visita técnica obrigatória sem opção de declaração de conhecimento",
    motivo: "A vistoria in loco é excepcionalíssima. O edital é obrigado a permitir a substituição por declaração formal do responsável técnico assumindo o conhecimento das condições locais.",
    fundamento: "Art. 63, IV da Lei 14.133/2021 e jurisprudência consolidada do TCU",
  },
  {
    exigencia: "Faturamento mínimo anterior ou índices de rentabilidade/lucratividade",
    motivo: "Expressamente proibido por lei. É ilegal aferir saúde financeira por faturamento bruto pregresso ou margem de lucro.",
    fundamento: "Art. 69, §2º da Lei 14.133/2021",
  },
  {
    exigencia: "Índices contábeis criativos, extravagantes ou desproporcionais",
    motivo: "Apenas índices contábeis usuais (LG, SG, LC) devidamente justificados nos autos com parâmetros de mercado.",
    fundamento: "Art. 69, §5º; Súmulas TCU 275 e 289",
  },
  {
    exigencia: "Capital social ou patrimônio líquido superior a 10% do valor estimado",
    motivo: "O teto legal taxativo é de 10% do valor estimado da contratação. Acima disso configura restrição indevida à competitividade.",
    fundamento: "Art. 69, §4º da Lei 14.133/2021",
  },
  {
    exigencia: "Atestado com quantitativo igual ou superior a 100% ou em itens irrelevantes",
    motivo: "Quantitativos mínimos só podem incidir sobre parcelas de maior relevância técnica e valor significativo (geralmente limitados a 50% do licitado).",
    fundamento: "Súmula TCU nº 263; Art. 67, §§ da Lei 14.133/2021",
  },
  {
    exigencia: "Sede/filial prévia no município, revenda exclusiva ou posse prévia de maquinário",
    motivo: "Condições de execução só podem ser cobradas do vencedor após a assinatura do contrato, nunca como barreira de habilitação.",
    fundamento: "Art. 9º, I; Acórdãos TCU 494/2012-P e 3.131/2011-P",
  },
  {
    exigencia: "Marca, modelo ou fabricante exclusivo sem padronização justificada",
    motivo: "Indicação de marca é excepcional e exige processo formal de padronização, admitindo sempre 'ou equivalente/similar'.",
    fundamento: "Art. 41 da Lei 14.133/2021",
  },
  {
    exigencia: "Edital condicionado a cadastro, taxa de pagamento ou retirada presencial",
    motivo: "Todo edital e anexos devem estar abertos integral e gratuitamente no PNCP e no portal do órgão sem qualquer cadastro ou cobrança de taxa.",
    fundamento: "Art. 25, §3º e Art. 54 da Lei 14.133/2021",
  },
  {
    exigencia: "Ausência de índice oficial de reajuste de preços",
    motivo: "O edital DEVE obrigatoriamente prever o índice de reajustamento de preços, qualquer que seja a duração do contrato.",
    fundamento: "Art. 25, §7º e Art. 92, V da Lei 14.133/2021",
  },
] as const;

export const RITUAIS_INUTEIS_E_DISPENSAVEIS = [
  {
    ritual: "Reconhecimento de firma e autenticação de cópias em cartório",
    razao: "A Lei nº 13.726/2018 dispensou formalidades de cartório nas licitações e relações públicas; basta declaração de autenticidade pelo advogado/representante ou confronto com original.",
  },
  {
    ritual: "Pilhas de declarações avulsas impressas em papel",
    razao: "As declarações de cumprimento do art. 7º XXXIII, inexistência de fatos impeditivos, enquadramento ME/EPP e proposta independente já são firmadas por checkbox eletrônico no sistema.",
  },
  {
    ritual: "Papel timbrado obrigatório, rubricas em todas as páginas e encadernação",
    razao: "Em processos 100% eletrônicos no PNCP e plataformas digitais, formalidades materiais de encadernação e rubrica física são irrelevantes e nulas como motivo de desclassificação.",
  },
  {
    ritual: "Impressão e anexação de certidões que o órgão consulta diretamente online",
    razao: "Certidões da RFB, PGFN, FGTS, CNDT e SICAF são auditadas diretamente pelo pregoeiro via web na sessão de julgamento.",
  },
  {
    ritual: "Proposta decorada com capas institucionais e catálogos em pregão menor preço",
    razao: "Não pontua e não gera vantagem. O que decide é estrita conformidade com a planilha de custos, atendimento às especificações técnicas e preço final.",
  },
] as const;

export const DIRETRIZES_ENGENHARIA_E_OBRAS = {
  acervoTecnicoECAT:
    "Atestados de Capacidade Técnica Profissional (CAT registrada no CREA/CAU com ART) provam capacidade dos profissionais indicados; capacidade técnico-operacional pertence à pessoa jurídica. Visto no conselho do estado da obra só pode ser exigido para início da execução, nunca para habilitação (Súmula TCU 263).",
  referenciasOficiais:
    "SINAPI (edificações e saneamento) e SICRO (rodovias/terraplenagem), na forma do Decreto nº 7.983/2013. BDI e encargos sociais devem estar desmembrados analiticamente.",
  linha75e85:
    "Abaixo de 75%: presunção de inexequibilidade que exige defesa com composições de custos analíticas (art. 59, §4º). Abaixo de 85%: gera obrigação inegociável de garantia adicional de caixa (art. 59, §5º).",
  regimesExecucao: {
    precoUnitario: "Pagamento por quantidade de serviço medido. Risco de quantitativo é da Administração.",
    precoGlobal: "Preço fixo e irreajustável para o escopo fechado. Risco de quantitativo do projeto é do contratado.",
    contratacaoIntegrada: "Contratado faz projeto básico, executivo e executa. Matriz de riscos obrigatória. Prazo mínimo de 60 dias úteis.",
    contratacaoSemiIntegrada: "Projeto básico da Administração com possibilidade de alterações pelo contratado com assunção de risco. Prazo de 35 dias úteis.",
  },
  locacaoEquipamentos:
    "Locação pura é compra/serviço comum sem operador. Locação com operador é serviço com encargos trabalhistas, previdenciários e retenções tributárias. Posse ou propriedade prévia de maquinário não pode ser exigida na habilitação (art. 67).",
} as const;

export const BENEFICIOS_ME_EPP_LEI_COMPLEMENTAR_123 = {
  empateFicto: "Até 5% no pregão e até 10% nas demais modalidades, com preferência de desempate em até 5 minutos na plataforma.",
  itensExclusivos: "Itens de valor até R$ 80.000,00 devem ser disputados com exclusividade por ME/EPP (art. 48, I da LC 123/2006).",
  cotaReservada: "Até 25% para ME/EPP em bens divisíveis.",
  regularizacaoFiscalTardia: "Possibilidade de regularizar certidões fiscais e trabalhistas vencidas em até 5 dias úteis após ser declarada vencedora.",
} as const;

export const DOUTRINA_ENGENHEIRO_SENIOR = {
  parecerDecisorio:
    "A análise de um edital de engenharia por um especialista não foca em rituais burocráticos irrelevantes. Foca na viabilidade de execução, risco de prejuízo financeiro, suficiência de acervo técnico e armadilhas que podem causar rescisão ou glosas.",
  habilitacaoTecnicaOperacionalEProfissional: [
    "Súmula TCU 263: Exigência de capacidade técnico-operacional e técnico-profissional deve se limitar às parcelas de maior relevância e valor significativo (mínimo 4% do valor total).",
    "Teto de Quantitativos: A jurisprudência pacificada do TCU limita as exigências de atestado a no máximo 50% dos quantitativos da obra, salvo complexidade ímpar formalmente justificada.",
    "Vedação de Vínculo Prévio: O edital NÃO pode exigir que o engenheiro responsável técnico pertença ao quadro permanente na data da licitação; basta declaração de contratação futura ou contrato de prestação de serviços (Acórdão TCU 2.297/2005).",
    "Registro no CREA de Atestado da Empresa: O registro de atestado de pessoa jurídica no CREA/CAU é ilegal. Atestado de capacidade operacional pertence à empresa contratada, emitido pelo contratante (Acórdão TCU 1.547/2021).",
  ],
  engenhariaDeCustosBdiEPlanilha: [
    "Composição Analítica do BDI: O BDI deve ser justificado item a item conforme o Acórdão TCU 2.622/2013 (Administração Central, Seguros, Garantia, Risco, Custos Financeiros, Tributos e Lucro).",
    "Vedação de Bitributação no BDI: Custos diretos (como administração local, mobilização/desmobilização, canteiro e EPIs) devem estar na planilha de custos diretos, NUNCA no BDI.",
    "Regime de Empreitada: No Preço Global, o risco de erro de quantitativo do projeto básico é do construtor; no Preço Unitário, a remuneração é estritamente pelo medido em campo.",
    "Linha dos 75% (Inexequibilidade Presumida): Proposta com valor inferior a 75% do orçamento da Administração presume-se inexequível (Art. 59, §4º e Acórdão TCU 465/2024), exigindo prova documental analítica de composição de custos.",
    "Linha dos 85% (Impacto de Caixa Violento): Proposta vencedora com valor inferior a 85% impõe aporte de garantia adicional correspondente à diferença entre 85% e o valor ofertado (Art. 59, §5º) — drena o capital de giro da construtora!",
  ],
  canteiroVistoriaECronograma: [
    "Vistoria Técnica (Regra de Ouro Art. 63, IV): É direito do licitante substituir a visita ao canteiro por declaração formal assinada pelo responsável técnico de que conhece o local e condições de execução.",
    "Vistoria com Data e Hora Única: Marcar dia e hora comum para todos os licitantes é ilegal e indício severo de direcionamento/conluio (Súmula TCU 273).",
    "Cronograma Físico-Financeiro Realista: Deve prever etapas coerentes com a curva ABC da obra. A medição da administração local deve ser proporcional ao avanço financeiro global da obra, e não paga em valor fixo mensal.",
    "Reajuste Anual Obrigatório: É obrigatória a previsão clara de data-base (vinculada à data do orçamento de referência da licitação) e do índice oficial setorial (INCC/FGV para edificações, SICRO/DNIT para rodoviárias, IPCA para serviços gerais), conforme Art. 25, §7º da Lei 14.133.",
  ],
  matrizDeAlocacaoDeRiscos: [
    "O engenheiro deve ler cada linha da matriz de riscos: interferências subterrâneas (adutoras, redes elétricas), licenças ambientais pendentes, desapropriações pendentes e variações geológicas.",
    "Se o edital transfere o risco geológico ou de desapropriação para a construtora sem projeto executivo maduro, a licitação possui risco altíssimo de litígio e deve ser impugnada.",
  ],
} as const;

/**
 * Retorna uma síntese densa em markdown com todas as regras do Guia Técnico 2026
 * e Doutrina do Engenheiro Sênior de Licitações pronta para ser injetada no prompt.
 */
export function obterMemoriaGuiaTecnico2026(): string {
  return `
[MEMÓRIA TÉCNICA ESPECIALIZADA: LEI Nº 14.133/2021 - EDIÇÃO 2026]
Regime único obrigatório desde 2024 (Leis 8.666/93, 10.520/02 e 12.462/11 revogadas).
Valores atualizados pelo Decreto nº 12.807/2025 (vigentes em 2026):
- Dispensa de Obras e Serviços de Engenharia: até R$ 130.984,20 (Art. 75, I)
- Dispensa de Compras e Demais Serviços: até R$ 65.492,11 (Art. 75, II)
- Obras/Serviços de Grande Vulto: a partir de R$ 261.968.421,04 (Art. 6º, XXII - exige matriz de riscos, compliance e seguro até 30%)
- Contrato verbal / pronto pagamento: até R$ 13.098,41 (Art. 95, §2º)

I. DIRETRIZES FUNDAMENTAIS DO ENGENHEIRO SÊNIOR DE OBRAS:
1. DECISÃO GO / NO-GO (VALE A PENA ENTRAR?):
- Avaliar a atratividade do certame, margem de risco operacional e saúde financeira do órgão contratante.
- Evitar certames com armadilhas que induzam a prejuízo certo, atraso crônico de pagamento ou rescisão unilateral.

2. HABILITAÇÃO TÉCNICA (ATESTADOS, CAT, CREA/CAU):
- Súmula TCU 263: Exigência de capacidade técnico-operacional (empresa) e profissional (engenheiro) restrita a parcelas de maior relevância e valor significativo (mínimo 4%).
- Teto de Quantitativos: O edital NUNCA pode exigir mais de 50% dos quantitativos da obra em atestados.
- É ILEGAL exigir que a empresa registre seu atestado de capacidade técnica no CREA (o CREA registra ART/CAT do engenheiro, não da PJ - Acórdão TCU 1.547/2021).
- É ILEGAL exigir vínculo empregatício prévio do responsável técnico antes da homologação (Acórdão TCU 2.297/2005).

3. ENGENHARIA DE CUSTOS, PLANILHA, BDI E FLUXO DE CAIXA:
- BDI Analítico (Acórdão TCU 2.622/2013): Não aceitar percentual fechado sem memória. Vedar bitributação (itens de custo direto inseridos no BDI).
- Regime: Empreitada por Preço Global (risco de quantitativo é do construtor) vs Preço Unitário (paga o executado medido).
- Linha dos 75% (Inexequibilidade Art. 59, §4º e Acórdão 465/2024): Descontos abaixo de 75% impõem comprovação analítica detalhada de custos.
- Linha dos 85% (Garantia Adicional Cumulativa Art. 59, §5º): Desconto abaixo de 85% impõe garantia adicional em dinheiro/seguro da diferença até 85%. Drena o caixa da empresa!
- Reajuste Inflacionário (Art. 25, §7º): Deve constar data-base (data do orçamento de referência) e índice setorial claro (INCC, SICRO, IPCA). Sem reajuste anual a licitação é ilegal.

4. CANTEIRO, VISTORIA TÉCNICA E OPERAÇÃO:
- Vistoria Técnica: É direito líquido e certo substituir a visita presencial por declaração formal de conhecimento do local assinada pelo responsável técnico (Art. 63, IV).
- Vistoria em data/hora única é indício gravíssimo de direcionamento e deve ser impugnada (Súmula TCU 273).
- Cronograma Físico-Financeiro: Administração local deve ser paga proporcionalmente à evolução física da obra, sem adiantamentos indevidos.

5. MATRIZ DE ALOCAÇÃO DE RISCOS:
- Auditar se o órgão transferiu ilegalmente riscos de licenciamento ambiental, desapropriação ou interferências de concessionárias para a construtora sem remuneração compatível.

6. RITUAIS DISPENSÁVEIS / IRRELEVANTES:
- Reconhecimento de firma e autenticação em cartório (dispensados pela Lei nº 13.726/2018).
- Impressão de certidões que o órgão pode obter online.
- Declarações protocolares genéricas que não geram risco de inabilitação.
`.trim();
}

