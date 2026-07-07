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

describe("parseSongContent — acordes com notação estendida (R3)", () => {
  const header = "---\ntitulo: Teste\ntom: C\n---\n\n";

  function chordsOf(line: string): string[] {
    const song = parseSongContent(header + line + "\n");
    const l = song.parts[0].sections[0].lines[0];
    expect(l.type).toBe("chords-only");
    return l.chords!.map((c) => c.chord);
  }

  it("modificador depois do número: E7sus4, E7dim, Amaj7sus4", () => {
    expect(chordsOf("E7sus4 Am")).toEqual(["E7sus4", "Am"]);
    expect(chordsOf("E7dim F7dim A#7dim")).toEqual(["E7dim", "F7dim", "A#7dim"]);
    expect(chordsOf("Amaj7sus4 Bm7b5")).toEqual(["Amaj7sus4", "Bm7b5"]);
  });

  it("alteração entre parêntesis: Dm7(b5), G7(#5), C6(11+), D7(9-/13)", () => {
    expect(chordsOf("Dm7(b5) G7(#5)")).toEqual(["Dm7(b5)", "G7(#5)"]);
    expect(chordsOf("C6(11+) D7(9-/13)")).toEqual(["C6(11+)", "D7(9-/13)"]);
    expect(chordsOf("Am(maj7) Bm7(5-)")).toEqual(["Am(maj7)", "Bm7(5-)"]);
  });

  it("alteração colada: F#m7b5, D7#9, E7b13, Bbm#5", () => {
    expect(chordsOf("F#m7b5 D7#9 E7b13")).toEqual(["F#m7b5", "D7#9", "E7b13"]);
    expect(chordsOf("Bbm#5 Em7b5")).toEqual(["Bbm#5", "Em7b5"]);
  });

  it("aumentado com '+': G7+, B+, B5+, Eb7+", () => {
    expect(chordsOf("G7+ B+ B5+ Eb7+")).toEqual(["G7+", "B+", "B5+", "Eb7+"]);
  });

  it("baixo com alteração: E7/b9, Bm7/b5, Em#5/A", () => {
    expect(chordsOf("E7/b9 Bm7/b5")).toEqual(["E7/b9", "Bm7/b5"]);
    expect(chordsOf("Em#5/A C#m5+")).toEqual(["Em#5/A", "C#m5+"]);
  });

  it("mantém a compatibilidade com notação brasileira e baixos", () => {
    expect(chordsOf("C#m7/5- D7/9 G6/D")).toEqual(["C#m7/5-", "D7/9", "G6/D"]);
    expect(chordsOf("D7M Cadd9 Gsus4 Bdim")).toEqual(["D7M", "Cadd9", "Gsus4", "Bdim"]);
  });

  it("erros de dados continuam a NÃO ser acordes (linha vira letra)", () => {
    // "Am-A7" (dois acordes unidos por hífen) não deve ser lido como acorde único
    const j1 = parseSongContent(header + "Am-A7 Cena qualquer\n");
    expect(j1.parts[0].sections[0].lines[0].type).toBe("lyrics");
    // "Adeus, adeus" continua letra
    const j2 = parseSongContent(header + "Adeus, adeus, meu bem\n");
    expect(j2.parts[0].sections[0].lines[0].type).toBe("lyrics");
  });
});

describe("parseSongContent — refrão fecha na linha em branco (R2b)", () => {
  const header = "---\ntitulo: Teste\ntom: C\n---\n\n";

  it("linha em branco fecha o [REFRÃO]; verso a seguir sai da secção-refrão", () => {
    const song = parseSongContent(
      header + "[REFRÃO]\n**linha do refrão**\n\nVerso normal a seguir\n"
    );
    const secs = song.parts[0].sections;
    const refrao = secs.find((s) => s.isChorus)!;
    expect(refrao).toBeDefined();
    // o verso normal NÃO está dentro da secção-refrão
    const inChorus = refrao.lines.some((l) => l.lyrics?.includes("Verso normal"));
    expect(inChorus).toBe(false);
    // existe noutra secção (não-refrão)
    const versoSec = secs.find(
      (s) => !s.isChorus && s.lines.some((l) => l.lyrics?.includes("Verso normal"))
    );
    expect(versoSec).toBeDefined();
  });

  it("família REFRÃO com qualificador ([REFRÃO 2x], [Refrão vozes]) conta como refrão", () => {
    const s1 = parseSongContent(header + "[REFRÃO 2x]\nlinha\n");
    expect(s1.parts[0].sections.find((s) => s.type === "REFRÃO 2x")?.isChorus).toBe(true);
    const s2 = parseSongContent(header + "[Refrão vozes]\nlinha\n");
    expect(s2.parts[0].sections.find((s) => /refrão vozes/i.test(s.type))?.isChorus).toBe(true);
    // Pré-Refrão NÃO é refrão
    const s3 = parseSongContent(header + "[Pré-Refrão]\nlinha\n");
    expect(s3.parts[0].sections.find((s) => /pr[eé]/i.test(s.type))?.isChorus).toBe(false);
  });

  it("[REFRÃO 2x] com conteúdo também fecha na linha em branco", () => {
    const song = parseSongContent(
      header + "[REFRÃO 2x]\n**refrão**\n\nVerso depois\n"
    );
    const refrao = song.parts[0].sections.find((s) => s.isChorus)!;
    expect(refrao.lines.some((l) => l.lyrics?.includes("Verso depois"))).toBe(false);
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
      header + "[Inst]   Em Am D C B7 (2x)\n         Am D G C Am B7 Em\n         C B7 Em (2x)\n"
    );
    const solo = song.parts[0].sections.find((s) => s.type === "Inst")!;
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
