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
- Modelo humano, quando houver, segue o §15: neutro, sem traços realistas, sem identificar pessoa real.
- Licenças com cláusula "não comercial", "sem derivados" ou de uso restrito a saúde/medicina exigem
  `LEGAL-REVIEW` antes de entrar (registrar em docs/legal/OPEN_ISSUES.md).

## Inventário atual

**Nenhum asset externo.** Fase 3 (ADR-0026):

| Item | Como é feito | Licença |
|---|---|---|
| Corpo 3D (`src/components/twin/scene/BodyScene.tsx`) | Geometria gerada em código (perfis de revolução, cápsulas e esferas do three.js) | Código do projeto |
| Cérebro 3D (`src/components/twin/scene/BrainScene.tsx`) | Esferas deformadas e divididas em regiões em código | Código do projeto |
| Versões 2D (`src/components/twin/fallback/`) | SVG desenhado em código | Código do projeto |
| Iluminação | Luz ambiente e direcional do three.js, sem mapa de ambiente | — |

Bibliotecas (código, não assets) seguem a política de dependências da ADR-0009: `three` (MIT) e
`@react-three/fiber` (MIT).
