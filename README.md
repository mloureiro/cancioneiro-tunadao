# Cancioneiro de Cifras

Plataforma para gerar cancioneiros de cifras (songbooks com acordes) para tunas académicas portuguesas. Cada subdirectório em `cifras/` é um cancioneiro independente que gera os seus próprios PDFs.

## Pré-requisitos

- [Node.js](https://nodejs.org/) 20+
- [Typst](https://typst.app/) (para compilar PDFs)

## Como usar

```bash
# Instalar dependências
npm install

# Correr testes
npm test

# Gerar PDFs (output/)
npm run build

# Regenerar o banco de acordes (chords/*.json) a partir das cifras
npm run seed:chords
```

O build itera cada subdirectório de `cifras/` e, para cada layout em `src/layouts/`, gera 2 PDFs por cancioneiro (A5 e A4):

```
output/
├── cancioneiro-tunadao-a5.pdf
├── cancioneiro-tunadao-a4.pdf
├── cancioneiro-portugues-a5.pdf
└── cancioneiro-portugues-a4.pdf
```

Com vários layouts em `src/layouts/`, os nomes incluem o layout
(`cancioneiro-tunadao-<layout>-a5.pdf`) e é possível filtrar com
`LAYOUT=<nome> npm run build` (lista separada por vírgulas).

## Como adicionar uma cifra

Criar um ficheiro `.txt` no directório do cancioneiro apropriado (ex: `cifras/tunadao/nome-da-musica.txt`).

O formato é simples — header YAML com metadata, seguido de acordes sobre letras:

```
---
titulo: Nome da Música
artista: Nome do Artista
tom: C
---

[INTRO]   C G Am F (2x)

     C               G
Primeira linha da letra
         Am          F
Segunda linha da letra

[REFRÃO]
    C       G
**Texto do refrão em bold**
```

Ver [docs/formato-cifras.md](docs/formato-cifras.md) para a documentação completa do formato.

## Como adicionar um cancioneiro

Criar um subdirectório em `cifras/` com o nome do cancioneiro:

```bash
mkdir cifras/meu-cancioneiro
```

Adicionar cifras `.txt` nesse directório. No próximo `npm run build`, serão gerados os PDFs correspondentes.

## Diagramas de acordes

Cada cancioneiro termina com um apêndice **Acordes**: uma tabela com os acordes usados nesse cancioneiro em colunas e os instrumentos em linhas (acordes sem shape possível levam "—"):

- **Guitarra** (E A D G B E) — 4 variações por acorde, com números de dedos
- **Cavaquinho** (G G B D, grave → agudo) — 2 variações
- **Bandolim** (G D A E) — 2 variações
- **Ukulele** (G C E A) — 2 variações
- **Acordeão** — mão direita: mini-teclado com as teclas do acorde (uma oitava a partir da fundamental); mão esquerda: baixos Stradella (botão do baixo + botão da qualidade: Maior, menor, 7ª ou diminuto)

Os shapes vivem em `chords/*.json`. Instrumentos de cordas usam a convenção [chords-db](https://github.com/tombatossals/chords-db) (`frets` da corda mais grave para a mais aguda, `-1` abafada, `0` solta, casas relativas a `baseFret`); o teclado (`piano.json`) guarda apenas as notas do acorde. Os diagramas de cordas são desenhados pelo package Typst [chordx](https://typst.app/universe/package/chordx), vendored em `typst/chordx/` com um patch (`hold-color`) para pintar dedilhado e barras na cor dos acordes; o mini-teclado e os baixos são funções Typst próprias emitidas pelo layout.

O `npm run seed:chords` (re)gera os JSONs a partir do conjunto de acordes presente nas cifras:

- guitarra e ukulele vêm da base de dados curada `@tombatossals/chords-db` (com dedilhado); quando a base não tem o acorde, é computado com `chord-fingering`
- bandolim e cavaquinho são computados com `chord-fingering` para as afinações respectivas
- acordeão usa as notas do acorde devolvidas por `chord-fingering` (grafias enarmónicas normalizadas)
- slash chords (ex: `D/F#`): na guitarra o baixo é honrado; nos instrumentos de 4 cordas e no teclado toca-se o acorde base
- sufixos abreviados `4`/`2` são lidos como `sus4`/`sus2`

Correcções manuais vivem em `chords/overrides.json` (`{ "<instrumento>": { "<acorde>": [shapes] } }`) — são aplicadas por cima do que o seed resolve e sobrevivem a re-seeds (ex: `F#m11`, que não é computável em instrumentos de 4 cordas). Se uma cifra usar um acorde sem shape, o build avisa e o acorde fica de fora do apêndice. O número de variações mostradas por instrumento define-se em `APPENDIX_INSTRUMENTS` (`src/chord-diagrams.ts`).

## Estrutura do projecto

```
├── cifras/
│   ├── tunadao/           ← Cancioneiro Tunadão 1998 (14 cifras)
│   └── portugues/         ← Cancioneiro Português (cifras populares)
├── chords/                ← Banco de acordes por instrumento (JSON, gerado pelo seed)
│   └── overrides.json     ← Shapes manuais (aplicados por cima do seed)
├── scripts/
│   └── seed-chords.ts     ← Gera chords/*.json (chords-db + chord-fingering)
├── src/
│   ├── types.ts           ← Tipos: Song, SongPart, Section, SongLine
│   ├── parser.ts          ← Parser de cifras (YAML + texto → AST)
│   ├── parser.test.ts     ← Testes vitest
│   ├── chord-diagrams.ts  ← Banco de acordes → chamadas Typst (chordx, mini-piano)
│   ├── render-typst.ts    ← Orquestrador do build (layouts × cancioneiros × tamanhos)
│   ├── typst-helpers.ts   ← Helpers de escaping/labels para Typst
│   ├── layouts/           ← Layouts (cada módulo = uma identidade visual)
│   └── index.ts           ← Re-exports
├── typst/
│   ├── chordx/            ← chordx vendored (patch hold-color)
│   └── fonts/             ← Atkinson Hyperlegible, Barlow, Barlow Condensed
├── docs/
│   └── formato-cifras.md  ← Documentação do formato de cifras
├── output/                ← (gitignored) PDFs gerados
├── package.json
└── tsconfig.json
```

## Design

- **Parser TypeScript** converte ficheiros `.txt` numa AST (Song → Parts → Sections → Lines)
- **Layouts** (`src/layouts/`) convertem a AST em código Typst; o build compila PDFs para cada layout
- Formatos A5 e A4, pensados para impressão frente/verso (margens espelhadas, headers pares/ímpares, fundo sempre branco)
- Cada música pode forçar coluna única com `colunas: 1` no header (default: duas colunas)
- Fonts: Barlow Condensed (títulos), Barlow (acordes), Atkinson Hyperlegible (letras)
- Paleta: tinta `#10141B`, azul eléctrico `#2B4BFF` (acordes), coral `#FF5148` (refrão)
