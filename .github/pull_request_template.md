## O que muda

## Requisitos LEG-xx afetados
<!-- Cite os IDs (ex.: LEG-M03, LEG-X01) -->

## Checklist
- [ ] `pnpm lint && pnpm typecheck && pnpm test` verdes
- [ ] Estados loading / empty / error / no-data / partial-data tratados
- [ ] Acessível (teclado, foco visível, aria-label, contraste, reduced motion) e responsivo (320–1920px)
- [ ] Nenhum dado de saúde, diário, medicamento ou mensagem da IA em log (LEG-R04)
- [ ] Nenhum segredo ou dado real no diff
- [ ] **Alterou `messages/**` no namespace `disclaimer.*`?** Revisão de conteúdo/jurídica obrigatória (LEG-M03)
- [ ] Novo serviço fora do Brasil? Registrado em `docs/privacy/SUBPROCESSORS.md` (LEG-S10)
- [ ] Tocou dados sensíveis, auth, consentimento, IA, exportação ou logs? Rodou o `privacy-reviewer`
