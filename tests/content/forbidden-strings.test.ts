// @vitest-environment node
/**
 * LEG-M03: falha se strings de interface contiverem alegações clínicas proibidas.
 * Ignora o namespace `disclaimer.*`, reservado aos avisos obrigatórios (que contêm negações).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APPROVED_DISCLAIMER_KEYS, APPROVED_DISCLAIMERS } from './approved-disclaimers';
import { findForbiddenTerms, FORBIDDEN_TERMS } from './forbidden-terms';

const MESSAGES_DIR = fileURLToPath(new URL('../../messages', import.meta.url));
const EXEMPT_NAMESPACE = 'disclaimer';

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ''): Array<[string, string]> {
  return Object.entries(messages).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? [[fullKey, value] as [string, string]]
      : flatten(value, fullKey);
  });
}

const catalogs = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({
    file,
    entries: flatten(JSON.parse(readFileSync(path.join(MESSAGES_DIR, file), 'utf8')) as Messages),
  }));

const isExempt = (key: string) =>
  key === EXEMPT_NAMESPACE || key.startsWith(`${EXEMPT_NAMESPACE}.`);

describe('strings proibidas (LEG-M03)', () => {
  it('encontra pelo menos um catálogo de mensagens', () => {
    expect(catalogs.map((c) => c.file)).toContain('pt-BR.json');
  });

  it.each(catalogs)('$file não contém alegações clínicas fora de disclaimer.*', ({ entries }) => {
    const violations = entries
      .filter(([key]) => !isExempt(key))
      .flatMap(([key, value]) =>
        findForbiddenTerms(value).map((term) => `${key} → ${term.id}: ${term.reason}`),
      );
    expect(violations).toEqual([]);
  });

  it.each(catalogs)('$file tem os avisos obrigatórios com o texto aprovado', ({ entries }) => {
    const byKey = new Map(entries);
    for (const [key, approved] of Object.entries(APPROVED_DISCLAIMERS)) {
      expect(byKey.get(key), `aviso ausente ou alterado sem aprovação: ${key}`).toBe(approved);
    }
    expect(byKey.get('disclaimer.riskSupport')).toMatch(/\b188\b/);
    expect(byKey.get('disclaimer.riskSupport')).toMatch(/\b192\b/);
  });

  it.each(catalogs)(
    '$file só tem chaves aprovadas em disclaimer.* (nova chave exige revisão)',
    ({ entries }) => {
      const keys = entries
        .map(([key]) => key)
        .filter(isExempt)
        .sort();
      expect(keys).toEqual([...APPROVED_DISCLAIMER_KEYS].sort());
    },
  );
});

describe('detector de alegações proibidas', () => {
  const FORBIDDEN_EXAMPLES: Record<string, string> = {
    diagnose: 'Faça seu diagnóstico em segundos',
    'treat-condition': 'Ajuda no tratamento da ansiedade',
    therapeutic: 'Um efeito terapêutico comprovado',
    cure: 'Cure sua insônia com hábitos',
    'prevent-disease': 'Previne doenças do coração',
    'detect-monitor-disease': 'Monitoramos sua depressão',
    'you-have-condition': 'Você pode ter um transtorno de sono',
    disorder: 'Seu padrão sugere um transtorno',
    'clinical-depression': 'Sinais de depressão clínica',
    symptom: 'Registre seus sintomas',
    'neurochemical-level': 'Seu nível de serotonina está baixo',
    'neurochemical-release': 'Caminhar libera dopamina no cérebro',
    'brain-state': 'Veja o estado do seu cérebro hoje',
    'dose-advice': 'Esta é a dose recomendada para você',
    'medication-change': 'Considere reduzir a dose do remédio',
    'drug-interaction': 'Alertas de interação medicamentosa',
    'replaces-professional': 'Substitui a consulta com o médico',
    'clinically-proven': 'Método clinicamente comprovado',
    'medical-grade': 'Precisão médica no seu bolso',
    'lgpd-compliance-claim': 'Plataforma em conformidade com a LGPD',
    'relieve-condition': 'Alivia o estresse e a insônia',
    'brain-assertion': 'Seu cérebro está sobrecarregado',
    'you-are-condition': 'Você está deprimido',
    'clinical-report': 'Laudo do seu sono',
    'population-norm': 'Seu sono está abaixo do recomendado para a sua idade',
    'causal-claim': 'Seu humor caiu por causa das noites curtas',
    'ideal-body': 'Chegue ao corpo ideal até o verão',
    'bmi-classification': 'Seu IMC indica sobrepeso',
    'body-shaming': 'Hora de secar a barriga',
    'fat-burning': 'Treino para queimar gordura',
    'food-judgment': 'Evite comidas proibidas',
    restriction: 'Experimente o jejum intermitente',
    'guilt-language': 'Exagerou no fim de semana? Sem deslizes desta vez',
    'diet-or-training-prescription': 'Receba seu plano alimentar em minutos',
  };

  /** Variações relatadas na revisão de privacidade: todas precisam ser detectadas. */
  const MORE_FORBIDDEN = [
    'Reduz a ansiedade em 7 dias',
    'Combate a depressão',
    'Melhora sua ansiedade',
    'Você está ansiosa demais',
    'Seu relatório vale como avaliação clínica',
    // Comparação com norma ou faixa (ADR-0025).
    'Você dormiu menos que o normal',
    'Fora da faixa saudável',
    'Acima da média da população',
    'Pessoas da sua idade dormem mais',
    'Seu peso ideal é 70 kg',
    // Causa (ADR-0025).
    'Dormir pouco causou a queda no seu humor',
    'Sua energia subiu devido aos hábitos',
    'Os hábitos melhoraram seu humor',
    'O exercício fez você dormir melhor',
    'Seu humor ficou baixo porque você dormiu pouco',
    'Isso resultou em noites mais curtas',
  ];

  it.each(MORE_FORBIDDEN)('detecta variação: %s', (text) => {
    expect(findForbiddenTerms(text).length).toBeGreaterThan(0);
  });

  const ALLOWED_EXAMPLES = [
    'Melhore sua rotina de sono com pequenas pausas',
    'Pausas curtas ajudam a reduzir o cansaço do dia',
    'Tratamento de dados pessoais conforme sua escolha',
    'Registre seu sono e suas medidas',
    'Siga a orientação de quem acompanha você',
    'Médias do período: sono, hábitos e atividade',
    'Nos seus registros, dormir mais costuma aparecer junto com mais minutos ativos',
    'Central de Privacidade',
    'O app não faz sugestões sobre remédios',
    'Seu sono médio registrado ficou 20 min menor que na semana anterior',
    'Aparecer junto não quer dizer que um explique o outro',
    'A média ficou parecida com a da semana anterior',
    'O app não define meta nem classifica valores',
    'Registre o que você comeu, quando quiser',
    'Sua refeição foi registrada',
    'Seu peso registrado ficou estável na semana',
    'Você pode registrar a sua atividade do dia',
    'O app não acompanha esta meta',
    'Converse com um nutricionista ou um profissional de educação física',
  ];

  it('tem um exemplo positivo para cada termo do glossário', () => {
    expect(Object.keys(FORBIDDEN_EXAMPLES).sort()).toEqual(FORBIDDEN_TERMS.map((t) => t.id).sort());
  });

  it.each(Object.entries(FORBIDDEN_EXAMPLES))('detecta %s', (id, text) => {
    expect(findForbiddenTerms(text).map((t) => t.id)).toContain(id);
  });

  it.each(ALLOWED_EXAMPLES)('não acusa texto permitido: %s', (text) => {
    expect(findForbiddenTerms(text)).toEqual([]);
  });

  it('a mesma frase dentro de disclaimer.* seria acusada fora dele (isenção é por namespace)', () => {
    expect(
      findForbiddenTerms('Não diagnostica, não trata e não monitora doenças').length,
    ).toBeGreaterThan(0);
  });
});
