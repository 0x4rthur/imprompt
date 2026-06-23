// presetColor.ts — uma cor (matiz) por "tipo de tarefa" (preset), pra
// identificação visual rápida na timeline do Início e nos chips do popup.
//
// Matizes fixos pros presets EMBUTIDOS; um hash determinístico cobre os
// customizados (o mesmo preset sempre cai na mesma cor). O número é só o H do
// OKLCH: ele entra numa custom property `--pc-h` e o CSS deriva fundo/texto/borda
// legíveis a partir dele (texto escuro sobre tinta clara), então a legibilidade
// vale pra qualquer matiz, sem precisar afinar cor a cor.

const BUILTIN_HUE: Record<string, number> = {
  estruturar: 300, // violeta
  codigo: 195, // ciano
  corrigir: 150, // verde
  ingles: 45, // âmbar
  frontend: 350, // rosa
};

// Hash estável (djb2) → matiz 0-359, para presets não-embutidos.
function hashHue(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Matiz OKLCH (0-359) determinístico para o id de um preset. */
export function presetHue(id: string): number {
  return BUILTIN_HUE[id] ?? hashHue(id);
}
