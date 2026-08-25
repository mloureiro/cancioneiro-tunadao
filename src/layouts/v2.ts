import { Song, SongPart, Section, SongLine } from "../types";
import { escTypst, escLiteral, songLabelId } from "../typst-helpers";
import { Layout, LayoutInput } from "./layout";
import {
  APPENDIX_INSTRUMENTS,
  loadInstrument,
  sortChordNames,
  isAppendixChord,
  mergeEnharmonicColumns,
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
  const { text: lyrics, times: repTimes } = extractRepeat(line.lyrics || "", false);
  const chords = line.chords || [];

  const bubbleExpr = repTimes > 1 ? ` + h(4pt) + rep-bubble("x${repTimes}")` : "";

  if (chords.length === 0 && lyrics) {
    // Bloco próprio para que linhas consecutivas sem acordes não se fundam
    // num único parágrafo com wrapping.
    if (line.isBold) {
      return `#lyr(text(weight: "bold", [${escTypst(lyrics)}])${bubbleExpr})\n`;
    }
    return `#lyr[${escTypst(lyrics)}${bubble(repTimes)}]\n`;
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

  const lyricsContent = (line.isBold
    ? `text(weight: "bold", [${escTypst(lyrics)}])`
    : `[${escTypst(lyrics)}]`) + bubbleExpr;

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

function renderLine(line: SongLine, forceBold: boolean): string {
  switch (line.type) {
    case "empty":
      return `#v(0.6em)\n`;
    case "instruction":
      return `#instruction-text([${escTypst(line.instruction || "")}])\n#linebreak()\n`;
    case "chords-only":
      if (line.lyrics) {
        const { text, times } = extractRepeat(line.lyrics, true);
        return `#chord-text[${chordRunContent(text)}]${bubble(times)}\n#linebreak()\n`;
      } else if (line.chords && line.chords.length > 0) {
        const chordsStr = line.chords.map(c => c.chord).join("  ");
        return `#chord-text("${escLiteral(chordsStr)}")\n#linebreak()\n`;
      }
      return "";
    case "lyrics":
      return renderChordLyricsLine(forceBold && line.lyrics ? { ...line, isBold: true } : line);
  }
}

// Classificação de secções por família. O qualificador (o que sobra do nome
// depois da palavra-chave, ex: "x2", "só vozes", "- Pantera Cor-de-Rosa")
// é mostrado em texto pequeno a seguir à pill.
const REFRAO_FAMILY = /^(\d+º\s*)?refr[ãa]o\s*[,–—-]?\s*(.*)$/i;
const INST_FAMILY = /^(?:inst(?:r|rumental)?\.?|passagem|solo)\s*[,–—-]?\s*(.*)$/i;

type TagFamily =
  | { kind: "pill"; label: string; color: string; qualifier: string }
  | { kind: "label"; label: string }
  | null;

function classifyTag(type: string): TagFamily {
  const t = type.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  let m;
  if (!upper.startsWith("PRÉ") && (m = t.match(REFRAO_FAMILY))) {
    const qualifier = [m[1]?.trim(), m[2]?.trim()].filter(Boolean).join(" ");
    return { kind: "pill", label: "REFRÃO", color: "coral", qualifier };
  }
  if ((m = t.match(/^intro\s*[,–—-]?\s*(.*)$/i))) {
    return { kind: "pill", label: "INTRO", color: "blue", qualifier: m[1]?.trim() ?? "" };
  }
  if ((m = t.match(INST_FAMILY))) {
    return { kind: "pill", label: "INST", color: "blue", qualifier: m[1]?.trim() ?? "" };
  }
  if (upper === "SAÍDA" || upper === "SAIDA") {
    return { kind: "pill", label: "SAÍDA", color: "ink", qualifier: "" };
  }
  if (upper === "SOLISTA") {
    return { kind: "pill", label: "SOLISTA", color: "ink", qualifier: "" };
  }
  return { kind: "label", label: t.toUpperCase() };
}

// Secções SEM conteúdo (ex: [Inst] no fim da cifra) não são sticky: uma pill
// sticky sem linhas a seguir era arrastada sozinha para a coluna seguinte,
// deixando colunas fantasma quase vazias.
function renderSectionTag(type: string, hasContent: boolean, times: number): string {
  const fam = classifyTag(type);
  if (!fam) return "";
  const sticky = hasContent ? "" : ", sticky: false";
  const timesArg = times > 1 ? `, times: ${times}` : "";
  // qualificador do nome pode já ser um marcador de repetição ("x2") — nesse
  // caso vai para a bolha em vez de nota em texto
  let qual = fam.kind === "pill" ? fam.qualifier : "";
  let bubbleTimes = times;
  const qm = qual.match(/^\(?\s*(?:x\s*(\d+)|(\d+)\s*x|bis)\s*\)?$/i);
  if (qm) {
    const n = qm[1] ? +qm[1] : qm[2] ? +qm[2] : 2;
    bubbleTimes = Math.max(bubbleTimes, n);
    qual = "";
  }
  const bubbleArg = bubbleTimes > 1 ? `, times: ${bubbleTimes}` : "";
  const note = qual ? `, note: "${escLiteral(`(${qual})`)}"` : "";
  if (fam.kind === "pill") {
    return `#sec-pill("${escLiteral(fam.label)}", ${fam.color}${sticky}${bubbleArg}${note})\n`;
  }
  return `#section-label("${escLiteral(fam.label)}"${sticky}${bubbleArg}${note})\n`;
}

function renderSection(
  section: Section,
  lines: SongLine[],
  times: number,
  pillOnly: boolean,
  seenChorus: Set<string>
): string {
  let out = "";
  const hasContent = !pillOnly && lines.some((l) => l.type !== "empty");
  if (section.type) {
    out += renderSectionTag(section.type, hasContent, times);
  }
  if (pillOnly) return out;
  const fam = classifyTag(section.type);
  const isChorusLike = section.isChorus || (fam?.kind === "pill" && fam.label === "REFRÃO");

  if (isChorusLike) {
    // secção-refrão: conteúdo todo a bold (a pill já saiu na tag)
    for (const line of lines) out += renderLine(line, true);
    return out;
  }

  // Dividir em "runs" pela boldness das linhas de letra: um run a bold é um
  // refrão embutido — ganha pill, colapsa repetições internas (bloco × k →
  // bloco + (xk)) e, se repetir um refrão já mostrado na música, sai só a
  // pill (repetições consecutivas fundem-se numa pill com (xN)).
  interface Run { bold: boolean | null; lines: SongLine[] }
  const runs: Run[] = [];
  let cur: Run = { bold: null, lines: [] };
  for (const line of lines) {
    if (line.type === "lyrics" && line.lyrics) {
      const b = !!line.isBold;
      if (cur.bold === null) cur.bold = b;
      else if (b !== cur.bold) {
        runs.push(cur);
        cur = { bold: b, lines: [] };
      }
    }
    cur.lines.push(line);
  }
  runs.push(cur);

  let pendingPill: { times: number } | null = null;
  const flushPill = () => {
    if (!pendingPill) return;
    const t = pendingPill.times > 1 ? `, times: ${pendingPill.times}` : "";
    out += `#sec-pill("REFRÃO", coral, sticky: false${t})\n`;
    pendingPill = null;
  };

  let emitted = false;
  for (const run of runs) {
    // Só é bloco-refrão com ≥2 linhas de letra a bold — linhas bold isoladas
    // (ex: cânticos alternados) ficam como estão, sem pill.
    const boldLyricCount = run.bold
      ? run.lines.filter((l) => l.type === "lyrics" && l.lyrics).length
      : 0;
    if (!run.bold || boldLyricCount < 2) {
      flushPill();
      if (emitted && run.lines.some((l) => l.type === "lyrics")) out += `#v(0.6em)\n`;
      for (const line of run.lines) out += renderLine(line, false);
      if (run.lines.some((l) => l.type !== "empty")) emitted = true;
      continue;
    }
    const { lines: blockLines, times: blockTimes } = collapseRepeats(run.lines);
    const sig = "REFRÃO||" + contentKeys(blockLines).join("¶");
    if (seenChorus.has(sig)) {
      // refrão repetido → só a pill; acumular repetições consecutivas
      if (pendingPill) pendingPill.times += Math.max(blockTimes, 1);
      else pendingPill = { times: Math.max(blockTimes, 1) };
      continue;
    }
    seenChorus.add(sig);
    flushPill();
    const t = blockTimes > 1 ? `, times: ${blockTimes}` : "";
    out += `#sec-pill("REFRÃO", coral${t})\n`;
    for (const line of blockLines) out += renderLine(line, false);
    emitted = true;
  }
  flushPill();
  return out;
}

// Assinatura do conteúdo de uma secção (para detectar repetições)
function contentKeys(lines: SongLine[]): string[] {
  return lines
    .filter((l) => l.type !== "empty")
    .map((l) => {
      const chords = (l.chords ?? []).map((c) => c.chord).join(" ");
      const text = (l.lyrics ?? l.instruction ?? "").trim().toLowerCase();
      return `${l.type}|${chords}|${text}`;
    });
}

// Conteúdo = bloco repetido k vezes? → colapsar para o bloco + k
function collapseRepeats(lines: SongLine[]): { lines: SongLine[]; times: number } {
  const keys = contentKeys(lines);
  const n = keys.length;
  for (let k = Math.min(8, n); k >= 2; k--) {
    if (n % k !== 0) continue;
    const m = n / k;
    let ok = true;
    for (let i = m; i < n && ok; i++) if (keys[i] !== keys[i % m]) ok = false;
    if (!ok) continue;
    // cortar no fim da m-ésima linha de conteúdo (mantém empties pelo meio)
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].type !== "empty") count++;
      if (count === m) return { lines: lines.slice(0, i + 1), times: k };
    }
  }
  return { lines, times: 1 };
}

// Uma parte (medley: [parte: X] / [tom: Y]).
// `seen` acumula assinaturas de secções já mostradas na música: uma secção
// com tag cujo conteúdo repete uma anterior sai só com a pill; repetições
// consecutivas fundem-se numa pill com nota (xN). O mesmo para conteúdo
// duplicado DENTRO de uma secção (bloco × k → bloco + (xk)).
function renderPart(part: SongPart, isFirst: boolean, seen: Set<string>): string {
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

  interface Unit { section: Section; lines: SongLine[]; times: number; pillOnly: boolean; sig: string }
  const units: Unit[] = [];
  for (const section of part.sections) {
    const tagged = !!section.type.trim();
    const { lines, times } = tagged ? collapseRepeats(section.lines) : { lines: section.lines, times: 1 };
    const keys = contentKeys(lines);
    // Assinatura por família (um [REFRÃO] e um bloco bold com o mesmo
    // conteúdo contam como o mesmo refrão)
    const fam = classifyTag(section.type);
    const sigType = fam?.kind === "pill" ? fam.label : section.type.toUpperCase();
    const sig = sigType + "||" + keys.join("¶");
    const pillOnly = tagged && keys.length > 0 && seen.has(sig);
    if (tagged && keys.length > 0 && !pillOnly) seen.add(sig);
    const prev = units[units.length - 1];
    if (pillOnly && prev?.pillOnly && prev.sig === sig) {
      prev.times += Math.max(times, 1);
      continue;
    }
    units.push({ section, lines, times, pillOnly, sig });
  }

  for (const u of units) {
    out += renderSection(u.section, u.lines, u.times, u.pillOnly, seen);
  }

  return out;
}

// Marcador de repetição no fim de uma linha: "(2x)", "(x2)", "(Bis)", "2x".
// bare=true aceita sem parêntesis (linhas de acordes); nas letras exige-os.
const REP_PAREN_RE = /\s*[\(\[]\s*(?:x\s*(\d+)|(\d+)\s*[xX]|bis)\s*[\)\]]\s*$/i;
const REP_BARE_RE = /\s+(?:x\s*(\d+)|(\d+)\s*[xX])\s*$/i;
function extractRepeat(text: string, bare: boolean): { text: string; times: number } {
  let m = text.match(REP_PAREN_RE);
  if (!m && bare) m = text.match(REP_BARE_RE);
  if (!m) return { text, times: 0 };
  const times = m[1] ? +m[1] : m[2] ? +m[2] : 2;
  return { text: text.slice(0, m.index).replace(/\s+$/, ""), times };
}
const bubble = (times: number) => (times > 1 ? ` #rep-bubble("x${times}")` : "");

// Separar o qualificador entre parêntesis no fim do título
function splitTitle(titulo: string): { main: string; sub: string } {
  const m = titulo.match(/^(.*\S)\s*(\([^()]+\))$/);
  return m ? { main: m[1], sub: m[2] } : { main: titulo, sub: "" };
}

// Crédito "SIGLA · Nome completo" (tunas/estudantinas) → { sigla, full }.
// Sem separador " · ", é um artista simples: sigla = tudo, full = "".
function splitArtista(artista: string): { sigla: string; full: string } {
  const i = artista.indexOf(" · ");
  return i === -1
    ? { sigla: artista, full: "" }
    : { sigla: artista.slice(0, i), full: artista.slice(i + 3) };
}

function renderSong(song: Song, labelId: string, autor: string, autorFull = ""): string {
  let out = "";
  // Qualificador entre parêntesis no fim do título → texto mais pequeno
  const { main, sub } = splitTitle(song.metadata.titulo);
  out += `#metadata("${escLiteral(song.metadata.titulo)}") <song-${labelId}>\n`;
  out += `#song-title("${escLiteral(main)}", "${escLiteral(song.metadata.tom)}", autor: "${escLiteral(autor)}", autor-full: "${escLiteral(autorFull)}", sub: "${escLiteral(sub)}", afinacao: "${escLiteral(song.metadata.afinacao || "")}")\n`;

  const seen = new Set<string>();
  for (let i = 0; i < song.parts.length; i++) {
    out += renderPart(song.parts[i], i === 0, seen);
  }

  return out;
}

// Nomes de acordes usados num conjunto de músicas
function collectChordNames(songs: Song[], allowed?: Set<string>): string[] {
  const names = new Set<string>();
  for (const song of songs)
    for (const part of song.parts)
      for (const section of part.sections)
        for (const line of section.lines)
          for (const c of line.chords ?? []) {
            // Slash chords, extensões entre parêntesis e runs de notas ficam
            // fora do apêndice — só o acorde base entra na tabela.
            if (!isAppendixChord(c.chord)) continue;
            // Acordes demasiado raros na colecção não ganham diagrama.
            if (allowed && !allowed.has(c.chord)) continue;
            names.add(c.chord);
          }
  return sortChordNames([...names]);
}

// Apêndice de acordes: tabela com acordes em colunas e instrumentos em
// linhas (guitarra com várias linhas — uma por variação; acordeão com
// mini-teclado + baixos Stradella). Acordes sem shape levam "—". Como não
// cabem todos os acordes à largura, a tabela é dividida em blocos.
function renderChordAppendix(songs: Song[], isA5: boolean, allowed?: Set<string>): string {
  const columns = mergeEnharmonicColumns(collectChordNames(songs, allowed));
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

  // Avisos de cobertura (uma vez por instrumento) — uma coluna só falha se
  // nenhuma das suas grafias tiver shape.
  for (const { data } of instruments) {
    const missing = columns
      .filter((col) => !col.names.some((n) => data.chords[n]?.length))
      .map((col) => col.labelParts.join(" • "));
    if (missing.length > 0) {
      console.warn(`  Aviso: ${data.instrument} sem diagrama para: ${missing.join(", ")}`);
    }
  }

  let out = `\n// ─── Apêndice: acordes ───\n`;
  out += `#pagebreak()\n`;
  out += `#set page(columns: 1)\n`;
  out += `#let chart-chord-d = chart-chord.with(size: ${diagramSize}, font: sans-font, hold-color: blue)\n`;
  out += `#let chord-dash = text(fill: grey, size: 1.2em)[—]\n`;
  // Separador de grafias enarmónicas (D# • Eb): cinzento e leve, com espaço,
  // para se distinguir dos nomes de acorde (azuis, bold).
  out += `#let enh-sep = text(fill: grey, weight: 400)[#h(0.22em)•#h(0.22em)]\n`;
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
  out += `#metadata("Acordes") <section-marker>\n`;
  out += `#v(4pt)\n`;
  out += `#cond-text([ACORDES], size: ${titleSize}, tracking: 0.06em)\n`;
  out += `#v(5pt)\n`;
  out += `#box(width: 38pt, height: 3pt, fill: blue)\n`;
  out += `#v(1.1em)\n`;

  for (let start = 0; start < columns.length; start += chordsPerTable) {
    const chunk = columns.slice(start, start + chordsPerTable);

    const headerCells = chunk
      .map((col) =>
        col.labelParts.length === 1
          ? `[#chord-text("${escLiteral(col.labelParts[0])}")]`
          : `[#{${col.labelParts.map((n) => `chord-text("${escLiteral(n)}")`).join(" + enh-sep + ")}}]`
      )
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
        for (const col of chunk) {
          // Qualquer grafia do grupo dá a mesma pega; usa a 1ª com shape.
          let shape, resolved;
          for (const n of col.names) {
            const s = data.chords[n]?.[v];
            if (s) { shape = s; resolved = n; break; }
          }
          if (!shape) {
            cells.push(`[#chord-dash]`);
          } else if (kind === "piano") {
            cells.push(`[#${miniPianoCall(shape as PianoShape, resolved!)}]`);
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
  const subTitleSize = isA5 ? "7pt" : "9pt";
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
    const { main, sub } = splitTitle(song.metadata.titulo);
    const title = escTypst(main) +
      (sub ? ` #text(size: 0.72em, fill: grey)[${escTypst(sub)}]` : "");
    return `  #context {
    let loc = locate(label("song-${labelId}"))
    let pg = counter(page).at(loc).first()
    link(label("song-${labelId}"))[${title} #box(width: 1fr, repeat(gap: 2.5pt)[#text(fill: hairline-color)[.]]) #text(font: sans-font, stretch: 100%, weight: 700, fill: blue)[#pg]]
    linebreak()
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
// Bolha de repetição: "x2", "x3", ... (marcadores (2x)/(Bis) das cifras)
#let rep-bubble(label) = box(
  fill: hairline-color.lighten(40%),
  radius: 5pt,
  inset: (x: 4pt, y: 1.6pt),
  cond-text(label, size: 0.72em, fill: ink, weight: 700, tracking: 0.03em),
)

#let sec-pill(label, color, sticky: true, note: "", times: 0) = block(sticky: sticky, above: 1.55em, below: 0.5em, {
  box(
    stroke: 0.8pt + color,
    radius: 2pt,
    inset: (x: 5pt, y: 2.6pt),
    cond-text(label, size: 0.78em, fill: color, tracking: 0.07em),
  )
  if times > 1 {
    h(4pt)
    rep-bubble("x" + str(times))
  }
  if note != "" {
    h(4pt)
    text(fill: grey, style: "italic", size: 0.78em, note)
  }
})

// Label de secção custom (sub-músicas etc.): quadrado azul + texto
#let section-label(label, sticky: true, note: "", times: 0) = block(sticky: sticky, above: 1.55em, below: 0.5em, {
  box(baseline: -0.08em, square(size: 0.5em, fill: blue))
  h(0.45em)
  cond-text(label, size: 0.85em, tracking: 0.04em)
  if times > 1 {
    h(4pt)
    rep-bubble("x" + str(times))
  }
  if note != "" {
    h(4pt)
    text(fill: grey, style: "italic", size: 0.78em, note)
  }
})

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
// sub: qualificador entre parêntesis no fim do título (ex: "(5º Ano
// Jurídico 88/89)", "(versão de X)") — bastante mais pequeno que o título.
// O tom não é mostrado (fica na metadata para transposição futura).
#let song-title(titulo, tom, autor: "", autor-full: "", sub: "", afinacao: "") = block(breakable: false, sticky: true, below: 0.9em, {
  grid(
    columns: (auto, 1fr),
    column-gutter: 6pt,
    align: (horizon + left, horizon),
    {
      cond-text(upper(titulo), size: ${titleSize})
      if sub != "" {
        h(5pt)
        cond-text(upper(sub), size: ${subTitleSize}, weight: 600, tracking: 0.03em)
      }
    },
    line(length: 100%, stroke: 0.5pt + hairline-color),
  )
  if autor != "" {
    v(2.5pt)
    // Sem upper: a sigla já vem em maiúsculas na fonte e os nomes por extenso
    // ficam em caixa natural. Só a sigla (quando acompanhada do nome completo)
    // leva o tracking largo de "etiqueta"; o nome completo fica mais leve.
    cond-text(size: 0.78em, fill: grey, weight: 600, tracking: 0.03em, {
      if autor-full != "" {
        text(tracking: 0.1em)[#autor]
        text(weight: 400, tracking: 0.02em)[ · #autor-full]
      } else {
        autor
      }
    })
  }
  if afinacao != "" {
    v(2.5pt)
    cond-text([afinação: #afinacao], size: 0.72em, fill: grey, weight: 500, tracking: 0.04em)
  }
})

// Título de secção no índice (livros com secções)
#let index-section-title(body) = block(above: 0.9em, below: 0.5em, sticky: true,
  cond-text(upper(body), size: ${indexSectionSize}, fill: coral, tracking: 0.08em),
)

// Página divisória de secção: barra coral, nome centrado, sem header/footer
// Secção corrente (para o rodapé): último marker de secção até esta página
#let current-section() = {
  let markers = query(selector(<section-marker>).before(here()))
  if markers.len() > 0 { markers.last().value } else { none }
}

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
    cond-text([${escTypst(version === "dev" ? "dev" : `v${version}`)}], size: ${coverVersionSize}, fill: grey, weight: 600, tracking: 0.12em),
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
    let sec = ${hasSections ? "current-section()" : "none"}
    let sec-label = if sec != none {
      cond-text(upper(sec), size: 0.82em, fill: grey, weight: 600, tracking: 0.12em)
    } else { none }
    // número da página na margem exterior; secção corrente no lado interior
    if calc.odd(pg) {
      grid(columns: (auto, 1fr), align: (left, right),
        counter(page).display(), sec-label)
    } else {
      grid(columns: (1fr, auto), align: (left, right),
        sec-label, counter(page).display())
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
      typ += `#section-divider("${escLiteral(sec.name)}")\n`;
      typ += `#metadata("${escLiteral(sec.name)}") <section-marker>\n\n`;
      currentCols = null; // a 1.ª música da secção re-emite o modo de colunas
    }
    // Dentro de cada secção nomeada, as músicas saem por título (A–Z), tal
    // como no índice. Livros sem secções (lista curada, ex: Tunadão) mantêm a
    // ordem em que foram listados.
    const sectionSongs = hasSections ? sec.songs.slice().sort(sortByTitle) : sec.songs;
    for (const song of sectionSongs) {
      const cols = song.metadata.colunas === 1 ? 1 : 2;
      if (cols !== currentCols) {
        typ += `#set page(columns: ${cols})\n\n`;
        currentCols = cols;
      } else {
        typ += `#colbreak()\n\n`;
      }
      // Autor por baixo do título — omitido quando é o próprio grupo do
      // livro (nos originais do Tunadão só os covers mostram o autor).
      const showAutor = song.metadata.artista && song.metadata.artista !== headerTitle;
      const { sigla, full } = showAutor
        ? splitArtista(song.metadata.artista!)
        : { sigla: "", full: "" };
      typ += renderSong(song, labelOf.get(song)!, sigla, full);
      typ += `\n`;
    }
  }

  typ += renderChordAppendix(songs, isA5, input.appendixChords);

  return typ;
}

const layout: Layout = {
  name: "v2",
  description: "Combinado: capa do palco (fundo branco), fonts Atkinson/Barlow, paleta do moderno, separador editorial sem número, pills hollow",
  generate,
};

export default layout;
