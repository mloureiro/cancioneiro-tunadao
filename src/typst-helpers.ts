// Helpers partilhados para gerar código Typst (usados pelos layouts).

// Escapar caracteres especiais para Typst content mode
export function escTypst(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    // "//" é comentário em Typst; escapar a barra evita que letras/acordes
    // (ex: "G/B", ou lixo de extração "Ré//Fá") comentem o resto da linha.
    .replace(/\//g, "\\/");
}

// Escapar string literal para Typst (entre aspas)
export function escLiteral(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

// Gerar label ID sanitizado para Typst (letras ASCII, dígitos, hífens)
export function songLabelId(title: string): string {
  return title
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
