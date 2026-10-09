// Gerado por scripts/assets/pack-models.mjs (ADR-0028). Não editar à mão: rode o pipeline.
import type { BodyAsset, BodyModel } from './bodyModel';

/** Modelos `.glb` do corpo por variante. Variante sem arquivo usa a geometria gerada em código. */
export const BODY_ASSETS: Partial<Record<BodyModel, BodyAsset>> = {
  neutral: {
    file: '/models/body-neutral.81510673.glb',
    bytes: 125076,
    sha256: '815106738f2576471babb6e527889c0f34dc959d39992c07f2e9afef83e07de6',
    triangles: 10902,
    calibration: {
      baseHeightM: 1.659,
      girthCm: {
        chest: {
          min: 72.6,
          base: 87.8,
          max: 105.1,
          sizeMin: 85.9,
          sizeMax: 92.6,
        },
        arm: {
          min: 17.1,
          base: 26.5,
          max: 36,
          sizeMin: 23.3,
          sizeMax: 29.5,
        },
        waist: {
          min: 59.5,
          base: 69.5,
          max: 79.9,
          sizeMin: 64.8,
          sizeMax: 77.7,
        },
        hip: {
          min: 85.5,
          base: 93.8,
          max: 110.6,
          sizeMin: 87.7,
          sizeMax: 100.8,
        },
        thigh: {
          min: 48.6,
          base: 53.1,
          max: 60.1,
          sizeMin: 47.6,
          sizeMax: 57.3,
        },
      },
    },
  },
  feminine: {
    file: '/models/body-feminine.b9939640.glb',
    bytes: 129668,
    sha256: 'b9939640d8aaeefd56cea920f750f03d1c79e5045b3131cfd855e160daf6df06',
    triangles: 10850,
    calibration: {
      baseHeightM: 1.591,
      girthCm: {
        chest: {
          min: 67.9,
          base: 82.6,
          max: 99.9,
          sizeMin: 79.6,
          sizeMax: 88.8,
        },
        arm: {
          min: 15.4,
          base: 24.4,
          max: 33.2,
          sizeMin: 21.8,
          sizeMax: 27.1,
        },
        waist: {
          min: 56.1,
          base: 65.2,
          max: 74.6,
          sizeMin: 60.9,
          sizeMax: 70.8,
        },
        hip: {
          min: 86.1,
          base: 94.7,
          max: 111.8,
          sizeMin: 87.4,
          sizeMax: 102.8,
        },
        thigh: {
          min: 49,
          base: 52.6,
          max: 58,
          sizeMin: 45.8,
          sizeMax: 58.4,
        },
      },
    },
  },
  masculine: {
    file: '/models/body-masculine.de79ddb3.glb',
    bytes: 122972,
    sha256: 'de79ddb3422e9c58791de58fea3a23623808ccf48b27bea6a36e3460d6b29ae7',
    triangles: 10890,
    calibration: {
      baseHeightM: 1.729,
      girthCm: {
        chest: {
          min: 78.4,
          base: 93.7,
          max: 110.9,
          sizeMin: 93.5,
          sizeMax: 98,
        },
        arm: {
          min: 19.3,
          base: 28.8,
          max: 38.4,
          sizeMin: 25.5,
          sizeMax: 32.1,
        },
        waist: {
          min: 64.3,
          base: 74.6,
          max: 85.2,
          sizeMin: 70.1,
          sizeMax: 85.9,
        },
        hip: {
          min: 85.7,
          base: 94.1,
          max: 111.1,
          sizeMin: 88.4,
          sizeMax: 99.9,
        },
        thigh: {
          min: 49.8,
          base: 54.9,
          max: 62.6,
          sizeMin: 50.1,
          sizeMax: 56.8,
        },
      },
    },
  },
};
