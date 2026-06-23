// types.ts — tipos compartilhados entre App.tsx e os componentes de aba.
// Espelham os tipos do backend (commands.rs / settings.rs).
export type Preset = {
  id: string;
  label: string;
  instruction: string;
  example_input: string;
  example_output: string;
  builtin: boolean;
  /** Preset padrão que o usuário editou (override ativo) — mostra "editado". */
  edited: boolean;
};

// Rascunho do formulário de "Meus presets" (id null = criando um novo).
export type PresetDraft = {
  id: string | null;
  label: string;
  instruction: string;
  example_input: string;
  example_output: string;
};

export type Settings = {
  default_preset: string;
  mode: "instant" | "popup";
  output: "replace" | "clipboard";
  autostart: boolean;
  api_base_url: string;
  api_model: string;
  use_examples: boolean;
  trigger_modifier: "ctrl" | "alt" | "shift";
  trigger_key: string;
  debounce_ms: number;
  // Idioma da UI. Espelha Settings.locale do backend (default "en").
  locale: "en" | "pt-BR";
  // NOTA: a chave NÃO trafega mais nas settings — ela vai pro cofre do SO via os
  // comandos set_api_key / get_api_key_status.
};

// Estado da chave salva no cofre (sem o valor real).
export type ApiKeyStatus = { saved: boolean; masked: string };

// Um refino do histórico (espelha commands::RefineRecord).
export type RefineRecord = { original: string; result: string; preset: string; timestamp: number };

// Uso da API no mês (espelha usage::UsageSummary).
export type UsageSummary = { month: string; refinements: number; cost_usd: number; approximate: boolean };

// Uso da API por mês (espelha usage::MonthSummary) — pro gráfico de gastos do dashboard.
export type MonthUsage = { month: string; refinements: number; cost_usd: number; prompt_tokens: number; completion_tokens: number; approximate: boolean };

// Abas da janela de preferências (id interno; o rótulo visível está no App.tsx).
export type Tab = "inicio" | "historico" | "motor" | "presets" | "gatilho" | "geral";
