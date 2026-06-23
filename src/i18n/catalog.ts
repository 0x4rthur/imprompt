// catalog.ts — dicionário de strings da UI (EN canônico + pt-BR).
//
// EN é a FONTE da verdade das chaves: o tipo `Key` deriva dele, então uma chave
// usada no código que não exista no catálogo vira erro de compilação no TS. O
// objeto pt-BR é tipado como `Record<keyof typeof en, string>`, forçando (em
// tempo de compilação) que toda chave EN tenha também uma tradução PT. Chaves
// novas SEMPRE entram nos dois objetos.
//
// Marca (OpenAI, Anthropic, Gemini, xAI, DeepSeek…) NUNCA entra aqui.
// Interpolação de valores: `{nome}` (ex.: "{mod}+{key} ×2").

export type Locale = "en" | "pt-BR";

const en = {
  "tab.inicio": "Home",
  "tab.historico": "History",
  "tab.presets": "Presets",
  "tab.api": "API",
  "tab.gatilho": "Shortcut",
  "tab.sobre": "About",
} as const;

const ptBR: Record<keyof typeof en, string> = {
  "tab.inicio": "Início",
  "tab.historico": "Histórico",
  "tab.presets": "Presets",
  "tab.api": "API",
  "tab.gatilho": "Atalho",
  "tab.sobre": "Sobre",
};

export const CATALOG = { en, "pt-BR": ptBR } as const;
export type Key = keyof typeof en;
