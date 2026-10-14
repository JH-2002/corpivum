# Runbook — Incidente de segurança com dados pessoais

> **RASCUNHO.** `LEGAL-REVIEW`: confirmar prazos e conteúdo da comunicação no regulamento vigente da ANPD
> (OPEN_ISSUES OI-05). Requisito: LEG-S08.

## 0. Contatos
| Papel | Nome | Contato |
|---|---|---|
| Responsável pelo incidente | `{{RESPONSAVEL_INCIDENTE}}` | `{{CONTATO}}` |
| Encarregado (DPO) | `{{ENCARREGADO}}` | `{{CONTATO_ENCARREGADO}}` |
| Jurídico | `{{JURIDICO}}` | `{{CONTATO}}` |
| Hospedagem / banco | `{{HOSPEDAGEM}}` | `{{SUPORTE}}` |

## 1. Detecção e registro (imediato)
1. Abrir registro interno: data/hora da detecção, quem detectou, sistemas afetados.
2. **Não** copiar dados pessoais para o registro, chat ou ticket: só identificadores e metadados.
3. Preservar evidências (logs de acesso, AuditLog, configurações) antes de alterar sistemas.

## 2. Classificação
| Nível | Critério | Exemplos |
|---|---|---|
| Crítico | Dados de saúde, diário, medicamentos ou credenciais expostos ou acessados por terceiro | Falha de RLS, vazamento de backup |
| Alto | Dados pessoais não sensíveis expostos; acesso indevido contido | E-mails expostos |
| Médio | Vulnerabilidade explorável sem evidência de acesso | Dependência vulnerável em produção |
| Baixo | Sem dado pessoal envolvido | Indisponibilidade |

## 3. Contenção
- Revogar sessões afetadas (sessões em banco, LEG-S04), rotacionar segredos e chaves (ver `KEY_ROTATION.md`).
- Desativar a funcionalidade afetada (ex.: envio de lembretes por e-mail) se necessário.
- Bloquear acessos suspeitos; aplicar correção; validar com testes de isolamento.

## 4. Avaliação de risco aos titulares
Avaliar se o incidente pode acarretar risco ou dano relevante: natureza sensível dos dados, volume, titulares,
possibilidade de reidentificação, medidas de proteção (criptografia de campo, RLS).

## 5. Comunicação
- **ANPD:** quando houver risco ou dano relevante, no prazo do regulamento vigente: `{{PRAZO_ANPD}}`.
  Conteúdo mínimo: natureza dos dados, titulares envolvidos, medidas técnicas, riscos, motivos de eventual
  demora, medidas adotadas.
- **Titulares:** linguagem clara, o que aconteceu, quais dados, o que fazer, canal de contato do encarregado.
- Textos-modelo: `{{MODELO_COMUNICACAO}}`.

## 6. Encerramento
- Relatório interno (linha do tempo, causa raiz, medidas, lições) e atualização do RIPD.
- Guardar o registro do incidente pelo prazo definido pelo jurídico.
