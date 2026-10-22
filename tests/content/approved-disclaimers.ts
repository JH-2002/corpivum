/**
 * Avisos obrigatórios APROVADOS do namespace `disclaimer.*` (LEG-M03), com o texto exato.
 * Este namespace é isento da varredura de alegações proibidas; por isso qualquer chave nova, removida ou
 * com texto alterado quebra o teste até ser aprovada aqui, num PR revisado (ver .github/CODEOWNERS).
 * Textos são RASCUNHO, sujeitos a `LEGAL-REVIEW` e revisão clínica (docs/legal/OPEN_ISSUES.md OI-09).
 */
export const APPROVED_DISCLAIMERS: Readonly<Record<string, string>> = {
  'disclaimer.wellbeingOnly':
    'O %PRODUTO% é uma ferramenta de bem-estar e autoacompanhamento. Não diagnostica, não trata e não monitora doenças, e não substitui profissional de saúde.',
  'disclaimer.notMedicalDevice':
    'Este aplicativo não é um dispositivo médico e não faz recomendações de diagnóstico ou tratamento.',
  'disclaimer.reportFooter':
    'Gerado em {date}. Material de autoacompanhamento, não é laudo nem avaliação clínica.',
  'disclaimer.riskSupport':
    'Se você está passando por um momento difícil, você não precisa enfrentar isso sozinho(a). O CVV atende 24 horas pelo telefone 188, de graça. Em emergência, ligue 192 (SAMU).',
  'disclaimer.draftLegal': 'RASCUNHO — revisão jurídica obrigatória.',
  // Fase 2 (ADR-0021): aviso do Índice de Bem-Estar (§14, LEG-D08) e do demo (LEG-X02). Índice v2 sem
  // humor e energia (ADR-0027). Índice v3 com a regularidade do registro de atividade (ADR-0050). LEGAL-REVIEW, OI-09.
  'disclaimer.wellbeingScore':
    'O Índice de Bem-Estar resume seus registros de sono, hábitos, as semanas com atividade física registrada e a constância dos registros. Não usa peso, medidas, duração nem intensidade de atividade, não é avaliação de saúde, não indica condição e não substitui profissional de saúde.',
  'disclaimer.demoData':
    'Demonstração com dados 100% fictícios, gerados para apresentar o app. Nenhum dado de pessoa real. Nada do que você vê aqui é gravado em conta nenhuma.',
  // Fase 3 (ADR-0026): aviso do corpo 3D (§15, LEG-M04). LEGAL-REVIEW, OI-09.
  'disclaimer.bodyModel':
    'Representação aproximada a partir das medidas que você informou. Não é avaliação corporal nem de saúde.',
};

export const APPROVED_DISCLAIMER_KEYS = Object.keys(APPROVED_DISCLAIMERS);
