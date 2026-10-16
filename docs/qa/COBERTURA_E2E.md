# Cobertura automática da qualidade (7d)

Mapa dos fluxos críticos para os testes que os cobrem (ADR-0039; LEG-X01, §41, §42). O que só uma pessoa avalia
(o que o leitor de tela fala, o celular de verdade) está em [`ROTEIRO_MANUAL.md`](ROTEIRO_MANUAL.md).

## Fluxos críticos (Playwright, `e2e/`)

| Fluxo | Teste | O que confere |
|---|---|---|
| Cadastro 18+ | `auth.spec.ts` › cadastro adulto | idade → conta → e-mail → onboarding, nenhuma caixa marcada, recusar tudo não bloqueia |
| Menor de 18 | `auth.spec.ts` › menor de 18 | mensagem neutra, nenhuma linha no banco (LEG-F01) |
| Encerramento por menor | `privacy.spec.ts` › menor de 18 encerra a conta | apagada na hora, só a prova mínima (LEG-F04) |
| Consentimento na interface | `critical-flows.spec.ts` › onboarding: autorizar… (7d) | a caixa marcada vira prova com a versão vigente e libera o registro (LEG-C01) |
| Revogação | `privacy.spec.ts` › revogar os dados de bem-estar; `health.spec.ts` › após revogar…; `reports.spec.ts` › OI-32 | aviso com data, bloqueio imediato, telas vazias, reautorização (LEG-C04) |
| Marketing (1 clique) | `privacy.spec.ts` › marketing; `keyboard.spec.ts` › Central (7d) | autorizar e revogar sem afetar o resto, também por teclado (LEG-C05) |
| Reorientação | `privacy.spec.ts` › reorientação | texto novo revisto antes de continuar (LEG-C06) |
| Registro | `health.spec.ts` (sono, hábitos, corpo), `routine.spec.ts` (alimentação, atividade), `keyboard.spec.ts` › registro rápido → sono (7d) | criar, editar, excluir; só teclado |
| Metas com guardrail | `routine.spec.ts` › perda insegura; `critical-flows.spec.ts` › ritmo e calorias (7d); `keyboard.spec.ts` › meta bloqueada (7d) | IMC mínimo, ritmo > 1%/semana, piso de calorias e meta de calorias só com a estimativa; aviso anunciado com 188/192; nada gravado (LEG-M04, LEG-M07) |
| Exportação | `reports.spec.ts` › exportação completa; `rights.spec.ts` › exportar → excluir | link autenticado, só do dono, expira (LEG-D03) |
| Exclusão | `rights.spec.ts` › exportar → excluir → confirmar; `critical-flows.spec.ts` › saída no onboarding (7d) | acesso cortado, purga, provas mantidas (LEG-D04, P7-M2) |
| Modo privacidade | `privacy-mode.spec.ts`; `keyboard.spec.ts` › modo privacidade (7d) | nenhum valor do corpo no texto nem no HTML; `aria-pressed` (LEG-M06) |
| Sessão | `auth.spec.ts` › revogação em outro aparelho | cai na próxima requisição (LEG-S04) |

## Acessibilidade

- **axe em todas as páginas, claro e escuro** (`a11y.spec.ts`): o inventário `PAGES` de `e2e/routes.ts` lista
  cada `page.tsx` com o jeito de chegar nela (logada, pública, demo, depois da idade, onboarding, passo 5,
  reorientação, 2º fator). `tests/content/page-inventory.test.ts` falha se uma página nova ficar fora.
- **Diálogos e estados** (`a11y.spec.ts`, `twin.spec.ts`, `presentation.spec.ts`, `rights.spec.ts`).
- **Teclado** (`keyboard.spec.ts`): pular para o conteúdo, navegação, diálogos com foco preso e Esc, e os fluxos
  críticos de ponta a ponta só com teclado (entrar, registro, meta bloqueada, Central, exclusão, modo
  privacidade), com contorno de foco conferido a cada Tab.
- **Contraste dos tokens** (`tests/design/contrast.test.ts`) e regras `jsx-a11y` estritas no lint.

## Responsividade (§42)

`responsive.spec.ts` e `demo.spec.ts`: sem rolagem horizontal de 320 a 1920 px em todas as rotas; navegação
certa para cada largura; `insights.spec.ts` e `privacy.spec.ts` em 320 px.

## Performance (§41)

| Verificação | Onde | Teto |
|---|---|---|
| JS de entrada por rota (gzip) | `pnpm check:perf-budget` no job de qualidade | `perf-budget.json` (dashboard 420 KiB; telas de conta 175 KiB) |
| three.js fora da entrada | `pnpm check:perf-budget` | nenhuma rota (ADR-0026) |
| Maior chunk do cliente | `pnpm check:perf-budget` | 180 KiB gzip |
| Modelos `.glb` | `pnpm check:perf-budget` | 160 KiB cada, 320 KiB no total |
| Dashboard interativo | `e2e/perf.spec.ts` (job `perf`, build de produção) | 2,5 s com 4G lenta (RTT 150 ms, 1,6 Mbit/s) e CPU 4× |

Medição local: `pnpm build` e depois `E2E_PROD=1 pnpm test:perf` (no Git Bash; no PowerShell,
`$env:E2E_PROD='1'; pnpm test:perf`).
