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

  it("repetição do refrão marcada como secção REFRÃO", () => {
    const refroes = song.parts[0].sections.filter((s) => s.isChorus);
    expect(refroes.length).toBeGreaterThan(0);
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

describe("parseSong — Maria Leviana", () => {
  let song: Song;

  it("deve fazer parse sem erros", () => {
    song = parseSong(cifraPath("maria-leviana.txt"));
    expect(song).toBeDefined();
  });

  it("metadata correcta", () => {
    expect(song.metadata.titulo).toBe("Maria Leviana");
    expect(song.metadata.tom).toBe("F");
  });

  it("tem secções com conteúdo", () => {
    expect(song.parts[0].sections.length).toBeGreaterThan(0);
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

describe("parseSong — todos os ficheiros sem erros", () => {
  const files = fs.readdirSync(CIFRAS_DIR).filter((f) => f.endsWith(".txt"));

  it("existem ficheiros de cifra", () => {
    // Contagem não fixa: o acervo muda (novas cifras, deduplicação)
    expect(files.length).toBeGreaterThan(0);
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

describe("parseSongContent — metadata colunas", () => {
  it("default é undefined (layout usa 2 colunas)", () => {
    const song = parseSongContent("---\ntitulo: Teste\ntom: C\n---\n\nLetra\n");
    expect(song.metadata.colunas).toBeUndefined();
  });

  it("colunas: 1 é lido", () => {
    const song = parseSongContent("---\ntitulo: Teste\ntom: C\ncolunas: 1\n---\n\nLetra\n");
    expect(song.metadata.colunas).toBe(1);
  });

  it("colunas: 2 é lido", () => {
    const song = parseSongContent("---\ntitulo: Teste\ntom: C\ncolunas: 2\n---\n\nLetra\n");
    expect(song.metadata.colunas).toBe(2);
  });

  it("valores inválidos são ignorados", () => {
    const song = parseSongContent("---\ntitulo: Teste\ntom: C\ncolunas: 3\n---\n\nLetra\n");
    expect(song.metadata.colunas).toBeUndefined();
  });
});

describe("parseSong — bold após secção PASSAGEM", () => {
  it("remove ** e marca isBold em linhas soltas depois de [PASSAGEM]", () => {
    const song = parseSongContent(
      "---\ntitulo: Teste\ntom: C\n---\n\n[PASSAGEM] C D\n\n**Linha a negrito**\n"
    );
    const lines = song.parts[0].sections.flatMap((s) => s.lines);
    const bold = lines.find((l) => l.lyrics?.includes("Linha a negrito"));
    expect(bold).toBeDefined();
    expect(bold!.lyrics).toBe("Linha a negrito");
    expect(bold!.isBold).toBe(true);
  });
});

describe("parseSongContent — linhas de acordes com vírgulas e repetições", () => {
  const header = "---\ntitulo: Teste\ntom: C\n---\n\n";

  it("acordes separados por vírgulas são linha de acordes", () => {
    const song = parseSongContent(header + "Dm , C , Dm , C , A (x2)\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("chords-only");
    expect(line.chords!.map((c) => c.chord)).toEqual(["Dm", "C", "Dm", "C", "A"]);
  });

  it("sufixo xN sem parêntesis é tolerado (ex: 'A E x4')", () => {
    const song = parseSongContent(header + "A E x4\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("chords-only");
    expect(line.chords!.map((c) => c.chord)).toEqual(["A", "E"]);
  });

  it("agrupamento '[E Am] x2' é linha de acordes, não secção nem instrução", () => {
    const song = parseSongContent(header + "[E Am] x2\n");
    const sections = song.parts[0].sections;
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("");
    const line = sections[0].lines[0];
    expect(line.type).toBe("chords-only");
    expect(line.chords!.map((c) => c.chord)).toEqual(["E", "Am"]);
  });

  it("'(bis)' é tolerado numa linha de acordes", () => {
    const song = parseSongContent(header + "F C G C (bis)\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("chords-only");
  });

  it("linha de acordes solta preserva o texto original", () => {
    const song = parseSongContent(header + "Dm , G , F (x2)\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.lyrics).toBe("Dm , G , F (x2)");
  });

  it("linha de letra com vírgulas não é confundida com acordes", () => {
    const song = parseSongContent(header + "Adeus, adeus, até amanhã\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("lyrics");
  });

  it("acordes com vírgulas sobre letra continuam a ser par acorde+letra", () => {
    const song = parseSongContent(header + "C , G\nLinha de letra\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("lyrics");
    expect(line.lyrics).toBe("Linha de letra");
    expect(line.chords!.map((c) => c.chord)).toEqual(["C", "G"]);
  });
});

describe("parseSongContent — notas livres ('> ...')", () => {
  it("linha começada por '> ' é instrução", () => {
    const song = parseSongContent(
      "---\ntitulo: Teste\ntom: C\n---\n\n> o baixo desce meio tom\nLetra\n"
    );
    const lines = song.parts[0].sections.flatMap((s) => s.lines);
    expect(lines[0].type).toBe("instruction");
    expect(lines[0].instruction).toBe("o baixo desce meio tom");
  });
});

describe("parseSongContent — runs de notas entre parêntesis", () => {
  const header = "---\ntitulo: Teste\ntom: C\n---\n\n";

  it("'G    (G A B)' sobre letra: run fica como um elemento com parêntesis", () => {
    const song = parseSongContent(header + "G    (G A B)\nTalvez só o padeiro\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("lyrics");
    expect(line.chords!.map((c) => c.chord)).toEqual(["G", "(G A B)"]);
  });

  it("'D (C# C) Bm' mantém a ordem por posição", () => {
    const song = parseSongContent(header + "D (C# C) Bm\nLetra qualquer\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.chords!.map((c) => c.chord)).toEqual(["D", "(C# C)", "Bm"]);
  });

  it("'Em  (F#, G)    A' é linha de acordes", () => {
    const song = parseSongContent(header + "Em  (F#, G)    A\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("chords-only");
  });

  it("baixo colado 'Em(E)' não é separado pelo run", () => {
    const song = parseSongContent(header + "Em(E), Em(D#) (x4)\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("chords-only");
    expect(line.chords!.map((c) => c.chord)).toEqual(["Em", "Em"]);
  });

  it("linha de letra com parêntesis não vira acordes", () => {
    const song = parseSongContent(header + "Canta comigo (outra vez)\n");
    const line = song.parts[0].sections[0].lines[0];
    expect(line.type).toBe("lyrics");
  });
});

describe("parseSongContent — continuações indentadas de secções", () => {
  const header = "---\ntitulo: Teste\ntom: C\n---\n\n";

  it("continuações com indentação ≠ 10 espaços são apanhadas e sem indent", () => {
    const song = parseSongContent(
      header + "[SOLO]   Em Am D C B7 (2x)\n         Am D G C Am B7 Em\n         C B7 Em (2x)\n"
    );
    const solo = song.parts[0].sections.find((s) => s.type === "SOLO")!;
    const runs = solo.lines.filter((l) => l.type === "chords-only");
    expect(runs).toHaveLength(3);
    expect(runs[1].lyrics).toBe("Am D G C Am B7 Em");
    expect(runs[1].chords![0].position).toBe(0);
    expect(runs[2].lyrics).toBe("C B7 Em (2x)");
  });

  it("par acorde+letra indentado logo após secção não é consumido como continuação", () => {
    const song = parseSongContent(
      header + "[REFRÃO]\n    C       G\nTexto do refrão\n"
    );
    const refrao = song.parts[0].sections.find((s) => s.isChorus)!;
    const line = refrao.lines[0];
    expect(line.type).toBe("lyrics");
    expect(line.lyrics).toBe("Texto do refrão");
    expect(line.chords!.map((c) => c.chord)).toEqual(["C", "G"]);
  });
});
