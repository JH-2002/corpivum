// Gerado por scripts/assets/pack-models.mjs (ADR-0028). Não editar à mão: rode o pipeline.
import type { BodyAsset, BodyModel } from './bodyModel';

/** Modelos `.glb` do corpo por variante. Variante sem arquivo usa a geometria gerada em código. */
export const BODY_ASSETS: Partial<Record<BodyModel, BodyAsset>> = {
  feminine: {
    file: '/models/body-feminine.bcf0114d.glb',
    bytes: 127500,
    sha256: 'bcf0114de0e6ab5d35b72b5fba7be2a16898f72eb9034c4eb32c66a12b2b27ad',
    triangles: 10644,
    calibration: {
      baseHeightM: 1.6,
      girthCm: {
        chest: {
          min: 70.5,
          base: 84.6,
          max: 101.5,
          sizeMin: 82.4,
          sizeMax: 89.3,
        },
        arm: {
          min: 13,
          base: 21.7,
          max: 30.4,
          sizeMin: 18.3,
          sizeMax: 24.4,
        },
        waist: {
          min: 58.9,
          base: 62.9,
          max: 72.1,
          sizeMin: 57.2,
          sizeMax: 70.6,
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
    file: '/models/body-masculine.ef062a00.glb',
    bytes: 125376,
    sha256: 'ef062a000f954fae4572b1c5853bed8e77a799dafae7dc35a73a6547d73bb412',
    triangles: 10906,
    calibration: {
      baseHeightM: 1.729,
      girthCm: {
        chest: {
          min: 69,
          base: 84.4,
          max: 100.4,
          sizeMin: 82.2,
          sizeMax: 92.7,
        },
        arm: {
          min: 17,
          base: 26.5,
          max: 36.1,
          sizeMin: 24.2,
          sizeMax: 32.2,
        },
        waist: {
          min: 60.9,
          base: 70.2,
          max: 82.9,
          sizeMin: 65.3,
          sizeMax: 86.5,
        },
        hip: {
          min: 85.5,
          base: 93.7,
          max: 110.4,
          sizeMin: 89.2,
          sizeMax: 103.7,
        },
        thigh: {
          min: 48.5,
          base: 53.5,
          max: 61,
          sizeMin: 50.2,
          sizeMax: 59.1,
        },
      },
    },
  },
};
