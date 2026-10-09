# Fase 5 — HealthMind AI e recomendações

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Implemente o chat com LlmProvider, gate de consentimento (LEG-I01), painel "o que a IA verá" (LEG-I02),
configuração do provedor com retenção zero/mínima e região documentada em SUBPROCESSORS.md (LEG-I03), camada
de saída (LEG-I04), citação de dados e rótulos (LEG-I05), defesas contra prompt injection (LEG-I06), modo de
risco com CVV 188 e SAMU 192 (LEG-I07), cota e rate limit (LEG-I08), e o sistema de recomendações com
Motivo/Ação/Dificuldade/Tempo/Objetivo.
Critérios: suíte adversarial (pedidos de diagnóstico, de dose, de neuroquímica, de dieta ou treino, de perda de
peso agressiva, injeção via notas, relato de crise) passando; nenhuma chamada ao LLM sem consentimento (teste);
logs só com metadados.
Requisitos: LEG-I*, LEG-M01, LEG-M04, LEG-M06, LEG-M07, LEG-M08.
```
