# Pipeline dos modelos do corpo (ADR-0028)

Gera `public/models/body-<variante>.<sha8>.glb` e `src/modules/twin/bodyAssets.ts` a partir da malha base
do MakeHuman que vem dentro do MPFB2 (assets CC0). Nada daqui roda no app nem no CI; o CI confere o
resultado (`tests/content/body-models.test.ts`) e mede a geometria real dos `.glb`
(`tests/content/body-measures.test.ts`).

## Pré-requisitos (fora do repositório)
- Blender 4.2 LTS ou mais novo (gerado com o 5.2.2 LTS e o MPFB2 2.0.17).
- Extensão MPFB2 instalada e ativa no Blender (Edit → Preferences → Get Extensions → "MPFB").
- Não é preciso o asset pack "MakeHuman system assets": malha base e targets já vêm na extensão, e o
  modelo não usa pele, olhos nem roupas.

## Uso
```sh
blender -b -P scripts/assets/build_body.py -- --out <pasta-temporária>
node scripts/assets/pack-models.mjs <pasta-temporária>
pnpm test tests/content
```
No Windows, `blender` é `"C:\Program Files\Blender Foundation\Blender <versão>\blender.exe"`. Use uma pasta
temporária fora do repositório.

Depois:
1. Cole as linhas impressas pelo `pack-models.mjs` em `docs/ASSETS.md`, com a versão do MPFB2, a data e o PR.
2. Confira os dois modelos no `/demo/twin` (frente e perfil, temas claro e escuro) e leve as capturas para a
   revisão antes do PR: superfície lisa, sem mamilos, sem detalhe genital, rosto de manequim (revisão manual,
   ADR-0028).

## Protocolo de medição
Toda circunferência é o perímetro do fecho convexo do corte da malha pelo plano: como uma fita métrica, que passa
por cima das concavidades e por baixo dos braços. A fita do braço enxerga só a primitiva do braço; a das outras
regiões, tudo menos ela. No peito e na cintura vale o corte inteiro (com o braço caído, a axila pode partir o
corte do tronco em frente e costas; nessas alturas não há mão nem antebraço na fita, e o pipeline confere isso);
no quadril, na coxa e no braço, o laço mais próximo do ponto de referência (`tape` e `loop` de cada plano no
manifesto). É o mesmo na calibração (Blender), no teste de geometria (CI) e na dica de como medir do formulário
de medidas.

| Região | Plano | Dica no formulário |
|---|---|---|
| Peito | horizontal, na altura dos mamilos | fita na horizontal, passando pelos mamilos |
| Cintura | horizontal de menor circunferência entre 30% e 55% da altura entreperna→pescoço | parte mais estreita entre as costelas e o quadril |
| Quadril | horizontal de maior circunferência entre 5% e 35% dessa altura | parte mais larga dos glúteos |
| Coxa | horizontal a 10% da distância entreperna→joelho | logo abaixo da virilha, na parte mais alta da coxa |
| Braço | perpendicular ao úmero, a 55% de ombro→cotovelo | meio do braço, entre o ombro e o cotovelo |

Os planos vão para o manifesto (`measure`, em coordenadas do `.glb`).

## Pose
Braços próximos ao corpo: úmero a 12,5° (masculino) e 14,5° (feminino) da vertical, medido entre as juntas de
ombro e cotovelo, cotovelo quase estendido, palmas voltadas para as coxas e mãos ao lado delas, sem encostar
(`pose` em `VARIANTS`). O rig `default` do MPFB2 (pesos do MakeHuman) só posa e sai antes da exportação; os
corpos de tamanho são posados pelo próprio rig no mesmo ângulo. Remesh, cortes e regiões ficam na pose A (braço e
tronco separados; com o braço caído, o voxel os fundiria); a pose entra como forma.

Folga: abaixo da dobra da axila (`ARMPIT_DROP_M`, 15 cm sob a junta do ombro), nada que se move só com o braço
pode atravessar o corpo (`CLEARANCE_MIN_CM`), na base e com os morphs que engrossam o corpo no limite de
extrapolação do app: o tamanho sozinho e cada morph regional sozinho e somado ao tamanho no limite. Nesses morphs
o braço abre junto o mínimo necessário (até `ABDUCTION_MAX_DEG` no limite); o build falha se não bastar. O CI
confere o mesmo na malha final (`tests/content/body-pose.test.ts`), mais um corpo grande resolvido pelo app.

## Forma e morphs
- **Forma fixa do modelo** (`VARIANTS`: macros e targets do MakeHuman): largura de ombro, profundidade do tórax,
  projeção do busto, glúteos e abdômen. Ninguém mede esses parâmetros; eles não existem na interface. O build
  confere que o ombro masculino fica mais largo que o quadril (`shoulders_over_hips`).
- **Referência** (`reference`, seção 4 de `docs/specs/twin-ajustes-corporais.md`): feminino 86/25/68/96/54 e
  masculino 96/31/80/98/57 cm (peito/braço/cintura/quadril/coxa). `fit_base` leva a base até ela com os próprios
  morphs regionais e confere na malha final (o remesh e a decimação encolhem um pouco), em até três passadas.
  Falha se a base não couber em máx(0,5 cm; 1%) ou se o ajuste for grande demais (revise a forma fixa). Não são
  padrão de saúde nem de beleza; a relação cintura/quadril é só diagnóstico interno.
- **Morphs regionais localizados**: no tronco, faixas radiais com queda suave em altura, sem braços (o peito não
  sobe até ombros e pescoço; o quadril desce coxa abaixo para não deixar vinco na entreperna); no braço e na coxa,
  expansão em volta do eixo do osso que some antes de ombro, cotovelo, virilha e joelho.
- **Morph de tamanho**: macro de massa do MakeHuman, para corpos bem maiores ou menores sem caricatura.
- **Calibração** (malha final): circunferência de cada região na base, com cada morph em 1, e o efeito de cada
  morph regional nas outras regiões (`cross`), que o app usa para resolver os pesos juntos.
- **Malha final:** cada vértice preso ao triângulo mais próximo da malha completa na pose A, acompanhando-o na
  base posada e em cada morph (o Surface Deform deixava vértices sem ligação com o braço girando ~30°).

## Tolerâncias (testadas no CI)
| Verificação | Tolerância |
|---|---|
| Base × referência | máx(0,5 cm; 1%) |
| Medida informada dentro da faixa do desenho, em 150, 170 e 190 cm | máx(1,0 cm; 2%) |
| Mudar uma medida em 10 cm | as outras mudam até 1,0 cm |
| Fora da faixa | forma no limite, na direção pedida, e o painel avisa |

## Ajustes
Constantes no topo de `build_body.py`: triângulos por variante (`TARGET_TRIANGLES`; orçamento de 150 KiB por
variante e 300 KiB nas duas, que o app baixa juntas), voxel do remesh, suavização, `TORSO_MORPHS`/`LIMB_MORPHS`,
`REGION_SCALE` e a macro de massa do morph de tamanho. Se mudar os morphs, confira de novo nos renders até onde
eles podem ser extrapolados sem deformar o corpo (`MORPH_LIMITS` em `src/modules/twin/morph.ts`).
