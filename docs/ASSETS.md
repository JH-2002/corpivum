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
| `public/models/body-feminine.00e6a01a.glb` | MPFB2 2.0.17 (extensions.blender.org/add-ons/mpfb), malha base e targets do MakeHuman embutidos na extensão; gerado com Blender 5.2.2 LTS em 2026-10-13 | MakeHuman Community | CC0 1.0 (LICENSE.ASSETS.md do MPFB2) | Não exigida | Sim. Variante feminina: só a pele do corpo (sem olhos, dentes, língua nem geometria genital), mamilos achatados, rosto estilizado (remesh por voxels e suavização), pose natural pelo rig `default` do MPFB2 (braços a 12–15° da vertical; rig removido), forma fixa do modelo (macros e targets do MakeHuman) ajustada às circunferências de referência, morphs regionais localizados e de tamanho, calibração medida na malha final, meshopt | `00e6a01a2394d976c8f23052a301da307186f6624e453e0cf450cd318051679d` | PR #11, 2026-10-13 (ajuste de ombros e pose) |
| `public/models/body-masculine.a82ae25d.glb` | MPFB2 2.0.17 (extensions.blender.org/add-ons/mpfb), malha base e targets do MakeHuman embutidos na extensão; gerado com Blender 5.2.2 LTS em 2026-10-13 | MakeHuman Community | CC0 1.0 (LICENSE.ASSETS.md do MPFB2) | Não exigida | Sim. Variante masculina: só a pele do corpo (sem olhos, dentes, língua nem geometria genital), mamilos achatados, rosto estilizado (remesh por voxels e suavização), pose natural pelo rig `default` do MPFB2 (braços a 12–15° da vertical; rig removido), forma fixa do modelo (macros e targets do MakeHuman) ajustada às circunferências de referência, morphs regionais localizados e de tamanho, calibração medida na malha final, meshopt | `a82ae25d2b144b0c2269e3c12fd6a450a1e16f973d792476403b6994524b187c` | PR #11, 2026-10-13 (ajuste de ombros e pose) |

### Marca e fonte (ADR-0045, ADR-0046)

| Asset | Origem | Autor | Licença | Atribuição | Uso comercial / modificação | SHA-256 | Revisão |
|---|---|---|---|---|---|---|---|
| `docs/brand/logo-referencia.png` e exportações em `public/brand/` | Imagem fornecida pelo responsável pelo produto (2026-10-21), gerada com ChatGPT (gpt-image, OpenAI) segundo o manifesto C2PA embutido (`digitalSourceType: trainedAlgorithmicMedia`, assinado por OpenAI OpCo, LLC, 2026-10-21); exportada por `scripts/brand/exportar-logo.mjs` | Gerada por IA (OI-39) | Termos de uso da OpenAI sobre o resultado; proteção autoral e registro de marca a confirmar (OI-39 `LEGAL-REVIEW`) | A confirmar | Exportação: fundo preto convertido em transparência, camada de apoio escura no círculo do símbolo, recortes e reduções (ADR-0045) | `fae380e77739d4feb4188b169539a755958fe54bbe4585f7e2d1c43216229e8e` (original) | Fase 9a, 2026-10-21 |
| `docs/brand/corpivum-favicon.svg`, `src/app/icon.svg`, `src/app/apple-icon.png`, `public/brand/corpivum-icone-*.png` | Desenhado no projeto (2026-10-21) | Projeto | Código do projeto | Não exigida | Sim | `65ac24e78930e9992947946b97a88aebf654e1b54de98a7c7a6f27983ce0fa0b` (SVG) | Fase 9a, 2026-10-21 |
| `src/app/fonts/inter-latin-400-700.woff2` | npm `@fontsource-variable/inter` 5.3.0 (Inter v4, `inter-latin-wght-normal.woff2`, SHA-256 `3100e775…bd4c62`), obtido em 2026-10-21 | The Inter Project Authors (rsms/inter) | SIL OFL 1.1 (`src/app/fonts/LICENSE-Inter.txt`), sem nome reservado | Licença distribuída junto do arquivo; nenhuma atribuição na interface | Sim. Modificada com `fonttools` 4.67: eixo de peso limitado a 400–700 (`varLib.instancer`) e subconjunto latino com só as features usadas (`subset`), ADR-0046 | `43302704d1a037a8c40ff839dfa07b83ce6bca32f40ba118a1c0decb8ee691d2` | Fase 9a, 2026-10-21 |

Bibliotecas e ferramentas (código, não assets) seguem a política de dependências da ADR-0009: `three`
(MIT), `@react-three/fiber` (MIT) e, só no pipeline, `gltfpack` (MIT). O MPFB2 (código GPL) roda só no
Blender da pessoa responsável e não entra no repositório; os assets dele usados aqui (malha base e targets do
MakeHuman) são CC0 1.0.
