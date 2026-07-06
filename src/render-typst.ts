import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { parse as parseYaml } from "yaml";
import { parseSong } from "./parser";
import { Song } from "./types";
import { Layout, BookSection } from "./layouts/layout";

// --- Configuração ---
const BOOKS_DIR = path.resolve(__dirname, "../books");
const ASSETS_DIR = path.resolve(__dirname, "../assets");
const OUTPUT_DIR = path.resolve(__dirname, "../output");
const TYPST_DIR = path.resolve(__dirname, "../typst");
const FONTS_DIR = path.resolve(TYPST_DIR, "fonts");
const LAYOUTS_DIR = path.resolve(__dirname, "layouts");
const PROJECT_ROOT = path.resolve(__dirname, "..");

const PAGE_SIZES = ["a5", "a4"] as const;

// Um livro é definido por books/<nome>.yaml.
// Secções normalizadas: um livro simples (`songs:`) vira uma secção sem nome.
interface RawSection { name: string; songs: string[] }
interface BookManifest {
  title: string;
  header: string;
  logo: string;
  formats: ("a5" | "a4")[];
  sections: RawSection[];
  hasNamedSections: boolean;
}

function loadBookManifest(filePath: string): BookManifest {
  const raw = (parseYaml(fs.readFileSync(filePath, "utf-8")) ?? {}) as any;
  const name = path.basename(filePath).replace(/\.ya?ml$/, "");
  if (!raw.title) throw new Error(`${name}: falta 'title'`);

  let sections: RawSection[];
  let hasNamedSections = false;
  if (Array.isArray(raw.sections) && raw.sections.length) {
    hasNamedSections = true;
    sections = raw.sections.map((s: any, i: number) => {
      if (!s || !Array.isArray(s.songs) || !s.songs.length) {
        throw new Error(`${name}: secção ${i + 1} precisa de 'songs' (lista não vazia)`);
      }
      return { name: String(s.name ?? ""), songs: s.songs as string[] };
    });
  } else if (Array.isArray(raw.songs) && raw.songs.length) {
    sections = [{ name: "", songs: raw.songs as string[] }];
  } else {
    throw new Error(`${name}: precisa de 'songs' ou 'sections'`);
  }

  return {
    title: raw.title,
    header: raw.header ?? raw.title,
    logo: raw.logo ?? "tunadao-logo.png",
    formats: Array.isArray(raw.formats) && raw.formats.length ? raw.formats : ["a5", "a4"],
    sections,
    hasNamedSections,
  };
}

// Expande caminhos e globs simples (1 nível, *) para ficheiros, por ordem e
// sem duplicados. `seen` é partilhado por livro (uma música não repete).
function resolveSongPaths(entries: string[], seen: Set<string>, bookName: string): string[] {
  const out: string[] = [];
  const add = (abs: string) => { if (!seen.has(abs)) { seen.add(abs); out.push(abs); } };
  for (const entry of entries) {
    if (entry.includes("*")) {
      const dir = path.resolve(PROJECT_ROOT, path.dirname(entry));
      const rx = new RegExp("^" + path.basename(entry).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      if (!fs.existsSync(dir)) throw new Error(`${bookName}: pasta não existe: ${entry}`);
      fs.readdirSync(dir)
        .filter(f => rx.test(f))
        .sort((a, b) => a.localeCompare(b, "pt"))
        .forEach(f => add(path.join(dir, f)));
    } else {
      const abs = path.resolve(PROJECT_ROOT, entry);
      if (!fs.existsSync(abs)) throw new Error(`${bookName}: ficheiro não existe: ${entry}`);
      add(abs);
    }
  }
  return out;
}

// Descobrir layouts em src/layouts/ (cada módulo exporta default um Layout).
// Filtrável via env LAYOUT (lista separada por vírgulas), ex: LAYOUT=v2
function loadLayouts(): Layout[] {
  const filter = process.env.LAYOUT
    ? process.env.LAYOUT.split(",").map(s => s.trim()).filter(Boolean)
    : null;

  const layouts = fs.readdirSync(LAYOUTS_DIR)
    .filter(f => /\.ts$/.test(f) && f !== "layout.ts" && !f.endsWith(".test.ts"))
    .map(f => {
      const mod = require(path.join(LAYOUTS_DIR, f));
      const layout: Layout = mod.default ?? mod;
      if (!layout || typeof layout.generate !== "function" || !layout.name) {
        throw new Error(`Módulo de layout inválido: ${f} (esperado default export com { name, generate })`);
      }
      return layout;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = filter ? layouts.filter(l => filter.includes(l.name)) : layouts;
  if (selected.length === 0) {
    console.error(filter
      ? `Nenhum layout corresponde a LAYOUT=${process.env.LAYOUT} (disponíveis: ${layouts.map(l => l.name).join(", ")})`
      : "Nenhum layout encontrado em src/layouts/");
    process.exit(1);
  }
  return selected;
}

function compileTypst(typPath: string, pdfPath: string) {
  execSync(`typst compile --root "${PROJECT_ROOT}" --font-path "${FONTS_DIR}" "${typPath}" "${pdfPath}"`, {
    stdio: "inherit",
  });
}

// --- Main ---
function main() {
  const runNumber = process.env.CANCIONEIRO_VERSION;
  const version = runNumber ? `${new Date().getFullYear()}.${runNumber}` : "dev";
  console.log(`Versão: ${version}`);

  const layouts = loadLayouts();
  console.log(`Layouts: ${layouts.map(l => l.name).join(", ")}`);

  // Cada books/<nome>.yaml é um cancioneiro separado
  if (!fs.existsSync(BOOKS_DIR)) {
    console.error(`Pasta de livros não encontrada: ${BOOKS_DIR}`);
    process.exit(1);
  }
  const manifests = fs.readdirSync(BOOKS_DIR).filter(f => /\.ya?ml$/.test(f)).sort();
  if (manifests.length === 0) {
    console.error("Nenhum manifesto de livro encontrado em books/");
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const manifestFile of manifests) {
    const name = manifestFile.replace(/\.ya?ml$/, "");
    const book = loadBookManifest(path.join(BOOKS_DIR, manifestFile));

    const seen = new Set<string>();
    const parsedSections: BookSection[] = book.sections.map(sec => ({
      name: sec.name,
      songs: resolveSongPaths(sec.songs, seen, name).map(fp => parseSong(fp)),
    }));
    const songs: Song[] = parsedSections.flatMap(s => s.songs);
    const sections = book.hasNamedSections ? parsedSections : undefined;

    console.log(`\n=== Livro: ${name} — "${book.title}" (${songs.length} cifras${book.hasNamedSections ? `, ${parsedSections.length} secções` : ""}) ===`);

    const logoPath = path.resolve(ASSETS_DIR, book.logo);
    const logoRelPath = path.relative(TYPST_DIR, logoPath).replace(/\\/g, "/");

    for (const layout of layouts) {
      for (const pageSize of PAGE_SIZES) {
        const typ = layout.generate({
          songs,
          sections,
          pageSize,
          displayName: book.title,
          headerTitle: book.header,
          logoRelPath,
          version,
        });

        // Com um único layout, nomes limpos (sem o segmento do layout)
        const baseName = layouts.length === 1
          ? `cancioneiro-${name}-${pageSize}`
          : `cancioneiro-${name}-${layout.name}-${pageSize}`;
        const typPath = path.join(TYPST_DIR, `${baseName}.typ`);
        const pdfPath = path.join(OUTPUT_DIR, `${baseName}.pdf`);

        fs.writeFileSync(typPath, typ, "utf-8");

        console.log(`A compilar ${baseName}...`);
        try {
          compileTypst(typPath, pdfPath);
          console.log(`PDF gerado: ${pdfPath}`);
        } catch (e) {
          console.error(`Erro a compilar ${baseName}:`, (e as Error).message);
          process.exit(1);
        }
      }
    }
  }

  console.log("\nDone! PDFs gerados em output/");
}

main();
