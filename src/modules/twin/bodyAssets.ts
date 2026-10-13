// Gerado por scripts/assets/pack-models.mjs (ADR-0028). Não editar à mão: rode o pipeline.
import type { BodyAsset, BodyModel } from './bodyModel';

/** Modelos `.glb` do corpo por variante. Variante sem arquivo usa a geometria gerada em código. */
export const BODY_ASSETS: Partial<Record<BodyModel, BodyAsset>> = {
  feminine: {
    file: '/models/body-feminine.00e6a01a.glb',
    bytes: 129984,
    sha256: '00e6a01a2394d976c8f23052a301da307186f6624e453e0cf450cd318051679d',
    triangles: 10202,
    calibration: {
      baseHeightM: 1.6,
      armAxis: [0.2502, -0.96806, 0.01593],
      girthCm: {
        chest: {
          min: 76.94,
          base: 85.76,
          max: 101.13,
          sizeMin: 83.89,
          sizeMax: 90.19,
          cross: {
            waist_min: 84.56,
            waist_max: 87.63,
          },
        },
        arm: {
          min: 19.4,
          base: 24.96,
          max: 30.98,
          sizeMin: 21.73,
          sizeMax: 27.59,
          cross: {
            chest_max: 24.91,
          },
        },
        waist: {
          min: 62.88,
          base: 68,
          max: 78.12,
          sizeMin: 63.07,
          sizeMax: 75.21,
          cross: {
            chest_min: 64.86,
            chest_max: 71.57,
            hip_min: 66.84,
            hip_max: 69.26,
          },
        },
        hip: {
          min: 76.56,
          base: 95.93,
          max: 117.33,
          sizeMin: 88.43,
          sizeMax: 104.1,
          cross: {
            waist_min: 95.78,
            waist_max: 96.12,
          },
        },
        thigh: {
          min: 49.63,
          base: 54.05,
          max: 58.91,
          sizeMin: 47.31,
          sizeMax: 59.78,
          cross: {
            hip_min: 48.33,
            hip_max: 60.22,
          },
        },
      },
    },
    measure: {
      chest: {
        point: [0, 1.15494, 0],
        normal: [0, 1, 0],
        near: [0, 1.15494, 0],
        tape: 'body',
        loop: 'whole',
      },
      waist: {
        point: [0, 1.00613, 0],
        normal: [0, 1, 0],
        near: [0, 1.00613, 0],
        tape: 'body',
        loop: 'whole',
      },
      hip: {
        point: [0, 0.80415, 0],
        normal: [0, 1, 0],
        near: [0, 0.80415, 0],
        tape: 'body',
        loop: 'nearest',
      },
      thigh: {
        point: [0, 0.72447, 0],
        normal: [0, 1, 0],
        near: [0.09436, 0.72447, 0.01573],
        tape: 'body',
        loop: 'nearest',
      },
      arm: {
        point: [0.16613, 1.13046, 0.02271],
        normal: [0.2502, -0.96806, 0.01593],
        near: [0.16613, 1.13046, 0.02271],
        tape: 'arm',
        loop: 'nearest',
      },
    },
  },
  masculine: {
    file: '/models/body-masculine.a82ae25d.glb',
    bytes: 128372,
    sha256: 'a82ae25d2b144b0c2269e3c12fd6a450a1e16f973d792476403b6994524b187c',
    triangles: 10242,
    calibration: {
      baseHeightM: 1.729,
      armAxis: [0.21628, -0.97625, -0.01239],
      girthCm: {
        chest: {
          min: 83.11,
          base: 95.88,
          max: 115.67,
          sizeMin: 94.92,
          sizeMax: 100.21,
          cross: {
            arm_max: 96.75,
            waist_min: 94.7,
            waist_max: 98.29,
          },
        },
        arm: {
          min: 24.14,
          base: 30.96,
          max: 38.69,
          sizeMin: 27.86,
          sizeMax: 34.31,
          cross: {
            chest_max: 31.43,
            waist_max: 31.21,
          },
        },
        waist: {
          min: 64.26,
          base: 79.93,
          max: 97.14,
          sizeMin: 74.46,
          sizeMax: 90.61,
          cross: {
            chest_min: 78.33,
            chest_max: 81.69,
            hip_min: 78.29,
            hip_max: 81.73,
          },
        },
        hip: {
          min: 78.33,
          base: 97.97,
          max: 119.65,
          sizeMin: 92.36,
          sizeMax: 103.47,
          cross: {
            waist_min: 97.2,
            waist_max: 98.89,
          },
        },
        thigh: {
          min: 51.28,
          base: 56.99,
          max: 63.3,
          sizeMin: 52.95,
          sizeMax: 58.87,
          cross: {
            hip_min: 50.8,
            hip_max: 63.68,
          },
        },
      },
    },
    measure: {
      chest: {
        point: [0, 1.26136, 0],
        normal: [0, 1, 0],
        near: [0, 1.26136, 0],
        tape: 'body',
        loop: 'whole',
      },
      waist: {
        point: [0, 1.06327, 0],
        normal: [0, 1, 0],
        near: [0, 1.06327, 0],
        tape: 'body',
        loop: 'whole',
      },
      hip: {
        point: [0, 0.86781, 0],
        normal: [0, 1, 0],
        near: [0, 0.86781, 0],
        tape: 'body',
        loop: 'nearest',
      },
      thigh: {
        point: [0, 0.80325, 0],
        normal: [0, 1, 0],
        near: [0.10854, 0.80325, -0.00724],
        tape: 'body',
        loop: 'nearest',
      },
      arm: {
        point: [0.23792, 1.20693, 0.01697],
        normal: [0.21628, -0.97625, -0.01239],
        near: [0.23792, 1.20693, 0.01697],
        tape: 'arm',
        loop: 'nearest',
      },
    },
  },
};
