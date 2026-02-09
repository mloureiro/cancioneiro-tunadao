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
```

O build itera cada subdirectório de `cifras/` e gera 2 PDFs por cancioneiro (A5 e A4):

```
output/
├── cancioneiro-tunadao-a5.pdf
├── cancioneiro-tunadao-a4.pdf
├── cancioneiro-portugues-a5.pdf
└── cancioneiro-portugues-a4.pdf
```

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

## Estrutura do projecto

```
├── cifras/
│   ├── tunadao/           ← Cancioneiro Tunadão 1998 (14 cifras)
│   └── portugues/         ← Cancioneiro Português (cifras populares)
├── src/
│   ├── types.ts           ← Tipos: Song, SongPart, Section, SongLine
│   ├── parser.ts          ← Parser de cifras (YAML + texto → AST)
│   ├── parser.test.ts     ← Testes vitest
│   ├── render-typst.ts    ← Gerador Typst, compila PDFs
│   └── index.ts           ← Re-exports
├── typst/
│   └── fonts/             ← Comic Neue, Faculty Glyphic, Madimi One
├── docs/
│   └── formato-cifras.md  ← Documentação do formato de cifras
├── output/                ← (gitignored) PDFs gerados
├── package.json
└── tsconfig.json
```

## Design

- **Parser TypeScript** converte ficheiros `.txt` numa AST (Song → Parts → Sections → Lines)
- **Renderer Typst** converte a AST em código Typst e compila PDFs
- Layout em **duas colunas**, formato A5 (para encadernação wire-o) e A4
- Fonts: Faculty Glyphic (títulos), Madimi One (acordes), Comic Neue (letras)
