// Gerado por scripts/assets/pack-models.mjs (ADR-0028). Não editar à mão: rode o pipeline.
import type { BodyAsset, BodyModel } from './bodyModel';

/** Modelos `.glb` do corpo por variante. Variante sem arquivo usa a geometria gerada em código. */
export const BODY_ASSETS: Partial<Record<BodyModel, BodyAsset>> = {
  feminine: {
    file: '/models/body-feminine.f471adac.glb',
    bytes: 128956,
    sha256: 'f471adac7434d864a01a0f48f2f9e096838c3c355e88bdacefbe5906b4b540fc',
    triangles: 10710,
    calibration: {
      baseHeightM: 1.6,
      armAxis: [0.67916, -0.73382, 0.01593],
      girthCm: {
        chest: {
          min: 77.27,
          base: 85.94,
          max: 102.23,
          sizeMin: 84.04,
          sizeMax: 90.43,
          cross: {
            waist_min: 84.82,
            waist_max: 87.73,
          },
        },
        arm: {
          min: 19.77,
          base: 25.04,
          max: 31.24,
          sizeMin: 21.71,
          sizeMax: 27.72,
          cross: {},
        },
        waist: {
          min: 62.39,
          base: 67.68,
          max: 77.69,
          sizeMin: 62.34,
          sizeMax: 74.97,
          cross: {
            chest_min: 64.55,
            chest_max: 71.21,
            hip_min: 66.53,
            hip_max: 68.92,
          },
        },
        hip: {
          min: 76.55,
          base: 96.13,
          max: 117.85,
          sizeMin: 88.55,
          sizeMax: 104.37,
          cross: {
            waist_min: 95.98,
            waist_max: 96.34,
          },
        },
        thigh: {
          min: 49.53,
          base: 53.82,
          max: 58.52,
          sizeMin: 47.13,
          sizeMax: 59.63,
          cross: {
            hip_min: 48.1,
            hip_max: 60,
          },
        },
      },
    },
    measure: {
      chest: {
        point: [0, 1.15494, 0],
        normal: [0, 1, 0],
        near: [0, 1.15494, 0],
      },
      waist: {
        point: [0, 1.00613, 0],
        normal: [0, 1, 0],
        near: [0, 1.00613, 0],
      },
      hip: {
        point: [0, 0.80415, 0],
        normal: [0, 1, 0],
        near: [0, 0.80415, 0],
      },
      thigh: {
        point: [0, 0.72447, 0],
        normal: [0, 1, 0],
        near: [0.09436, 0.72447, 0.01573],
      },
      arm: {
        point: [0.22265, 1.16826, 0.02271],
        normal: [0.67916, -0.73382, 0.01593],
        near: [0.22265, 1.16826, 0.02271],
      },
    },
  },
  masculine: {
    file: '/models/body-masculine.534b3fb1.glb',
    bytes: 125036,
    sha256: '534b3fb1eb481e6261d2dd99ab64ddfe15fe00570ee17fc73dae2590334c63e8',
    triangles: 10882,
    calibration: {
      baseHeightM: 1.729,
      armAxis: [0.646, -0.76324, -0.01239],
      girthCm: {
        chest: {
          min: 77.45,
          base: 95.76,
          max: 116.62,
          sizeMin: 94.61,
          sizeMax: 99.91,
          cross: {
            waist_min: 94.47,
            waist_max: 97.23,
          },
        },
        arm: {
          min: 27.19,
          base: 30.92,
          max: 36.12,
          sizeMin: 27.75,
          sizeMax: 34.37,
          cross: {},
        },
        waist: {
          min: 64.42,
          base: 80.16,
          max: 97.44,
          sizeMin: 75.21,
          sizeMax: 90.91,
          cross: {
            chest_min: 77.99,
            chest_max: 82.52,
            hip_min: 78.98,
            hip_max: 81.44,
          },
        },
        hip: {
          min: 78.06,
          base: 97.96,
          max: 119.89,
          sizeMin: 92.32,
          sizeMax: 103.5,
          cross: {
            waist_min: 97.17,
            waist_max: 98.89,
          },
        },
        thigh: {
          min: 51.25,
          base: 56.83,
          max: 63.05,
          sizeMin: 52.82,
          sizeMax: 58.76,
          cross: {
            hip_min: 50.59,
            hip_max: 63.69,
          },
        },
      },
    },
    measure: {
      chest: {
        point: [0, 1.2613, 0],
        normal: [0, 1, 0],
        near: [0, 1.2613, 0],
      },
      waist: {
        point: [0, 1.07675, 0],
        normal: [0, 1, 0],
        near: [0, 1.07675, 0],
      },
      hip: {
        point: [0, 0.86781, 0],
        normal: [0, 1, 0],
        near: [0, 0.86781, 0],
      },
      thigh: {
        point: [0, 0.80325, 0],
        normal: [0, 1, 0],
        near: [0.10854, 0.80325, -0.00724],
      },
      arm: {
        point: [0.32302, 1.27583, 0.01697],
        normal: [0.646, -0.76324, -0.01239],
        near: [0.32302, 1.27583, 0.01697],
      },
    },
  },
};
