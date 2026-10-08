import { createServer, type AddressInfo, type Server } from 'node:net';
import { createLogger, type LogRecord } from '@/lib/logger';
import { createMailProvider } from './index';
import { ConsoleMailProvider } from './console';
import { buildMime, DevSmtpMailProvider } from './dev-smtp';

const TOKEN = 'tok3n-secreto-de-teste';
const URL = `http://localhost:3000/verificar-email?token=${TOKEN}`;

/** Servidor SMTP mínimo que aceita tudo e guarda a conversa. */
function fakeSmtp(): Promise<{ server: Server; port: number; transcript: () => string }> {
  let log = '';
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    let inData = false;
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk: string) => {
      log += chunk;
      if (inData) {
        if (log.endsWith('\r\n.\r\n')) {
          inData = false;
          socket.write('250 OK\r\n');
        }
        return;
      }
      const line = chunk.trim();
      if (line.startsWith('EHLO')) socket.write('250-fake\r\n250 8BITMIME\r\n');
      else if (line === 'DATA') {
        inData = true;
        socket.write('354 go\r\n');
      } else if (line === 'QUIT') socket.end('221 bye\r\n');
      else socket.write('250 OK\r\n');
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        port: (server.address() as AddressInfo).port,
        transcript: () => log,
      }),
    ),
  );
}

function capture() {
  const logs: LogRecord[] = [];
  return { logs, logger: createLogger({ minLevel: 'debug', sink: (r) => logs.push(r) }) };
}

describe('e-mail em desenvolvimento via Mailpit (ADR-0023)', () => {
  it('entrega o link ao SMTP local e loga só metadados, sem token', async () => {
    const smtp = await fakeSmtp();
    const { logs, logger } = capture();
    const mail = new DevSmtpMailProvider({ host: '127.0.0.1', port: smtp.port, logger });
    await mail.send({
      to: 'pessoa@exemplo.test',
      template: 'email-verification',
      params: { url: URL },
    });
    smtp.server.close();

    const t = smtp.transcript();
    expect(t).toContain('MAIL FROM:<nao-responda@healthmind.local>');
    expect(t).toContain('RCPT TO:<pessoa@exemplo.test>');
    expect(t).toContain(`url: ${URL}`);
    expect(t).toContain('Content-Type: text/plain; charset=utf-8');
    expect(t).toMatch(/Subject: =\?UTF-8\?B\?/);

    expect(logs.map((l) => l.event)).toEqual(['mail.sent']);
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
    expect(JSON.stringify(logs)).not.toContain('pessoa@exemplo.test');
  });

  it('Mailpit fora do ar: não lança e avisa só com metadados', async () => {
    const smtp = await fakeSmtp();
    const port = smtp.port;
    await new Promise((r) => smtp.server.close(r));
    const { logs, logger } = capture();
    const mail = new DevSmtpMailProvider({ host: '127.0.0.1', port, logger });
    await expect(
      mail.send({ to: 'pessoa@exemplo.test', template: 'password-reset', params: { url: URL } }),
    ).resolves.toHaveProperty('id');
    expect(logs.map((l) => l.event)).toEqual(['mail.dev_smtp_unavailable']);
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
  });

  it('recusa destinatário com quebra de linha (injeção de cabeçalho ou comando)', async () => {
    const mail = new DevSmtpMailProvider({ host: '127.0.0.1', port: 1 });
    await expect(
      mail.send({ to: 'a@b.test\r\nBcc: x@y.test', template: 'reminder', params: {} }),
    ).rejects.toThrow();
  });

  it('faz dot-stuffing de linhas começadas por ponto', () => {
    const mime = buildMime(
      { to: 'a@b.test', template: 'reminder', params: { nota: 'x\n.y' } },
      'id',
      new Date(0),
    );
    expect(mime).toContain('\r\n..y');
  });

  it('só development usa o SMTP; test continua em memória; produção recusa o console', async () => {
    const base = {
      MAIL_PROVIDER: 'console',
      DEV_SMTP_HOST: 'localhost',
      DEV_SMTP_PORT: 1025,
    } as const;
    expect(createMailProvider({ ...base, APP_ENV: 'development' })).toBeInstanceOf(
      DevSmtpMailProvider,
    );
    expect(createMailProvider({ ...base, APP_ENV: 'test' })).toBeInstanceOf(ConsoleMailProvider);
    const { parseEnv } = await import('@/lib/env');
    expect(() =>
      parseEnv({
        APP_ENV: 'development',
        DATABASE_URL: 'postgresql://app_user:x@localhost:5432/db',
        DEV_SMTP_HOST: 'smtp.exemplo.com',
      }),
    ).toThrow(/DEV_SMTP_HOST/);
  });
});
