// Preview rápido de UMA cifra: gera 1 PDF (A5) a partir de um .txt.
//   npx tsx scripts/preview.ts "cifras/fados/Fado Hilário.txt" [afinação]
// O 2º argumento opcional injecta o campo `afinação` (para testar a etiqueta).
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { parseSong } from "../src/parser";
import layout from "../src/layouts/v2";
import { appendixChordSet } from "../src/chord-usage";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TYPST_DIR = path.join(PROJECT_ROOT, "typst");
const FONTS_DIR = path.join(TYPST_DIR, "fonts");

const file = process.argv[2];
if (!file) throw new Error("Uso: tsx scripts/preview.ts <ficheiro.txt> [afinação]");
const afinacao = process.argv[3];

const song = parseSong(path.resolve(PROJECT_ROOT, file));
if (afinacao) song.metadata.afinacao = afinacao;

const logoRel = path
  .relative(TYPST_DIR, path.join(PROJECT_ROOT, "assets", "tunadao-logo.png"))
  .replace(/\\/g, "/");

const typ = layout.generate({
  songs: [song],
  sections: undefined,
  pageSize: "a5",
  displayName: "Preview",
  headerTitle: "Preview",
  logoRelPath: logoRel,
  version: "dev",
  appendixChords: appendixChordSet(path.join(PROJECT_ROOT, "cifras")),
});

const typPath = path.join(TYPST_DIR, "_preview.typ");
const pdfPath = path.join(PROJECT_ROOT, "output", "_preview.pdf");
fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
fs.writeFileSync(typPath, typ, "utf-8");
try {
  execSync(
    `typst compile --root "${PROJECT_ROOT}" --font-path "${FONTS_DIR}" "${typPath}" "${pdfPath}"`,
    { stdio: "inherit" },
  );
  console.log(`OK → ${pdfPath}`);
} finally {
  fs.rmSync(typPath, { force: true });
}
