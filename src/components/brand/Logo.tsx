/**
 * Logotipo do produto (ADR-0045). A imagem oficial é a original (`docs/brand/logo-referencia.png`), exportada
 * por `scripts/brand/exportar-logo.mjs` para `public/brand/`.
 *
 * Tamanho mínimo, pela largura exibida:
 * - 128 px ou mais: logo completo (símbolo + nome);
 * - de 48 a 127 px: só o símbolo;
 * - abaixo de 48 px: o favicon aprovado ("C" + ponto, sem a figura).
 *
 * A figura é marca, não referência de corpo (LEG-M06): não usar perto do twin, de medidas, metas ou celebrações.
 */

import { PRODUCT_SLUG } from '@/config/product';

export const LOGO_MIN_COMPLETO = 128;
export const LOGO_MIN_SIMBOLO = 48;

export type LogoForma = 'completo' | 'simbolo' | 'icone';

const ARQUIVOS: Record<
  LogoForma,
  { base: string; ext: 'webp' | 'png'; larguras: number[]; razao: number }
> = {
  // razão altura / largura do recorte exportado
  completo: {
    base: `${PRODUCT_SLUG}-logo`,
    ext: 'webp',
    larguras: [128, 256, 512],
    razao: 667 / 1004,
  },
  simbolo: {
    base: `${PRODUCT_SLUG}-simbolo`,
    ext: 'webp',
    larguras: [64, 128, 256, 512],
    razao: 1,
  },
  icone: {
    base: `${PRODUCT_SLUG}-icone`,
    ext: 'png',
    larguras: [16, 32, 48, 180, 192, 512],
    razao: 1,
  },
};

/** Forma do logotipo permitida para a largura exibida (em px CSS). */
export function logoForma(largura: number): LogoForma {
  if (largura >= LOGO_MIN_COMPLETO) return 'completo';
  if (largura >= LOGO_MIN_SIMBOLO) return 'simbolo';
  return 'icone';
}

function menorArquivo(larguras: number[], minimo: number): number {
  return larguras.find((l) => l >= minimo) ?? larguras[larguras.length - 1]!;
}

/** Arquivos e dimensões para a largura exibida: 1× e 2× (telas de alta densidade). */
export function logoFonte(largura: number): {
  forma: LogoForma;
  src: string;
  srcSet: string;
  width: number;
  height: number;
} {
  const forma = logoForma(largura);
  const { base, ext, larguras, razao } = ARQUIVOS[forma];
  const url = (l: number) => `/brand/${base}-${l}.${ext}`;
  const x1 = menorArquivo(larguras, largura);
  const x2 = menorArquivo(larguras, largura * 2);
  return {
    forma,
    src: url(x1),
    srcSet: x1 === x2 ? `${url(x1)} 1x` : `${url(x1)} 1x, ${url(x2)} 2x`,
    width: largura,
    height: Math.round(largura * razao),
  };
}

type Props = {
  /**
   * Largura exibida em px CSS; define a forma (completo, símbolo ou ícone). A `className` não deve mudar a largura:
   * encolher a imagem por CSS escaparia da regra de tamanho mínimo.
   */
  largura: number;
  /** Nome acessível. Sem ele a imagem é decorativa (use quando o nome do produto já está escrito ao lado). */
  rotulo?: string;
  className?: string;
};

export function Logo({ largura, rotulo, className }: Props) {
  const { forma, src, srcSet, width, height } = logoFonte(largura);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagens estáticas já exportadas no tamanho certo (ADR-0045)
    <img
      src={src}
      srcSet={srcSet}
      width={width}
      height={height}
      alt={rotulo ?? ''}
      aria-hidden={rotulo ? undefined : true}
      decoding="async"
      data-logo={forma}
      className={className}
    />
  );
}
