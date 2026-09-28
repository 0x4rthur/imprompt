// dev/tauri-mock/core.ts — invoke() falso para `npm run dev:mock`.
//
// Deixa as janelas (Preferências, popup) rodarem no navegador com dados de
// exemplo, pra conferência visual sem o Tauri. Só é usado quando o Vite roda em
// `--mode mock` (alias em vite.config.ts); o build de produção nem o importa.
// Parâmetros de URL: ?empty=1 (sem histórico/uso), ?err=1 (API falha),
// ?lang=en (inglês), ?presets=11 (11 presets, pra testar muitas linhas).
import type { MonthUsage, Preset, RefineRecord, Settings, UsageSummary } from "../../types";

const q = new URLSearchParams(location.search);
const EMPTY = q.has("empty");
const ERR = q.has("err");
const MANY = q.get("presets") === "11";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STORE = "mock.settings";

const DEFAULTS: Settings = {
  default_preset: "estruturar", mode: "instant", output: "replace", autostart: false,
  api_base_url: "https://api.openai.com/v1", api_model: "gpt-5.6-luna", api_format: "auto", api_custom: false,
  api_fast_mode: true, use_examples: true, trigger_modifier: "ctrl", trigger_key: "c", debounce_ms: 400,
  locale: q.get("lang") === "en" ? "en" : "pt-BR", theme: "system",
};

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null") as Partial<Settings> | null;
    const s: Settings = { ...DEFAULTS, ...(saved ?? {}) };
    if (q.get("lang")) s.locale = q.get("lang") === "en" ? "en" : "pt-BR";
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}
let settings = loadSettings();
function saveSettings(next: Settings) {
  settings = next;
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* aba privada */ }
}

const BUILTIN: Array<[string, string, string]> = [
  ["estruturar", "Estruturar", "Structure"],
  ["codigo", "Prompt de código", "Code prompt"],
  ["corrigir", "Corrigir & clarear", "Fix & clarify"],
  ["ingles", "Traduzir p/ EN", "Translate to English"],
  ["frontend", "Vibe Code", "Vibe Code"],
  ["resumir", "Resumir", "Summarize"],
];
function defaults(): Preset[] {
  const list: Preset[] = BUILTIN.map(([id, pt, en]) => ({
    id, label: settings.locale === "en" ? en : pt,
    instruction: "Reescreva o prompt enviado com estrutura clara e lógica: papel, contexto, tarefa e formato de saída.",
    example_input: "", example_output: "", builtin: true, edited: id === "frontend",
  }));
  if (MANY) {
    for (let i = 1; i <= 5; i++) {
      list.push({ id: "custom-" + i, label: "Meu preset " + i, instruction: "…", example_input: "", example_output: "", builtin: false, edited: false });
    }
  }
  return list;
}
let presets: Preset[] = defaults();

const MIN = 60_000;
const now = Date.now();
const HISTORY: RefineRecord[] = [
  { original: "me ajuda a escrever um email pro cliente explicando o atraso da entrega sem parecer desculpa", result: "Tarefa: escreva um e-mail ao cliente explicando o atraso da entrega.\nTom: profissional e direto, sem soar como desculpa.\nFormato: até 5 frases, com a nova data.", preset: "estruturar", timestamp: now - 2 * MIN },
  { original: "faz um script que renomeia as fotos da pasta pela data que foram tiradas", result: "Crie um script Python que renomeie as fotos de uma pasta usando a data de captura (EXIF DateTimeOriginal).", preset: "codigo", timestamp: now - 29 * MIN },
  { original: "oi pessoal segue o relatorio atualizado com os numeros de setembro qualquer duvida me chama", result: "Oi, pessoal! Segue o relatório atualizado com os números de setembro. Qualquer dúvida, me chamem.", preset: "corrigir", timestamp: now - 3 * 60 * MIN },
  { original: "Crie uma função Python chamada `calcular_total` que some uma lista de preços.", result: "Write a Python function named `calcular_total` that sums a list of prices.", preset: "ingles", timestamp: now - 26 * 60 * MIN },
  { original: "o botão de salvar some quando a tela fica pequena e o modal não fecha no esc", result: "## Requests\n1. The Save button disappears on narrow windows.\n2. The modal does not close on Esc.", preset: "frontend", timestamp: now - 28 * 60 * MIN },
];

function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const MONTHS: MonthUsage[] = ([
  [5, 38, 0.12, 52_000, 14_000], [4, 97, 0.31, 131_000, 36_000], [3, 70, 0.22, 96_000, 27_000],
  [2, 121, 0.38, 166_000, 46_000], [1, 88, 0.29, 120_000, 33_000], [0, 132, 0.421, 182_400, 51_200],
] as const).map(([offset, n, cost, pin, pout]) => ({ month: monthKey(offset), refinements: n, cost_usd: cost, prompt_tokens: pin, completion_tokens: pout, approximate: true }));

const CAPTURED = "me ajuda a escrever um email pro cliente explicando o atraso da entrega sem parecer desculpa, e diz que a nova data é sexta que vem, com o rastreio";
const RESULT = "Papel: você é um gerente de contas cuidadoso.\nTarefa: escreva um e-mail ao cliente explicando o atraso da entrega.\nTom: profissional e direto, sem soar como desculpa.\nDetalhes: a nova data é sexta que vem; inclua o código de rastreio.\nFormato: até 5 frases.";
const API_ERROR = "Chave de API inválida ou sem permissão.";

export async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const out = await handle(cmd, args);
  return out as T;
}

async function handle(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case "get_settings": return { ...settings };
    case "set_settings": saveSettings(args.newSettings as Settings); return null;
    case "list_presets": return presets.map((p) => ({ ...p }));
    case "create_preset": {
      const p = args.preset as Preset;
      const created: Preset = { ...p, id: p.label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "preset", builtin: false, edited: false };
      presets = [...presets, created];
      return created;
    }
    case "update_preset": {
      const p = args.preset as Preset;
      presets = presets.map((x) => (x.id === p.id ? { ...x, ...p, builtin: x.builtin, edited: x.builtin } : x));
      return null;
    }
    case "delete_preset": presets = presets.filter((x) => x.id !== args.id); return null;
    case "restore_default_presets": presets = defaults(); return null;
    case "get_history": return EMPTY ? [] : HISTORY;
    case "get_usage": {
      const cur = MONTHS[MONTHS.length - 1];
      const usage: UsageSummary = EMPTY
        ? { month: monthKey(0), refinements: 0, cost_usd: 0, approximate: true }
        : { month: cur.month, refinements: cur.refinements, cost_usd: cur.cost_usd, approximate: true };
      return usage;
    }
    case "get_usage_history": return EMPTY ? [] : MONTHS;
    case "get_api_balance": {
      // ?lowbal=1 simula saldo baixo; DeepSeek/OpenRouter leem saldo, o resto dá o link.
      const host = new URL(settings.api_base_url).host;
      const low = new URLSearchParams(location.search).has("lowbal");
      if (host.endsWith("deepseek.com") || low) return { kind: "remaining", amount: low ? 0.42 : 4.2, currency: "USD" };
      if (host.endsWith("openrouter.ai")) return { kind: "used", amount: 1.5, currency: "USD" };
      return { kind: "unsupported", billing_url: host.endsWith("openai.com") ? "https://platform.openai.com/settings/organization/billing/overview" : null };
    }
    case "get_api_key_status": return { saved: true, masked: "sk-…DEMO" };
    case "test_api_connection":
      await wait(700);
      if (ERR) throw API_ERROR;
      return "OK";
    case "apply_api_configuration": {
      await wait(900);
      if (ERR) throw API_ERROR;
      const next: Settings = {
        ...settings, api_base_url: String(args.baseUrl), api_model: String(args.model),
        api_format: args.format as Settings["api_format"], api_custom: Boolean(args.custom), api_fast_mode: args.fastMode !== false,
      };
      saveSettings(next);
      return { ...next };
    }
    case "check_accessibility": return true;
    case "get_captured_text": return CAPTURED;
    case "refine_text":
      await wait(1300);
      if (ERR) throw API_ERROR;
      return RESULT;
    case "deliver_result": return null;
    case "get_pending_update": return null;
    case "check_for_updates": await wait(800); return null;
    case "install_update": await wait(1000); return null;
    default: return null;
  }
}
