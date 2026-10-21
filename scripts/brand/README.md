# Marca (ADR-0045)

O logo oficial é a imagem original `docs/brand/logo-referencia.png`. Abaixo de 48 px usa-se o favicon aprovado
(`docs/brand/corpivum-favicon.svg`, só o "C" e um ponto).

## Exportar

```sh
node scripts/brand/exportar-logo.mjs
```

Gera `public/brand/` (símbolo e logo completo em WebP e PNG com transparência, 512/256/128/64 px, e os ícones do
favicon em 16/32/48/180/192/512 px) e a folha de revisão em `capturas/logo/` (fora do Git), sobre o fundo do app.

## Arquivo

`arquivo/` guarda os scripts das tentativas de redesenho descartadas (figura a partir da média dos modelos do twin,
variantes "fiel" e "neutra"). Ficam só como registro; rodam a partir da raiz e escrevem em `capturas/logo/arquivo`.

| Script | O que faz |
|---|---|
| `perfil-modelos.mjs` | Rasteriza a vista frontal dos dois `.glb` do twin e salva o perfil médio (tronco e braço por altura). |
| `gerar-simbolo-simples.mjs` | Símbolo com a silhueta derivada do perfil médio. |
| `gerar-variantes.mjs` | Variante "fiel à referência", desenhada sobre medidas da referência. |
| `grade-referencia.mjs` | Sobrepõe uma grade normalizada à referência para medir proporções. |
| `comparar-com-referencia.mjs` | Folha comparando a referência e a variante. |
