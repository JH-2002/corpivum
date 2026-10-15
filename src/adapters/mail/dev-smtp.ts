import { randomUUID } from 'node:crypto';
import { connect, type Socket } from 'node:net';
import { logger as defaultLogger, maskEmail, type Logger } from '@/lib/logger';
import type { MailMessage, MailProvider, MailTemplateId } from './types';

/**
 * Entrega de e-mail de DESENVOLVIMENTO (APP_ENV=development) ao Mailpit local do docker-compose, para ler os
 * links de verificação e redefinição em http://localhost:8025. Nada sai da máquina: o host só pode ser
 * local (validado em `parseEnv`). Cliente SMTP mínimo com `node:net`, sem autenticação nem TLS, sem
 * dependência nova (ADR-0009, ADR-0023).
 *
 * O conteúdo (inclusive tokens nos links) vai só para o Mailpit; o log continua com metadados (template e
 * destinatário mascarado). Mailpit fora do ar não quebra o fluxo: registra `mail.dev_smtp_unavailable`.
 */
const FROM = 'nao-responda@healthmind.local';
const TIMEOUT_MS = 5000;

const SUBJECTS: Record<MailTemplateId, string> = {
  'email-verification': 'Confirme seu e-mail',
  'password-reset': 'Redefinição de senha',
  'account-exists': 'Tentativa de cadastro com o seu e-mail',
  'security-alert': 'Alerta de segurança da conta',
  reminder: 'Lembrete',
  'export-ready': 'Sua exportação está pronta',
  'privacy-request-received': 'Pedido de privacidade recebido',
  'account-deleted': 'Sua conta foi excluída',
};

/** Texto simples da mensagem de desenvolvimento: assunto do template e os parâmetros (links, códigos). */
export function renderDevMail(message: MailMessage): { subject: string; text: string } {
  const lines = Object.entries(message.params).map(([key, value]) => `${key}: ${value}`);
  return {
    subject: `[DEV] HealthMind 360 — ${SUBJECTS[message.template]}`,
    text: [
      'Mensagem de DESENVOLVIMENTO entregue ao Mailpit local. Em produção o texto final vem do provedor.',
      '',
      `Modelo: ${message.template}`,
      ...lines,
      '',
    ].join('\r\n'),
  };
}

function encodeHeader(value: string): string {
  // Não-ASCII em cabeçalho: palavra codificada (RFC 2047).
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Endereço simples, sem CR/LF nem `<>`: evita injeção de cabeçalho ou de comando SMTP. */
function assertSafeAddress(address: string): void {
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(address)) throw new Error('endereço de e-mail inválido');
}

export function buildMime(message: MailMessage, id: string, now: Date): string {
  const { subject, text } = renderDevMail(message);
  // Linhas começando com "." são duplicadas (dot-stuffing, RFC 5321 §4.5.2).
  const body = text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  return [
    `From: HealthMind 360 (dev) <${FROM}>`,
    `To: <${message.to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${id}@healthmind.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
}

/** Diálogo SMTP: cada comando espera o código de resposta esperado. */
async function smtpSend(host: string, port: number, to: string, data: string): Promise<void> {
  const socket: Socket = connect({ host, port });
  socket.setEncoding('utf8');
  socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('timeout')));
  let buffer = '';
  const waiters: Array<(line: string) => void> = [];
  const failures: Array<(e: Error) => void> = [];
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    // Resposta completa: última linha com "NNN " (sem hífen de continuação).
    const match = /(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/.exec(buffer);
    if (match) {
      const code = match[1] ?? '';
      buffer = '';
      waiters.shift()?.(code);
      failures.shift();
    }
  });
  socket.on('error', (e) => {
    for (const fail of failures.splice(0)) fail(e);
    waiters.splice(0);
  });
  const expect = (codes: string[]) =>
    new Promise<void>((resolve, reject) => {
      waiters.push((code) =>
        codes.includes(code) ? resolve() : reject(new Error(`smtp ${code}`)),
      );
      failures.push(reject);
    });
  const command = (line: string, codes: string[]) => {
    const reply = expect(codes);
    socket.write(`${line}\r\n`);
    return reply;
  };
  try {
    await expect(['220']);
    await command('EHLO healthmind.local', ['250']);
    await command(`MAIL FROM:<${FROM}>`, ['250']);
    await command(`RCPT TO:<${to}>`, ['250', '251']);
    await command('DATA', ['354']);
    await command(`${data}\r\n.`, ['250']);
    await command('QUIT', ['221']).catch(() => undefined);
  } finally {
    socket.destroy();
  }
}

export class DevSmtpMailProvider implements MailProvider {
  readonly id = 'dev-smtp';
  readonly #host: string;
  readonly #port: number;
  readonly #logger: Logger;

  constructor({
    host,
    port,
    logger = defaultLogger,
  }: {
    host: string;
    port: number;
    logger?: Logger;
  }) {
    this.#host = host;
    this.#port = port;
    this.#logger = logger;
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    const id = randomUUID();
    assertSafeAddress(message.to);
    const meta = { adapter: this.id, template: message.template, recipient: maskEmail(message.to) };
    try {
      await smtpSend(this.#host, this.#port, message.to, buildMime(message, id, new Date()));
      this.#logger.info('mail.sent', meta);
    } catch {
      // Sem detalhes do erro: a mensagem do socket/servidor não entra no log.
      this.#logger.warn('mail.dev_smtp_unavailable', meta);
    }
    return { id };
  }
}
