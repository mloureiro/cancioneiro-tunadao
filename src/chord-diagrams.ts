import * as fs from "fs";
import * as path from "path";

// Banco de acordes (chords/*.json) — convenção chords-db:
// frets por corda (grave → agudo), -1 abafada, 0 solta, n = casa relativa a baseFret
export interface ChordShape {
  frets: number[];
  fingers: number[] | null;
  baseFret: number;
  barres: number[];
}

// Shape de teclado (piano/acordeão): notas do acorde, fundamental primeiro
export interface PianoShape {
  notes: string[];
}

export interface InstrumentChords {
  instrument: string;
  strings?: number;
  tuning?: string[];
  chords: Record<string, (ChordShape | PianoShape)[]>;
}

const CHORDS_DIR = path.resolve(__dirname, "../chords");

export interface AppendixInstrument {
  file: string;
  label: string;
  variations: number;
  kind: "strings" | "piano";
}

// Instrumentos no apêndice, por ordem de apresentação
export const APPENDIX_INSTRUMENTS: AppendixInstrument[] = [
  { file: "guitar.json", label: "Guitarra", variations: 4, kind: "strings" },
  { file: "cavaquinho.json", label: "Cavaquinho", variations: 2, kind: "strings" },
  { file: "mandolin.json", label: "Bandolim", variations: 2, kind: "strings" },
  { file: "ukulele.json", label: "Ukulele", variations: 2, kind: "strings" },
  { file: "piano.json", label: "Acordeão", variations: 1, kind: "piano" },
];

export function loadInstrument(file: string): InstrumentChords {
  return JSON.parse(fs.readFileSync(path.join(CHORDS_DIR, file), "utf-8"));
}

// Ordenação musical: por fundamental (C, C#, D, ...) e depois por sufixo
const ROOT_ORDER = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

export function chordSortKey(name: string): [number, string] {
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return [ROOT_ORDER.length, name];
  const idx = ROOT_ORDER.indexOf(m[1]);
  return [idx === -1 ? ROOT_ORDER.length : idx, m[2]];
}

export function sortChordNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const [ra, sa] = chordSortKey(a);
    const [rb, sb] = chordSortKey(b);
    return ra - rb || sa.localeCompare(sb);
  });
}

// Acordes que NÃO entram no apêndice (nem no banco de acordes):
//  - slash chords / baixo alterado (ex: "D/F#", "A7/5-") — nos instrumentos de
//    4 cordas e no teclado tocar-se-ia o acorde base, que já está na tabela;
//  - acordes com extensões entre parêntesis (ex: "A7(4)", "C7(9)") — notação
//    redundante que se reduz ao acorde base.
// Runs de notas ("(G A B)") também caem aqui por conterem "(".
export function isAppendixChord(name: string): boolean {
  return !name.includes("/") && !name.includes("(");
}

// Raízes enarmónicas: mesmo som, grafia diferente (D#≡Eb) → mesma pega em
// qualquer instrumento. Chave de agrupamento normaliza a raiz para bemol.
const ENHARMONIC_FLAT: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
};
function enharmonicKey(name: string): string {
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return name;
  return (ENHARMONIC_FLAT[m[1]] ?? m[1]) + m[2];
}

export interface ChordColumn {
  /** Rótulo do cabeçalho (ex: "D#/Eb"). */
  label: string;
  /** Grafias do grupo, por ordem de procura do shape (todas dão a mesma pega). */
  names: string[];
}

// Junta grafias enarmónicas numa só coluna do apêndice: um diagrama, rótulo
// com as grafias usadas (sustenido primeiro, "D#/Eb"). Colunas ordenadas como
// sortChordNames (pela grafia de sustenido).
export function mergeEnharmonicColumns(names: string[]): ChordColumn[] {
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const k = enharmonicKey(n);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(n);
  }
  const flatFirst = (n: string) => (/^[A-G]b/.test(n) ? 1 : 0);
  const cols = [...groups.values()].map((members) => {
    const ordered = [...members].sort((a, b) => flatFirst(a) - flatFirst(b));
    return { label: ordered.join("/"), names: ordered };
  });
  return cols.sort((a, b) => {
    const [ra, sa] = chordSortKey(a.names[0]);
    const [rb, sb] = chordSortKey(b.names[0]);
    return ra - rb || sa.localeCompare(sb);
  });
}

// Gerar a chamada chordx `chart-chord` para um shape (sem nome — o nome do
// acorde vive no cabeçalho da tabela do apêndice).
// tabs/fingers/capos seguem a convenção chordx: chars da corda mais grave para
// a mais aguda; cordas cobertas só pela barra levam "n" e a barra vai em capos
// ("<casa><corda-de><corda-até>", cordas numeradas 1 = mais aguda).
export function chartChordCall(shape: ChordShape): string {
  const n = shape.frets.length;
  const barreFret = shape.barres[0];

  const tabsChars = shape.frets.map((f) => {
    if (f === -1) return "x";
    if (f === 0) return "o";
    if (barreFret !== undefined && f === barreFret) return "n";
    return String(f);
  });

  const fingersChars = shape.frets.map((_, i) => {
    const fg = shape.fingers?.[i] ?? 0;
    return fg > 0 ? String(fg) : "n";
  });

  const args = [`tabs: "${tabsChars.join("")}"`, `fingers: "${fingersChars.join("")}"`];

  if (barreFret !== undefined) {
    const covered = shape.frets
      .map((f, i) => (f === barreFret ? i : -1))
      .filter((i) => i !== -1);
    const from = n - Math.max(...covered);
    const to = n - Math.min(...covered);
    args.push(`capos: "${barreFret}${from}${to}"`);
  }

  if (shape.baseFret > 1) {
    args.push(`fret: ${shape.baseFret}`);
  }

  return `chart-chord-d(${args.join(", ")})[]`;
}

// Gerar a chamada `mini-piano` (função definida no .typ gerado) para um shape
// de teclado. O teclado desenhado tem 8 teclas brancas a começar na natural da
// fundamental (uma oitava inclusiva) — qualquer acorde cabe sempre.
// - pw: índices (0-7) das teclas brancas premidas
// - blacks: pares (posição, premida) — posição = fronteira entre brancas (1-7)
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_CHROMA: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHROMA: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6,
  Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

// Botão de qualidade nos baixos Stradella (índices: 2=Maior, 3=menor,
// 4=sétima, 5=diminuto); null se a qualidade não tiver botão próprio.
// O baixo de slash chords é ignorado (toca-se o acorde base).
export function stradellaQuality(name: string): number | null {
  const suffix = name.split("/")[0].replace(/^[A-G][#b]?/, "");
  if (suffix === "" || suffix === "maj") return 2;
  if (suffix === "m" || suffix === "min") return 3;
  if (suffix === "7") return 4;
  if (suffix === "dim" || suffix === "dim7") return 5;
  return null;
}

export function miniPianoCall(shape: PianoShape, name: string): string {
  const root = shape.notes[0];
  // Janela de 8 brancas a partir da natural da fundamental; se a fundamental
  // for bemol (Bb), começa uma letra abaixo para a tecla preta ficar dentro.
  let startIdx = LETTERS.indexOf(root[0]);
  if (root.includes("b")) startIdx = (startIdx + 6) % 7;
  const base = NATURAL_CHROMA[LETTERS[startIdx]];

  // Offsets cromáticos (0-12) das 8 teclas brancas da janela
  const whiteOff: number[] = [0];
  for (let i = 1; i < 8; i++) {
    const prev = NATURAL_CHROMA[LETTERS[(startIdx + i - 1) % 7]];
    const curr = NATURAL_CHROMA[LETTERS[(startIdx + i) % 7]];
    whiteOff.push(whiteOff[i - 1] + ((curr - prev + 12) % 12));
  }
  // Teclas pretas: nas fronteiras entre brancas separadas por 2 meios-tons
  const blacks = whiteOff
    .slice(0, -1)
    .map((off, i) => ({ pos: i + 1, off: off + 1, gap: whiteOff[i + 1] - off }))
    .filter((b) => b.gap === 2);

  const pressedWhite: number[] = [];
  const pressedBlack = new Set<number>();
  for (const note of shape.notes) {
    const off = (CHROMA[note] - base + 12) % 12;
    const wIdx = whiteOff.indexOf(off);
    if (wIdx !== -1) pressedWhite.push(wIdx);
    else if (blacks.some((b) => b.off === off)) pressedBlack.add(off);
    else console.warn(`  mini-piano: nota ${note} sem tecla na janela de ${root}`);
  }

  const pwStr = `(${pressedWhite.join(", ")}${pressedWhite.length === 1 ? "," : ""})`;
  const blacksStr = `(${blacks
    .map((b) => `(${b.pos}, ${pressedBlack.has(b.off)})`)
    .join(", ")}${blacks.length === 1 ? "," : ""})`;

  const piano = `mini-piano(pw: ${pwStr}, blacks: ${blacksStr})`;
  const quality = stradellaQuality(name);
  const buttons = `stradella(quality: ${quality ?? "none"})`;
  return `stack(dir: ttb, spacing: 2.5pt, ${piano}, ${buttons})`;
}
