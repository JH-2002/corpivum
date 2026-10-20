# Avisos de terceiros / Third-party notices

O código deste repositório é de João Henrique Arruda do Carmo, com todos os direitos reservados (`LICENSE`). Os componentes abaixo são de terceiros e continuam sob as próprias licenças; nada aqui altera essas licenças.

_The code in this repository is © João Henrique Arruda do Carmo, all rights reserved (`LICENSE`). The components below belong to third parties and remain under their own licenses._

## Modelos 3D do corpo

| Arquivo | Origem | Autor | Licença |
|---|---|---|---|
| `public/models/body-feminine.00e6a01a.glb` | Gerado com o MPFB2 2.0.17 (malha base e targets do MakeHuman) no Blender, e depois modificado | MakeHuman Community | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `public/models/body-masculine.a82ae25d.glb` | Gerado com o MPFB2 2.0.17 (malha base e targets do MakeHuman) no Blender, e depois modificado | MakeHuman Community | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

A CC0 não exige atribuição; ela é registrada aqui por transparência. O processo de geração, as modificações e os hashes estão em [`docs/ASSETS.md`](docs/ASSETS.md). O corpo de reserva, as versões 2D e o material holográfico são código do próprio projeto.

## Atribuição exigida

- **caniuse-lite** (dados do [Can I use](https://caniuse.com), de Alexis Deveria), dependência do Next.js para a compatibilidade com navegadores: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Dependências de produção

122 pacotes, diretos e transitivos, gerados com `pnpm licenses list --prod` a partir do `pnpm-lock.yaml`. Os textos completos das licenças vêm com cada pacote, em `node_modules/<pacote>/LICENSE`. As dependências de desenvolvimento (testes, lint, build) não vão para o app publicado e ficam fora desta lista.

| Licença | Pacotes |
|---|---|
| MIT | 88 |
| ISC | 15 |
| Apache-2.0 | 11 |
| BSD-3-Clause | 4 |
| (MIT AND Zlib) | 1 |
| 0BSD | 1 |
| CC-BY-4.0 | 1 |
| MIT AND ISC | 1 |

### MIT

- @babel/runtime 7.29.7
- @eloqnt/config 0.1.1
- @eloqnt/format-json 0.1.0
- @eloqnt/format-po 0.1.1
- @formatjs/fast-memoize 3.1.7
- @formatjs/icu-messageformat-parser 3.5.18, 3.5.21
- @formatjs/icu-skeleton-parser 2.1.11, 2.1.12
- @formatjs/intl-localematcher 0.8.14
- @next/env 16.3.8
- @parcel/watcher 2.6.0
- @pdf-lib/standard-fonts 1.0.0
- @pdf-lib/upng 1.0.1
- @react-three/fiber 9.8.1
- @reduxjs/toolkit 2.13.0
- @schummar/icu-type-parser 1.21.5
- @standard-schema/spec 1.1.0
- @standard-schema/utils 0.3.0
- @types/d3-array 3.0.3
- @types/d3-color 3.1.0
- @types/d3-ease 3.0.2
- @types/d3-interpolate 3.0.1
- @types/d3-path 3.1.1
- @types/d3-scale 4.0.2
- @types/d3-shape 3.1.7
- @types/d3-time 3.0.0
- @types/d3-timer 3.0.2
- @types/node 24.19.1
- @types/pg 8.23.1
- @types/react 19.3.0
- @types/react-reconciler 0.28.9
- @types/use-sync-external-store 0.0.6
- @types/webxr 0.5.24
- base64-js 1.5.1
- buffer 6.0.3
- client-only 0.0.1
- clsx 2.1.1
- content-type 2.1.0
- csstype 3.2.3
- decimal.js-light 2.5.1
- es-toolkit 1.52.0
- eventemitter3 5.0.4
- icu-minify 4.14.9
- immer 11.1.21
- is-extglob 2.1.1
- is-glob 4.0.3
- its-fine 2.1.1
- nanoid 3.3.20
- negotiator 1.1.0
- next 16.3.8
- next-intl 4.14.9
- next-intl-swc-plugin-extractor 4.14.9
- node-addon-api 7.1.1
- pdf-lib 1.17.1
- pg 8.23.1
- pg-connection-string 2.14.1
- pg-pool 3.14.0
- pg-protocol 1.16.1
- pg-types 2.2.0
- pgpass 1.0.5
- picomatch 4.0.7
- po-parser 2.2.0
- postcss 8.5.23
- postgres-array 2.0.0, 3.0.4
- postgres-bytea 1.0.1
- postgres-date 1.0.7
- postgres-interval 1.2.0
- qrcode-generator 2.0.4
- react 19.3.0
- react-dom 19.3.0
- react-is 17.0.2
- react-redux 9.3.0
- react-use-measure 2.1.7
- recharts 3.10.1
- redux 5.0.1
- redux-thunk 3.1.0
- reselect 5.2.0
- scheduler 0.28.0
- server-only 0.0.1
- styled-jsx 5.1.6
- suspend-react 0.1.3
- three 0.186.1
- tiny-invariant 1.3.3
- undici-types 7.24.6
- use-intl 4.14.9
- use-sync-external-store 1.7.0
- xtend 4.0.2
- zod 4.6.5
- zustand 5.0.15

### ISC

- d3-array 3.2.4
- d3-color 3.1.0
- d3-format 3.1.0
- d3-interpolate 3.0.1
- d3-path 3.1.0
- d3-scale 4.0.2
- d3-shape 3.2.0
- d3-time 3.1.0
- d3-time-format 4.1.0
- d3-timer 3.0.1
- internmap 2.0.3
- lucide-react 1.52.0
- pg-int8 1.0.1
- picocolors 1.1.1
- split2 4.2.0

### Apache-2.0

- @prisma/adapter-pg 7.10.0
- @prisma/client 7.10.0
- @prisma/client-runtime-utils 7.10.0
- @prisma/debug 7.10.0
- @prisma/driver-adapter-utils 7.10.0
- @swc/core 1.16.13
- @swc/counter 0.1.3
- @swc/helpers 0.5.23
- @swc/types 0.1.28
- baseline-browser-mapping 2.11.27
- detect-libc 2.1.2

### BSD-3-Clause

- d3-ease 3.0.1
- ieee754 1.2.1
- intl-messageformat 11.2.15
- source-map-js 1.2.2

### (MIT AND Zlib)

- pako 1.0.11

### 0BSD

- tslib 1.14.1, 2.8.1

### CC-BY-4.0

- caniuse-lite 1.0.30001814

### MIT AND ISC

- victory-vendor 37.3.6
