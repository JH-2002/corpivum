/**
 * Chaves aprovadas do namespace `disclaimer.*` (LEG-M03). Este namespace é isento da varredura de
 * alegações proibidas, por isso toda chave nova ou alterada exige revisão no PR (ver .github/CODEOWNERS).
 * Textos são RASCUNHO, sujeitos a `LEGAL-REVIEW` e revisão clínica (docs/legal/OPEN_ISSUES.md).
 */
export const APPROVED_DISCLAIMER_KEYS = [
  'disclaimer.wellbeingOnly',
  'disclaimer.notMedicalDevice',
  'disclaimer.medications',
  'disclaimer.medicationsScope',
  'disclaimer.brainModel',
  'disclaimer.neurochemistry',
  'disclaimer.aiGenerated',
  'disclaimer.reportFooter',
  'disclaimer.riskSupport',
  'disclaimer.draftLegal',
] as const;
