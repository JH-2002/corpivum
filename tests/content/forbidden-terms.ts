/**
 * Glossário de alegações proibidas em strings de interface (LEG-M03, §43, CLAUDE.md regras 8 e 10).
 *
 * Os padrões rodam sobre texto normalizado: minúsculas e sem acentos ("diagnóstico" → "diagnostico").
 * O namespace i18n `disclaimer.*` NÃO é verificado: ele contém as negações obrigatórias
 * ("não diagnostica...") e toda alteração nele passa por revisão no PR.
 *
 * Para incluir um termo: adicione o padrão, um exemplo em `FORBIDDEN_EXAMPLES` e, se houver risco de
 * falso positivo, um caso em `ALLOWED_EXAMPLES` (tests/content/forbidden-strings.test.ts).
 */
export interface ForbiddenTerm {
  id: string;
  pattern: RegExp;
  reason: string;
}

const NEUROCHEMICALS =
  '(serotonina|dopamina|cortisol|ocitocina|oxitocina|endorfinas?|noradrenalina|adrenalina|melatonina|gaba|neurotransmissor(es)?)';
const CONDITIONS =
  '(doencas?|transtornos?|depressao|ansiedade|insonia|sindromes?|disturbios?|patologias?|condic(ao|oes) clinicas?)';

export const FORBIDDEN_TERMS: readonly ForbiddenTerm[] = [
  { id: 'diagnose', pattern: /\bdiagnos\w*/, reason: 'O app não diagnostica (LEG-M01).' },
  {
    id: 'treat-condition',
    pattern: new RegExp(
      `\\b(trata(r|mos|mento)?|tratar)\\s+(d[aeo]s?\\s+|sua\\s+|seu\\s+)?${CONDITIONS}`,
    ),
    reason: 'O app não trata doenças (LEG-M01).',
  },
  { id: 'therapeutic', pattern: /\bterapeutic\w*/, reason: 'Sem alegação terapêutica (LEG-M01).' },
  {
    id: 'cure',
    pattern: /\b(cura[rm]?|cure[ms]?|curativ\w*)\b/,
    reason: 'Sem alegação de cura (LEG-M01).',
  },
  {
    id: 'prevent-disease',
    pattern: new RegExp(
      `\\b(previne|prevenir|evita|evitar)\\s+(a\\s+|o\\s+|as\\s+|os\\s+)?${CONDITIONS}`,
    ),
    reason: 'Sem alegação de prevenção de doença (LEG-M01).',
  },
  {
    id: 'detect-monitor-disease',
    pattern: new RegExp(
      `\\b(detect|identific|monitor|rastrei)\\w*\\s+(d[aeo]s?\\s+|sua\\s+|seu\\s+)?${CONDITIONS}`,
    ),
    reason: 'O app não detecta nem monitora doenças (LEG-M01).',
  },
  {
    id: 'you-have-condition',
    pattern: new RegExp(
      `\\b(voce|vc)\\s+(tem|sofre de|apresenta|pode ter|esta com)\\s+(\\w+\\s+){0,2}${CONDITIONS}`,
    ),
    reason: 'Nunca afirmar condição da pessoa (CLAUDE.md regra 8).',
  },
  {
    id: 'disorder',
    pattern: /\btranstornos?\b/,
    reason: 'Nunca afirmar transtorno (CLAUDE.md regra 8).',
  },
  {
    id: 'clinical-depression',
    pattern: /\bdepressao\s+clinica\b/,
    reason: 'Termo clínico (regra 8).',
  },
  { id: 'symptom', pattern: /\bsintomas?\b/, reason: 'Linguagem de sintoma é clínica (LEG-M01).' },
  {
    id: 'neurochemical-level',
    pattern: new RegExp(
      `\\b(nivel|niveis|taxas?|quantidade|concentracao)\\s+(de\\s+|da\\s+|do\\s+)?(sua\\s+|seu\\s+)?${NEUROCHEMICALS}`,
    ),
    reason: 'Nunca afirmar nível de neurotransmissor (regra 8, regra 8).',
  },
  {
    id: 'neurochemical-release',
    pattern: new RegExp(
      `\\b(libera\\w*|produz\\w*|aument\\w*|reduz\\w*|diminu\\w*|dispar\\w*|eleva\\w*)\\s+(\\w+\\s+){0,3}${NEUROCHEMICALS}|\\b${NEUROCHEMICALS}\\s+(\\w+\\s+){0,2}(liberad|produzid|aumentad|elevad|baix|alt)\\w*`,
    ),
    reason: 'Nunca afirmar liberação ou alteração de substância (regra 8, regra 8).',
  },
  {
    id: 'brain-state',
    pattern: /\b(estado|atividade|funcionamento|saude)\s+(do\s+seu\s+|do\s+)?cerebr\w*/,
    reason: 'Nunca afirmar estado cerebral (regra 8).',
  },
  {
    id: 'dose-advice',
    pattern: /\b(dose|dosagem|posologia)\s+(recomendad|ideal|sugerid|cert|corret|adequad)\w*/,
    reason: 'Sem sugestão de dose (LEG-I04; medicamentos fora do produto, ADR-0027).',
  },
  {
    id: 'medication-change',
    pattern:
      /\b(aument\w*|reduz\w*|diminu\w*|ajust\w*|suspend\w*|interromp\w*|par[ea] de tomar|troqu\w*|substitu\w*)\s+(\w+\s+){0,3}(dose|dosagem|medicament\w*|remedio\w*|medicac\w*)/,
    reason: 'Sem recomendação de mudança de medicação (LEG-I04).',
  },
  {
    id: 'drug-interaction',
    pattern: /\binterac(ao|oes)\s+(medicamentos\w*|entre\s+(medicamentos|remedios))/,
    reason: 'Sem verificação de interações (LEG-I04).',
  },
  {
    id: 'replaces-professional',
    pattern:
      /\b(substitui|dispensa|no lugar d[eo])\s+(o\s+|a\s+|uma?\s+)?(medic[oa]|profissional|consulta|psicolog[oa]|terapeuta|nutricionista)/,
    reason: 'Só pode aparecer negado, no namespace disclaimer (LEG-M01).',
  },
  {
    id: 'clinically-proven',
    pattern:
      /\b(clinicamente|cientificamente)\s+(comprovad|provad|testad|validad)\w*|\bcomprovad\w*\s+cientificamente/,
    reason: 'Sem alegação de eficácia clínica (LEG-M01).',
  },
  {
    id: 'medical-grade',
    pattern:
      /\b(grau|nivel|padrao)\s+(medico|hospitalar|clinico)\b|\bprecisao\s+(medica|clinica)\b/,
    reason: 'Não é dispositivo médico (LEG-M01).',
  },
  {
    id: 'lgpd-compliance-claim',
    pattern:
      /\b(em\s+)?conformidade\s+com\s+a\s+lgpd\b|\b(100%|totalmente)\s+(conforme|adequad\w*|compliant)\b|\bcertificad\w*\s+(pela\s+)?(anvisa|lgpd|anpd)/,
    reason: 'Nunca afirmar conformidade legal (CLAUDE.md regra 10).',
  },
  {
    id: 'relieve-condition',
    pattern: new RegExp(
      `\\b(reduz|alivi|combat|melhor|control|ameniz|elimin|venc|supera)\\w*\\s+(\\w+\\s+){0,4}${CONDITIONS}`,
    ),
    reason: 'Sem alegação de efeito sobre condição de saúde (LEG-M01).',
  },
  {
    id: 'brain-assertion',
    pattern: /\b(seu\s+)?cerebro\s+(esta|fica|anda|ficou|estava)\b/,
    reason: 'Nunca afirmar estado cerebral (regra 8, regra 8).',
  },
  {
    id: 'you-are-condition',
    pattern:
      /\b(voce|vc)\s+(esta|parece|e|anda|ficou)\s+(\w+\s+)?(deprimid|ansios|bipolar|viciad|compulsiv)\w*/,
    reason: 'Nunca afirmar condição da pessoa (CLAUDE.md regra 8).',
  },
  {
    id: 'population-norm',
    pattern:
      /\b(a?normal|normais|anormais)\b|\b(abaixo|acima|fora)\s+d[oa]s?\s+(recomendad|ideal|ideais|esperad|normal|saudave)\w*|\bfaixas?\s+(saudave\w*|normal|normais|ideal|ideais|recomendad\w*)|\bvalor(es)?\s+(ideal|ideais|de\s+referencia)\b|\b(maioria|media)\s+d[ao]s?\s+(pessoas|populacao|brasileir\w*)|\bpessoas\s+(da\s+sua\s+idade|como\s+voce)\b|\bpeso\s+ideal\b/,
    reason:
      'Comparar só com o próprio histórico e as próprias metas, nunca com norma ou faixa (ADR-0025).',
  },
  {
    id: 'causal-claim',
    pattern:
      /\b(causou|causam?|causad[oa]s?|causaram)\b|\bpor\s+causa\s+d|\bdevido\s+(a|ao|aos|as)\b|\bgracas\s+(a|ao|aos|as)\b|\bresult(ou|a|aram)\s+(em|n[oa]s?)\b|\bfez\s+(voce|seu|sua)\b|\bporque\s+voce\b|\b(melhor|pior)(a|ou|aram)\s+(o\s+|a\s+)?(seu|sua)\s+(humor|sono|energia|estresse|bem-estar)/,
    reason: 'Descrever e associar, nunca atribuir causa (§32, LEG-I04, ADR-0025).',
  },
  {
    id: 'ideal-body',
    pattern:
      /\b(corpo|shape|forma|silhueta|barriga)\s+(ideal|perfeit\w*|dos\s+sonhos|sarad\w*|definid\w*)\b|\bcorpo\s+de\s+(verao|praia)\b|\bprojeto\s+verao\b/,
    reason: 'Nada de corpo ideal ou meta de aparência (LEG-M06).',
  },
  {
    id: 'body-shaming',
    pattern:
      /\b(secar|sequinh\w*|barriga\s+negativa|gordurinhas?|pneuzinhos?|flacidez|celulite|imperfeic\w*|defeitos?\s+(do|no)\s+corpo)\b/,
    reason: 'Nenhum juízo sobre o corpo (LEG-M06).',
  },
  {
    id: 'fat-burning',
    pattern:
      /\b(queim\w*|derret\w*|elimin\w*|perder|perca)\s+(\w+\s+){0,2}gordura\b|\bdetox\b|\bemagre\w*\s+(rapid\w*|ja|em\s+\d+)|\bperca\s+\d+\s*(kg|quilos)\b/,
    reason: 'Sem promessa de emagrecimento ou de queima de gordura (LEG-M04, LEG-M06).',
  },
  {
    id: 'food-judgment',
    pattern:
      /\b(comidas?|alimentos?|refeic(ao|oes))\s+(proibid\w*|lixo|ruins?|toxic\w*|errad\w*|sujas?|limpas?|boas?)\b|\bjunk\s*food\b|\bcomer\s+(errado|certo|mal)\b/,
    reason: 'Alimentação sem rótulo de bom ou ruim (LEG-M07).',
  },
  {
    id: 'restriction',
    pattern:
      /\b(jejum|jejuar|jejue)\b|\bpul(ar|e)\s+(\w+\s+)?refeic\w*|\bcort(ar|e)\s+(o\s+|os\s+|a\s+)?(carboidrat\w*|acucar|doces?|refeic\w*)|\bdeficit\s+calorico\b|\bdieta\s+restritiva\b|\bcompens\w*\s+(\w+\s+){0,3}(comeu|comida|refeic\w*|calorias|exagero|doces?)\b/,
    reason: 'Sem incentivo a restrição, jejum ou compensação (LEG-M04, LEG-M07).',
  },
  {
    id: 'guilt-language',
    pattern: /\b(culpad\w*|pecad\w*|deslizes?|furou\s+a\s+dieta|jacad\w*|enfiou\s+o\s+pe)\b/,
    reason: 'Sem culpa ou punição ligada a comida ou corpo (LEG-F05, LEG-M07).',
  },
  {
    id: 'diet-or-training-prescription',
    pattern:
      /\b(seu|sua|um|uma)\s+(plano\s+alimentar|cardapio\s+personalizad\w*|dieta\s+personalizad\w*|treino\s+personalizad\w*|ficha\s+de\s+treino)\b|\bprescrev\w*\s+(\w+\s+){0,2}(dieta|treino|cardapio)/,
    reason: 'O app não prescreve dieta nem treino (LEG-M08).',
  },
  {
    id: 'clinical-report',
    pattern: /\blaudos?\b|\bavaliac(ao|oes)\s+clinicas?\b|\bprontuario/,
    reason: 'Relatórios não são laudo nem avaliação clínica (§29, LEG-M01).',
  },
];

/** Minúsculas e sem diacríticos, para casar "diagnóstico" e "DIAGNOSTICO" com o mesmo padrão. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function findForbiddenTerms(text: string): ForbiddenTerm[] {
  const normalized = normalizeText(text);
  return FORBIDDEN_TERMS.filter((term) => term.pattern.test(normalized));
}
