// Seed do banco de acordes (chords/*.json) a partir de:
//  - @tombatossals/chords-db  → guitarra e ukulele (shapes curados, com dedilhado)
//  - chord-fingering          → bandolim e cavaquinho (computados, sem dedilhado)
//                               e fallback para guitarra/ukulele
//  - chords/overrides.json    → shapes definidos à mão (sobrevivem ao re-seed)
//
// Correr: npm run seed:chords
//
// Política para slash chords (ex: D/F#):
//  - guitarra: computado a honrar o baixo; se não der, acorde base
//  - instrumentos de 4 cordas e teclado: acorde base (baixo ignorado)

import * as fs from "fs";
import * as path from "path";
import { parseSong } from "../src/parser";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findGuitarChord } = require("chord-fingering");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const guitarDb = require("@tombatossals/chords-db/lib/guitar.json");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ukuleleDb = require("@tombatossals/chords-db/lib/ukulele.json");

const CIFRAS_BASE = path.resolve(__dirname, "../cifras");
const CHORDS_DIR = path.resolve(__dirname, "../chords");
const MAX_SHAPES = 4;

const GUITAR_TUNING = ["E2", "A2", "D3", "G3", "B3", "E4"];
const UKULELE_TUNING = ["G4", "C4", "E4", "A4"];
const MANDOLIN_TUNING = ["G3", "D4", "A4", "E5"];
// Afinação GGBD (grave → agudo); as duas cordas G são uníssono, mas o
// cálculo usa G3-G4 para a lib as tratar como cordas distintas.
const CAVAQUINHO_TUNING = ["G3", "G4", "B4", "D5"];

// Shape de um acorde: convenção chords-db.
// frets: por corda, da mais grave para a mais aguda; -1 = abafada, 0 = solta,
//        n = casa relativa a baseFret (casa absoluta = n + baseFret - 1)
// fingers: dedo por corda (1-4), 0 = nenhum; null = desconhecido (computado)
// barres: casas (relativas) com barra
export interface Shape {
  frets: number[];
  fingers: number[] | null;
  baseFret: number;
  barres: number[];
}

export interface PianoShape {
  notes: string[];
}

interface InstrumentChords {
  instrument: string;
  strings?: number;
  tuning?: string[];
  chords: Record<string, (Shape | PianoShape)[]>;
}

// ─── Nomes: separar fundamental/sufixo/baixo ───

// Notação brasileira: "7M" = sétima maior ("C7M" → "Cmaj7", "Cm7M" → "Cmmaj7").
// Aplicado só na resolução de shapes — o nome original mantém-se nas cifras
// e como chave nos JSONs.
export function normalizeChordName(name: string): string {
  return name.replace(/^([A-G][#b]?)(m?)7M/, (_, root, minor) =>
    `${root}${minor ? "mmaj7" : "maj7"}`
  );
}

export function splitBass(name: string): { base: string; bass: string | null } {
  const idx = name.indexOf("/");
  if (idx === -1) return { base: name, bass: null };
  return { base: name.slice(0, idx), bass: name.slice(idx + 1) };
}

function splitChordName(name: string): { root: string; suffix: string } {
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m) throw new Error(`Acorde inválido: ${name}`);
  return { root: m[1], suffix: m[2] };
}

// ─── Extrair o conjunto de acordes usados nas cifras ───

function collectChords(): string[] {
  const chords = new Set<string>();
  for (const sub of fs.readdirSync(CIFRAS_BASE)) {
    const dir = path.join(CIFRAS_BASE, sub);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
      const song = parseSong(path.join(dir, f));
      for (const part of song.parts)
        for (const sec of part.sections)
          for (const line of sec.lines)
            for (const c of line.chords ?? []) {
              // Runs de notas "(G A B)" não são acordes para os diagramas
              if (c.chord.startsWith("(")) continue;
              chords.add(c.chord);
            }
    }
  }
  return [...chords].sort();
}

// ─── Guitarra / Ukulele: lookup em chords-db ───

// chords-db usa nomes de chave diferentes por instrumento (guitar: Csharp/Fsharp,
// ukulele: Db/Gb) — tentamos todas as grafias enarmónicas.
const DB_KEY_MAP: Record<string, string[]> = {
  "C#": ["Csharp", "Db"], Db: ["Csharp", "Db"],
  "D#": ["Eb"], "F#": ["Fsharp", "Gb"], Gb: ["Fsharp", "Gb"],
  "G#": ["Ab"], "A#": ["Bb"],
};

const DB_SUFFIX_MAP: Record<string, string> = {
  "": "major", m: "minor", "7": "7", m7: "m7", maj7: "maj7",
  "6": "6", "9": "9", m6: "m6", m9: "m9", dim: "dim", dim7: "dim7",
  aug: "aug", sus2: "sus2", sus4: "sus4", add9: "add9", "5": "5",
  // Abreviaturas comuns nas cifras: C4 = Csus4, C2 = Csus2
  "4": "sus4", "2": "sus2",
};

function lookupDb(db: any, name: string): Shape[] | null {
  const { root, suffix } = splitChordName(name);
  const dbSuffix = DB_SUFFIX_MAP[suffix];
  if (!dbSuffix) return null;
  const keys = DB_KEY_MAP[root] ?? [root];
  const entries = keys.map((k) => db.chords[k]).find(Boolean);
  if (!entries) return null;
  const entry = entries.find((e: any) => e.suffix === dbSuffix);
  if (!entry) return null;
  return entry.positions.slice(0, MAX_SHAPES).map((p: any) => ({
    frets: p.frets,
    fingers: p.fingers,
    baseFret: p.baseFret,
    barres: p.barres ?? [],
  }));
}

// ─── Computar shapes com chord-fingering (qualquer afinação) ───

// Nota: a lib exige a fundamental no baixo, o que esconde shapes idiomáticos
// (ex: C no bandolim = 0230, um C/G). Contornamos pedindo também as inversões
// (C/E, C/G) e escolhendo pelo critério de tocabilidade. Se `name` já tiver
// baixo explícito (D/F#), é honrado e não se tentam outras inversões.
export function computeShapes(name: string, tuning: string[]): Shape[] {
  const base = findGuitarChord(name, tuning);
  if (!base || !base.notes) return [];

  const candidates: any[] = [...(base.fingerings ?? [])];
  if (!name.includes("/")) {
    const rootNote = base.notes[0];
    for (const note of base.notes.slice(1)) {
      if (note === rootNote) continue;
      const inv = findGuitarChord(`${name}/${note}`, tuning);
      if (inv?.fingerings) candidates.push(...inv.fingerings);
    }
  }

  const seen = new Set<string>();
  const shapes: { frets: number[]; barre: any; score: number }[] = [];

  for (const f of candidates) {
    const frets: number[] = new Array(tuning.length).fill(-1);
    for (const p of f.positions) frets[p.stringIndex] = p.fret;

    const key = frets.join(",");
    if (seen.has(key)) continue;
    seen.add(key);

    const fretted = frets.filter((n) => n > 0);
    const open = frets.filter((n) => n === 0).length;
    const muted = frets.filter((n) => n === -1).length;
    if (fretted.length === 0 && open === 0) continue;
    const maxFret = Math.max(0, ...fretted);
    const minFret = fretted.length ? Math.min(...fretted) : 0;
    const span = fretted.length ? maxFret - minFret : 0;

    // Tocabilidade: span curto, posição baixa, cordas soltas são bem-vindas
    if (span > 3 || maxFret > 9) continue;
    if (maxFret > 5 && open > 0) continue; // posição alta com soltas não desloca
    const score = maxFret * 4 + span + fretted.length - open * 2 + muted * 3 + (f.barre ? 1 : 0);

    shapes.push({ frets, barre: f.barre ?? null, score });
  }

  shapes.sort((a, b) => a.score - b.score);

  // Variações "da mesma família" (iguais a menos de cordas abafadas, ex:
  // 0023 vs x023) não acrescentam nada — manter só a melhor de cada família.
  const sameFamily = (a: number[], b: number[]) =>
    a.every((v, i) => v === b[i] || v === -1 || b[i] === -1);
  const picked: typeof shapes = [];
  for (const s of shapes) {
    if (picked.some((p) => sameFamily(p.frets, s.frets))) continue;
    picked.push(s);
    if (picked.length === MAX_SHAPES) break;
  }

  return picked.map(({ frets, barre }) => {
    const fretted = frets.filter((n) => n > 0);
    const minFret = fretted.length ? Math.min(...fretted) : 1;
    const maxFret = Math.max(0, ...fretted);
    // Deslocar para baseFret quando o shape vive em casas altas (sem soltas)
    const shift = maxFret > 4 && !frets.includes(0);
    const baseFret = shift ? minFret : 1;
    const rel = frets.map((n) => (n > 0 ? n - baseFret + 1 : n));
    const barres = barre ? [barre.fret - baseFret + 1] : [];
    return { frets: rel, fingers: null, baseFret, barres };
  });
}

// ─── Teclado (acordeão): notas do acorde ───

const NATURAL_CHROMA: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

// Nome canónico por classe cromática (grafia standard, sem dobrados)
const CANONICAL_NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

// Normalizar qualquer grafia (incl. Fb, E#, C##, Bbb) para o nome canónico
export function normalizeNote(note: string): string | null {
  const m = note.match(/^([A-G])([#b]*)$/);
  if (!m) return null;
  let chroma = NATURAL_CHROMA[m[1]];
  for (const acc of m[2]) chroma += acc === "#" ? 1 : -1;
  return CANONICAL_NOTE[((chroma % 12) + 12) % 12];
}

export function computePianoShape(name: string): PianoShape | null {
  const c = findGuitarChord(name, GUITAR_TUNING);
  if (!c?.notes?.length) return null;

  const notes: (string | null)[] = c.notes.map((n: string) => normalizeNote(n));
  if (notes.some((n) => n === null)) {
    console.warn(`  piano: nota desconhecida em ${name}: ${c.notes.join(" ")}`);
    return null;
  }

  return { notes: notes as string[] };
}

// ─── Resolvers por instrumento (com fallbacks) ───

// Guitarra: slash → computado a honrar o baixo; senão chords-db; fallbacks
// para o acorde base e para o cálculo.
export function resolveGuitar(name: string): Shape[] | null {
  const { base, bass } = splitBass(name);
  if (bass) {
    const withBass = computeShapes(name, GUITAR_TUNING);
    if (withBass.length) return withBass;
  }
  const db = lookupDb(guitarDb, base);
  if (db) return db;
  const computed = computeShapes(base, GUITAR_TUNING);
  return computed.length ? computed : null;
}

// Instrumentos pequenos: baixo ignorado (acorde base); db (ukulele) ou
// cálculo, com fallback de um para o outro.
export function resolveUkulele(name: string): Shape[] | null {
  const { base } = splitBass(name);
  const db = lookupDb(ukuleleDb, base);
  if (db) return db;
  const computed = computeShapes(base, UKULELE_TUNING);
  return computed.length ? computed : null;
}

export function resolveMandolin(name: string): Shape[] | null {
  const { base } = splitBass(name);
  const s = computeShapes(base, MANDOLIN_TUNING);
  return s.length ? s : null;
}

export function resolveCavaquinho(name: string): Shape[] | null {
  const { base } = splitBass(name);
  const s = computeShapes(base, CAVAQUINHO_TUNING);
  return s.length ? s : null;
}

export function resolvePiano(name: string): PianoShape[] | null {
  const { base } = splitBass(name);
  const s = computePianoShape(base);
  return s ? [s] : null;
}

// ─── Overrides manuais ───

// chords/overrides.json: { "<instrumento>": { "<acorde>": [shapes] } }
// Merged por cima do que o seed resolve — é aqui que vivem as correcções
// manuais, para não se perderem quando o seed volta a correr.
function loadOverrides(): Record<string, Record<string, (Shape | PianoShape)[]>> {
  const p = path.join(CHORDS_DIR, "overrides.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ─── Main ───

function main() {
  const names = collectChords();
  console.log(`Acordes nas cifras (${names.length}): ${names.join("  ")}`);

  const overrides = loadOverrides();

  const instruments: { file: string; data: InstrumentChords; resolve: (n: string) => (Shape | PianoShape)[] | null }[] = [
    {
      file: "guitar.json",
      data: { instrument: "guitar", strings: 6, tuning: ["E", "A", "D", "G", "B", "E"], chords: {} },
      resolve: resolveGuitar,
    },
    {
      file: "ukulele.json",
      data: { instrument: "ukulele", strings: 4, tuning: ["G", "C", "E", "A"], chords: {} },
      resolve: resolveUkulele,
    },
    {
      file: "mandolin.json",
      data: { instrument: "mandolin", strings: 4, tuning: ["G", "D", "A", "E"], chords: {} },
      resolve: resolveMandolin,
    },
    {
      file: "cavaquinho.json",
      data: { instrument: "cavaquinho", strings: 4, tuning: ["G", "G", "B", "D"], chords: {} },
      resolve: resolveCavaquinho,
    },
    {
      file: "piano.json",
      data: { instrument: "piano", chords: {} },
      resolve: resolvePiano,
    },
  ];

  if (!fs.existsSync(CHORDS_DIR)) fs.mkdirSync(CHORDS_DIR, { recursive: true });

  for (const { file, data, resolve } of instruments) {
    const instOverrides = overrides[data.instrument] ?? {};
    const missing: string[] = [];
    for (const name of names) {
      const shapes = instOverrides[name] ?? resolve(normalizeChordName(name));
      if (shapes) data.chords[name] = shapes;
      else missing.push(name);
    }
    const outPath = path.join(CHORDS_DIR, file);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log(
      `${file}: ${Object.keys(data.chords).length}/${names.length} acordes` +
        (missing.length ? `  (em falta: ${missing.join(", ")})` : "")
    );
  }
}

if (require.main === module) {
  main();
}
