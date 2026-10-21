// @vitest-environment node
/**
 * Nome do produto num único lugar (ADR-0043, fase 8b; ADR-0044): a constante `PRODUCT_NAME` e o marcador
 * `%PRODUTO%` do i18n. O nome antigo só pode sobrar nos textos jurídicos versionados, cobertos por hash, que
 * mudam no go-live (ADR-0043, D5).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import raw from '@messages/pt-BR.json';
import { PRODUCT_NAME, PRODUCT_NAME_MARKER } from '@/config/product';
import { demoClientMessages, messages } from '@/i18n/messages';
import { DOCUMENT_MESSAGES } from '@/modules/consent/catalog';
import { APPROVED_DISCLAIMERS } from './approved-disclaimers';
import { findForbiddenTerms } from './forbidden-terms';

type Messages = { [key: string]: string | Messages };

function flatten(node: Messages, prefix = ''): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? [[fullKey, value] as [string, string]]
      : flatten(value, fullKey);
  });
}

const VERSIONED = Object.values(DOCUMENT_MESSAGES);
const isVersioned = (key: string) => VERSIONED.some((ns) => key.startsWith(`${ns}.`));
const OLD_NAME = /HealthMind/;

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const PRODUCT_FILE = path.join(SRC, 'config', 'product.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('nome do produto num único lugar', () => {
  const rawEntries = flatten(raw as Messages);
  const resolved = flatten(messages as Messages);

  it('o catálogo não escreve o nome: usa o marcador', () => {
    expect(rawEntries.filter(([, v]) => v.includes(PRODUCT_NAME)).map(([k]) => k)).toEqual([]);
    expect(raw.common.appName).toBe(PRODUCT_NAME_MARKER);
  });

  it('o nome antigo só sobra nos textos jurídicos versionados', () => {
    const leftovers = rawEntries.filter(([k, v]) => OLD_NAME.test(v) && !isVersioned(k));
    expect(leftovers.map(([k]) => k)).toEqual([]);
  });

  it('o catálogo carregado troca todo marcador pelo nome', () => {
    expect(messages.common.appName).toBe(PRODUCT_NAME);
    expect(resolved.filter(([, v]) => v.includes(PRODUCT_NAME_MARKER)).map(([k]) => k)).toEqual([]);
    expect(resolved).toHaveLength(rawEntries.length);
  });

  it('os textos versionados ficam idênticos (o hash não muda)', () => {
    const byKey = new Map(resolved);
    for (const [key, value] of rawEntries.filter(([k]) => isVersioned(k))) {
      expect(byKey.get(key), key).toBe(value);
    }
  });

  it('o nome não tem sintaxe de ICU nem de tags, que quebrariam as mensagens', () => {
    expect(PRODUCT_NAME).toMatch(/^[\p{L}\p{N} .-]+$/u);
  });

  it('com o nome trocado, os avisos seguem aprovados e sem alegações proibidas (LEG-M03)', () => {
    const byKey = new Map(resolved);
    for (const [key, approved] of Object.entries(APPROVED_DISCLAIMERS)) {
      expect(byKey.get(key), key).toBe(approved.replaceAll(PRODUCT_NAME_MARKER, PRODUCT_NAME));
    }
    const violations = resolved
      .filter(([key]) => !key.startsWith('disclaimer.'))
      .flatMap(([key, value]) => findForbiddenTerms(value).map((term) => `${key} → ${term.id}`));
    expect(violations).toEqual([]);
  });

  it('no modo só demo, o navegador não recebe os textos jurídicos', () => {
    const client = JSON.stringify(demoClientMessages());
    expect(client).not.toMatch(OLD_NAME);
    expect(client).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(client).toContain(PRODUCT_NAME);
  });

  it('o código não escreve o nome fora da constante', () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const text = readFileSync(file, 'utf8');
      return OLD_NAME.test(text) || (file !== PRODUCT_FILE && text.includes(PRODUCT_NAME));
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
