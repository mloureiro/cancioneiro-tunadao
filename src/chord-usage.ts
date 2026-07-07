import * as fs from "fs";
import * as path from "path";
import { parseSong } from "./parser";
import { isAppendixChord } from "./chord-diagrams";

// Mínimo de músicas (na colecção inteira) em que um acorde tem de aparecer
// para merecer um diagrama no apêndice. Acordes mais raros continuam a ser
// escritos por cima da letra — só não ganham entrada na tabela de acordes.
export const MIN_APPENDIX_SONGS = 3;

// Nº de músicas distintas que usam cada acorde de apêndice (baixo/parêntesis
// já excluídos). Conta uma vez por música, não por ocorrência.
export function chordSongCounts(cifrasBase: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sub of fs.readdirSync(cifrasBase)) {
    const dir = path.join(cifrasBase, sub);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
      const song = parseSong(path.join(dir, f));
      const inSong = new Set<string>();
      for (const part of song.parts)
        for (const sec of part.sections)
          for (const line of sec.lines)
            for (const c of line.chords ?? [])
              if (isAppendixChord(c.chord)) inSong.add(c.chord);
      for (const ch of inSong) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  return counts;
}

// Acordes que entram no apêndice: usados em pelo menos `min` músicas.
export function appendixChordSet(cifrasBase: string, min = MIN_APPENDIX_SONGS): Set<string> {
  const set = new Set<string>();
  for (const [ch, n] of chordSongCounts(cifrasBase)) if (n >= min) set.add(ch);
  return set;
}
