# Módulo `twin`

Health Digital Twin: corpo 3D (Fase 3, ADR-0026). O cérebro 3D saiu na reorientação (ADR-0027).

- Spec: §15–§16 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-M04, LEG-M06, LEG-X01

Funções puras, sem React e sem three.js:

- `snapshot.ts`: medidas vigentes por data (`bodySnapshotAt`), datas do controle (`measurementDays`),
  Antes × Agora (`compareSnapshots`) e a linha mínima enviada ao navegador (`toTwinRows`).
- `shape.ts`: forma do corpo só a partir de altura e circunferências informadas. O peso não entra; não há
  IMC nem classificação.
- `regions.ts`: regiões do corpo e a medida informada de cada uma.

O desenho (3D e 2D) fica em `src/components/twin`; o three.js só em `src/components/twin/scene`, carregado
sob demanda. Os resumos em texto ficam em `src/modules/insights/twin.ts`. Nada deste módulo é persistido.

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
