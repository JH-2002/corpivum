// Atendimento manual de pedidos do titular (ADR-0034, ADR-0037, LEG-D07; runbook DATA_SUBJECT_REQUEST.md).
// Uso:
//   pnpm privacy:requests list                       pedidos em aberto (sem e-mail nem pessoa)
//   pnpm privacy:requests contact <id>               e-mail da conta do pedido (fica no AuditLog)
//   pnpm privacy:requests close <id> completed|rejected
//   pnpm privacy:requests register <tipo> <aaaa-mm-dd>   pedido recebido fora do app; o e-mail da conta é
//                                                     pedido no terminal (não fica no histórico do shell)
//   pnpm privacy:requests delete <id>                exclusão ou encerramento de menor já registrado, depois de
//                                                     conferida a identidade: corta o acesso; a purga é do job
// Conecta com o papel de login de QUEM ATENDE (OPERATOR_DATABASE_URL, `operador_<nome>`), membro do grupo
// app_operator, que só executa as funções app.operator_*: nada de tabela, nada de dado de saúde. Cada ato grava
// esse papel no AuditLog. Nunca imprime credenciais.
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = [
  'confirmation_access',
  'correction',
  'portability',
  'deletion',
  'anonymization',
  'sharing_info',
  'automated_review',
  'minor_closure',
];
const [command, id, status] = process.argv.slice(2);

function usage(message) {
  console.error(message);
  console.error(
    'Uso: pnpm privacy:requests list | contact <id> | close <id> completed|rejected |' +
      ' register <tipo> <aaaa-mm-dd> | delete <id>',
  );
  process.exit(2);
}

const url = process.env.OPERATOR_DATABASE_URL;
if (!url) usage('OPERATOR_DATABASE_URL não está definida.');
// Papel de login de uma pessoa (o grupo app_operator não entra no banco; o banco confere a pertença).
if (!/^operador_[a-z0-9_]{1,54}$/.test(new URL(url).username))
  usage('OPERATOR_DATABASE_URL precisa usar o seu papel de login operador_<nome>.');
if (!['list', 'contact', 'close', 'register', 'delete'].includes(command ?? '')) {
  usage('Comando desconhecido.');
}
if (command === 'register') {
  if (!KINDS.includes(id ?? '')) usage(`Tipo inválido. Use: ${KINDS.join(', ')}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(status ?? ''))
    usage('Informe a data de recebimento (aaaa-mm-dd).');
} else if (command !== 'list' && !UUID.test(id ?? '')) {
  usage('Informe o protocolo (UUID) do pedido.');
}
if (command === 'close' && !['completed', 'rejected'].includes(status ?? '')) {
  usage('Informe a situação final: completed ou rejected.');
}

const client = new pg.Client({ connectionString: url });
const day = (d) => d.toISOString().slice(0, 10);

try {
  await client.connect();
  if (command === 'list') {
    const { rows } = await client.query(
      'SELECT request_id, kind, status, opened_at, due FROM app.operator_requests_due()',
    );
    if (rows.length === 0) console.log('Nenhum pedido em aberto.');
    const now = Date.now();
    for (const r of rows) {
      const late = r.due.getTime() < now ? '  VENCIDO' : '';
      console.log(
        `${r.request_id}  ${r.kind}  ${r.status}  aberto ${day(r.opened_at)}  prazo ${day(r.due)}${late}`,
      );
    }
  } else if (command === 'contact') {
    const { rows } = await client.query('SELECT app.operator_request_contact($1::uuid) AS email', [
      id,
    ]);
    console.log(rows[0]?.email ?? 'Sem contato: pedido fechado, inexistente ou conta excluída.');
  } else if (command === 'register') {
    // O e-mail é lido do terminal: não fica no histórico do shell nem na lista de processos.
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const email = (await rl.question('E-mail da conta: ')).trim();
    rl.close();
    if (!email) usage('E-mail vazio.');
    const { rows } = await client.query(
      `SELECT app.operator_request_register($1, $2::public.privacy_request_kind,
         ($3::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo') AS id`,
      [email, id, status],
    );
    console.log(
      rows[0]?.id
        ? `Pedido registrado: ${rows[0].id}`
        : 'Nenhuma conta ativa com esse e-mail: nada foi registrado.',
    );
  } else if (command === 'delete') {
    const { rows } = await client.query('SELECT app.operator_account_delete($1::uuid) AS ok', [id]);
    console.log(
      rows[0]?.ok
        ? 'Acesso cortado. A conta e os dados são apagados pelo job em até 1 hora.'
        : 'Nada mudou: pedido fechado, inexistente, de outro tipo ou conta já excluída.',
    );
  } else {
    const { rows } = await client.query(
      'SELECT app.operator_request_close($1::uuid, $2::public.privacy_request_status) AS ok',
      [id, status],
    );
    console.log(
      rows[0]?.ok ? 'Pedido fechado.' : 'Nada mudou: pedido já fechado, inexistente ou do sistema.',
    );
  }
} catch (error) {
  console.error(`Falha: ${error?.code ?? error?.name ?? 'erro desconhecido'}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
