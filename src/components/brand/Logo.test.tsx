import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo, logoFonte, logoForma } from './Logo';

describe('logoForma (tamanho mínimo, ADR-0045)', () => {
  it.each([
    [512, 'completo'],
    [128, 'completo'],
    [127, 'simbolo'],
    [48, 'simbolo'],
    [47, 'icone'],
    [16, 'icone'],
  ] as const)('%i px → %s', (largura, forma) => {
    expect(logoForma(largura)).toBe(forma);
  });
});

describe('logoFonte', () => {
  it('escolhe o menor arquivo que cobre 1× e 2×', () => {
    expect(logoFonte(48)).toMatchObject({
      forma: 'simbolo',
      src: '/brand/corpivum-simbolo-64.webp',
      srcSet: '/brand/corpivum-simbolo-64.webp 1x, /brand/corpivum-simbolo-128.webp 2x',
      width: 48,
      height: 48,
    });
    expect(logoFonte(176)).toMatchObject({
      forma: 'completo',
      src: '/brand/corpivum-logo-256.webp',
      srcSet: '/brand/corpivum-logo-256.webp 1x, /brand/corpivum-logo-512.webp 2x',
    });
    expect(logoFonte(32).src).toBe('/brand/corpivum-icone-32.png');
  });

  it('todo arquivo referenciado existe em public/brand', () => {
    for (const largura of [16, 24, 32, 40, 47, 48, 64, 96, 127, 128, 176, 256, 400]) {
      for (const entrada of logoFonte(largura).srcSet.split(', ')) {
        const url = entrada.split(' ')[0]!;
        expect(existsSync(path.join(process.cwd(), 'public', url)), url).toBe(true);
      }
    }
  });
});

describe('public/brand', () => {
  it('só tem arquivos no padrão que o proxy deixa passar sem sessão (src/proxy.ts, ADR-0045)', () => {
    const arquivos = readdirSync(path.join(process.cwd(), 'public', 'brand'));
    expect(arquivos.length).toBeGreaterThan(0);
    for (const f of arquivos) expect(f).toMatch(/^corpivum-[a-z]+-[0-9]+\.(?:webp|png)$/);
  });
});

describe('<Logo>', () => {
  it('com rótulo é uma imagem com nome acessível', () => {
    render(<Logo largura={176} rotulo="Corpivum" />);
    expect(screen.getByRole('img', { name: 'Corpivum' })).toHaveAttribute('data-logo', 'completo');
  });

  it('sem rótulo é decorativa', () => {
    const { container } = render(<Logo largura={48} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('data-logo', 'simbolo');
  });
});
