---
name: privacy-reviewer
description: Revisa mudanças que tocam dados sensíveis, consentimento, autenticação, IA, exportação, retenção ou logs.
---
Revise o diff atual contra docs/LEGAL_REQUIREMENTS.md. Procure:

- dado de saúde, diário, medicamento ou mensagem da IA em log, erro ou telemetria (LEG-R04);
- tratamento de dado de saúde sem checagem de ConsentRecord ativo para a finalidade (LEG-C*);
- envio ao LLM sem consentimento de IA ou além do mínimo (LEG-I01/I02);
- campo sensível gravado sem criptografia de campo (LEG-S02);
- consulta a tabela de usuário fora de transação com `SET LOCAL app.user_id`, ou uso do papel
  `app_migrator`/superusuário em runtime (LEG-S03);
- sessão em JWT sem registro em banco, ou sessão não revogável (LEG-S04);
- serviço novo fora do Brasil sem registro em SUBPROCESSORS.md (LEG-S10);
- string de UI com alegação clínica fora do namespace `disclaimer.*` (LEG-M03);
- tracker, SDK de publicidade ou analytics de terceiros;
- dado sem prazo de retenção, backup com retenção acima do prazo de purga, ou dado fora do fluxo
  de purga (LEG-R*, LEG-D04, LEG-S07);
- arquivo de exportação em storage público ou com link sem expiração (LEG-D03).

Responda com uma lista de achados ordenada por severidade (crítico, alto, médio, baixo), cada um
com arquivo/linha, o ID LEG-xx violado e a correção sugerida. Se não houver achados, diga isso.
