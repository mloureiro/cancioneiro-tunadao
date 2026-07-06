import { Song, SongPart, Section, SongLine } from "../types";
import { escTypst, escLiteral, songLabelId } from "../typst-helpers";
import { Layout, LayoutInput } from "./layout";
import {
  APPENDIX_INSTRUMENTS,
  loadInstrument,
  sortChordNames,
  chartChordCall,
  miniPianoCall,
  ChordShape,
  PianoShape,
} from "../chord-diagrams";

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
// Secções SEM conteúdo (ex: [SOLO] no fim da cifra) não são sticky: uma pill
// sticky sem linhas a seguir era arrastada sozinha para a coluna seguinte,
// deixando colunas fantasma quase vazias.
function renderSectionTag(type: string, hasContent: boolean): string {
  const sticky = hasContent ? "" : ", sticky: false";
  const upper = type.toUpperCase();
  if (upper === "REFRÃO" || upper === "REFRAO") {
    return `#sec-pill("REFRÃO", coral${sticky})\n`;
  }
  if (upper === "INTRO") {
    return `#sec-pill("INTRO", blue${sticky})\n`;
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
    return `#sec-pill("${known[upper]}", ink${sticky})\n`;
  }
  if (type.trim()) {
    // Secção custom (sub-músicas, etc.): marca azul + label
    return `#section-label("${escLiteral(type.toUpperCase())}"${sticky})\n`;
  }
  return "";
}

function renderSection(section: Section): string {
  let out = "";
  if (section.type) {
    const hasContent = section.lines.some((l) => l.type !== "empty");
    out += renderSectionTag(section.type, hasContent);
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

// Nomes de acordes usados num conjunto de músicas
function collectChordNames(songs: Song[]): string[] {
  const names = new Set<string>();
  for (const song of songs)
    for (const part of song.parts)
      for (const section of part.sections)
        for (const line of section.lines)
          for (const c of line.chords ?? []) names.add(c.chord);
  return sortChordNames([...names]);
}

// Apêndice de acordes: tabela com acordes em colunas e instrumentos em
// linhas (guitarra com várias linhas — uma por variação; acordeão com
// mini-teclado + baixos Stradella). Acordes sem shape levam "—". Como não
// cabem todos os acordes à largura, a tabela é dividida em blocos.
function renderChordAppendix(songs: Song[], isA5: boolean): string {
  const chordNames = collectChordNames(songs);
  const titleSize = isA5 ? "22pt" : "30pt";
  const diagramSize = isA5 ? "11pt" : "15pt";
  const pianoWidth = isA5 ? "36pt" : "42pt";
  const chordsPerTable = isA5 ? 7 : 9;
  const colWidth = isA5 ? "44pt" : "49pt";
  const cellInsetY = isA5 ? "3pt" : "5pt";

  const instruments = APPENDIX_INSTRUMENTS.map((meta) => ({
    ...meta,
    data: loadInstrument(meta.file),
  }));

  // Índices das linhas onde começa cada instrumento (0 = header) — usados
  // para desenhar os separadores horizontais entre instrumentos
  const groupStartRows: number[] = [];
  {
    let row = 1;
    for (const inst of instruments) {
      groupStartRows.push(row);
      row += inst.variations;
    }
  }

  // Avisos de cobertura (uma vez por instrumento)
  for (const { data } of instruments) {
    const missing = chordNames.filter((n) => !data.chords[n]?.length);
    if (missing.length > 0) {
      console.warn(`  Aviso: ${data.instrument} sem diagrama para: ${missing.join(", ")}`);
    }
  }

  let out = `\n// ─── Apêndice: acordes ───\n`;
  out += `#pagebreak()\n`;
  out += `#set page(columns: 1)\n`;
  out += `#let chart-chord-d = chart-chord.with(size: ${diagramSize}, font: sans-font, hold-color: blue)\n`;
  out += `#let chord-dash = text(fill: grey, size: 1.2em)[—]\n`;
  // Mini-teclado: 8 teclas brancas (uma oitava a partir da fundamental);
  // pw = índices das brancas premidas, blacks = ((posição, premida), ...)
  out += `#let piano-pressed = blue\n`;
  out += `#let mini-piano(pw: (), blacks: (), width: ${pianoWidth}) = {
  let n = 8
  let kw = width / n
  let kh = kw * 3.2
  box(width: width, height: kh, {
    for i in range(n) {
      place(dx: i * kw, rect(
        width: kw, height: kh,
        stroke: 0.5pt + luma(120),
        fill: if i in pw { piano-pressed } else { white },
      ))
    }
    for (pos, pressed) in blacks {
      let bw = kw * 0.62
      place(dx: pos * kw - bw / 2, rect(
        width: bw, height: kh * 0.6,
        stroke: 0.5pt + luma(120),
        fill: if pressed { piano-pressed } else { black },
      ))
    }
  })
}\n`;
  // Baixos Stradella (mão esquerda do acordeão): 6 botões — contrabaixo (3ª),
  // baixo, Maior, menor, 7ª, diminuto. Premidos: baixo (índice 1) + o botão
  // da qualidade do acorde.
  out += `#let stradella(quality: none, width: ${pianoWidth}) = {
  let labels = ("3ª", "B", "M", "m", "7", "d")
  let pressed = (1,) + if quality != none { (quality,) } else { () }
  let n = 6
  let cw = width / n
  let r = cw * 0.34
  box(width: width, height: 2 * r + 6.5pt, {
    for i in range(n) {
      place(dx: i * cw + cw / 2 - r, circle(
        radius: r,
        stroke: 0.5pt + luma(120),
        fill: if i in pressed { piano-pressed } else { white },
      ))
      place(dx: i * cw, dy: 2 * r + 1.5pt, box(
        width: cw,
        align(center, text(size: 4pt, fill: grey, labels.at(i))),
      ))
    }
  })
}\n`;
  out += `#metadata("Acordes") <song-acordes>\n`;
  out += `#v(4pt)\n`;
  out += `#cond-text([ACORDES], size: ${titleSize}, tracking: 0.06em)\n`;
  out += `#v(5pt)\n`;
  out += `#box(width: 38pt, height: 3pt, fill: blue)\n`;
  out += `#v(1.1em)\n`;

  for (let start = 0; start < chordNames.length; start += chordsPerTable) {
    const chunk = chordNames.slice(start, start + chordsPerTable);

    const headerCells = chunk
      .map((name) => `[#chord-text("${escLiteral(name)}")]`)
      .join(", ");

    const rows: string[] = [];
    for (const { label, variations, kind, data } of instruments) {
      for (let v = 0; v < variations; v++) {
        const cells: string[] = [];
        if (v === 0) {
          let labelContent = `#cond-text([${escTypst(label)}], size: 0.9em)`;
          if (data.tuning) {
            labelContent += `#linebreak()#cond-text([${data.tuning.join(" ")}], size: 0.66em, fill: grey, weight: 500, tracking: 0.06em)`;
          }
          cells.push(`table.cell(rowspan: ${variations}, align: left + horizon, [${labelContent}])`);
        }
        for (const name of chunk) {
          const shape = data.chords[name]?.[v];
          if (!shape) {
            cells.push(`[#chord-dash]`);
          } else if (kind === "piano") {
            cells.push(`[#${miniPianoCall(shape as PianoShape, name)}]`);
          } else {
            cells.push(`[#${chartChordCall(shape as ChordShape)}]`);
          }
        }
        rows.push(`    ${cells.join(", ")},`);
      }
    }

    out += `#block(breakable: false, below: 1.2em)[\n`;
    out += `  #table(\n`;
    out += `    columns: (auto,) + (${colWidth},) * ${chunk.length},\n`;
    out += `    align: center + horizon,\n`;
    // Separadores verticais entre colunas + horizontais entre instrumentos
    // (sem contorno exterior)
    out += `    stroke: (x, y) => (\n`;
    out += `      left: if x > 0 { 0.4pt + hairline-color },\n`;
    out += `      top: if y in (${groupStartRows.join(", ")}) { 0.4pt + hairline-color },\n`;
    out += `    ),\n`;
    out += `    inset: (x: 2pt, y: ${cellInsetY}),\n`;
    out += `    table.header([], ${headerCells}),\n`;
    out += rows.join("\n") + "\n";
    out += `  )\n`;
    out += `]\n`;
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

// chordx vendored (typst/chordx) com patch hold-color para colorir dedilhado
#import "chordx/lib.typ": chart-chord

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
#let sec-pill(label, color, sticky: true) = block(sticky: sticky, above: 1.3em, below: 0.45em,
  box(
    stroke: 0.8pt + color,
    radius: 2pt,
    inset: (x: 5pt, y: 2.6pt),
    cond-text(label, size: 0.78em, fill: color, tracking: 0.07em),
  ),
)

// Label de secção custom (sub-músicas etc.): quadrado azul + texto
#let section-label(label, sticky: true) = block(sticky: sticky, above: 1.3em, below: 0.45em, {
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

// Título de parte de medley ([parte: X] / [tom: Y]): marca coral + nome + tom.
// Tom em texto cinzento (sem chip azul) e nome mais contido, para não se
// confundir com uma cabeça de música nova a meio da coluna.
#let part-title(nome, tom) = block(breakable: false, sticky: true, above: 0.5em, below: 0.5em, {
  if nome != "" {
    box(baseline: -0.1em, square(size: 0.55em, fill: coral))
    h(0.45em)
    cond-text(upper(nome), size: 1.1em)
  }
  if tom != "" {
    if nome != "" { h(6pt) }
    cond-text([TOM #tom], size: 0.72em, fill: grey, weight: 600, tracking: 0.04em)
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
  #v(0.5em)
  #context {
    let loc = locate(label("song-acordes"))
    let pg = counter(page).at(loc).first()
    [#text(style: "italic")[Acordes] #box(width: 1fr, repeat(gap: 2.5pt)[#text(fill: hairline-color)[.]]) #text(font: sans-font, stretch: 100%, weight: 700, fill: blue)[#pg] \\ ]
  }
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

  typ += renderChordAppendix(songs, isA5);

  return typ;
}

const layout: Layout = {
  name: "v2",
  description: "Combinado: capa do palco (fundo branco), fonts Atkinson/Barlow, paleta do moderno, separador editorial sem número, pills hollow",
  generate,
};

export default layout;
