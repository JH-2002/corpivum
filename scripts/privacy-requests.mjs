// Atendimento manual de pedidos do titular (ADR-0034, LEG-D07; runbook docs/runbooks/DATA_SUBJECT_REQUEST.md).
// Uso:
//   pnpm privacy:requests list                       pedidos em aberto (sem e-mail nem pessoa)
//   pnpm privacy:requests contact <id>               e-mail da conta do pedido (fica no AuditLog)
//   pnpm privacy:requests close <id> completed|rejected
// Conecta como app_operator (OPERATOR_DATABASE_URL), que só executa as funções app.operator_*: nada de
// tabela, nada de dado de saúde. Nunca imprime credenciais.
import 'dotenv/config';
import pg from 'pg';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [command, id, status] = process.argv.slice(2);

function usage(message) {
  console.error(message);
  console.error('Uso: pnpm privacy:requests list | contact <id> | close <id> completed|rejected');
  process.exit(2);
}

const url = process.env.OPERATOR_DATABASE_URL;
if (!url) usage('OPERATOR_DATABASE_URL não está definida.');
if (new URL(url).username !== 'app_operator')
  usage('OPERATOR_DATABASE_URL precisa usar o papel app_operator.');
if (!['list', 'contact', 'close'].includes(command ?? '')) usage('Comando desconhecido.');
if (command !== 'list' && !UUID.test(id ?? '')) usage('Informe o protocolo (UUID) do pedido.');
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
