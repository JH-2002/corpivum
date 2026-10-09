// Gerado por scripts/assets/pack-models.mjs (ADR-0028). Não editar à mão: rode o pipeline.
import type { BodyAsset, BodyModel } from './bodyModel';

/** Modelos `.glb` do corpo por variante. Variante sem arquivo usa a geometria gerada em código. */
export const BODY_ASSETS: Partial<Record<BodyModel, BodyAsset>> = {
  neutral: {
    file: '/models/body-neutral.3f2b5e82.glb',
    bytes: 125152,
    sha256: '3f2b5e82ff6abdb86e48f8d668d065643e7305b27683ee921a6c4cbde78273c0',
    triangles: 10852,
    calibration: {
      baseHeightM: 1.659,
      girthCm: {
        chest: {
          min: 69.2,
          base: 84.2,
          max: 101.7,
          sizeMin: 82.2,
          sizeMax: 89,
        },
        arm: {
          min: 17.1,
          base: 26.5,
          max: 36,
          sizeMin: 23.3,
          sizeMax: 29.5,
        },
        waist: {
          min: 59.7,
          base: 69.3,
          max: 82.7,
          sizeMin: 64.5,
          sizeMax: 77.5,
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
    file: '/models/body-feminine.4a6fbc27.glb',
    bytes: 128896,
    sha256: '4a6fbc272a0254466c5997f6c76113d83d7b3889acf97644e742b64654f4ed04',
    triangles: 10802,
    calibration: {
      baseHeightM: 1.6,
      girthCm: {
        chest: {
          min: 68.9,
          base: 83.3,
          max: 100.3,
          sizeMin: 81.2,
          sizeMax: 88.2,
        },
        arm: {
          min: 13,
          base: 21.7,
          max: 30.4,
          sizeMin: 18.3,
          sizeMax: 24.4,
        },
        waist: {
          min: 61.4,
          base: 65.3,
          max: 74.5,
          sizeMin: 59.6,
          sizeMax: 73,
        },
        hip: {
          min: 89,
          base: 97.8,
          max: 115.5,
          sizeMin: 90.2,
          sizeMax: 106.1,
        },
        thigh: {
          min: 49.5,
          base: 53.4,
          max: 59.5,
          sizeMin: 46.8,
          sizeMax: 59.3,
        },
      },
    },
  },
  masculine: {
    file: '/models/body-masculine.b5903269.glb',
    bytes: 124060,
    sha256: 'b59032693d8d0d8639d0fbae6590c97d4bac33c33d716c6dd54bbc776c58a250',
    triangles: 10805,
    calibration: {
      baseHeightM: 1.729,
      girthCm: {
        chest: {
          min: 92.1,
          base: 107.6,
          max: 122.5,
          sizeMin: 106.7,
          sizeMax: 111,
        },
        arm: {
          min: 22.1,
          base: 31.7,
          max: 41.4,
          sizeMin: 28.5,
          sizeMax: 35,
        },
        waist: {
          min: 63.5,
          base: 72.4,
          max: 84.7,
          sizeMin: 66.7,
          sizeMax: 83.3,
        },
        hip: {
          min: 80.5,
          base: 88.8,
          max: 105.3,
          sizeMin: 83.1,
          sizeMax: 94.4,
        },
        thigh: {
          min: 48.3,
          base: 53.4,
          max: 61.2,
          sizeMin: 49.3,
          sizeMax: 55.4,
        },
      },
    },
  },
};
