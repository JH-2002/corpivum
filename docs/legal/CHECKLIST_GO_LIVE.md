# Checklist humano antes do go-live (o Claude Code não resolve)

- [ ] Definir o controlador (pessoa física ou jurídica). Isso decide a aplicabilidade do art. 15 do Marco Civil (LEG-R02)
- [ ] Nomear o encarregado (DPO) e publicar o canal de contato (LEG-G03)
- [ ] Contratar revisão jurídica especializada (LGPD, ECA Digital, enquadramento ANVISA) e fechar `docs/legal/OPEN_ISSUES.md`
- [ ] Assinar contratos de tratamento (DPA) com hospedagem, banco gerenciado, e-mail e monitoramento de erros (sem provedor de LLM desde o ADR-0030)
- [ ] Definir o mecanismo do art. 33 para os serviços fora do Brasil, sem depender de consentimento do titular (OI-03)
- [ ] Escolher região de hospedagem e confirmar residência de dados, backups **e execução das funções** no Brasil (LEG-S10)
- [ ] Configurar retenção de backup ≤ prazo de purga e testar restauração em ambiente real (LEG-S07)
- [ ] Contratar pentest independente e tratar os achados (escopo em `docs/security/PENTEST_SCOPE.md`, contexto em `docs/security/THREAT_MODEL.md`)
- [ ] Pedir ao pentest atenção especial ao **módulo de autenticação próprio** (ADR-0014): sessões (fixação e revogação), enumeração de e-mail e diferença de tempo de resposta, contorno dos limites de tentativa (IP, variações de maiúsculas no e-mail), TOTP (reuso e força bruta), códigos de recuperação, tokens de verificação e reset, funções SECURITY DEFINER e RLS, CSRF e CSP, cookie de aparelho conhecido (falsificação, reuso entre contas) e guard de consentimento (`app.has_active_consent`, ADR-0019)
- [ ] Revisão clínica dos textos de saúde, das fórmulas e dos fluxos de risco por profissionais habilitados
- [ ] Definir canal de suporte e de atendimento a titulares com SLA compatível com 15 dias (LEG-D07)
- [ ] Lançar primeiro em beta fechado com poucos usuários adultos antes de abrir ao público
