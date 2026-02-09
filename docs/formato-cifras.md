# Formato de Cifras

Cada cifra é um ficheiro `.txt` com header YAML e corpo de texto com acordes posicionados sobre as letras.

## Header YAML

O ficheiro começa com um bloco YAML delimitado por `---`:

```yaml
---
titulo: Nome da Música
artista: Nome do Artista
tom: C
subtitulo: Texto opcional
---
```

Campos:
- **titulo** (obrigatório): nome da música
- **tom** (obrigatório): tonalidade principal (notação internacional: C, D, E, F, G, A, B)
- **artista** (opcional): compositor ou intérprete
- **subtitulo** (opcional): informação adicional

Para medleys com múltiplas tonalidades: `tom: Dm / Am`

## Corpo

Após o header, o corpo contém as secções da música.

### Acordes sobre letras

Acordes são posicionados na linha acima da letra, alinhados por espaços:

```
     C               G
Primeira linha da letra
         Am          F
Segunda linha da letra
```

A posição do acorde corresponde à sílaba onde muda a harmonia.

### Notação de acordes

Usar **notação internacional**: C, D, E, F, G, A, B (não Dó, Ré, Mi).

Acordes suportados:
- Maiores: `C`, `D`, `G`
- Menores: `Am`, `Dm`, `Em`
- Sétimas: `G7`, `D7`, `Am7`
- Complexos: `C/G`, `F#m`, `Bdim`, `Gsus4`, `Cadd9`

### Secções

Secções são marcadas com `[NOME]` no início da linha:

```
[INTRO]   C G Am F (2x)

[REFRÃO]
    C       G
Texto do refrão

[PASSAGEM]
Am  G  F  C

[SOLO]
Em  Am  D7  G

[INSTR.]
C  F  G  C

[SAÍDA]
Am  G  C
```

Secções com acordes inline (ex: `[INTRO]   C G Am F`) mantêm os acordes na mesma linha.

### Bold (refrão)

Texto entre `**` aparece em negrito no PDF:

```
[REFRÃO]
    C       G
**Texto do refrão em bold**
         Am          F
**Segunda linha do refrão**
```

### Instruções

Texto entre `[...]` que não seja um nome de secção é tratado como instrução:

```
[SOBE UM TOM]
[Repete 2x]
[Param os instrumentos]
[CONCLUSÃO – ANEXO DE PODES PARTIR]
[SAÍDA PARA AI VISEU]
```

### Medleys

Músicas compostas por múltiplas partes são separadas por `===`:

```yaml
---
titulo: Caravelas / Menina da Saia Preta
tom: Dm / Am
---

[parte: Caravelas]
[tom: Dm]

(corpo da primeira parte)

===

[parte: Menina da Saia Preta]
[tom: Am]

(corpo da segunda parte)
```

Cada parte pode ter metadata própria: `[parte: Nome]` e `[tom: X]`.

### Bloco Solista

Para partes a solo com texto que não são acordes sobre letras:

```
[SOLISTA]
Sinto a falta do teu sorriso (Em)
Que iluminava o meu caminho (Am)
[/SOLISTA]
```

### Chaves de repetição

Repetições com chaves visuais usam `}` seguido de contagem:

```
[INTRO]   Dm  C  Dm  F  Am  Dm  C  Dm } 2x
```

## Exemplos

### Música simples

```yaml
---
titulo: Ai Viseu
tom: C
---

[INTRO]   C A Dm F G C (2x)

                   C
Ó Viseu anda pra rua
                 A
Vamos acordar a Lua

[REFRÃO]
     C                  Am
**Tens ruelas tortuosas**
```

### Medley

```yaml
---
titulo: Caravelas / Menina da Saia Preta
tom: Dm / Am
---

[parte: Caravelas]
[tom: Dm]

[INTRO]   Dm A7 Dm

    Dm            A7
Era uma vez um marinheiro

===

[parte: Menina da Saia Preta]
[tom: Am]

     Am            G
Menina da saia preta
```
