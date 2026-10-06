# Questões jurídicas em aberto (`LEGAL-REVIEW`)

> Lista viva. Cada item precisa de decisão de advogado(a) especializado(a) e, quando indicado, de revisão
> clínica, antes do lançamento público. Ao resolver: registrar a decisão, a data e quem decidiu, e mover para
> "Resolvidas". Ver também `docs/legal/CHECKLIST_GO_LIVE.md`.

| ID | Tema | Questão | Referência | Afeta | Status |
|---|---|---|---|---|---|
| OI-01 | Base legal | Consentimento (art. 11, I) é a base adequada para dados de saúde em app de bem-estar? | LEG §A, §C.1 | Fase 1b | Aberta |
| OI-02 | Idade | Autodeclaração de data de nascimento + bloqueio de menores basta frente ao ECA Digital (Lei 15.211/2025) e à fiscalização da ANPD? Confirmar vigência e obrigações na data do lançamento. | LEG-F01, F02, §C.2 | Fase 1a | Aberta (Fase 1a implementada; validação jurídica pendente) |
| OI-03 | Transferência internacional | Provedor de LLM e outros subprocessadores fora do Brasil: mecanismo do art. 33 e regulamento da ANPD. | LEG-I03, LEG-S10, §C.3 | Fase 5 | Aberta |
| OI-04 | Retenção | Prazos de prova de consentimento e de pedidos do titular (LEG-R03), backups e logs. | LEG-R03, S07, §C.4 | Fases 1b, 6 | Aberta |
| OI-05 | Incidentes | Prazo vigente de comunicação à ANPD e aos titulares (regulamento de incidentes). Placeholder no runbook. | LEG-S08, §C.4 | Fase 7 | Aberta |
| OI-06 | Marco Civil | Definir o controlador (PF ou PJ). Se o art. 15 não se aplicar, reduzir `ACCESS_LOG_RETENTION_DAYS` (hoje 180) ao mínimo para segurança. | LEG-R02, §C.6 | Fase 1b | Aberta |
| OI-07 | ANVISA | Enquadramento (SaMD, RDC 657/2022) de medicamentos, metas e recomendações. Revisar `docs/INTENDED_USE.md`. | LEG-M01, §C.5 | Todas | Aberta |
| OI-08 | Textos | Política de Privacidade, Termos, consentimentos por finalidade, Aviso de IA, Cookies: textos finais. | LEG-G04, §C.7 | Fase 1b | Aberta |
| OI-09 | Avisos de interface | Revisão jurídica **e clínica** das chaves `disclaimer.*` em `messages/pt-BR.json` (texto de bem-estar, medicamentos, cérebro/neuroquímica, IA, rodapé de relatório, apoio CVV/SAMU, rótulo de rascunho). | LEG-M01–M05, LEG-I07 | Fase 0 em diante | Aberta |
| OI-10 | Glossário | Validar o glossário de termos proibidos (`tests/content/forbidden-terms.ts`) com revisão jurídica/clínica. | LEG-M03 | Fase 0 em diante | Aberta |
| OI-11 | Subprocessadores | Escolher hospedagem, banco, storage, filas, e-mail e monitoramento com região no Brasil; assinar DPAs; preencher `docs/privacy/SUBPROCESSORS.md`. | LEG-S10, LEG-D06 | Fase 7 | Aberta |
| OI-12 | Encarregado | Nomear o encarregado e publicar o canal de contato (`{{ENCARREGADO}}`). | LEG-G03 | Fase 1b | Aberta |
| OI-13 | Revisão de avisos | CODEOWNERS preenchido com @JH-2002. Falta: (a) incluir revisor jurídico/clínico quando houver; (b) exigir aprovação de Code Owners na branch `main` (em repositório privado, requer plano GitHub Pro/Team). Até lá, a revisão de `disclaimer.*` depende do teste de texto aprovado e do checklist de PR. | LEG-M03 | Fase 0 | Parcial |

## Resolvidas
_(nenhuma)_
