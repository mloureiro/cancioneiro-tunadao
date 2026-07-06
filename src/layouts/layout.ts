import { Song } from "../types";

// Uma secção nomeada dentro de um cancioneiro (ex: "Fados", "Tunas").
export interface BookSection {
  name: string;
  songs: Song[];
}

// Input passado a cada layout para gerar um ficheiro .typ.
export interface LayoutInput {
  /** Todas as músicas do livro, por ordem (concatenação das secções). */
  songs: Song[];
  /**
   * Secções nomeadas do livro. Se ausente/vazio, o livro é uma lista simples
   * (sem divisórias nem índice agrupado).
   */
  sections?: BookSection[];
  pageSize: "a5" | "a4";
  /** Nome completo do cancioneiro, ex: "Cancioneiro Tunadão 1998" */
  displayName: string;
  /** Título curto para headers, ex: "Tunadão 1998" */
  headerTitle: string;
  /** Caminho do logo relativo ao directório typst/ (onde vive o .typ) */
  logoRelPath: string;
  /** Versão a mostrar (ex: "2026.42" ou "dev") */
  version: string;
}

// Cada módulo em src/layouts/ (excepto este) exporta default um Layout.
//
// Contrato que todos os layouts devem respeitar:
// - Capa com logo, nome do cancioneiro e versão.
// - Índice alfabético com números de página correctos.
// - Impressão em livro (frente/verso): margens espelhadas (inside/outside),
//   headers/footers diferenciados para páginas pares/ímpares.
// - Respeitar `song.metadata.colunas` (1 = coluna única, default 2).
//   Mudar de modo de colunas deve quebrar página.
// - Se `sections` for fornecido (secções nomeadas), mostrar uma divisória por
//   secção e agrupar o índice por secção. Caso contrário, lista simples.
// - Apêndice "Acordes" no fim (com entrada no índice): diagramas dos acordes
//   usados, por instrumento (dados em chords/, helpers em src/chord-diagrams.ts).
// - Fonts custom vão em typst/fonts/ (o build passa --font-path).
export interface Layout {
  /** Identificador usado nos nomes de ficheiros (kebab-case). */
  name: string;
  /** Descrição curta da identidade visual. */
  description: string;
  generate(input: LayoutInput): string;
}
