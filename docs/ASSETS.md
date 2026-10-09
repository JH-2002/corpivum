# Assets externos — HealthMind 360

Registro de licenças de modelos 3D, texturas, fontes, imagens e sons de terceiros (ADR-0026).

## Regra
**Nenhum asset externo entra no repositório nem é carregado em tempo de execução sem uma linha neste
arquivo, aprovada em PR.** Cada linha registra:

| Campo | O que registrar |
|---|---|
| Asset | Nome e caminho no repositório (`public/...`) |
| Origem | URL de onde foi obtido e data |
| Autor | Pessoa ou organização titular |
| Licença | Nome e versão (ex.: CC0 1.0, CC BY 4.0, MIT), com link para o texto |
| Atribuição | Texto exigido pela licença e onde aparece no app (ou "não exigida") |
| Uso comercial / modificação | Permitidos? Alterações feitas |
| SHA-256 | Hash do arquivo commitado |
| Revisão | PR e data |

Também vale:
- Asset servido pelo próprio app (`'self'`). A CSP (`src/lib/security/csp.ts`) não libera CDN de terceiros
  e nada é buscado fora do domínio (LEG-S10). Isso exclui HDRI/ambientes, fontes 3D e decodificadores
  (Draco/KTX2) remotos.
- Modelo humano segue a ADR-0028 (substitui a regra do §15 para o twin): forma anatômica em estilo
  holográfico, sem pele nem textura, superfície lisa, sem mamilos nem detalhe genital, rosto estilizado, sem
  identificar pessoa real.
- Modelos 3D ficam em `public/models/<nome>.<sha8>.glb`, gerados pelo pipeline versionado em `scripts/assets/`
  a partir de downloads feitos fora do repositório.
- Licenças com cláusula "não comercial", "sem derivados" ou de uso restrito a saúde/medicina exigem
  `LEGAL-REVIEW` antes de entrar (registrar em docs/legal/OPEN_ISSUES.md).

## Inventário atual

Assets externos: os dois modelos do corpo da Fase 3b (ADR-0028), gerados pelo pipeline
(`scripts/assets/`), na tabela "Modelos do corpo" abaixo.

| Item | Como é feito | Licença |
|---|---|---|
| Corpo 3D de reserva (`src/components/twin/scene/BodyScene.tsx`) | Geometria gerada em código (perfis de revolução, cápsulas e esferas do three.js), usada enquanto o `.glb` carrega, se ele falhar ou faltar | Código do projeto |
| Versões 2D (`src/components/twin/fallback/`) | SVG desenhado em código | Código do projeto |
| Material holográfico (`src/components/twin/scene/Hologram.tsx`) | Shader próprio, sem luz, textura nem mapa de ambiente | Código do projeto |

### Modelos do corpo (ADR-0028)

| Asset | Origem | Autor | Licença | Atribuição | Uso comercial / modificação | SHA-256 | Revisão |
|---|---|---|---|---|---|---|---|
| `public/models/body-feminine.f471adac.glb` | MPFB2 2.0.17 (extensions.blender.org/add-ons/mpfb), malha base e targets do MakeHuman embutidos na extensão; gerado com Blender 5.2.2 LTS em 2026-10-09 | MakeHuman Community | CC0 1.0 (LICENSE.ASSETS.md do MPFB2) | Não exigida | Sim. Variante feminina: só a pele do corpo (sem olhos, dentes, língua nem geometria genital), mamilos achatados, rosto estilizado (remesh por voxels e suavização), forma fixa do modelo (macros e targets do MakeHuman) ajustada às circunferências de referência, morphs regionais localizados e de tamanho, calibração medida na malha final, meshopt | `f471adac7434d864a01a0f48f2f9e096838c3c355e88bdacefbe5906b4b540fc` | PR da Fase 3b, 2026-10-09 |
| `public/models/body-masculine.534b3fb1.glb` | MPFB2 2.0.17 (extensions.blender.org/add-ons/mpfb), malha base e targets do MakeHuman embutidos na extensão; gerado com Blender 5.2.2 LTS em 2026-10-09 | MakeHuman Community | CC0 1.0 (LICENSE.ASSETS.md do MPFB2) | Não exigida | Sim. Variante masculina: só a pele do corpo (sem olhos, dentes, língua nem geometria genital), mamilos achatados, rosto estilizado (remesh por voxels e suavização), forma fixa do modelo (macros e targets do MakeHuman) ajustada às circunferências de referência, morphs regionais localizados e de tamanho, calibração medida na malha final, meshopt | `534b3fb1eb481e6261d2dd99ab64ddfe15fe00570ee17fc73dae2590334c63e8` | PR da Fase 3b, 2026-10-09 |

Bibliotecas e ferramentas (código, não assets) seguem a política de dependências da ADR-0009: `three`
(MIT), `@react-three/fiber` (MIT) e, só no pipeline, `gltfpack` (MIT). O MPFB2 (código GPL) roda só no
Blender da pessoa responsável e não entra no repositório; os assets dele usados aqui (malha base e targets do
MakeHuman) são CC0 1.0.
