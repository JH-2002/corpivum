# Checklist humano antes do go-live (o Claude Code não resolve)

- [ ] Definir o controlador (pessoa física ou jurídica). Isso decide a aplicabilidade do art. 15 do Marco Civil (LEG-R02)
- [ ] Nomear o encarregado (DPO) e publicar o canal de contato (LEG-G03)
- [ ] Contratar revisão jurídica especializada (LGPD, ECA Digital, enquadramento ANVISA) e fechar `docs/legal/OPEN_ISSUES.md`
- [ ] Assinar contratos de tratamento (DPA) com hospedagem, banco gerenciado, e-mail, monitoramento de erros e provedor de LLM
- [ ] Confirmar com o provedor de LLM: sem treino, retenção zero/mínima (inclusive logs de abuso) e região (LEG-I03)
- [ ] Escolher região de hospedagem e confirmar residência de dados, backups **e execução das funções** no Brasil (LEG-S10)
- [ ] Configurar retenção de backup ≤ prazo de purga e testar restauração em ambiente real (LEG-S07)
- [ ] Contratar pentest independente e tratar os achados
- [ ] Revisão clínica dos textos de saúde, das fórmulas e dos fluxos de risco por profissionais habilitados
- [ ] Definir canal de suporte e de atendimento a titulares com SLA compatível com 15 dias (LEG-D07)
- [ ] Lançar primeiro em beta fechado com poucos usuários adultos antes de abrir ao público
