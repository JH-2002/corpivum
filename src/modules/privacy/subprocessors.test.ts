// @vitest-environment node
import { readFileSync } from 'node:fs';
import { messages } from '@/i18n/messages';
import { SUBPROCESSORS } from './subprocessors';

/** LEG-D06: a lista exibida ao titular é a mesma do registro de subprocessadores (docs/privacy). */
describe('subprocessadores', () => {
  it('espelha a tabela de produção de docs/privacy/SUBPROCESSORS.md, na mesma ordem', () => {
    const md = readFileSync(
      new URL('../../../docs/privacy/SUBPROCESSORS.md', import.meta.url),
      'utf8',
    );
    const section = md.slice(md.indexOf('## Produção'), md.indexOf('## Desenvolvimento'));
    const services = section
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('| ') && !line.startsWith('| Serviço') && !line.startsWith('|---'),
      )
      .map((line) => line.split('|')[1]?.trim());
    expect(services).toEqual(SUBPROCESSORS.map((key) => messages.subprocessors.items[key].service));
  });
});
