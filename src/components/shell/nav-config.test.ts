import { describe, expect, it } from 'vitest';
import messages from '@messages/pt-BR.json';
import {
  ALL_NAV_ITEMS,
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
      'sleep',
      'mood',
      'habits',
      'journal',
      'body',
      'nutrition',
      'activity',
      'medications',
      'goals',
      'timeline',
      'twin',
      'ai',
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
    expect(navItemForPath('/medicamentos')?.key).toBe('medications');
    expect(navItemForPath('/inexistente')).toBeUndefined();
  });
});
