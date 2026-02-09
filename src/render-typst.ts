import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { parseSong } from "./parser";
import { Song, SongPart, Section, SongLine, ChordPosition } from "./types";

// --- Configuração ---
const CIFRAS_BASE = path.resolve(__dirname, "../cifras");
const OUTPUT_DIR = path.resolve(__dirname, "../output");
const TYPST_DIR = path.resolve(__dirname, "../typst");
const FONTS_DIR = path.resolve(TYPST_DIR, "fonts");

// Cores do design system
const COLORS = {
  title: "#2B4162",      // Indigo Dye
  subtitle: "#385F71",   // Lapis Lazuli
  chord: "#6386BB",      // Glaucous
  text: "#152328",       // Gunmetal
  introFill: "#F2DDA4",  // Flax (pill background)
  refraoFill: "#385F71", // Lapis Lazuli (pill background)
  pillText: "#FFFFFF",
};

// Fonts
const FONTS = {
  title: "Faculty Glyphic",
  chord: "Madimi One",
  lyrics: "Comic Neue",
};

// Metadata por cancioneiro (chave = nome do subdirectório em cifras/)
const CANCIONEIRO_META: Record<string, { displayName: string; logoFile: string }> = {
  tunadao: { displayName: "Cancioneiro Tunadão 1998", logoFile: "tunadao-logo.png" },
  portugues: { displayName: "Cancioneiro de Música Portuguesa", logoFile: "tunadao-logo.png" },
};

// Fallback para cancioneiros sem metadata explícita
function getCancioneiroMeta(subdir: string) {
  return CANCIONEIRO_META[subdir] ?? {
    displayName: `Cancioneiro ${subdir.charAt(0).toUpperCase() + subdir.slice(1)}`,
    logoFile: "tunadao-logo.png",
  };
}

// Configuração passada a generateTypFile
interface CancioneiroConfig {
  songs: Song[];
  pageSize: "a5" | "a4";
  subdir: string;
  displayName: string;
  logoPath: string;
  version: string;
}

// Escapar caracteres especiais para Typst content mode
function escTypst(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

// Escapar string literal para Typst (entre aspas)
function escLiteral(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

// Gerar inline Typst code para uma linha com acordes sobre letras.
// Abordagem: pré-computar as prefix strings em JS (que lida bem com Unicode)
// e gerar code Typst que usa measure() em cada prefix para posicionar o acorde.
function renderChordLyricsLine(line: SongLine): string {
  const lyrics = line.lyrics || "";
  const chords = line.chords || [];

  if (chords.length === 0 && lyrics) {
    if (line.isBold) {
      return `#text(weight: "bold", [${escTypst(lyrics)}])\n`;
    }
    return `${escTypst(lyrics)}\n`;
  }

  if (chords.length > 0 && !lyrics) {
    const chordsStr = chords.map(c => c.chord).join("  ");
    return `#text(font: chord-font, fill: chord-color, size: chord-size, [${escTypst(chordsStr)}])\n`;
  }

  // Linha com acordes sobre letras.
  // Abordagem: grid com 2 linhas — acordes em cima, letras em baixo.
  // A linha de acordes é um box com place() para cada acorde.
  const weight = line.isBold ? `"bold"` : `"regular"`;

  const placeCalls = chords.map(c => {
    const pos = Math.min(c.position, lyrics.length);
    const prefix = lyrics.substring(0, pos);
    return `      place(dx: measure(text(font: lyrics-font, size: lyrics-size, weight: ${weight}, "${escLiteral(prefix)}")).width, text(font: chord-font, fill: chord-color, size: chord-size, "${escLiteral(c.chord)}"))`;
  }).join("\n");

  const lyricsContent = line.isBold
    ? `text(weight: "bold", [${escTypst(lyrics)}])`
    : `[${escTypst(lyrics)}]`;

  return `#v(0.15em)
#context grid(columns: (100%,), row-gutter: 0pt,
    box(height: chord-size, {
${placeCalls}
    }),
    ${lyricsContent},
  )
`;
}

// Gerar uma secção
function renderSection(section: Section): string {
  let out = "";

  // Pill de secção
  if (section.type) {
    const sectionUpper = section.type.toUpperCase();
    if (sectionUpper === "INTRO") {
      out += `#section-pill("INTRO", intro-fill)\n`;
    } else if (sectionUpper === "REFRÃO" || sectionUpper === "REFRAO") {
      out += `#section-pill("REFRÃO", refrao-fill)\n`;
    } else if (sectionUpper === "PASSAGEM") {
      out += `#section-pill("PASSAGEM", subtitle-color)\n`;
    } else if (sectionUpper === "SOLO") {
      out += `#section-pill("SOLO", subtitle-color)\n`;
    } else if (sectionUpper === "INSTR.") {
      out += `#section-pill("INSTR.", subtitle-color)\n`;
    } else if (sectionUpper === "SAÍDA" || sectionUpper === "SAIDA") {
      out += `#section-pill("SAÍDA", subtitle-color)\n`;
    } else if (sectionUpper === "SOLISTA") {
      out += `#section-pill("SOLISTA", subtitle-color)\n`;
    } else if (section.type.trim()) {
      out += `#section-label("${escLiteral(section.type)}")\n`;
    }
  }

  // Linhas da secção
  for (const line of section.lines) {
    switch (line.type) {
      case "empty":
        out += `#v(0.3em)\n`;
        break;
      case "instruction":
        out += `#text(fill: subtitle-color, style: "italic", size: 0.85em, [${escTypst(line.instruction || "")}])\n`;
        out += `#linebreak()\n`;
        break;
      case "chords-only":
        if (line.lyrics) {
          out += `#text(font: chord-font, fill: chord-color, size: chord-size, [${escTypst(line.lyrics)}])\n`;
          out += `#linebreak()\n`;
        } else if (line.chords && line.chords.length > 0) {
          const chordsStr = line.chords.map(c => c.chord).join("  ");
          out += `#text(font: chord-font, fill: chord-color, size: chord-size, [${escTypst(chordsStr)}])\n`;
          out += `#linebreak()\n`;
        }
        break;
      case "lyrics":
        out += renderChordLyricsLine(line);
        break;
    }
  }

  return out;
}

// Gerar uma parte (SongPart)
function renderPart(part: SongPart, isFirst: boolean): string {
  let out = "";

  if (part.metadata) {
    if (!isFirst) {
      out += `#v(0.6em)\n`;
      out += `#line(length: 100%, stroke: 0.5pt + luma(180))\n`;
      out += `#v(0.3em)\n`;
    }
    if (part.metadata.parte) {
      out += `#text(font: title-font, fill: title-color, size: 1em, weight: "bold", [${escTypst(part.metadata.parte)}])\n`;
    }
    if (part.metadata.tom) {
      out += `#h(0.5em)\n`;
      out += `#text(fill: subtitle-color, style: "italic", size: 0.85em, [Tom: ${escTypst(part.metadata.tom)}])\n`;
    }
    out += `#linebreak()\n`;
    out += `#v(0.2em)\n`;
  }

  for (const section of part.sections) {
    out += renderSection(section);
  }

  return out;
}

// Gerar uma música completa
function renderSong(song: Song): string {
  let out = "";
  out += `#song-title("${escLiteral(song.metadata.titulo)}", "${escLiteral(song.metadata.tom)}")\n`;

  for (let i = 0; i < song.parts.length; i++) {
    out += renderPart(song.parts[i], i === 0);
  }

  return out;
}

// Gerar o ficheiro .typ completo
function generateTypFile(config: CancioneiroConfig): string {
  const { songs, pageSize, subdir, displayName, logoPath, version } = config;
  const isA5 = pageSize === "a5";
  const pageWidth = isA5 ? "148mm" : "210mm";
  const pageHeight = isA5 ? "210mm" : "297mm";
  const marginInner = isA5 ? "13mm" : "20mm";
  const marginOuter = isA5 ? "5mm" : "15mm";
  const marginTop = isA5 ? "10mm" : "15mm";
  const marginBottom = isA5 ? "8mm" : "12mm";
  const titleSize = isA5 ? "13pt" : "16pt";
  const lyricsSize = isA5 ? "7.5pt" : "10pt";
  const chordSize = isA5 ? "7pt" : "9pt";
  const columnGutter = isA5 ? "8mm" : "12mm";

  let typ = `// Cancioneiro: ${displayName} — gerado automaticamente
// Formato: ${pageSize.toUpperCase()} (${pageWidth} × ${pageHeight})

// ─── Cores ───
#let title-color = rgb("${COLORS.title}")
#let subtitle-color = rgb("${COLORS.subtitle}")
#let chord-color = rgb("${COLORS.chord}")
#let text-color = rgb("${COLORS.text}")
#let intro-fill = rgb("${COLORS.introFill}")
#let refrao-fill = rgb("${COLORS.refraoFill}")
#let pill-text = rgb("${COLORS.pillText}")

// ─── Fonts ───
#let title-font = "${FONTS.title}"
#let chord-font = "${FONTS.chord}"
#let lyrics-font = "${FONTS.lyrics}"
#let chord-size = ${chordSize}
#let lyrics-size = ${lyricsSize}

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
)

#set text(
  font: lyrics-font,
  size: lyrics-size,
  fill: text-color,
  lang: "pt",
)

#set par(leading: 0.5em, spacing: 0.4em)

// ─── Funções auxiliares ───

// Pill de secção (INTRO, REFRÃO, etc.)
#let section-pill(label, bg-color) = {
  v(0.4em)
  box(
    fill: bg-color,
    radius: 3pt,
    inset: (x: 5pt, y: 2pt),
    text(fill: pill-text, size: 0.75em, weight: "bold", font: title-font, label),
  )
  linebreak()
  v(0.15em)
}

// Label de secção custom (sub-músicas etc.)
#let section-label(label) = {
  v(0.4em)
  text(font: title-font, fill: title-color, size: 0.9em, weight: "bold", label)
  linebreak()
  v(0.15em)
}

// Título da música com tom
#let song-title(titulo, tom) = {
  text(font: title-font, fill: title-color, size: ${titleSize}, weight: "bold", titulo)
  linebreak()
  text(fill: subtitle-color, style: "italic", size: 0.8em, [Tom: #tom])
  linebreak()
  v(0.4em)
}

// TODO: Phase 2 — cover page
// TODO: Phase 2 — index

// ─── Layout em duas colunas ───
#show: doc => columns(2, gutter: ${columnGutter}, doc)

// TODO: Phase 2 — headers/footers

// ─── Conteúdo ───

`;

  for (let i = 0; i < songs.length; i++) {
    if (i > 0) {
      typ += `#colbreak()\n\n`;
    }
    typ += renderSong(songs[i]);
    typ += `\n`;
  }

  return typ;
}

// --- Main ---
function main() {
  // Iterar subdirectórios de cifras/ como cancioneiros separados
  const subdirs = fs.readdirSync(CIFRAS_BASE).filter(d => {
    const fullPath = path.join(CIFRAS_BASE, d);
    return fs.statSync(fullPath).isDirectory();
  }).sort();

  if (subdirs.length === 0) {
    console.error("Nenhum subdirectório encontrado em cifras/");
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const subdir of subdirs) {
    const cifrasDir = path.join(CIFRAS_BASE, subdir);
    const files = fs.readdirSync(cifrasDir)
      .filter(f => f.endsWith(".txt"))
      .sort();

    if (files.length === 0) {
      console.log(`Directório ${subdir}/ sem cifras, a saltar.`);
      continue;
    }

    console.log(`\n=== Cancioneiro: ${subdir} (${files.length} cifras) ===`);

    const meta = getCancioneiroMeta(subdir);
    const logoPath = path.resolve(__dirname, "../assets", meta.logoFile);

    const songs: Song[] = files.map(f => {
      const filePath = path.join(cifrasDir, f);
      console.log(`  Parsing: ${f}`);
      return parseSong(filePath);
    });

    // Gerar e compilar A5
    const typA5 = generateTypFile({ songs, pageSize: "a5", subdir, displayName: meta.displayName, logoPath, version: "dev" });
    const typA5Path = path.join(TYPST_DIR, `cancioneiro-${subdir}-a5.typ`);
    fs.writeFileSync(typA5Path, typA5, "utf-8");
    console.log(`Gerado: ${typA5Path}`);

    // Gerar e compilar A4
    const typA4 = generateTypFile({ songs, pageSize: "a4", subdir, displayName: meta.displayName, logoPath, version: "dev" });
    const typA4Path = path.join(TYPST_DIR, `cancioneiro-${subdir}-a4.typ`);
    fs.writeFileSync(typA4Path, typA4, "utf-8");
    console.log(`Gerado: ${typA4Path}`);

    // Compilar com Typst
    const outputA5 = path.join(OUTPUT_DIR, `cancioneiro-${subdir}-a5.pdf`);
    const outputA4 = path.join(OUTPUT_DIR, `cancioneiro-${subdir}-a4.pdf`);

    console.log(`Compilando ${subdir} A5...`);
    try {
      execSync(`typst compile --font-path "${FONTS_DIR}" "${typA5Path}" "${outputA5}"`, {
        stdio: "inherit",
      });
      console.log(`PDF A5 gerado: ${outputA5}`);
    } catch (e) {
      console.error(`Erro a compilar ${subdir} A5:`, (e as Error).message);
      process.exit(1);
    }

    console.log(`Compilando ${subdir} A4...`);
    try {
      execSync(`typst compile --font-path "${FONTS_DIR}" "${typA4Path}" "${outputA4}"`, {
        stdio: "inherit",
      });
      console.log(`PDF A4 gerado: ${outputA4}`);
    } catch (e) {
      console.error(`Erro a compilar ${subdir} A4:`, (e as Error).message);
      process.exit(1);
    }
  }

  console.log("\nDone! PDFs gerados em output/");
}

main();
