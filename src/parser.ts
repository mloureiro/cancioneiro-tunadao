import * as fs from "fs";
import {
  Song,
  SongPart,
  Section,
  SongLine,
  ChordPosition,
} from "./types";

// Padrão para detectar acordes: letra maiúscula + opcionais (# b m 7 maj dim aug sus add / etc.)
const CHORD_TOKEN_RE =
  /^[A-G][#b]?(?:m|min|maj|dim|aug|sus[24]?|add\d+|[0-9]+)?(?:\/[A-G][#b]?)?$/;

const SECTION_RE = /^\[([^\]]+)\](.*)$/;
const REPETITION_RE = /\((\d+)x\)\s*$/;
const BRACE_REPETITION_RE = /\}\s*(\d+)x\s*$/;

/**
 * Verifica se uma linha contém APENAS acordes (sem letras).
 * Tolera espaços, parêntesis de repetição, e chaves de repetição.
 */
function isChordLine(line: string): boolean {
  // Linha vazia não é linha de acordes
  if (line.trim() === "") return false;

  // Remover indicações de repetição e chaves para análise
  let cleaned = line.replace(/\(\d+x\)\s*$/, "").replace(/[{}]\s*\d*x?\s*$/i, "").trim();
  if (cleaned === "") return false;

  // Separar em tokens e verificar se todos são acordes ou espaços
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return false;

  return tokens.every((t) => CHORD_TOKEN_RE.test(t));
}

/**
 * Extrai as posições dos acordes de uma linha de acordes.
 * A posição é o índice do caractere onde o acorde começa.
 */
function extractChordPositions(chordLine: string): ChordPosition[] {
  const positions: ChordPosition[] = [];
  const re = /[A-G][#b]?(?:m|min|maj|dim|aug|sus[24]?|add\d+|[0-9]+)?(?:\/[A-G][#b]?)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chordLine)) !== null) {
    positions.push({
      chord: match[0],
      position: match.index,
    });
  }
  return positions;
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
  // Instruções entre [] que não são secções standard
  const match = trimmed.match(/^\[(.+)\]$/);
  if (match) {
    const content = match[1];
    // Não é secção se contiver espaços e palavras tipo "Repete", "Param", "SOBE", etc.
    // ou se for referência a anexo, ou instrução musical
    const sectionNames = [
      "INTRO", "REFRÃO", "REFRAO", "PASSAGEM", "SOLO",
      "INSTR.", "SAÍDA", "SAIDA", "SOLISTA", "/SOLISTA",
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

  return {
    metadata: {
      titulo: metadata["titulo"] || "",
      tom: metadata["tom"] || "",
      artista: metadata["artista"],
      subtitulo: metadata["subtitulo"],
    },
    restIndex: endIndex + 1,
  };
}

/**
 * Determina se uma secção type indica refrão.
 */
function isSectionChorus(type: string): boolean {
  return type.toUpperCase() === "REFRÃO" || type.toUpperCase() === "REFRAO";
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
  "INSTR.", "SAÍDA", "SAIDA", "SOLISTA", "/SOLISTA",
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
    "MISSÃO", "Repete", "Param",
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
        // Pode ter múltiplas linhas de conteúdo inline (continuação)
        const inlineText = sectionHeader.inlineContent;

        // Verificar chaves de repetição no inline
        const braceMatch = inlineText.match(BRACE_REPETITION_RE);

        currentSection.lines.push({
          type: "chords-only",
          chords: extractChordPositions(inlineText),
          lyrics: inlineText,
        });
      }

      i++;

      // Verificar linhas de continuação (indentadas, sem [] prefix)
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();
        // Continuação: linha indentada com espaços que é chord-only
        if (
          nextTrimmed !== "" &&
          nextLine.startsWith("          ") &&
          !nextTrimmed.startsWith("[") &&
          isChordLine(nextTrimmed)
        ) {
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

    // Linha vazia — só adicionar se já temos uma secção activa
    if (trimmed === "") {
      if (currentSection) {
        currentSection.lines.push({ type: "empty" });
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
      // Linha de acordes sem letra seguinte
      const sec = ensureSection();
      sec.lines.push({
        type: "chords-only",
        chords,
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
      const sec = ensureSection();
      sec.lines.push({
        type: "lyrics",
        lyrics: trimmed,
      });
      i++;
      continue;
    }

    // Linha de letras pura (possivelmente com bold)
    const { text, isBold } = parseBold(line);
    const sec = ensureSection();

    // Verificar se tem chaves de repetição
    const braceMatch = trimmed.match(BRACE_REPETITION_RE);
    if (braceMatch) {
      sec.lines.push({
        type: "lyrics",
        lyrics: text,
        isBold: isBold || undefined,
      });
    } else {
      sec.lines.push({
        type: "lyrics",
        lyrics: text,
        isBold: isBold || undefined,
      });
    }
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
