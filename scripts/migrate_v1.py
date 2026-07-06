#!/usr/bin/env python3
"""
Migra ficheiros de cifra v1 -> v2.

v2 espera:
  - header YAML entre --- com: titulo (obrigatório), tom, artista (opcional)
  - secções instrumentais em bracket: [INTRO] [PASSAGEM] [SOLO] [INSTR.] [REFRÃO] [SAÍDA]
  - acordes em notação inglesa (A-G) — a notação portuguesa NÃO é reconhecida pelo parser

Por defeito corre em DRY-RUN: não escreve nada, gera relatório e amostras em /tmp.
Com --apply reescreve os ficheiros in-place.
"""
import os
import re
import sys
import unicodedata

CIFRAS_DIR = os.path.join(os.path.dirname(__file__), "..", "cifras")
SAMPLE_DIR = "/tmp/cifras-migrated"

APPLY = "--apply" in sys.argv

# ---- deteção de notação ----
PT_NOTE_RE = re.compile(r"(?:^|(?<=[^A-Za-zÀ-ÿ]))(Dó|Ré|Mi|Fá|Sol|Lá|Si)(m|M|7|9|6|#|b|dim|maj|sus|aug)*", re.UNICODE)

# chave válida (notação inglesa) em (KEY)
KEY_PARENS_RE = re.compile(r"\(([A-Ga-g][#b]?m?7?)\)\s*$")
KEY_UNKNOWN_RE = re.compile(r"\(\?\)\s*$")
TOM_LINE_RE = re.compile(r"^\s*tom\s*:\s*(.+)$", re.IGNORECASE)
LM_LINE_RE = re.compile(r"letra\s*&\s*m[úu]sica\s*:", re.IGNORECASE)
META_LINE_RE = re.compile(r"^\s*(capo|tempo)\s*:", re.IGNORECASE)


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower().strip()


def parse_filename(path):
    """Devolve (artista, titulo) a partir de 'Artista - Titulo.txt'."""
    base = os.path.basename(path)[:-4]  # tira .txt
    base = re.sub(r"\s*-\s*v1$", "", base)  # tira sufixo -v1
    if " - " in base:
        artist, title = base.split(" - ", 1)
    else:
        artist, title = "", base
    return artist.strip(), title.strip()


def looks_like_pt(text):
    return len(PT_NOTE_RE.findall(text)) > 3


def extract_tom_from_line(line):
    """Extrai tom de uma linha título com (KEY) ou de 'Tom: X'. Devolve (tom|None, unknown_bool)."""
    if KEY_UNKNOWN_RE.search(line):
        return None, True
    m = KEY_PARENS_RE.search(line)
    if m:
        return m.group(1), False
    m = TOM_LINE_RE.match(line)
    if m:
        tok = m.group(1).strip().split()[0]
        tok = tok.strip(".,;:()")
        return tok, False
    return None, False


# ---- normalização de secções ----
SECTION_MAP = [
    (re.compile(r"^\s*\[?\s*intro\s*\d*\s*\]?\s*[:.\-]?\s*(.*)$", re.IGNORECASE), "INTRO"),
    (re.compile(r"^\s*\[?\s*instrumental\s*\d*\s*\]?\s*[:.\-]?\s*(.*)$", re.IGNORECASE), "INSTR."),
    (re.compile(r"^\s*\[?\s*passagem\s*\d*\s*\]?\s*[:.\-]?\s*(.*)$", re.IGNORECASE), "PASSAGEM"),
    (re.compile(r"^\s*\[?\s*solo\s*\d*\s*\]?\s*[:.\-]?\s*(.*)$", re.IGNORECASE), "SOLO"),
    (re.compile(r"^\s*\[?\s*sa[íi]da\s*\]?\s*[:.\-]?\s*(.*)$", re.IGNORECASE), "SAÍDA"),
    (re.compile(r"^\s*\[?\s*refr[ãa]o\s*\]?\s*[:.\-]?\s*$", re.IGNORECASE), "REFRÃO"),
]


def normalize_sections(lines):
    """Converte marcadores de secção v1 -> bracket v2. Devolve (novas_linhas, n_convertidas)."""
    out = []
    n = 0
    for line in lines:
        converted = None
        for rx, tag in SECTION_MAP:
            m = rx.match(line)
            if not m:
                continue
            rest = m.group(1).strip() if m.groups() else ""
            # segurança: só converte se já era bracket, ou tem ':' , ou o resto parece acordes/parêntesis, ou linha curta sem letra
            raw = line.strip()
            had_bracket = raw.startswith("[")
            had_colon = ":" in raw.split("]")[-1] or re.search(r"\b(intro|instrumental|passagem|solo|sa[íi]da)\s*\d*\s*:", raw, re.IGNORECASE)
            rest_chordish = rest == "" or bool(re.match(r"^[\(\[]?\s*([A-Ga-g][#b]?m?7?|Dó|Ré|Mi|Fá|Sol|Lá|Si)", rest))
            if had_bracket or had_colon or rest_chordish or tag == "REFRÃO":
                converted = f"[{tag}] {rest}".rstrip()
                break
        if converted is not None:
            out.append(converted)
            n += 1
        else:
            out.append(line)
    return out, n


def read_text(path):
    """Lê ficheiro, tolerando encoding não-UTF-8. Devolve (texto, was_non_utf8)."""
    raw = open(path, "rb").read()
    try:
        return raw.decode("utf-8"), False
    except UnicodeDecodeError:
        # fallback Latin-1 / Windows-1252 (comum em cifras antigas)
        return raw.decode("cp1252", errors="replace"), True


def migrate(path):
    content, non_utf8 = read_text(path)
    lines = content.split("\n")
    if lines and lines[0].strip() == "---":
        return None  # já é v2

    artist, title = parse_filename(path)

    # --- identificar e retirar bloco de header v1 ---
    tom = None
    tom_unknown = False
    body_start = 0
    artist_norm = strip_accents(artist)
    title_norm = strip_accents(title)

    # linha 0: título (quase sempre). extrair tom se lá estiver.
    if lines:
        t, unk = extract_tom_from_line(lines[0])
        if t:
            tom = t
        if unk:
            tom_unknown = True
    body_start = 1

    # linhas seguintes: artista / Letra&Música / Tom: / Capo: / Tempo:  (e vazias intercaladas)
    i = 1
    trailing_blanks = 0
    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        sn = strip_accents(s)
        is_header = False
        if s == "":
            i += 1
            trailing_blanks += 1
            body_start = i
            continue
        if LM_LINE_RE.search(s):
            is_header = True
        elif META_LINE_RE.match(s):
            is_header = True
        elif TOM_LINE_RE.match(s):
            t, unk = extract_tom_from_line(s)
            if t and not tom:
                tom = t
            if unk:
                tom_unknown = True
            is_header = True
        elif artist_norm and sn == artist_norm:
            is_header = True
        elif artist_norm and artist_norm in sn and len(sn) < len(artist_norm) + 8:
            is_header = True
        if is_header:
            i += 1
            body_start = i
            trailing_blanks = 0
        else:
            break

    body = lines[body_start:]
    # tira linhas vazias no topo do corpo
    while body and body[0].strip() == "":
        body.pop(0)

    body, n_sections = normalize_sections(body)

    # --- construir header YAML ---
    hdr = ["---", f"titulo: {title}"]
    if artist and strip_accents(artist) not in ("unknown", "desconhecido"):
        hdr.append(f"artista: {artist}")
    hdr.append(f"tom: {tom if tom else ''}")
    hdr.append("---")
    new_content = "\n".join(hdr) + "\n\n" + "\n".join(body).rstrip() + "\n"

    return {
        "path": path,
        "title": title,
        "artist": artist,
        "tom": tom,
        "tom_unknown": tom_unknown,
        "tom_missing": tom is None,
        "n_sections": n_sections,
        "is_pt": looks_like_pt(content),
        "non_utf8": non_utf8,
        "new_content": new_content,
    }


def main():
    results = []
    for root, _, files in os.walk(CIFRAS_DIR):
        for f in sorted(files):
            if f.endswith(".txt"):
                r = migrate(os.path.join(root, f))
                if r:
                    results.append(r)

    total = len(results)
    tom_missing = [r for r in results if r["tom_missing"]]
    tom_unknown = [r for r in results if r["tom_unknown"]]
    pt = [r for r in results if r["is_pt"]]
    non_utf8 = [r for r in results if r["non_utf8"]]
    no_sections = [r for r in results if r["n_sections"] == 0]

    print(f"Ficheiros v1 a migrar:          {total}")
    print(f"  título extraído:              {total} (100%, via nome do ficheiro)")
    print(f"  artista extraído:             {sum(1 for r in results if r['artist'])}")
    print(f"  tom encontrado:               {total - len(tom_missing)}")
    print(f"  tom EM FALTA (rever):         {len(tom_missing)}")
    print(f"  tom marcado (?) desconhecido: {len(tom_unknown)}")
    print(f"  secções convertidas em >=1 :  {total - len(no_sections)}")
    print(f"  ⚠ notação PT (acordes não vão renderizar em v2): {len(pt)}")
    print(f"  ⚠ encoding não-UTF-8 (convertido p/ UTF-8):      {len(non_utf8)}")
    print()

    if APPLY:
        for r in results:
            with open(r["path"], "w", encoding="utf-8") as fh:
                fh.write(r["new_content"])
        print(f"APLICADO in-place a {total} ficheiros.")
    else:
        os.makedirs(SAMPLE_DIR, exist_ok=True)
        for r in results[:8]:
            out = os.path.join(SAMPLE_DIR, os.path.basename(r["path"]))
            with open(out, "w", encoding="utf-8") as fh:
                fh.write(r["new_content"])
        with open(os.path.join(SAMPLE_DIR, "_tom_em_falta.txt"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(os.path.basename(r["path"]) for r in tom_missing))
        with open(os.path.join(SAMPLE_DIR, "_notacao_pt.txt"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(os.path.basename(r["path"]) for r in pt))
        print(f"DRY-RUN. Amostras (8) e listas em {SAMPLE_DIR}/")
        print("Corre com --apply para reescrever in-place.")


if __name__ == "__main__":
    main()
