import { Song, SongPart, Section, SongLine } from "../types";
import { escTypst, escLiteral, songLabelId } from "../typst-helpers";
import { Layout, LayoutInput } from "./layout";

// ─────────────────────────────────────────────────────────────────────────────
// Layout "v2" — combinação dos melhores elementos dos protótipos:
// - capa do palco (composição centrada), mas fundo SEMPRE branco
// - fonts do palco: Atkinson Hyperlegible (letras) + Barlow/Condensed (resto)
// - paleta do moderno: tinta, azul eléctrico, coral
// - separador de música do editorial (filete fino), sem número de música
// - headers/footers do moderno, corrigidos (logo dentro da moldura, texto
//   fora da zona não-imprimível, linhas simples e alinhamento consistente)
// - secções em pills com contorno (hollow), como no moderno
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  ink: "#10141B",        // tinta quase-preta (títulos, letras)
  blue: "#2B4BFF",       // azul eléctrico (acordes, acentos)
  coral: "#FF5148",      // coral quente (refrão, marcas)
  grey: "#6E7684",       // meta-informação
  hairline: "#D4D8DE",   // filetes
};

// "Barlow" inclui a largura Condensed (stretch 75%) — especificar sempre
// o stretch explicitamente para escolher a variante certa.
const FONTS = {
  lyrics: "Atkinson Hyperlegible",
  sans: "Barlow",
};

// Preservar alinhamento aproximado em linhas de acordes "cruas" (ex: as
// continuações de [INTRO] com espaços à esquerda) — o content mode do
// Typst colapsa whitespace.
function chordRunContent(s: string): string {
  // Escapar os parênteses do conteúdo ANTES de inserir "#h()": em markup, um
  // "#h(..)" seguido de "(" seria encadeado como chamada `h(..)(2x)` e "2x"
  // lido como número (ex: "E   (2x)"). Com "\(" o encadeamento não acontece.
  const escaped = escTypst(s).replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  return escaped.replace(/ {2,}/g, (m) => `#h(${(m.length * 0.5).toFixed(1)}em)`);
}

// Linha com acordes sobre letras.
// Mecânica: prefixos pré-computados em JS (Unicode-safe) + measure() no
// Typst; um cursor `x` impede que acordes vizinhos se sobreponham.
function renderChordLyricsLine(line: SongLine): string {
  const lyrics = line.lyrics || "";
  const chords = line.chords || [];

  if (chords.length === 0 && lyrics) {
    // Bloco próprio para que linhas consecutivas sem acordes não se fundam
    // num único parágrafo com wrapping.
    if (line.isBold) {
      return `#lyr(text(weight: "bold", [${escTypst(lyrics)}]))\n`;
    }
    return `#lyr[${escTypst(lyrics)}]\n`;
  }

  if (chords.length > 0 && !lyrics) {
    const chordsStr = chords.map(c => c.chord).join("  ");
    return `#chord-text("${escLiteral(chordsStr)}")\n#linebreak()\n`;
  }

  const weight = line.isBold ? `"bold"` : `"regular"`;

  const placeCalls = chords.map(c => {
    const pos = Math.min(c.position, lyrics.length);
    const prefix = lyrics.substring(0, pos);
    return `      x = calc.max(x, measure(text(font: lyrics-font, size: lyrics-size, weight: ${weight}, "${escLiteral(prefix)}")).width)
      place(dx: x, chord-text("${escLiteral(c.chord)}"))
      x = x + measure(chord-text("${escLiteral(c.chord)}")).width + chord-size * 0.3`;
  }).join("\n");

  const lyricsContent = line.isBold
    ? `text(weight: "bold", [${escTypst(lyrics)}])`
    : `[${escTypst(lyrics)}]`;

  return `#v(0.15em)
#context grid(columns: (100%,), row-gutter: 0pt,
    box(height: chord-size, {
      let x = 0pt
${placeCalls}
    }),
    ${lyricsContent},
  )
`;
}

function renderLine(line: SongLine): string {
  switch (line.type) {
    case "empty":
      return `#v(0.35em)\n`;
    case "instruction":
      return `#instruction-text([${escTypst(line.instruction || "")}])\n#linebreak()\n`;
    case "chords-only":
      if (line.lyrics) {
        return `#chord-text[${chordRunContent(line.lyrics)}]\n#linebreak()\n`;
      } else if (line.chords && line.chords.length > 0) {
        const chordsStr = line.chords.map(c => c.chord).join("  ");
        return `#chord-text("${escLiteral(chordsStr)}")\n#linebreak()\n`;
      }
      return "";
    case "lyrics":
      return renderChordLyricsLine(line);
  }
}

// Pill de secção: sempre com contorno (hollow); a cor distingue o tipo —
// REFRÃO coral, INTRO azul, restantes tinta.
function renderSectionTag(type: string): string {
  const upper = type.toUpperCase();
  if (upper === "REFRÃO" || upper === "REFRAO") {
    return `#sec-pill("REFRÃO", coral)\n`;
  }
  if (upper === "INTRO") {
    return `#sec-pill("INTRO", blue)\n`;
  }
  const known: Record<string, string> = {
    "PASSAGEM": "PASSAGEM",
    "SOLO": "SOLO",
    "INSTR.": "INSTR.",
    "SAÍDA": "SAÍDA",
    "SAIDA": "SAÍDA",
    "SOLISTA": "SOLISTA",
  };
  if (known[upper]) {
    return `#sec-pill("${known[upper]}", ink)\n`;
  }
  if (type.trim()) {
    // Secção custom (sub-músicas, etc.): marca azul + label
    return `#section-label("${escLiteral(type.toUpperCase())}")\n`;
  }
  return "";
}

function renderSection(section: Section): string {
  let out = "";
  if (section.type) {
    out += renderSectionTag(section.type);
  }
  // Refrões sem tag explícita são marcados só com **bold**: dar espaço
  // extra na fronteira verso ↔ refrão (e vice-versa), como uma secção.
  let prevBold: boolean | null = null;
  for (const line of section.lines) {
    if (line.type === "lyrics" && line.lyrics) {
      const isBold = !!line.isBold;
      if (prevBold !== null && isBold !== prevBold) {
        out += `#v(0.6em)\n`;
      }
      prevBold = isBold;
    }
    out += renderLine(line);
  }
  return out;
}

// Uma parte (medley: [parte: X] / [tom: Y])
function renderPart(part: SongPart, isFirst: boolean): string {
  let out = "";

  if (part.metadata) {
    if (!isFirst) {
      out += `#part-divider\n`;
    }
    const parte = part.metadata.parte ? escLiteral(part.metadata.parte) : "";
    const tom = part.metadata.tom ? escLiteral(part.metadata.tom) : "";
    if (parte || tom) {
      out += `#part-title("${parte}", "${tom}")\n`;
    }
  }

  for (const section of part.sections) {
    out += renderSection(section);
  }

  return out;
}

function renderSong(song: Song, labelId: string): string {
  let out = "";
  out += `#metadata("${escLiteral(song.metadata.titulo)}") <song-${labelId}>\n`;
  out += `#song-title("${escLiteral(song.metadata.titulo)}", "${escLiteral(song.metadata.tom)}")\n`;

  for (let i = 0; i < song.parts.length; i++) {
    out += renderPart(song.parts[i], i === 0);
  }

  return out;
}

function generate(input: LayoutInput): string {
  const { songs, pageSize, displayName, headerTitle, logoRelPath, version } = input;
  const isA5 = pageSize === "a5";

  // Secções: se não vierem, o livro é uma lista simples (uma secção sem nome).
  const bookSections = (input.sections && input.sections.length)
    ? input.sections
    : [{ name: "", songs }];
  const hasSections = bookSections.some(s => s.name.trim() !== "");

  // Label único por música (títulos repetem-se — ex: várias "Madalena" — e
  // labels Typst duplicados quebram a compilação). Ordem = ordem do livro.
  const labelOf = new Map<Song, string>();
  const usedLabels = new Set<string>();
  for (const song of songs) {
    const base = songLabelId(song.metadata.titulo) || "musica";
    let id = base;
    for (let k = 2; usedLabels.has(id); k++) id = `${base}-${k}`;
    usedLabels.add(id);
    labelOf.set(song, id);
  }

  const pageWidth = isA5 ? "148mm" : "210mm";
  const pageHeight = isA5 ? "210mm" : "297mm";
  const marginInner = isA5 ? "13mm" : "20mm";
  const marginOuter = isA5 ? "6mm" : "14mm";
  // Top/bottom com folga: o header/footer têm de ficar fora da zona
  // não-imprimível (~5mm) da maioria das impressoras.
  const marginTop = isA5 ? "13mm" : "18mm";
  const marginBottom = isA5 ? "11mm" : "15mm";
  const columnGutter = isA5 ? "7mm" : "11mm";

  const lyricsSize = isA5 ? "7.4pt" : "9.8pt";
  const chordSize = isA5 ? "8pt" : "10.5pt";
  const titleSize = isA5 ? "13pt" : "17pt";
  const headerSize = isA5 ? "6.5pt" : "8pt";
  const footerSize = isA5 ? "8pt" : "10pt";
  const headerLogoHeight = isA5 ? "11pt" : "13pt";

  const coverMargin = isA5 ? "14mm" : "24mm";
  const coverTitleSize = isA5 ? "34pt" : "48pt";
  const coverSubtitleSize = isA5 ? "15pt" : "21pt";
  const coverVersionSize = isA5 ? "7.5pt" : "9.5pt";
  const coverLogoWidth = isA5 ? "46%" : "42%";

  const indexTitleSize = isA5 ? "22pt" : "30pt";
  const indexEntrySize = isA5 ? "9pt" : "11pt";
  const indexSectionSize = isA5 ? "12pt" : "15pt";
  const sectionTitleSize = isA5 ? "28pt" : "40pt";

  // Subtítulo da capa: displayName sem o prefixo "Cancioneiro "
  const coverSubtitle = displayName.replace(/^Cancioneiro\s*/, "");

  // Índice: uma entrada por música (página resolvida via label). Agrupado por
  // secção quando o livro tem secções nomeadas.
  const indexEntry = (song: Song): string => {
    const labelId = labelOf.get(song)!;
    const title = escTypst(song.metadata.titulo);
    return `  #context {
    let loc = locate(label("song-${labelId}"))
    let pg = counter(page).at(loc).first()
    [${title} #box(width: 1fr, repeat(gap: 2.5pt)[#text(fill: hairline-color)[.]]) #text(font: sans-font, stretch: 100%, weight: 700, fill: blue)[#pg] \\ ]
  }`;
  };
  const sortByTitle = (a: Song, b: Song) => a.metadata.titulo.localeCompare(b.metadata.titulo, "pt");
  const indexBody = hasSections
    ? bookSections.map(sec =>
        `  #index-section-title[${escTypst(sec.name)}]\n` +
        sec.songs.slice().sort(sortByTitle).map(indexEntry).join("\n")
      ).join("\n")
    : songs.slice().sort(sortByTitle).map(indexEntry).join("\n");

  let typ = `// Cancioneiro: ${displayName} — gerado automaticamente
// Layout: v2 | Formato: ${pageSize.toUpperCase()} (${pageWidth} × ${pageHeight})

// ─── Cores ───
#let ink = rgb("${COLORS.ink}")
#let blue = rgb("${COLORS.blue}")
#let coral = rgb("${COLORS.coral}")
#let grey = rgb("${COLORS.grey}")
#let hairline-color = rgb("${COLORS.hairline}")

// ─── Fonts ───
#let lyrics-font = "${FONTS.lyrics}"
#let sans-font = "${FONTS.sans}"
#let chord-size = ${chordSize}
#let lyrics-size = ${lyricsSize}

// Acordes: Barlow bold, azul eléctrico, ligeiramente maiores que a letra
#let chord-text(body) = text(
  font: sans-font, stretch: 100%, weight: 700,
  fill: blue, size: chord-size, body,
)

// Texto condensed para títulos, pills e navegação
#let cond-text(body, size: 1em, fill: ink, weight: 700, tracking: 0em) = text(
  font: sans-font, stretch: 75%, weight: weight,
  fill: fill, size: size, tracking: tracking, body,
)

// ─── Página ───
#set page(
  width: ${pageWidth},
  height: ${pageHeight},
  margin: (
    inside: ${marginInner},
    outside: ${marginOuter},
    top: ${marginTop},
    bottom: ${marginBottom},
  ),
  // Ascent/descent baixos: header/footer encostados ao conteúdo, longe da
  // zona não-imprimível (~5mm) na borda física da página.
  header-ascent: 10%,
  footer-descent: 12%,
)

#set text(
  font: lyrics-font,
  size: lyrics-size,
  fill: ink,
  lang: "pt",
)

#set par(leading: 0.45em, spacing: 0.4em)

// ─── Funções auxiliares ───

// Linha de letra sem acordes (bloco próprio para não fundir com a seguinte)
#let lyr(body) = block(body)

// Instrução (ex: [Repete 2x])
#let instruction-text(body) = text(fill: grey, style: "italic", size: 0.85em, body)

// Pill de secção com contorno (hollow) — cor distingue o tipo.
// sticky: nunca fica órfã no fundo de uma coluna.
// "above" generoso: espaço claro entre secções.
#let sec-pill(label, color) = block(sticky: true, above: 1.3em, below: 0.45em,
  box(
    stroke: 0.8pt + color,
    radius: 2pt,
    inset: (x: 5pt, y: 2.6pt),
    cond-text(label, size: 0.78em, fill: color, tracking: 0.07em),
  ),
)

// Label de secção custom (sub-músicas etc.): quadrado azul + texto
#let section-label(label) = block(sticky: true, above: 1.3em, below: 0.45em, {
  box(baseline: -0.08em, square(size: 0.5em, fill: blue))
  h(0.45em)
  cond-text(label, size: 0.85em, tracking: 0.04em)
})

// Chip do tom: contorno azul (junto ao título e às partes de medley)
#let tom-chip(tom) = box(
  stroke: 0.8pt + blue,
  radius: 2pt,
  inset: (x: 4pt, y: 2.6pt),
  cond-text([TOM #tom], size: 0.78em, fill: blue, tracking: 0.04em),
)

// Separador entre partes de um medley
#let part-divider = {
  v(0.8em)
  line(length: 100%, stroke: 0.4pt + hairline-color)
  v(0.15em)
}

// Título de parte de medley ([parte: X] / [tom: Y]): marca coral + nome + tom
#let part-title(nome, tom) = block(breakable: false, sticky: true, above: 0.5em, below: 0.5em, {
  if nome != "" {
    box(baseline: -0.1em, square(size: 0.55em, fill: coral))
    h(0.45em)
    cond-text(upper(nome), size: 1.25em)
  }
  if tom != "" {
    if nome != "" { h(6pt) }
    tom-chip(tom)
  }
})

// Cabeça de música (estilo editorial, sem número): título condensed,
// filete fino a preencher até ao chip do tom — "TÍTULO ———— [TOM X]".
#let song-title(titulo, tom) = block(breakable: false, sticky: true, below: 0.9em, {
  grid(
    columns: (auto, 1fr, auto),
    column-gutter: 6pt,
    align: (horizon + left, horizon, horizon + right),
    cond-text(upper(titulo), size: ${titleSize}),
    line(length: 100%, stroke: 0.5pt + hairline-color),
    tom-chip(tom),
  )
})

// Título de secção no índice (livros com secções)
#let index-section-title(body) = block(above: 0.9em, below: 0.5em, sticky: true,
  cond-text(upper(body), size: ${indexSectionSize}, fill: coral, tracking: 0.08em),
)

// Página divisória de secção: barra coral, nome centrado, sem header/footer
#let section-divider(name) = page(header: none, footer: none, columns: 1)[
  #set align(center + horizon)
  #box(width: 26%, height: 3pt, fill: coral)
  #v(16pt)
  #cond-text(upper(name), size: ${sectionTitleSize}, tracking: 0.12em)
  #v(16pt)
  #box(width: 26%, height: 3pt, fill: coral)
]

// ─── Capa (composição do palco, fundo branco) ───
#page(margin: ${coverMargin}, header: none, footer: none)[
  #set align(center)
  #v(0.9fr)
  #image("${escLiteral(logoRelPath)}", width: ${coverLogoWidth})
  #v(1.1fr)
  #cond-text([CANCIONEIRO], size: ${coverTitleSize}, tracking: 0.08em)
  #v(10pt)
  #box(width: 26%, height: 2.5pt, fill: blue)
  #v(10pt)
  #cond-text(upper[${escTypst(coverSubtitle)}], size: ${coverSubtitleSize}, fill: coral, weight: 600, tracking: 0.28em)
  #v(1fr)
  #box(
    stroke: 0.7pt + hairline-color,
    radius: 2pt,
    inset: (x: 6pt, y: 3.5pt),
    cond-text([VERSÃO ${escTypst(version)}], size: ${coverVersionSize}, fill: grey, weight: 600, tracking: 0.12em),
  )
  #v(0.12fr)
]

// ─── Página em branco (verso da capa) ───
#page(header: none, footer: none)[]

// ─── Índice (sem números de música — a paginação chega) ───
#page(header: none, footer: none)[
  #v(4pt)
  #cond-text([ÍNDICE], size: ${indexTitleSize}, tracking: 0.06em)
  #v(5pt)
  #box(width: 38pt, height: 3pt, fill: blue)
  #v(1.1em)
  #set text(size: ${indexEntrySize})
  #set par(leading: 0.5em, spacing: 0.62em)
  #columns(2, gutter: ${columnGutter})[
${indexBody}
  ]
]

#counter(page).update(1)
#pagebreak(to: "even")

// ─── Páginas de músicas (headers/footers espelhados) ───
// Paridade: a contagem lógica recomeça em 1 numa página física par, por
// isso pg ímpar = verso (esquerda) e pg par = recto (direita).
#set columns(gutter: ${columnGutter})
#set page(
  header: context {
    let pg = counter(page).get().first()
    // Conteúdo + filete com alinhamentos consistentes com o footer:
    // header = conteúdo, espaço, linha; footer = linha, espaço, número.
    box(width: 100%, height: ${headerLogoHeight}, {
      if calc.odd(pg) {
        // verso (esquerda): logo na margem exterior, dentro da moldura
        place(left + horizon, image("${escLiteral(logoRelPath)}", height: ${headerLogoHeight}))
      } else {
        // recto (direita): título na margem exterior
        place(right + horizon, {
          box(baseline: -0.1em, square(size: 3.2pt, fill: coral))
          h(4pt)
          cond-text(upper[${escTypst(headerTitle)}], size: ${headerSize}, fill: ink, tracking: 0.14em)
        })
      }
    })
    v(3pt)
    line(length: 100%, stroke: 0.5pt + ink)
  },
  footer: context {
    let pg = counter(page).get().first()
    line(length: 100%, stroke: 0.5pt + ink)
    v(3pt)
    set text(font: sans-font, size: ${footerSize}, weight: 700, fill: ink)
    if calc.odd(pg) {
      align(left, counter(page).display())
    } else {
      align(right, counter(page).display())
    }
  },
)

// ─── Conteúdo ───

`;

  // Músicas por secção. Cada secção nomeada abre com uma página divisória.
  // Respeitar colunas por música: mudar de modo quebra página; senão colbreak.
  let currentCols: number | null = null;
  for (const sec of bookSections) {
    if (hasSections && sec.name.trim() !== "") {
      typ += `#section-divider("${escLiteral(sec.name)}")\n\n`;
      currentCols = null; // a 1.ª música da secção re-emite o modo de colunas
    }
    for (const song of sec.songs) {
      const cols = song.metadata.colunas === 1 ? 1 : 2;
      if (cols !== currentCols) {
        typ += `#set page(columns: ${cols})\n\n`;
        currentCols = cols;
      } else {
        typ += `#colbreak()\n\n`;
      }
      typ += renderSong(song, labelOf.get(song)!);
      typ += `\n`;
    }
  }

  return typ;
}

const layout: Layout = {
  name: "v2",
  description: "Combinado: capa do palco (fundo branco), fonts Atkinson/Barlow, paleta do moderno, separador editorial sem número, pills hollow",
  generate,
};

export default layout;
