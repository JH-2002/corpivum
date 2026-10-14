# HealthMind 360 — Pacote para Claude Code (v3)

> Este material traduz requisitos legais em requisitos técnicos e de produto. **Não é parecer jurídico.**
> Tudo marcado `LEGAL-REVIEW` precisa de validação por advogado especializado antes do lançamento público.

## Estrutura

| Arquivo | Função |
|---|---|
| `CLAUDE.md` | Memória permanente do projeto (enxuta): regras, stack, armadilhas conhecidas |
| `.claude/agents/privacy-reviewer.md` | Subagente que revisa diffs contra os requisitos LEG-xx |
| `docs/LEGAL_REQUIREMENTS.md` | Requisitos legais rastreáveis (IDs `LEG-xx`) |
| `docs/SPEC_ADDENDUM.md` | Substituições e acréscimos ao spec original |
| `docs/PRODUCT_SPEC.md` | **Você adiciona:** seu prompt original (51 seções), sem alterações |
| `docs/prompts/fase-*.md` | Um prompt por fase, cada um em sessão limpa |
| `docs/legal/CHECKLIST_GO_LIVE.md` | O que o Claude Code não resolve |

Precedência em conflito: `LEGAL_REQUIREMENTS` > `SPEC_ADDENDUM` > `PRODUCT_SPEC`.

## Como usar
1. Copie esta pasta para a raiz do repositório e adicione `docs/PRODUCT_SPEC.md`.
2. Para cada fase, abra uma sessão limpa (`/clear`), entre no modo plan e cole o conteúdo do arquivo da fase.
3. Revise o plano, aprove, e só passe à próxima fase com CI verde e o `privacy-reviewer` sem achados críticos.

Ordem: 0 → 1a → 1b → 2 → 3 → 4 → 6 → 7. A Fase 5 (IA e recomendações) foi cancelada (ADR-0030); a numeração
das demais não muda.

## O que mudou da v2 para a v3
- **Teste de strings proibidas** agora ignora o namespace `disclaimer.*`, para não falhar nos avisos obrigatórios (LEG-M03).
- **Backups** com retenção ≤ `PURGE_DAYS`, amarrando LEG-D04 e LEG-S07, com checagem automática.
- **Diário criptografado** sem busca textual no conteúdo no MVP (LEG-S02, §19).
- **Sessões em banco** obrigatórias; JWT puro não atende (LEG-S04). Instrução de parar e propor alternativa se o Auth.js não servir.
- **Prisma + RLS** detalhado: papéis `app_user`/`app_migrator`, `SET LOCAL app.user_id`, teste de "sem contexto = vazio" (LEG-S03).
- **Residência de dados** inclui execução das funções e logs da hospedagem (novo LEG-S10).
- **Provedor de LLM** com retenção zero ou mínima, inclusive logs de abuso (LEG-I03; revogado depois, ADR-0030).
- **Marco Civil art. 15** condicionado à definição do controlador; retenção de AccessLog configurável (LEG-R02).
- **Demo público**: "sem coleta além dos registros técnicos mínimos" (LEG-X02).
- **Age gate**: não persiste nem a data informada pelo menor (LEG-F01).
- **Fase 1 dividida** em 1a (auth, sessões, idade, RLS, criptografia) e 1b (onboarding, consentimento, Central de Privacidade, logs).
- **CLAUDE.md** enxuto, com seção "Armadilhas conhecidas".
