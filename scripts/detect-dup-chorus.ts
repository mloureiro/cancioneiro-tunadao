import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "cifras");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".txt")) out.push(p);
  }
  return out;
}

// linha que é APENAS uma tag de secção/instrução: ^[...]$ sem acordes a seguir
const TAG_ONLY = /^\[[^\]]+\]$/;
// tem letras (pelo menos 2 letras alfabéticas seguidas fora de []) -> conta como linha de letra
function hasLyric(line: string): boolean {
  const t = line.trim();
  if (t === "" || TAG_ONLY.test(t)) return false;
  // remover tokens de acorde comuns e ver se sobra texto
  const words = t.replace(/\*\*/g, "").split(/\s+/);
  // heurística: existe uma "palavra" com >=3 letras minúsculas seguidas
  return words.some((w) => /[a-záàâãéêíóôõúç]{3,}/i.test(w) && !/^[A-G][#b]?m?(7|maj7|sus\d?|dim|add\d|\d)?$/.test(w));
}

interface Cand { file: string; blockLines: string[]; count: number; }

const files = walk(ROOT);
const results: Cand[] = [];

for (const file of files) {
  const raw = fs.readFileSync(file, "utf-8");
  const lines = raw.split("\n");
  // saltar header YAML
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end !== -1) start = end + 1;
  }
  const body = lines.slice(start);

  // dividir em parágrafos por linhas em branco (=== também separa)
  const paras: string[][] = [];
  let cur: string[] = [];
  for (const l of body) {
    if (l.trim() === "" || l.trim() === "===") {
      if (cur.length) paras.push(cur), (cur = []);
    } else cur.push(l);
  }
  if (cur.length) paras.push(cur);

  // normalizar: remover linha-tag de topo, rstrip
  const norm = (p: string[]): { key: string; nLyric: number; nLines: number } => {
    let pp = [...p];
    while (pp.length && TAG_ONLY.test(pp[0].trim())) pp = pp.slice(1);
    const key = pp.map((l) => l.replace(/\s+$/, "")).join("\n");
    const nLyric = pp.filter(hasLyric).length;
    return { key, nLyric, nLines: pp.length };
  };

  const groups = new Map<string, { count: number; sample: string[]; nLyric: number; nLines: number }>();
  for (const p of paras) {
    const { key, nLyric, nLines } = norm(p);
    if (key.trim() === "") continue;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { count: 1, sample: p, nLyric, nLines });
  }

  for (const [, g] of groups) {
    // candidato: bloco com >=2 linhas de letra, repetido >=2x
    if (g.count >= 2 && g.nLyric >= 2 && g.nLines >= 2) {
      results.push({ file, blockLines: g.sample, count: g.count });
    }
  }
}

// ordenar por ficheiro
results.sort((a, b) => a.file.localeCompare(b.file));
const byFile = new Map<string, Cand[]>();
for (const r of results) {
  const arr = byFile.get(r.file) ?? [];
  arr.push(r);
  byFile.set(r.file, arr);
}

console.log(`CANDIDATE FILES: ${byFile.size}  (dup blocks: ${results.length})`);
console.log("---");
for (const [file, cands] of byFile) {
  const rel = path.relative(path.resolve(__dirname, ".."), file);
  console.log(`${rel}\t${cands.map((c) => `${c.count}x/${c.blockLines.filter(hasLyric).length}L`).join(", ")}`);
}
// dump JSON for the fan-out
fs.writeFileSync(
  path.resolve(__dirname, "..", "output", "dup-chorus-candidates.json"),
  JSON.stringify([...byFile.keys()].map((f) => path.relative(path.resolve(__dirname, ".."), f)), null, 2)
);
