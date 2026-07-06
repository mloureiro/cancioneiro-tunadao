#!/usr/bin/env python3
"""
Limpeza/normalização das cifras v2:
  1. Transliterar acordes de notação PT (Dó Ré Mi Fá Sol Lá Si, +maior -menor)
     para notação inglesa (A-G) que o parser v2 reconhece.
     Só actua em LINHAS DE ACORDES (nunca em letra) e preserva o alinhamento
     coluna-a-coluna (acorde por cima da sílaba), fazendo padding com espaços.
  2. Preencher 'tom' em falta, inferido dos acordes:
       - tónica ~= último acorde (regra dos ~90%), reforçada por
       - scoring diatónico das 24 tonalidades (maj/menor).

Dry-run por defeito; --apply reescreve in-place.
"""
import os
import re
import sys

CIFRAS_DIR = os.path.join(os.path.dirname(__file__), "..", "cifras")
APPLY = "--apply" in sys.argv

# ---------------------------------------------------------------- notas
PT_NOTES = {
    "Dó": 0, "Do": 0, "Ré": 2, "Re": 2, "Mi": 4, "Fá": 5, "Fa": 5,
    "Sol": 7, "Lá": 9, "La": 9, "Si": 11,
}
PT_NOTE_RE = "|".join(sorted(PT_NOTES, key=len, reverse=True))  # Sol antes de Si etc.
EN_SHARP = {0: "C", 1: "C#", 2: "D", 3: "D#", 4: "E", 5: "F",
            6: "F#", 7: "G", 8: "G#", 9: "A", 10: "A#", 11: "B"}
EN_FLAT = {1: "Db", 3: "Eb", 6: "Gb", 8: "Ab", 10: "Bb"}

# acorde PT completo: nota (+acidente) + sufixo + opcional /baixo
PT_CHORD_RE = re.compile(
    rf"(?P<root>{PT_NOTE_RE})(?P<acc>#|b)?(?P<suf>(?:[-+mM]|7M|maj7|maj|dim|sus[24]?|add\d+|º|°|m7b5|b5|b9|\d)*)"
    rf"(?:/(?P<bassroot>{PT_NOTE_RE})(?P<bassacc>#|b)?)?"
)
# acorde EN (para reconhecer linhas já inglesas e para key detection)
EN_CHORD_RE = re.compile(
    r"^[A-G][#b]?(?:m|min|maj|dim|aug|sus[24]?|add\d+|[0-9]|M|\+|-|º|°|b5|b9)*(?:/[A-G][#b]?)?$"
)
# tokens de repetição / estrutura a ignorar na classificação de linha de acordes
IGNORE_TOK_RE = re.compile(
    r"^(?:\d+x|x\d+|bis|\d+|vezes?|\d+ ?vezes?|[|}{/,.\-–>%]+)$", re.IGNORECASE)


def token_ok(t):
    """Token aceitável numa linha de acordes: acorde (PT/EN) ou repetição/estrutura.
    Remove uma camada de parêntesis à volta (ex: (x2), (Dó7))."""
    core = t
    m = re.match(r"^\((.*)\)$", core)
    if m:
        core = m.group(1)
    if core == "":
        return True
    if IGNORE_TOK_RE.match(core):
        return True
    if pt_chord_to_en(core) is not None:
        return True
    if EN_CHORD_RE.match(core):
        return True
    return False


def note_to_en(root, acc):
    pc = (PT_NOTES[root] + (1 if acc == "#" else -1 if acc == "b" else 0)) % 12
    if acc == "b":
        return EN_FLAT.get(pc, EN_SHARP[pc])
    return EN_SHARP[pc]


def suffix_to_en(suf):
    if suf is None:
        suf = ""
    s = suf
    # maior/menor via +/-
    s = s.replace("+", "")          # + = maior -> nada
    s = s.replace("-", "m")         # - = menor -> m
    s = s.replace("º", "dim").replace("°", "dim")
    s = s.replace("7M", "maj7").replace("M7", "maj7")
    # 'M' isolado = maior -> nada; mas não mexer em 'maj'
    s = re.sub(r"(?<![a-z])M(?![a-z])", "", s)
    # normalizar 'mm' acidental
    s = s.replace("mm", "m")
    return s


def pt_chord_to_en(token):
    """Converte um token de acorde PT -> EN. Devolve None se não for acorde PT."""
    m = PT_CHORD_RE.fullmatch(token)
    if not m:
        return None
    en = note_to_en(m.group("root"), m.group("acc"))
    en += suffix_to_en(m.group("suf"))
    if m.group("bassroot"):
        en += "/" + note_to_en(m.group("bassroot"), m.group("bassacc"))
    return en


def split_section_prefix(line):
    """Se a linha começa por [SECÇÃO], devolve (prefixo, resto)."""
    m = re.match(r"^(\s*\[[^\]]+\]\s*)(.*)$", line)
    if m:
        return m.group(1), m.group(2)
    return "", line


def tokenize(text):
    return [t for t in re.split(r"[\s,]+", text.strip()) if t]


def is_chord_line(line):
    """Linha só de acordes (PT e/ou EN), tolerando repetições. Devolve (bool, tem_pt)."""
    _, rest = split_section_prefix(line)
    if rest.strip() == "":
        return False, False
    toks = tokenize(rest)
    if not toks:
        return False, False
    has_pt = False
    for t in toks:
        if not token_ok(t):
            return False, False
        core = re.sub(r"^\((.*)\)$", r"\1", t)
        if pt_chord_to_en(core) is not None:
            has_pt = True
    return True, has_pt


def transliterate_line(line):
    """Transl. acordes PT->EN preservando colunas. Só chamar em linhas de acordes."""
    def repl(m):
        old = m.group(0)
        en = pt_chord_to_en(old)
        if en is None:
            return old
        if len(en) <= len(old):
            return en + " " * (len(old) - len(en))
        return en
    return PT_CHORD_RE.sub(repl, line)


# ---------------------------------------------------------------- key detection
def chord_quality(sym):
    """Reduz um símbolo EN a 'maj'|'min'|'dim' e devolve (pc, qual)."""
    m = re.match(r"^([A-G][#b]?)(.*)$", sym)
    if not m:
        return None
    root = m.group(1)
    rest = m.group(2)
    base = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[root[0]]
    if len(root) > 1:
        base = (base + (1 if root[1] == "#" else -1)) % 12
    if re.match(r"^(dim|º|°|m7b5|b5)", rest) or "dim" in rest:
        q = "dim"
    elif re.match(r"^(m|min)(?!aj)", rest):
        q = "min"
    else:
        q = "maj"
    return base % 12, q


def diatonic_set(root, mode):
    if mode == "maj":
        offs = [(0, "maj"), (2, "min"), (4, "min"), (5, "maj"),
                (7, "maj"), (9, "min"), (11, "dim")]
    else:  # menor natural + V maior (harmónica)
        offs = [(0, "min"), (2, "dim"), (3, "maj"), (5, "min"),
                (7, "min"), (8, "maj"), (10, "maj"), (7, "maj")]
    return {((root + o) % 12, q) for o, q in offs}


NAME_MAJ = {0: "C", 1: "C#", 2: "D", 3: "Eb", 4: "E", 5: "F",
            6: "F#", 7: "G", 8: "Ab", 9: "A", 10: "Bb", 11: "B"}
NAME_MIN = {0: "Cm", 1: "C#m", 2: "Dm", 3: "D#m", 4: "Em", 5: "Fm",
            6: "F#m", 7: "Gm", 8: "G#m", 9: "Am", 10: "Bbm", 11: "Bm"}


def detect_key(chords):
    """chords: lista de símbolos EN por ordem. Devolve (tom, confidence)."""
    parsed = [chord_quality(c) for c in chords]
    parsed = [p for p in parsed if p]
    if not parsed:
        return None, None
    first, last = parsed[0], parsed[-1]
    best, best_score = None, -1
    for root in range(12):
        for mode in ("maj", "min"):
            dset = diatonic_set(root, mode)
            score = 0
            for i, ch in enumerate(parsed):
                w = 1
                if i == len(parsed) - 1:
                    w = 4
                elif i == 0:
                    w = 2
                if ch in dset:
                    score += w
            # bónus tónica = último acorde
            if (root, "min" if mode == "min" else "maj") == (last[0], last[1]):
                score += 6
            if (root, "min" if mode == "min" else "maj") == (first[0], first[1]):
                score += 3
            if score > best_score:
                best_score, best = score, (root, mode)
    root, mode = best
    tom = NAME_MAJ[root] if mode == "maj" else NAME_MIN[root]
    tonic_is_last = (root == last[0] and ((mode == "min") == (last[1] == "min")))
    return tom, ("high" if tonic_is_last else "low")


# ---------------------------------------------------------------- ficheiro
def process(path):
    text = open(path, encoding="utf-8").read()
    lines = text.split("\n")
    # header
    if lines[0].strip() != "---":
        return None
    end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    header = lines[1:end]
    body = lines[end + 1:]

    changed = False
    pt_converted = 0
    collected = []

    # transliterar tom no header, se PT
    new_header = []
    tom_val = ""
    tom_idx = None
    for i, h in enumerate(header):
        if h.lower().startswith("tom:"):
            tom_idx = len(new_header)
            tom_val = h.split(":", 1)[1].strip()
            en = pt_chord_to_en(tom_val) if tom_val else None
            if en and en != tom_val:
                h = f"tom: {en}"
                tom_val = en
                changed = True
        new_header.append(h)

    # corpo
    new_body = []
    for line in body:
        is_ch, has_pt = is_chord_line(line)
        if is_ch:
            pref, rest = split_section_prefix(line)
            new_rest = transliterate_line(rest) if has_pt else rest
            if has_pt:
                pt_converted += 1
                changed = True
            new_line = pref + new_rest
            new_body.append(new_line.rstrip())
            # recolher acordes (EN) para key detection
            for t in tokenize(split_section_prefix(new_line)[1]):
                core = re.sub(r"^\((.*)\)$", r"\1", t)
                if IGNORE_TOK_RE.match(core):
                    continue
                if EN_CHORD_RE.match(core) and chord_quality(core):
                    collected.append(core)
        else:
            new_body.append(line)

    # preencher tom se vazio
    tom_conf = None
    if tom_idx is not None and tom_val == "" and collected:
        tom, conf = detect_key(collected)
        if tom:
            new_header[tom_idx] = f"tom: {tom}"
            tom_conf = conf
            changed = True

    if not changed:
        return {"path": path, "changed": False, "pt": pt_converted,
                "tom_filled": None, "tom_conf": None}

    out = "---\n" + "\n".join(new_header) + "\n---\n\n" + "\n".join(new_body).rstrip() + "\n"
    return {"path": path, "changed": True, "pt": pt_converted,
            "tom_filled": tom_conf is not None, "tom_conf": tom_conf, "out": out}


def main():
    results = []
    for root, _, files in os.walk(CIFRAS_DIR):
        for f in sorted(files):
            if f.endswith(".txt"):
                r = process(os.path.join(root, f))
                if r:
                    results.append(r)

    pt_files = [r for r in results if r["pt"] > 0]
    tom_filled = [r for r in results if r["tom_filled"]]
    tom_high = [r for r in tom_filled if r["tom_conf"] == "high"]

    print(f"Ficheiros analisados:            {len(results)}")
    print(f"  com acordes PT convertidos:    {len(pt_files)}")
    print(f"  linhas de acordes convertidas: {sum(r['pt'] for r in results)}")
    print(f"  tom preenchido (estava vazio): {len(tom_filled)}")
    print(f"     confiança alta (=últ.acorde): {len(tom_high)}")
    print(f"     confiança baixa (rever):       {len(tom_filled) - len(tom_high)}")

    if APPLY:
        n = 0
        for r in results:
            if r["changed"]:
                open(r["path"], "w", encoding="utf-8").write(r["out"])
                n += 1
        print(f"\nAPLICADO a {n} ficheiros.")
    else:
        print("\nDRY-RUN. Corre com --apply para reescrever.")


if __name__ == "__main__":
    main()
