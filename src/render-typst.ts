import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { parseSong } from "./parser";
import { Song } from "./types";
import { Layout } from "./layouts/layout";

// --- Configuração ---
const CIFRAS_BASE = path.resolve(__dirname, "../cifras");
const OUTPUT_DIR = path.resolve(__dirname, "../output");
const TYPST_DIR = path.resolve(__dirname, "../typst");
const FONTS_DIR = path.resolve(TYPST_DIR, "fonts");
const LAYOUTS_DIR = path.resolve(__dirname, "layouts");
const PROJECT_ROOT = path.resolve(__dirname, "..");

const PAGE_SIZES = ["a5", "a4"] as const;

// Metadata por cancioneiro (chave = nome do subdirectório em cifras/)
const CANCIONEIRO_META: Record<string, { displayName: string; headerTitle: string; logoFile: string }> = {
  tunadao: { displayName: "Cancioneiro Tunadão 1998", headerTitle: "Tunadão 1998", logoFile: "tunadao-logo.png" },
  portugues: { displayName: "Cancioneiro de Música Portuguesa", headerTitle: "Músicas Portuguesas", logoFile: "tunadao-logo.png" },
};

// Fallback para cancioneiros sem metadata explícita
function getCancioneiroMeta(subdir: string) {
  return CANCIONEIRO_META[subdir] ?? {
    displayName: `Cancioneiro ${subdir.charAt(0).toUpperCase() + subdir.slice(1)}`,
    headerTitle: subdir.charAt(0).toUpperCase() + subdir.slice(1),
    logoFile: "tunadao-logo.png",
  };
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
    const logoRelPath = path.relative(TYPST_DIR, logoPath).replace(/\\/g, "/");

    const songs: Song[] = files.map(f => {
      const filePath = path.join(cifrasDir, f);
      return parseSong(filePath);
    });

    for (const layout of layouts) {
      for (const pageSize of PAGE_SIZES) {
        const typ = layout.generate({
          songs,
          pageSize,
          displayName: meta.displayName,
          headerTitle: meta.headerTitle,
          logoRelPath,
          version,
        });

        // Com um único layout, nomes limpos (sem o segmento do layout)
        const baseName = layouts.length === 1
          ? `cancioneiro-${subdir}-${pageSize}`
          : `cancioneiro-${subdir}-${layout.name}-${pageSize}`;
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
