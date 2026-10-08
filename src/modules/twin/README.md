# Módulo `twin`

Health Digital Twin: corpo 3D e cérebro 3D educativo (Fase 3, ADR-0026).

- Spec: §15–§18 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-M05, LEG-M04, LEG-X01

Funções puras, sem React e sem three.js:

- `snapshot.ts`: medidas vigentes por data (`bodySnapshotAt`), datas do controle (`measurementDays`),
  Antes × Agora (`compareSnapshots`) e a linha mínima enviada ao navegador (`toTwinRows`).
- `shape.ts`: forma do corpo só a partir de altura e circunferências informadas. O peso não entra; não há
  IMC nem classificação.
- `regions.ts`: regiões do corpo e do cérebro e os temas que o conteúdo educativo associa a cada região.
- `confidence.ts`: nível de confiança do painel do cérebro, pela suficiência dos registros (`TWIN_RULES`).

O desenho (3D e 2D) fica em `src/components/twin`; o three.js só em `src/components/twin/scene`, carregado
sob demanda. Os resumos em texto ficam em `src/modules/insights/twin.ts`. Nada deste módulo é persistido.

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
