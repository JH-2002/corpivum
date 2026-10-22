import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n/messages';
import {
  ACCOUNT_KEYS,
  ALL_NAV_ITEMS,
  BOTTOM_NAV_HREFS,
  DEMO_ITEMS,
  DEMO_MORE_ITEMS,
  isActivePath,
  MORE_ITEMS,
  NAV_ITEMS_BY_KEY,
  navItemForPath,
  SIDEBAR_ITEMS,
} from './nav-config';

describe('nav-config', () => {
  it('a sidebar segue a ordem da §9', () => {
    expect(SIDEBAR_ITEMS.map((i) => i.key)).toEqual([
      'home',
      'body',
      'sleep',
      'habits',
      'nutrition',
      'activity',
      'goals',
      'timeline',
      'twin',
      'reports',
      'settings',
    ]);
  });

  it('toda chave tem item, rótulo i18n e rota única', () => {
    const hrefs = ALL_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of ALL_NAV_ITEMS) {
      expect(NAV_ITEMS_BY_KEY[item.key]).toBe(item);
      expect(messages.nav[item.key]).toBeTruthy();
    }
  });

  it('"Mais" contém tudo que não está na barra inferior, inclusive a Central de Privacidade', () => {
    const keys = MORE_ITEMS.map((i) => i.key);
    expect(keys).not.toContain('home');
    expect(keys).not.toContain('twin');
    expect(keys).not.toContain('timeline');
    expect(keys).toContain('privacy');
    expect(keys).toHaveLength(ALL_NAV_ITEMS.length - 3);
  });

  it('isActivePath casa a rota e subrotas, sem falso prefixo', () => {
    expect(isActivePath('/sono', '/sono')).toBe(true);
    expect(isActivePath('/sono/123', '/sono')).toBe(true);
    expect(isActivePath('/sonolencia', '/sono')).toBe(false);
    expect(navItemForPath('/corpo')?.key).toBe('body');
    expect(navItemForPath('/inexistente')).toBeUndefined();
  });

  it('a barra inferior tem as mesmas 4 rotas no app e no demo, e o demo fica só em /demo (9b)', () => {
    expect(Object.keys(BOTTOM_NAV_HREFS.app)).toEqual(Object.keys(BOTTOM_NAV_HREFS.demo));
    for (const href of Object.values(BOTTOM_NAV_HREFS.demo)) expect(href).toMatch(/^\/demo(\/|$)/);
    expect(BOTTOM_NAV_HREFS.app.more).toBe('/mais');
  });

  it('"Mais" do demo tem os módulos do demo que não estão na barra, todos dentro de /demo', () => {
    const keys = DEMO_MORE_ITEMS.map((i) => i.key);
    expect(keys).toEqual(['body', 'sleep', 'habits', 'nutrition', 'activity', 'goals']);
    expect(keys).toHaveLength(DEMO_ITEMS.length - 3);
    for (const item of DEMO_MORE_ITEMS) expect(item.href).toMatch(/^\/demo\//);
  });

  it('o grupo "Conta" da sidebar tem relatórios, configurações e Central de Privacidade', () => {
    for (const key of ACCOUNT_KEYS) expect(NAV_ITEMS_BY_KEY[key]).toBeDefined();
    expect(ACCOUNT_KEYS).toContain('privacy');
  });
});
