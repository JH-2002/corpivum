'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, Color, FrontSide, NormalBlending } from 'three';
import { usePrefersReducedMotion } from '@/components/charts/reduced-motion';
import { useThemeToken, useTokenColor } from '../hooks';

/**
 * Material holográfico do twin (ADR-0028): fresnel nas bordas, preenchimento translúcido e linhas de
 * varredura sutis. Usa os chunks de morph do three, então serve para a malha `.glb` com morph targets e
 * para a geometria gerada em código. Nenhuma cor depende dos registros da pessoa: só o estado de
 * interface (escolhida, sem medida) muda o desenho.
 */
const VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vY;
void main() {
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  vNormalV = normalize(normalMatrix * objectNormal);
  vViewDir = normalize(-mv.xyz);
  vY = (modelMatrix * vec4(transformed, 1.0)).y;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uRim;
uniform vec3 uScan;
uniform vec3 uHighlight;
uniform float uTime;
uniform float uSelected;
uniform float uDimmed;
uniform float uBaseAlpha;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vY;
void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
  float rim = pow(1.0 - facing, 2.2);
  float band = 0.5 + 0.5 * sin((vY * 38.0 - uTime * 0.5) * 6.2831853);
  float scan = pow(band, 10.0);
  vec3 edge = mix(uRim, uHighlight, uSelected);
  vec3 color = mix(mix(uFill, uHighlight, uSelected * 0.6), edge, rim) + uScan * scan * 0.25;
  float alpha = (uBaseAlpha + uSelected * 0.18) + (0.85 - uBaseAlpha) * rim + scan * 0.05;
  alpha *= mix(1.0, 0.4, uDimmed);
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

/** Tempo da varredura, compartilhado por todas as malhas (uniform com o mesmo objeto). */
const sharedTime = { value: 0 };

export type HoloState = 'base' | 'selected' | 'dimmed';

/** Cores e mistura do holograma pelos tokens `--hm-holo-*` (tema único escuro, ADR-0046). */
export function useHoloTheme() {
  return {
    fill: useTokenColor('--hm-holo-fill', '#38bdf8'),
    rim: useTokenColor('--hm-holo-rim', '#a5e8ff'),
    scan: useTokenColor('--hm-holo-scan', '#7dd3fc'),
    highlight: useTokenColor('--hm-holo-highlight', '#ffffff'),
    additive: useThemeToken('--hm-holo-blend', 'additive') === 'additive',
  };
}

export type HoloTheme = ReturnType<typeof useHoloTheme>;

/** Uniforms novos por material; os valores vêm das props (notação com hífen do R3F). */
const makeUniforms = () => ({
  uFill: { value: new Color() },
  uRim: { value: new Color() },
  uScan: { value: new Color() },
  uHighlight: { value: new Color() },
  uTime: sharedTime,
  uSelected: { value: 0 },
  uDimmed: { value: 0 },
  uBaseAlpha: { value: 0.16 },
});

export function HologramMaterial({ theme, state }: { theme: HoloTheme; state: HoloState }) {
  const uniforms = useMemo(() => makeUniforms(), []);
  return (
    <shaderMaterial
      vertexShader={VERTEX}
      fragmentShader={FRAGMENT}
      uniforms={uniforms}
      uniforms-uFill-value={theme.fill}
      uniforms-uRim-value={theme.rim}
      uniforms-uScan-value={theme.scan}
      uniforms-uHighlight-value={theme.highlight}
      uniforms-uSelected-value={state === 'selected' ? 1 : 0}
      uniforms-uDimmed-value={state === 'dimmed' ? 1 : 0}
      uniforms-uBaseAlpha-value={theme.additive ? 0.12 : 0.16}
      transparent
      depthWrite={false}
      side={FrontSide}
      blending={theme.additive ? AdditiveBlending : NormalBlending}
    />
  );
}

/** Quadros por segundo da varredura: suficiente para um movimento suave sem gastar bateria. */
const SCAN_FPS = 30;

/**
 * Anima a varredura só com a aba visível e o canvas na tela. Com `prefers-reduced-motion`, a varredura
 * fica parada e nenhum quadro extra é pedido (`frameloop="demand"` segue parado).
 */
export function HoloClock() {
  const reduced = usePrefersReducedMotion();
  const invalidate = useThree((s) => s.invalidate);
  const canvas = useThree((s) => s.gl.domElement);

  useEffect(() => {
    if (reduced) {
      sharedTime.value = 0;
      invalidate();
      return;
    }
    let onScreen = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      const active = onScreen && document.visibilityState === 'visible';
      if (active && timer === null) timer = setInterval(() => invalidate(), 1000 / SCAN_FPS);
      if (!active && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
            update();
          });
    observer?.observe(canvas);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      if (timer !== null) clearInterval(timer);
    };
  }, [reduced, invalidate, canvas]);

  useFrame(() => {
    if (!reduced) sharedTime.value = performance.now() / 1000;
  });
  return null;
}

/** Estado de interface de uma região: escolhida, sem medida informada (esmaecida) ou base. */
export function regionHoloState<R extends string>(
  region: R | null,
  selected: R | null,
  missing: readonly R[],
): HoloState {
  if (region !== null && region === selected) return 'selected';
  if (region !== null && missing.includes(region)) return 'dimmed';
  return 'base';
}
