# Pipeline dos modelos do corpo (ADR-0028)

Gera `public/models/body-<variante>.<sha8>.glb` e `src/modules/twin/bodyAssets.ts` a partir da malha base
do MakeHuman que vem dentro do MPFB2 (assets CC0). Nada daqui roda no app nem no CI; o CI só confere o
resultado (`tests/content/body-models.test.ts`).

## Pré-requisitos (fora do repositório)
- Blender 4.2 LTS ou mais novo.
- Extensão MPFB2 instalada e ativa no Blender (Edit → Preferences → Get Extensions → "MPFB").
- Não é preciso o asset pack "MakeHuman system assets": malha base e targets já vêm na extensão, e o
  modelo não usa pele, olhos nem roupas.

## Uso
```sh
blender -b -P scripts/assets/build_body.py -- --out <pasta-temporária>
node scripts/assets/pack-models.mjs <pasta-temporária>
pnpm test tests/content/body-models.test.ts
```
No Windows, `blender` é `"C:\Program Files\Blender Foundation\Blender <versão>\blender.exe"`. Use uma pasta
temporária fora do repositório.

Depois:
1. Cole as linhas impressas pelo `pack-models.mjs` em `docs/ASSETS.md`, com a versão do MPFB2, a data e o PR.
2. Confira as três variantes no `/demo/twin` (frente, perfil, costas) e anexe as capturas ao PR: superfície
   lisa, sem mamilos, sem detalhe genital, rosto estilizado (revisão manual, ADR-0028).

## Ajustes
Constantes no topo de `build_body.py`: triângulos por variante (`TARGET_TRIANGLES`, orçamento de 300 KiB),
iterações de suavização do rosto e dos detalhes, e os targets de circunferência por região.
