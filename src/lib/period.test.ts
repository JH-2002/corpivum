import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERIOD,
  formatIsoDate,
  parseStoredPeriod,
  resolveRange,
  validateCustomRange,
} from './period';

describe('resolveRange', () => {
  it.each([
    ['7d', '2026-10-06', '2026-09-30'],
    ['30d', '2026-10-06', '2026-09-07'],
    ['90d', '2026-10-06', '2026-07-09'],
    ['12m', '2026-10-06', '2025-10-07'],
    ['7d', '2026-03-03', '2026-02-25'],
    ['12m', '2024-02-29', '2023-03-02'],
  ] as const)('%s terminando em %s começa em %s (inclusivo)', (preset, today, from) => {
    expect(resolveRange({ preset }, today)).toEqual({ from, to: today });
  });

  it('usa as datas do intervalo personalizado', () => {
    expect(
      resolveRange({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' }, '2026-10-06'),
    ).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });
});

describe('validateCustomRange', () => {
  const today = '2026-10-06';
  it('aceita intervalo válido, inclusive de um dia', () => {
    expect(validateCustomRange('2026-09-01', '2026-09-30', today)).toBeNull();
    expect(validateCustomRange(today, today, today)).toBeNull();
  });
  it('recusa início depois do fim', () => {
    expect(validateCustomRange('2026-09-30', '2026-09-01', today)).toBe('inverted');
  });
  it('recusa datas no futuro', () => {
    expect(validateCustomRange('2026-10-01', '2026-10-07', today)).toBe('future');
  });
  it('recusa datas inválidas', () => {
    expect(validateCustomRange('', '2026-10-01', today)).toBe('invalid');
    expect(validateCustomRange('2026-02-30', '2026-03-01', today)).toBe('invalid');
  });
});

describe('parseStoredPeriod', () => {
  it('recupera valores válidos', () => {
    expect(parseStoredPeriod('{"preset":"90d"}')).toEqual({ preset: '90d' });
    expect(parseStoredPeriod('{"preset":"custom","from":"2026-01-01","to":"2026-02-01"}')).toEqual({
      preset: 'custom',
      from: '2026-01-01',
      to: '2026-02-01',
    });
  });

  it.each([
    null,
    '',
    'não-json',
    '{"preset":"5y"}',
    '{"preset":"custom","from":"x","to":"y"}',
    '{"preset":"custom","from":"2026-02-01","to":"2026-01-01"}',
  ])('cai no padrão para %j', (raw) => {
    expect(parseStoredPeriod(raw)).toEqual(DEFAULT_PERIOD);
  });
});

describe('formatIsoDate', () => {
  it('formata em dd/mm/aaaa', () => {
    expect(formatIsoDate('2026-10-06')).toBe('06/10/2026');
  });
});
