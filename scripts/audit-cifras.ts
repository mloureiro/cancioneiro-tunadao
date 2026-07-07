// Auditoria automática das cifras (R1–R5).
// Corre o parser sobre todas as cifras e emite sinais determinísticos para
// os problemas reportados. Não corrige nada — só lista candidatos.
//
//   npx tsx scripts/audit-cifras.ts
//
// R1  não-cifras (só acordes / só letra / tablatura)
// R2  refrão em texto (devia ser tag) + refrão que arrasta versos
// R3  acordes não identificados (tokens tipo acorde tratados como letra)
// R4  sem refrão identificado (nenhuma secção refrão, nenhuma linha bold)
// R5  2 colunas com linhas de letra compridas (risco de folding)

import * as fs from "fs";
import * as path from "path";
import { parseSong } from "../src/parser";
import { Song, Section, SongLine } from "../src/types";

const ROOT = path.resolve(__dirname, "..", "cifras");

// Cópia do padrão estrito do parser (mantém em sincronia manual com CHORD_CORE).
const NOTE_ = String.raw`[A-G][#b]?`;
const PAREN_ = String.raw`\((?:maj7|[0-9#b+\-\/]+)\)`;
const SUFFIX_ = String.raw`(?:maj|min|dim|aug|sus|add|m|M|[0-9]+|[#b][0-9]+|[0-9]+[#b+\-]|[+\-]|${PAREN_})`;
const BASS_ = String.raw`(?:\/(?:${NOTE_}|[#b]?[0-9]+[#b+\-]?))`;
const PARBASS_ = String.raw`(?:\(${NOTE_}\))`;
const STRICT_CHORD = new RegExp(`^${NOTE_}${SUFFIX_}*${BASS_}?${PARBASS_}?$`);
// Padrão largo: começa por nota, é curto, só tem caracteres de acorde.
const LOOSE_CHORD = /^[A-G][#b]?[mM0-9#b/()+\-]*(?:sus|maj|min|dim|aug|add)?[0-9#b/()+\-]*$/;
const DECORATION = /^(\(?\d+x\)?|\(?x\d+\)?|\(?bis\)?|[-|]|\/[A-G][#b]?)$/i;

function looksLikeChordToken(t: string): boolean {
  if (t.length > 9) return false;
  if (!/^[A-G]/.test(t)) return false;
  // fragmentos típicos de acorde para além do que o padrão largo apanha
  return LOOSE_CHORD.test(t) || /^[A-G][#b]?(m|maj|min|dim|aug|sus|add|7|9|6|4|2|11|13)/.test(t);
}

interface Finding {
  file: string;
  dir: string;
  detail: string;
}

const R1: Finding[] = []; // não-cifras
const R2text: Finding[] = []; // refrão em texto
const R2bleed: Finding[] = []; // refrão a arrastar versos
const R3: Finding[] = []; // acordes não identificados
const R4: Finding[] = []; // sem refrão
const R5: Finding[] = []; // folding em 2 colunas

function eachLine(song: Song, fn: (l: SongLine, s: Section) => void) {
  for (const part of song.parts)
    for (const sec of part.sections) for (const l of sec.lines) fn(l, sec);
}

function bodyLines(raw: string): string[] {
  const lines = raw.split("\n");
  // saltar header YAML
  let start = 0;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++)
      if (lines[i].trim() === "---") {
        start = i + 1;
        break;
      }
  }
  return lines.slice(start);
}

// Comprimento máximo de linha de letra tolerado em A5 duas colunas (≈61mm,
// 7.4pt Atkinson) antes de haver risco de dobrar. Estimativa conservadora.
const A5_MAX_CHARS = 42;

const files: string[] = [];
for (const dir of fs.readdirSync(ROOT)) {
  const abs = path.join(ROOT, dir);
  if (!fs.statSync(abs).isDirectory()) continue;
  for (const f of fs.readdirSync(abs))
    if (f.endsWith(".txt")) files.push(path.join(abs, f));
}
files.sort((a, b) => a.localeCompare(b, "pt"));

for (const file of files) {
  const dir = path.basename(path.dirname(file));
  const rel = path.relative(ROOT, file);
  let song: Song;
  try {
    song = parseSong(file);
  } catch (e) {
    R1.push({ file: rel, dir, detail: `ERRO parser: ${(e as Error).message}` });
    continue;
  }

  // ── contabilizar tipos de linha ──
  let lyricLinesWithText = 0;
  let lyricLinesWithChords = 0;
  let chordOnlyLines = 0;
  let anyChords = false;
  eachLine(song, (l) => {
    if (l.type === "lyrics" && l.lyrics && l.lyrics.trim()) {
      lyricLinesWithText++;
      if (l.chords && l.chords.length) {
        lyricLinesWithChords++;
        anyChords = true;
      }
    }
    if (l.type === "chords-only") {
      chordOnlyLines++;
      if (l.chords && l.chords.length) anyChords = true;
    }
  });

  // ── R1: não-cifras ──
  const raw = fs.readFileSync(file, "utf-8");
  const body = bodyLines(raw);
  const tabLines = body.filter((l) => /(?:^|\s)[|][-0-9h/p~]{2,}/.test(l) || /^[eBGDAE][|:]/.test(l.trim()));
  if (tabLines.length >= 2) {
    R1.push({ file: rel, dir, detail: `tablatura (${tabLines.length} linhas de tab)` });
  } else if (lyricLinesWithText === 0) {
    R1.push({ file: rel, dir, detail: `só acordes / instrumental (0 linhas de letra)` });
  } else if (!anyChords) {
    R1.push({ file: rel, dir, detail: `só letra (0 acordes) — falta cifrar` });
  } else if (lyricLinesWithChords === 0) {
    R1.push({ file: rel, dir, detail: `acordes só em blocos, nunca sobre a letra` });
  }

  // ── R3: acordes não identificados ──
  const r3tokens = new Set<string>();
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const t = line.trim();
    if (t === "" || t.startsWith("[") || t.startsWith(">") || t.startsWith("(")) continue;
    if (/^(titulo|artista|tom|subtitulo|colunas|parte):/i.test(t)) continue;
    const tokens = t.replace(/[,\[\]]/g, " ").split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const strictPass = tokens.filter((tk) => STRICT_CHORD.test(tk));
    const looseButFailStrict = tokens.filter(
      (tk) => !STRICT_CHORD.test(tk) && !DECORATION.test(tk) && looksLikeChordToken(tk)
    );
    // linha maioritariamente acordes mas com ≥1 token tipo-acorde rejeitado
    if (
      looseButFailStrict.length > 0 &&
      strictPass.length + looseButFailStrict.length === tokens.length &&
      strictPass.length >= 1
    ) {
      for (const tk of looseButFailStrict) r3tokens.add(tk);
    }
  }
  if (r3tokens.size) {
    R3.push({ file: rel, dir, detail: `tokens rejeitados: ${[...r3tokens].join(" ")}` });
  }

  // ── R2: refrão em texto solto ──
  const refText: string[] = [];
  eachLine(song, (l) => {
    const txt = (l.type === "lyrics" ? l.lyrics : l.instruction) || "";
    if (/^\s*refr[ãa]o\b/i.test(txt)) refText.push(txt.trim());
  });
  if (refText.length) {
    R2text.push({ file: rel, dir, detail: refText.join(" | ") });
  }

  // ── R2/R4: refrão ──
  let hasChorusSection = false;
  let anyBoldLyric = false;
  for (const part of song.parts)
    for (const sec of part.sections) {
      if (sec.isChorus) {
        hasChorusSection = true;
        const lyr = sec.lines.filter((l) => l.type === "lyrics" && l.lyrics);
        if (lyr.length > 6)
          R2bleed.push({
            file: rel,
            dir,
            detail: `[${sec.type}] com ${lyr.length} linhas de letra (versos arrastados?)`,
          });
      }
      if (sec.lines.some((l) => l.type === "lyrics" && l.isBold)) anyBoldLyric = true;
    }

  // ── R4: sem refrão identificado ──
  if (lyricLinesWithText > 4 && !hasChorusSection && !anyBoldLyric) {
    R4.push({ file: rel, dir, detail: `sem [REFRÃO] e sem linhas bold` });
  }

  // ── R5: folding em 2 colunas ──
  const colunas = song.metadata.colunas;
  if (colunas !== 1) {
    let longest = 0;
    let longestLine = "";
    eachLine(song, (l) => {
      if (l.type === "lyrics" && l.lyrics) {
        const len = [...l.lyrics].length;
        if (len > longest) {
          longest = len;
          longestLine = l.lyrics;
        }
      }
    });
    if (longest > A5_MAX_CHARS) {
      R5.push({
        file: rel,
        dir,
        detail: `linha máx ${longest} car.: "${longestLine.slice(0, 60)}${longestLine.length > 60 ? "…" : ""}"`,
      });
    }
  }
}

function report(title: string, items: Finding[]) {
  console.log(`\n## ${title} — ${items.length}`);
  const byDir: Record<string, Finding[]> = {};
  for (const it of items) (byDir[it.dir] ||= []).push(it);
  for (const d of Object.keys(byDir).sort()) {
    console.log(`\n### ${d} (${byDir[d].length})`);
    for (const it of byDir[d]) console.log(`- ${path.basename(it.file)} — ${it.detail}`);
  }
}

console.log(`# Auditoria de cifras — ${files.length} ficheiros`);
report("R1 · Não-cifras (só acordes / só letra / tablatura)", R1);
report("R2a · Refrão em texto (devia ser tag/pill)", R2text);
report("R2b · Refrão a arrastar versos (secção refrão longa)", R2bleed);
report("R3 · Acordes não identificados", R3);
report("R4 · Sem refrão identificado", R4);
report("R5 · 2 colunas com risco de folding (linhas compridas)", R5);
console.log(
  `\n# Totais: R1=${R1.length} R2a=${R2text.length} R2b=${R2bleed.length} R3=${R3.length} R4=${R4.length} R5=${R5.length}`
);
