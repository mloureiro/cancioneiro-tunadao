import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { parseSong, parseSongContent } from "./parser";
import { Song } from "./types";

const CIFRAS_DIR = path.join(__dirname, "..", "cifras", "tunadao");

function cifraPath(name: string): string {
  return path.join(CIFRAS_DIR, name);
}

describe("parseSong — Ai Viseu (simples com INTRO e REFRÃO)", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("ai-viseu.txt"));
    expect(song).toBeDefined();
  });

  it("metadata correcta", () => {
    expect(song.metadata.titulo).toBe("Ai Viseu");
    expect(song.metadata.tom).toBe("C");
  });

  it("uma parte só (não é medley)", () => {
    expect(song.parts).toHaveLength(1);
  });

  it("primeira secção é INTRO com acordes", () => {
    const intro = song.parts[0].sections[0];
    expect(intro.type).toBe("INTRO");
    expect(intro.isChorus).toBe(false);
    expect(intro.lines.length).toBeGreaterThan(0);
    expect(intro.lines[0].type).toBe("chords-only");
  });

  it("posições dos acordes correctas na primeira estrofe", () => {
    // "                   C"  → posição 19
    // "Ó Viseu anda pra rua"
    const sections = song.parts[0].sections;
    const firstVerseSection = sections.find(
      (s) => s.lines.some((l) => l.lyrics?.includes("Ó Viseu"))
    );
    expect(firstVerseSection).toBeDefined();

    const line = firstVerseSection!.lines.find(
      (l) => l.lyrics?.includes("Ó Viseu anda pra rua")
    );
    expect(line).toBeDefined();
    expect(line!.chords).toBeDefined();
    expect(line!.chords![0].chord).toBe("C");
    expect(line!.chords![0].position).toBe(19);
  });

  it("detecta linhas em bold (refrão)", () => {
    const sections = song.parts[0].sections;
    const boldLine = sections
      .flatMap((s) => s.lines)
      .find((l) => l.lyrics?.includes("Tens ruelas tortuosas"));
    expect(boldLine).toBeDefined();
    expect(boldLine!.isBold).toBe(true);
  });

  it("tem secção REFRÃO", () => {
    const refrao = song.parts[0].sections.find(
      (s) => s.type === "REFRÃO"
    );
    expect(refrao).toBeDefined();
    expect(refrao!.isChorus).toBe(true);
  });
});

describe("parseSong — Caravelas/Menina da Saia Preta (medley)", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("caravelas-menina-da-saia-preta.txt"));
    expect(song).toBeDefined();
  });

  it("metadata global correcta", () => {
    expect(song.metadata.titulo).toBe(
      "Caravelas / Menina da Saia Preta"
    );
    expect(song.metadata.tom).toBe("Dm / Am");
  });

  it("tem 2 partes (medley)", () => {
    expect(song.parts).toHaveLength(2);
  });

  it("primeira parte é Caravelas com tom Dm", () => {
    const part1 = song.parts[0];
    expect(part1.metadata?.parte).toBe("Caravelas");
    expect(part1.metadata?.tom).toBe("Dm");
  });

  it("segunda parte é Menina da Saia Preta com tom Am", () => {
    const part2 = song.parts[1];
    expect(part2.metadata?.parte).toBe("Menina da Saia Preta");
    expect(part2.metadata?.tom).toBe("Am");
  });

  it("detecta PASSAGEM com nome Pulp Fiction", () => {
    const part1 = song.parts[0];
    const passagem = part1.sections.find(
      (s) => s.type.toUpperCase() === "PASSAGEM"
    );
    expect(passagem).toBeDefined();
    // Procurar menção a Pulp Fiction nas linhas
    const pulpLine = passagem!.lines.find(
      (l) => l.lyrics?.includes("Pulp Fiction")
    );
    expect(pulpLine).toBeDefined();
  });

  it("detecta bold nas linhas do refrão", () => {
    const part1 = song.parts[0];
    const boldLines = part1.sections
      .flatMap((s) => s.lines)
      .filter((l) => l.isBold);
    expect(boldLines.length).toBeGreaterThan(0);
    expect(
      boldLines.some((l) => l.lyrics?.includes("Meu barco está perdido"))
    ).toBe(true);
  });
});

describe("parseSong — Podes Partir (solista)", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("podes-partir.txt"));
    expect(song).toBeDefined();
  });

  it("metadata correcta", () => {
    expect(song.metadata.titulo).toBe("Podes Partir");
    expect(song.metadata.tom).toBe("Em");
  });

  it("tem secção SOLISTA", () => {
    const solista = song.parts[0].sections.find(
      (s) => s.type === "SOLISTA"
    );
    expect(solista).toBeDefined();
    expect(solista!.lines.length).toBeGreaterThan(0);
  });

  it("solista contém texto do solo", () => {
    const solista = song.parts[0].sections.find(
      (s) => s.type === "SOLISTA"
    );
    const textos = solista!.lines.filter((l) => l.type === "lyrics");
    expect(textos.some((l) => l.lyrics?.includes("Sinto a falta"))).toBe(
      true
    );
  });

  it("tem instrução CONCLUSÃO – ANEXO", () => {
    const allLines = song.parts[0].sections.flatMap((s) => s.lines);
    const instruction = allLines.find(
      (l) =>
        l.type === "instruction" &&
        l.instruction?.includes("CONCLUSÃO")
    );
    expect(instruction).toBeDefined();
  });

  it("detecta refrão em bold", () => {
    const boldLines = song.parts[0].sections
      .flatMap((s) => s.lines)
      .filter((l) => l.isBold);
    expect(boldLines.length).toBeGreaterThan(0);
    expect(
      boldLines.some((l) => l.lyrics?.includes("Podes partir"))
    ).toBe(true);
  });
});

describe("parseSong — Vejam Bem (chaves de repetição)", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("vejam-bem.txt"));
    expect(song).toBeDefined();
  });

  it("metadata correcta", () => {
    expect(song.metadata.titulo).toBe("Vejam Bem");
    expect(song.metadata.tom).toBe("Dm");
  });

  it("INTRO com chaves de repetição", () => {
    const intro = song.parts[0].sections[0];
    expect(intro.type).toBe("INTRO");
    // As chaves } 2x estão nas linhas
    const braceLines = intro.lines.filter(
      (l) => l.lyrics?.includes("}") || (l.type === "chords-only" && l.chords?.length)
    );
    expect(braceLines.length).toBeGreaterThan(0);
  });

  it("instrução [Param os instrumentos]", () => {
    const allLines = song.parts[0].sections.flatMap((s) => s.lines);
    const instr = allLines.find(
      (l) =>
        l.type === "instruction" &&
        l.instruction?.includes("Param os instrumentos")
    );
    expect(instr).toBeDefined();
  });
});

describe("parseSong — Maria Leviana (SOBE UM TOM)", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("maria-leviana.txt"));
    expect(song).toBeDefined();
  });

  it("metadata correcta", () => {
    expect(song.metadata.titulo).toBe("Maria Leviana");
    expect(song.metadata.tom).toBe("F");
  });

  it("tem instrução SOBE UM TOM", () => {
    const allLines = song.parts[0].sections.flatMap((s) => s.lines);
    const sobeUmTom = allLines.find(
      (l) =>
        l.type === "instruction" &&
        l.instruction === "SOBE UM TOM"
    );
    expect(sobeUmTom).toBeDefined();
  });
});

describe("parseSong — Grito Académico (sub-música)", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("grito-academico.txt"));
    expect(song).toBeDefined();
  });

  it("metadata correcta", () => {
    expect(song.metadata.titulo).toBe("Grito Académico");
    expect(song.metadata.tom).toBe("Am / G");
  });

  it("tem secção PÕE A MÃO NA CABECINHA", () => {
    const section = song.parts[0].sections.find(
      (s) => s.type === "PÕE A MÃO NA CABECINHA"
    );
    expect(section).toBeDefined();
  });

  it("tem instrução SAÍDA PARA AI VISEU", () => {
    const allLines = song.parts[0].sections.flatMap((s) => s.lines);
    const saida = allLines.find(
      (l) =>
        l.type === "instruction" &&
        l.instruction?.includes("SAÍDA PARA AI VISEU")
    );
    expect(saida).toBeDefined();
  });
});

describe("parseSong — És Tu (passagem com modulação)", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("es-tu.txt"));
    expect(song).toBeDefined();
  });

  it("metadata correcta", () => {
    expect(song.metadata.titulo).toBe("És Tu");
    expect(song.metadata.tom).toBe("G");
  });

  it("posições de acordes correctas", () => {
    // " G                 D"  → G pos 1, D pos 19
    // "Numa noite de luar"
    const sections = song.parts[0].sections;
    const line = sections
      .flatMap((s) => s.lines)
      .find((l) => l.lyrics?.includes("Numa noite de luar"));
    expect(line).toBeDefined();
    expect(line!.chords).toBeDefined();
    expect(line!.chords![0].chord).toBe("G");
    expect(line!.chords![0].position).toBe(1);
    expect(line!.chords![1].chord).toBe("D");
    expect(line!.chords![1].position).toBe(19);
  });
});

describe("parseSong — todos os 14 ficheiros sem erros", () => {
  const files = fs.readdirSync(CIFRAS_DIR).filter((f) => f.endsWith(".txt"));

  it("existem 14 ficheiros de cifra", () => {
    expect(files).toHaveLength(14);
  });

  for (const file of files) {
    it(`parse ${file} sem erros`, () => {
      const song = parseSong(path.join(CIFRAS_DIR, file));
      expect(song).toBeDefined();
      expect(song.metadata.titulo).toBeTruthy();
      expect(song.metadata.tom).toBeTruthy();
      expect(song.parts.length).toBeGreaterThan(0);
      expect(
        song.parts.some((p) => p.sections.length > 0)
      ).toBe(true);
    });
  }
});
