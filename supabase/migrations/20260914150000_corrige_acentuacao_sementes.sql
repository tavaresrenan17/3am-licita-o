-- Correção de acentuação dos dados semeados.
--
-- O arquivo consolidado que foi colado no SQL Editor foi montado lendo os .sql
-- sem declarar UTF-8, e o PowerShell interpretou os bytes como ANSI. Resultado
-- no banco: "LeilÃ£o - EletrÃ´nico", "PregÃ£o", "construÃ§Ã£o".
--
-- As licitações vindas do PNCP não foram afetadas: elas entram pelo Node, que
-- trata JSON em UTF-8 do começo ao fim. Só as sementes do SQL precisam disto.

update public.modalidades m
   set nome = v.nome,
       atualizado_em = now()
  from (values
    (1, 'Leilão - Eletrônico'),
    (2, 'Diálogo Competitivo'),
    (3, 'Concurso'),
    (4, 'Concorrência - Eletrônica'),
    (5, 'Concorrência - Presencial'),
    (6, 'Pregão - Eletrônico'),
    (7, 'Pregão - Presencial'),
    (8, 'Dispensa'),
    (9, 'Inexigibilidade'),
    (10, 'Manifestação de Interesse'),
    (11, 'Pré-qualificação'),
    (12, 'Credenciamento'),
    (13, 'Leilão - Presencial'),
    (14, 'Inaplicabilidade da Licitação'),
    (15, 'Chamada pública'),
    (16, 'Concorrência – Eletrônica Internacional'),
    (17, 'Concorrência – Presencial Internacional'),
    (18, 'Pregão – Eletrônico Internacional'),
    (19, 'Pregão – Presencial Internacional')
  ) as v(id, nome)
 where m.id = v.id
   and m.nome is distinct from v.nome;

update public.configuracoes
   set palavras_chave = array[
     'obra', 'construção', 'reforma', 'engenharia', 'pavimentação', 'drenagem',
     'manutenção predial', 'infraestrutura', 'escola', 'hospital', 'praça',
     'urbanização', 'terraplenagem', 'concreto', 'cobertura', 'elétrica', 'hidráulica'
   ],
       atualizado_em = now()
 where id = true;

-- O score das licitações já gravadas foi calculado com as palavras corrompidas,
-- então nenhuma delas casou com "construção" ou "pavimentação". Zerar o hash
-- força o próximo merge a regravar e recalcular o score, em vez de considerar
-- que nada mudou.
update public.licitacoes
   set source_hash = ''
 where source_hash <> '';
