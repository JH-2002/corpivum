import { describe, expect, it } from 'vitest';
import { createLogger, maskEmail, REDACTED, type LogRecord } from './logger';

function capture() {
  const records: LogRecord[] = [];
  return { records, logger: createLogger({ minLevel: 'debug', sink: (r) => records.push(r) }) };
}

describe('logger', () => {
  it('grava apenas metadados tipados', () => {
    const { records, logger } = capture();
    logger.info('job.completed', { jobName: 'reminder.dispatch', count: 1, durationMs: 5 });
    expect(records[0]).toMatchObject({
      level: 'info',
      event: 'job.completed',
      jobName: 'reminder.dispatch',
    });
  });

  it('substitui nomes de evento fora do padrão (evita conteúdo livre no nome)', () => {
    const { records, logger } = capture();
    logger.info('usuário escreveu: dormi mal');
    expect(records[0]?.event).toBe('log.invalid_event_name');
  });

  it('descarta chaves fora da allowlist mesmo vindas de objeto não literal', () => {
    const { records, logger } = capture();
    const meta = { userId: 'u1', noteText: 'dormi mal e chorei' };
    logger.info('note.created', meta);
    expect(records[0]).toMatchObject({ userId: 'u1' });
    expect(JSON.stringify(records[0])).not.toContain('dormi mal');
  });

  it('troca texto livre em campos de identificador por [redacted]', () => {
    const { records, logger } = capture();
    logger.info('ai.request', {
      operation: 'conteúdo livre: tomei 2 comprimidos',
      recipient: 'pessoa@exemplo.com',
      durationMs: Number.NaN,
      status: 200,
      template: 'email-verification',
    });
    expect(records[0]).toMatchObject({
      operation: REDACTED,
      recipient: REDACTED,
      durationMs: REDACTED,
      status: 200,
      template: 'email-verification',
    });
  });

  it('aceita destinatário já mascarado', () => {
    const { records, logger } = capture();
    logger.info('mail.sent', { recipient: maskEmail('maria@exemplo.com.br') });
    expect(records[0]?.recipient).toBe('m***@e***.br');
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
