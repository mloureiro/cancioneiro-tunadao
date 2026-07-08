import * as fs from "fs";
import {
  Song,
  SongPart,
  Section,
  SongLine,
  ChordPosition,
} from "./types";

// Gramática de acordes, montada de peças partilhadas para que a detecção
// (`CHORD_TOKEN_RE`, ancorada) e a extracção (`CHORD_EXTRACT_RE`, global)
// nunca divirjam. Aceita, além do básico:
//  - modificador depois do número: E7sus4, E7dim, Amaj7sus4
//  - alteração entre parêntesis: Dm7(b5), G7(#5), C6(11+), D7(9-/13), Am(maj7)
//  - alteração colada: F#m7b5, D7#9, E7b13, Bbm#5
//  - aumentado com "+": G7+, B+, B5+
//  - notação brasileira (D7M, C#m7/5-, D7/9), baixo alterado (G6/D),
//    baixo entre parêntesis (Em(E) — descendente) e baixo com alteração (E7/b9)
const NOTE = String.raw`[A-G][#b]?`;
// Grupo entre parêntesis: (maj7) ou alterações numéricas — (b5) (#5) (9) (13) (5-) (11+) (9-/13) (4)
const PAREN_MOD = String.raw`\((?:maj7|[0-9#b+\-\/]+)\)`;
// Um sufixo de acorde (qualidade, número, alteração, M, ou grupo entre parêntesis)
const CHORD_SUFFIX = String.raw`(?:maj|min|dim|aug|sus|add|m|M|[0-9]+|[#b][0-9]+|[0-9]+[#b+\-]|[+\-]|${PAREN_MOD})`;
// Baixo: /nota ou /alteração (ex: C#m7/5-, E7/b9)
const CHORD_BASS = String.raw`(?:\/(?:${NOTE}|[#b]?[0-9]+[#b+\-]?))`;
// Baixo descendente entre parêntesis (ex: Em(E))
const CHORD_PARBASS = String.raw`(?:\(${NOTE}\))`;
const CHORD_CORE = `${NOTE}${CHORD_SUFFIX}*${CHORD_BASS}?${CHORD_PARBASS}?`;

const CHORD_TOKEN_RE = new RegExp(`^${CHORD_CORE}$`);

// Tokens decorativos permitidos numa linha de acordes: repetições
// ("x2", "2x", "(x2)", "(2x)", "(bis)"), separadores soltos ("-", "|")
// e baixos soltos ("/G" — ex: "D /G").
const CHORD_DECORATION_RE = /^(\(?\d+x\)?|\(?x\d+\)?|\(?bis\)?|[-|]|\/[A-G][#b]?)$/i;

/**
 * Verifica se uma linha contém APENAS acordes (sem letras).
 * Tolera espaços, vírgulas, indicações de repetição ("x2", "(2x)", "(bis)")
 * e chaves/separadores de repetição.
 */
function isChordLine(line: string): boolean {
  // Linha vazia não é linha de acordes
  if (line.trim() === "") return false;

  // Remover chaves de repetição e tratar vírgulas, parêntesis rectos de
  // agrupamento (ex: "[E Am] x2") e parêntesis de runs de notas
  // (ex: "G (G A B)") como separadores. Nota: parêntesis colados ao acorde
  // ("Em(E)") fazem parte do token e não são separados.
  let cleaned = line
    .replace(/[{}]\s*\d*x?\s*$/i, "")
    .replace(/(?<=^|[\s,])\(([^()]*)\)/g, " $1 ")
    .replace(/[,\[\]]/g, " ")
    .trim();
  if (cleaned === "") return false;

  // Separar em tokens; ignorar decorações, exigir pelo menos um acorde
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  const chordTokens = tokens.filter((t) => !CHORD_DECORATION_RE.test(t));
  if (chordTokens.length === 0) return false;

  return chordTokens.every((t) => CHORD_TOKEN_RE.test(t));
}

/**
 * Extrai as posições dos acordes de uma linha de acordes.
 * A posição é o índice do caractere onde o acorde começa.
 */
function extractChordPositions(chordLine: string): ChordPosition[] {
  const positions: ChordPosition[] = [];

  // 1º passo: runs de notas entre parêntesis soltos (ex: "G (G A B)",
  // "D (C# C) Bm") ficam como UM elemento — preservam os parêntesis na
  // renderização e não geram acordes individuais. Parêntesis colados ao
  // acorde ("Em(E)") não contam — fazem parte do token.
  let masked = chordLine;
  const groupRe = /(?<=^|[\s,])\(([^()]*)\)/g;
  let gm: RegExpExecArray | null;
  while ((gm = groupRe.exec(chordLine)) !== null) {
    const inner = gm[1].split(/[\s,]+/).filter((t) => t.length > 0);
    const isNoteRun =
      inner.some((t) => CHORD_TOKEN_RE.test(t)) &&
      inner.every((t) => CHORD_TOKEN_RE.test(t) || CHORD_DECORATION_RE.test(t));
    if (!isNoteRun) continue;
    positions.push({ chord: gm[0], position: gm.index });
    masked =
      masked.slice(0, gm.index) +
      " ".repeat(gm[0].length) +
      masked.slice(gm.index + gm[0].length);
  }

  // 2º passo: acordes normais no resto da linha. O baixo entre parêntesis
  // (ex: "Em(E)") é consumido pelo match (para não gerar um acorde
  // fantasma), mas removido do nome — o apêndice só conhece o acorde base.
  const re = new RegExp(CHORD_CORE, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(masked)) !== null) {
    positions.push({
      chord: match[0].replace(/\([A-G][#b]?\)$/, ""),
      position: match.index,
    });
  }

  return positions.sort((a, b) => a.position - b.position);
}

/**
 * Verifica se uma linha está em bold (entre **).
 * Retorna o texto limpo (sem **) e se está em bold.
 */
function parseBold(line: string): { text: string; isBold: boolean } {
  const stripped = line.replace(/\*\*/g, "");
  const isBold = line.includes("**");
  return { text: stripped, isBold };
}

/**
 * Verifica se uma linha é uma instrução (ex: [SOBE UM TOM], [Repete 2x], etc.)
 */
function isInstruction(line: string): string | null {
  const trimmed = line.trim();
  // Runs de acordes agrupados (ex: "[E Am] x2") não são instruções
  if (isChordLine(trimmed)) return null;
  // Instruções entre [] que não são secções standard
  const match = trimmed.match(/^\[(.+)\]$/);
  if (match) {
    const content = match[1];
    // Não é secção se contiver espaços e palavras tipo "Repete", "Param", "SOBE", etc.
    // ou se for referência a anexo, ou instrução musical
    const sectionNames = [
      "INTRO", "REFRÃO", "REFRAO", "PASSAGEM", "SOLO",
      "INST", "INSTR.", "INSTRUMENTAL", "SAÍDA", "SAIDA", "SOLISTA", "/SOLISTA",
    ];
    // Secções com conteúdo extra (ex: [PASSAGEM] ou [SAÍDA] seguidos de acordes)
    // são tratadas como secções, não instruções
    if (sectionNames.includes(content.toUpperCase())) {
      return null;
    }
    return content;
  }
  return null;
}

/**
 * Parse do header YAML (entre ---).
 */
function parseYamlHeader(lines: string[]): {
  metadata: Song["metadata"];
  restIndex: number;
} {
  if (lines[0]?.trim() !== "---") {
    throw new Error("Ficheiro de cifra deve começar com ---");
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error("Header YAML não fechado (falta segundo ---)");
  }

  const metadata: Record<string, string> = {};
  for (let i = 1; i < endIndex; i++) {
    const colonIdx = lines[i].indexOf(":");
    if (colonIdx !== -1) {
      const key = lines[i].substring(0, colonIdx).trim();
      const value = lines[i].substring(colonIdx + 1).trim();
      metadata[key] = value;
    }
  }

  const colunas = metadata["colunas"]
    ? parseInt(metadata["colunas"], 10)
    : undefined;

  return {
    metadata: {
      titulo: metadata["titulo"] || "",
      tom: metadata["tom"] || "",
      artista: metadata["artista"],
      subtitulo: metadata["subtitulo"],
      afinacao: metadata["afinação"] || metadata["afinacao"] || undefined,
      colunas: colunas === 1 || colunas === 2 ? colunas : undefined,
    },
    restIndex: endIndex + 1,
  };
}

/**
 * Determina se uma secção type indica refrão. Reconhece a família completa
 * (com qualificador: "REFRÃO 2x", "REFRÃO vozes", "1º Refrão", "Refrão - X"),
 * em sincronia com a classificação do layout — para que a regra "linha em
 * branco fecha o refrão" também se aplique a estes. "Pré-Refrão" NÃO é refrão.
 */
function isSectionChorus(type: string): boolean {
  const t = type.trim();
  if (/^pr[eé]/i.test(t)) return false;
  return /^(\d+º\s*)?refr[ãa]o\b/i.test(t);
}

/**
 * Determina se uma secção type é da família refrão OU pré-refrão. Usado para
 * detectar remissões "vazias": um [REFRÃO]/[PRÉ-REFRÃO] sem conteúdo próprio
 * (linha em branco logo a seguir) é uma referência ao refrão já mostrado, não
 * um cabeçalho que agrupa o verso seguinte.
 */
function isChorusFamilyTag(type: string): boolean {
  const t = type.trim();
  if (/^pr[eé]-?\s*refr[ãa]o\b/i.test(t)) return true;
  return isSectionChorus(t);
}

/**
 * Verifica se uma linha é o início de um marcador [parte: ...] ou [tom: ...]
 */
function parsePartMetadata(
  line: string
): { key: string; value: string } | null {
  const match = line.trim().match(/^\[(parte|tom):\s*(.+)\]$/i);
  if (match) {
    return { key: match[1].toLowerCase(), value: match[2].trim() };
  }
  return null;
}

/**
 * Verifica se uma linha é separador de medley (===).
 */
function isMedleySeparator(line: string): boolean {
  return line.trim() === "===";
}

// Nomes de secções conhecidas que agrupam linhas
const KNOWN_SECTION_NAMES = new Set([
  "INTRO", "REFRÃO", "REFRAO", "PASSAGEM", "SOLO",
  "INST", "INSTR.", "SAÍDA", "SAIDA", "SOLISTA", "/SOLISTA",
]);

/**
 * Detecta se uma linha é um cabeçalho de secção (agrupa linhas).
 * Apenas secções conhecidas ou secções com conteúdo inline (acordes).
 * Tudo o resto em [...] é instrução.
 */
function parseSectionHeader(
  line: string
): { sectionType: string; label?: string; inlineContent?: string } | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return null;

  const raw = match[1];
  const after = match[2].trim();

  // Metadata: [parte: X], [tom: X] — não é secção
  if (/^(parte|tom):/i.test(raw)) return null;

  // Run de acordes agrupados (ex: "[E Am] x2", "[G7 C E Am] x2") — não é
  // secção; será tratado como linha de acordes
  if (isChordLine(trimmed)) return null;

  // Secções conhecidas
  if (KNOWN_SECTION_NAMES.has(raw.toUpperCase())) {
    return {
      sectionType: raw,
      inlineContent: after || undefined,
    };
  }

  // Secção com conteúdo inline (acordes depois do ]) — é secção
  if (after && isChordLine(after)) {
    return {
      sectionType: raw,
      inlineContent: after,
    };
  }

  // Se é ALL CAPS e não contém palavras-chave de instrução, tratar como secção custom
  // Ex: [PÕE A MÃO NA CABECINHA] é sub-música, funciona como secção
  const instructionKeywords = [
    "SOBE", "REPETE", "PARAM", "CONCLUSÃO", "ANEXO", "SAÍDA PARA",
    "Repete", "Param",
  ];
  const isInstructionLike = instructionKeywords.some((kw) =>
    raw.toUpperCase().includes(kw.toUpperCase())
  );
  if (isInstructionLike) {
    return null; // é instrução
  }

  // Secção custom (sub-música, etc.)
  return { sectionType: raw };
}

/**
 * Processa as linhas de uma parte (entre medley separators ou do ficheiro inteiro).
 * Retorna as sections da parte.
 */
function parsePartLines(lines: string[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let inSolista = false;
  let solistaSection: Section | null = null;
  let i = 0;

  function ensureSection(): Section {
    if (!currentSection) {
      currentSection = {
        type: "",
        isChorus: false,
        lines: [],
      };
      sections.push(currentSection);
    }
    return currentSection;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Metadata de parte (já processada externamente)
    const partMeta = parsePartMetadata(line);
    if (partMeta) {
      i++;
      continue;
    }

    // Nota livre (ex: "> o baixo desce meio tom") — texto auxiliar do autor,
    // renderizado como instrução (itálico, discreto)
    if (trimmed.startsWith("> ")) {
      const sec = ensureSection();
      sec.lines.push({
        type: "instruction",
        instruction: trimmed.slice(2).trim(),
      });
      i++;
      continue;
    }

    // Início de bloco Solista
    if (trimmed === "[SOLISTA]") {
      inSolista = true;
      solistaSection = {
        type: "SOLISTA",
        isChorus: false,
        lines: [],
      };
      sections.push(solistaSection);
      i++;
      continue;
    }

    // Fim de bloco Solista
    if (trimmed === "[/SOLISTA]") {
      inSolista = false;
      solistaSection = null;
      currentSection = null;
      i++;
      continue;
    }

    // Dentro de bloco solista - tudo é texto/instrução
    if (inSolista && solistaSection) {
      if (trimmed === "") {
        solistaSection.lines.push({ type: "empty" });
      } else {
        // No solista, acordes aparecem entre parêntesis inline ex: (Em)
        solistaSection.lines.push({
          type: "lyrics",
          lyrics: trimmed,
        });
      }
      i++;
      continue;
    }

    // Detectar cabeçalho de secção
    const sectionHeader = parseSectionHeader(line);
    if (sectionHeader) {
      const isChorus = isSectionChorus(sectionHeader.sectionType);
      currentSection = {
        type: sectionHeader.sectionType,
        isChorus,
        lines: [],
      };
      sections.push(currentSection);

      // Se tem conteúdo inline (ex: acordes de INTRO)
      if (sectionHeader.inlineContent) {
        const inlineText = sectionHeader.inlineContent;
        currentSection.lines.push({
          type: "chords-only",
          chords: extractChordPositions(inlineText),
          lyrics: inlineText,
        });
      }

      i++;

      // Verificar linhas de continuação (indentadas, sem [] prefix).
      // A indentação alinha-as com o conteúdo inline a seguir a "[Inst] ",
      // que desaparece na renderização — por isso são emitidas sem indent.
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        // Continuação: linha indentada com espaços que é chord-only
        if (
          nextTrimmed !== "" &&
          /^ {4,}/.test(nextLine) &&
          !nextTrimmed.startsWith("[") &&
          isChordLine(nextTrimmed)
        ) {
          // Se a linha seguinte for letra, isto é um par acorde+letra do
          // corpo da secção — não consumir como continuação
          const after = lines[i + 1];
          const afterTrimmed = after?.trim() ?? "";
          if (
            after !== undefined &&
            afterTrimmed !== "" &&
            !isChordLine(after) &&
            !parseSectionHeader(after) &&
            !isMedleySeparator(after) &&
            !isInstruction(after)
          ) {
            break;
          }
          currentSection.lines.push({
            type: "chords-only",
            chords: extractChordPositions(nextTrimmed),
            lyrics: nextTrimmed,
          });
          i++;
        } else {
          break;
        }
      }

      // Remissão de refrão/pré-refrão "vazia": um [REFRÃO] ou [PRÉ-REFRÃO] sem
      // conteúdo próprio (linha em branco logo a seguir, ou fim de ficheiro) é
      // uma referência ao refrão já mostrado — fecha-se de imediato para o
      // verso seguinte não ser absorvido como parte do refrão.
      if (
        isChorusFamilyTag(sectionHeader.sectionType) &&
        currentSection.lines.length === 0
      ) {
        const next = lines[i];
        if (next === undefined || next.trim() === "") {
          currentSection = null;
        }
      }
      continue;
    }

    // Instrução entre [] (não secção)
    const instruction = isInstruction(line);
    if (instruction) {
      const sec = ensureSection();
      sec.lines.push({
        type: "instruction",
        instruction,
      });
      i++;
      continue;
    }

    // Linhas de passagem com conteúdo formatado (ex: "Pulp Fiction   A# A ...")
    // Estas aparecem como continuação de uma secção PASSAGEM

    // Linha vazia. Numa secção-refrão, a linha em branco FECHA o refrão —
    // o conteúdo a seguir volta a ser verso normal (não-bold), sem precisar
    // de tag de fecho no ficheiro (as cifras ficam simples). Nas restantes
    // secções, a linha em branco é apenas espaçamento interno.
    if (trimmed === "") {
      if (currentSection) {
        const hasContent = currentSection.lines.some((l) => l.type !== "empty");
        currentSection.lines.push({ type: "empty" });
        if (currentSection.isChorus && hasContent) {
          currentSection = null;
        }
      }
      i++;
      continue;
    }

    // Detectar par acorde + letra (acorde na linha actual, letra na próxima)
    // ou linha só de acordes, ou linha só de letra
    if (isChordLine(line)) {
      const chords = extractChordPositions(line);
      // Verificar se a próxima linha é letra (não vazia, não acorde, não secção)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine.trim();
        if (
          nextTrimmed !== "" &&
          !isChordLine(nextLine) &&
          !parseSectionHeader(nextLine) &&
          !isMedleySeparator(nextLine) &&
          !isInstruction(nextLine)
        ) {
          // Par acorde + letra
          const { text, isBold } = parseBold(nextLine);
          const sec = ensureSection();
          sec.lines.push({
            type: "lyrics",
            lyrics: text,
            chords,
            isBold: isBold || undefined,
          });
          i += 2;
          continue;
        }
      }
      // Linha de acordes sem letra seguinte — preservar o texto original
      // (vírgulas, repetições tipo "x2", agrupamentos "[E Am]") na renderização
      const sec = ensureSection();
      sec.lines.push({
        type: "chords-only",
        chords,
        lyrics: line.replace(/\s+$/, ""),
      });
      i++;
      continue;
    }

    // Linha de conteúdo misto: pode ter acordes no início seguidos de letra
    // Ex: "Dm                Gm"  acima de "O vento nas velas..."
    // Mas também: "Dm" sozinho seguido de letra
    // Ou: linha pura de letras (sem acordes acima)

    // Verificar se a linha tem acordes misturados com letras
    // Padrão: acorde(s) no início, depois letras, depois possivelmente mais acordes
    // Ex: "Dm                Gm" - isto é chord line (já tratado acima)
    // Ex: "O vento nas velas" - isto é pura lyrics

    // Passagem com nome (ex: "Pulp Fiction   A# A (4 tempos cada)")
    if (currentSection?.type.toUpperCase() === "PASSAGEM" && /^\S/.test(line)) {
      const { text, isBold } = parseBold(trimmed);
      const sec = ensureSection();
      sec.lines.push({
        type: "lyrics",
        lyrics: text,
        isBold: isBold || undefined,
      });
      i++;
      continue;
    }

    // Linha de letras pura (possivelmente com bold)
    const { text, isBold } = parseBold(line);
    const sec = ensureSection();
    sec.lines.push({
      type: "lyrics",
      lyrics: text,
      isBold: isBold || undefined,
    });
    i++;
  }

  return sections;
}

/**
 * Parser principal.
 * Lê um ficheiro .txt de cifra e devolve estrutura Song.
 */
export function parseSong(filePath: string): Song {
  const content = fs.readFileSync(filePath, "utf-8");
  return parseSongContent(content);
}

/**
 * Parser que recebe conteúdo string directamente (útil para testes).
 */
export function parseSongContent(content: string): Song {
  const lines = content.split("\n");

  // Remover trailing newline
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  // Parse header YAML
  const { metadata, restIndex } = parseYamlHeader(lines);
  const bodyLines = lines.slice(restIndex);

  // Verificar se é medley (tem separador ===)
  const hasMedley = bodyLines.some((l) => isMedleySeparator(l));

  if (hasMedley) {
    return parseMedley(metadata, bodyLines);
  }

  // Música simples (uma parte só)
  const sections = parsePartLines(bodyLines);
  return {
    metadata,
    parts: [{ sections }],
  };
}

/**
 * Parse de medley (múltiplas partes separadas por ===).
 */
function parseMedley(
  metadata: Song["metadata"],
  bodyLines: string[]
): Song {
  const partChunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const line of bodyLines) {
    if (isMedleySeparator(line)) {
      partChunks.push(currentChunk);
      currentChunk = [];
    } else {
      currentChunk.push(line);
    }
  }
  if (currentChunk.length > 0) {
    partChunks.push(currentChunk);
  }

  const parts: SongPart[] = partChunks.map((chunk) => {
    // Extrair metadata de parte ([parte: ...], [tom: ...])
    const partMeta: SongPart["metadata"] = {};
    for (const line of chunk) {
      const pm = parsePartMetadata(line);
      if (pm) {
        if (pm.key === "parte") partMeta.parte = pm.value;
        if (pm.key === "tom") partMeta.tom = pm.value;
      }
    }

    const sections = parsePartLines(chunk);
    return {
      metadata: partMeta.parte || partMeta.tom ? partMeta : undefined,
      sections,
    };
  });

  return { metadata, parts };
}
