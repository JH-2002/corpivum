import { describe, expect, it } from 'vitest';
import { createLogger, maskEmail, type LogRecord } from './logger';

function capture() {
  const records: LogRecord[] = [];
  return { records, logger: createLogger({ minLevel: 'debug', sink: (r) => records.push(r) }) };
}

describe('logger', () => {
  it('grava apenas metadados tipados', () => {
    const { records, logger } = capture();
    logger.info('llm.completion', { model: 'fake', inputTokens: 10, durationMs: 5 });
    expect(records[0]).toMatchObject({ level: 'info', event: 'llm.completion', model: 'fake' });
  });

  it('substitui nomes de evento fora do padrão (evita conteúdo livre no nome)', () => {
    const { records, logger } = capture();
    logger.info('usuário escreveu: dormi mal');
    expect(records[0]?.event).toBe('log.invalid_event_name');
  });

  it('respeita o nível mínimo', () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ minLevel: 'warn', sink: (r) => records.push(r) });
    logger.info('app.started');
    logger.warn('app.slow');
    expect(records.map((r) => r.event)).toEqual(['app.slow']);
  });
});

describe('maskEmail', () => {
  it('mascara local e domínio', () => {
    expect(maskEmail('maria@exemplo.com.br')).toBe('m***@e***.br');
    expect(maskEmail('a@b')).toBe('a***@b***');
  });
});
