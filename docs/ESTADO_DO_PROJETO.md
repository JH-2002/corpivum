# Estado do projeto — Corpivum (antes HealthMind 360)

> Atualizado em 17/10/2026, no fim da Fase 7 (ADR-0041). Resumo para quem não acompanha o código.

## O que o app faz hoje

O HealthMind 360 é um site para adultos acompanharem o próprio corpo e a própria rotina. A pessoa cria a conta,
aceita os Termos, escolhe se autoriza o uso dos dados de bem-estar e passa a registrar:

- peso e medidas do corpo, sono, hábitos, alimentação, água e atividade física;
- metas próprias e lembretes por e-mail.

Com isso o app mostra gráficos, uma linha do tempo, resumos escritos por regras fixas, um índice de bem-estar e um
modelo 3D do corpo feito só com as medidas informadas. Há um modo que esconde peso e medidas da tela, um modo de
apresentação e uma demonstração pública com dados inventados.

O app **não** usa inteligência artificial, **não** dá conselhos automáticos, **não** diagnostica nem prescreve
dieta ou treino. Quando uma meta passa de um limite de segurança, ele bloqueia a meta e indica ajuda profissional
(CVV 188, SAMU 192).

A privacidade já funciona: a pessoa vê e baixa todos os seus dados, revoga autorizações, corrige registros e exclui a
conta (inclusive antes de terminar o cadastro). O app foi feito para guardar e processar os dados no Brasil; só o
envio de e-mails e o diagnóstico de erros devem ficar com fornecedores de fora, sem nenhum dado de bem-estar. Cada
pessoa só enxerga os próprios dados, os textos livres (notas, descrições, nomes de hábitos e exercícios) e as cópias
de segurança são cifrados, e os registros técnicos levam só identificadores, nunca o conteúdo dos registros.

## O que falta para lançar

O código da primeira versão está completo, mas **ainda não pode ir ao ar**: faltam decisões, contratos e
fornecedores. A lista completa, na ordem, está em `docs/legal/CHECKLIST_GO_LIVE.md`. Em resumo:

| O que falta | Quem faz |
|---|---|
| Decidir quem é o responsável legal pelo app (pessoa física ou empresa) e nomear o encarregado de dados | Responsável pelo produto |
| Responder as perguntas jurídicas (`docs/legal/PACOTE_JURIDICO.md`) e aprovar os textos públicos, que hoje são rascunho | Advogado(a) especializado(a) em LGPD |
| Revisar os textos de saúde, os limites de segurança das metas e o modelo 3D | Profissionais de saúde (nutrição, educação física, psicologia) |
| Escolher onde o app vai rodar (hospedagem, banco, armazenamento, chaves, e-mail) e assinar os contratos de dados | Responsável pelo produto, com o jurídico |
| Ligar o app aos fornecedores escolhidos, configurar cópias de segurança, alertas e o processo separado das tarefas automáticas, e testar uma restauração | Desenvolvimento (com o Claude Code) |
| Teste de invasão por uma empresa independente | Empresa de segurança contratada |
| Teste manual com leitor de tela e no celular | Responsável pelo produto (roteiro em `docs/qa/ROTEIRO_MANUAL.md`) |
| Parecer do encarregado sobre o relatório de impacto (RIPD) | Encarregado de dados |
| Canal de atendimento, teste fechado com poucas pessoas e só então a abertura | Responsável pelo produto |

## Onde está cada coisa

- Decisões técnicas: `docs/DECISIONS.md` · Pendências jurídicas (lista completa): `docs/legal/OPEN_ISSUES.md`
- Registro do tratamento de dados: `docs/privacy/ROPA.md` · Relatório de impacto: `docs/privacy/RIPD.md`
- Prazos de guarda: `docs/privacy/RETENTION.md` · Fornecedores: `docs/privacy/SUBPROCESSORS.md`
- O que o app é e não é: `docs/INTENDED_USE.md` · Lacunas a preencher (`{{...}}`): `docs/legal/PLACEHOLDERS.md`
- Procedimentos de operação: `docs/runbooks/`
