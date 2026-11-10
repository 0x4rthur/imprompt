// @vitest-environment jsdom
// O popup precisa guardar a INTENÇÃO do usuário mesmo quando as teclas chegam
// mais rápido que a API: Enter durante o carregamento, troca de preset depois
// (ou durante) um refino, Esc, e a janela sendo reusada com outro texto.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

const hide = vi.fn(() => Promise.resolve());
const show = vi.fn(() => Promise.resolve());
const events = vi.hoisted(() => new Map<string, (e: { payload: string }) => void>());
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, cb: (e: { payload: string }) => void) => {
    events.set(name, cb);
    return Promise.resolve(() => {});
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ hide, show }) }));
vi.mock("./autoscroll", () => ({ initAutoScrollbars: () => () => {} }));
import Palette from "./Palette";

const presets = Array.from({ length: 4 }, (_, i) => ({
  id: "p" + i, label: "Preset " + i, instruction: "", example_input: "", example_output: "", builtin: true, edited: false,
}));
const SETTINGS = { default_preset: "p0", output: "replace", api_model: "gpt-x", locale: "en", theme: "system" };

// Cada refine_text fica pendente até o teste resolver: simula a espera da API.
type Pending = { presetId: string; text: string; resolve: (out: string) => void; reject: (e: unknown) => void };
let pending: Pending[] = [];
let settings: () => Promise<typeof SETTINGS>;

const calls = (cmd: string) => vi.mocked(invoke).mock.calls.filter(([c]) => c === cmd);
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
// Pausa maior que a janela de "rajada de Enter" do popup: o usuário parou de
// apertar, olhou o resultado, e só então age.
const calm = () => act(() => new Promise((resolve) => setTimeout(resolve, 660)));
// Ritmo HUMANO de "ficar apertando Enter": um toque a cada ~0,35 s (não a cada
// poucos ms, como uma máquina). Nesse ritmo nenhum toque pode valer como
// confirmação — nem fechar o popup no meio (o próximo cairia no app de origem).
const tap = async (times: number, everyMs = 350) => {
  for (let i = 0; i < times; i++) {
    fireEvent.keyDown(window, { key: "Enter" });
    await act(() => new Promise((resolve) => setTimeout(resolve, everyMs)));
  }
};

beforeEach(() => {
  hide.mockClear();
  show.mockClear();
  pending = [];
  settings = async () => SETTINGS;
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
    switch (cmd) {
      case "list_presets": return presets;
      case "get_captured_text": return "make this better";
      case "get_settings": return settings();
      case "refine_text": {
        const a = args as { text: string; presetId: string };
        return new Promise<string>((resolve, reject) => pending.push({ ...a, resolve, reject }));
      }
      default: return null;
    }
  });
});
afterEach(cleanup);

async function open() {
  render(<Palette />);
  await screen.findByText("make this better");
  await screen.findByText("Preset 3");
  await flush();
}

it("Enter pressed again while loading applies the result as soon as it arrives", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" });
  expect(calls("refine_text")).toHaveLength(1);
  expect(screen.getByText(/applies when ready/)).toBeTruthy();
  await act(async () => { pending[0].resolve("Better text"); });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Better text", presetId: "p0" }));
  expect(calls("deliver_result")).toHaveLength(1);
});

it("a queued apply never applies an error", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].reject("Invalid key"); });
  expect((await screen.findByRole("alert")).textContent).toBe("Invalid key");
  expect(calls("deliver_result")).toHaveLength(0);
});

// A lógica do usuário, tudo no Enter: trocar de preset só SELECIONA (o resultado
// do anterior some; nada é refeito sozinho); Enter gera com o preset novo; e
// Enter de novo, no mesmo preset, insere.
it("after a result, picking another preset only selects it; Enter generates with it; Enter again inserts", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Result of p0"); });
  await screen.findByText("Result of p0");
  fireEvent.keyDown(window, { key: "3" }); // não gostei: troca pro p2
  expect(screen.queryByText("Result of p0")).toBeNull();
  await flush();
  expect(calls("refine_text")).toHaveLength(1); // nada refeito sozinho
  fireEvent.keyDown(window, { key: "Enter" }); // Enter = gera com o novo
  expect(pending[1]).toMatchObject({ presetId: "p2", text: "make this better" });
  expect(calls("deliver_result")).toHaveLength(0);
  await act(async () => { pending[1].resolve("Result of p2"); });
  await screen.findByText("Result of p2");
  await calm();
  fireEvent.keyDown(window, { key: "Enter" }); // mesmo preset: insere
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Result of p2", presetId: "p2" }));
  expect(calls("deliver_result")).toHaveLength(1);
});

it("picking another preset while loading drops that request; Enter generates with the new one", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Preset 1" }));
  expect(pending).toHaveLength(1); // nada refeito sozinho
  await act(async () => { pending[0].resolve("Old answer"); });
  expect(screen.queryByText("Old answer")).toBeNull();
  expect(calls("deliver_result")).toHaveLength(0);
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pending[1].presetId).toBe("p1");
  await act(async () => { pending[1].resolve("New answer"); });
  expect(await screen.findByText("New answer")).toBeTruthy();
});

it("picking a preset before the first Enter only selects it", async () => {
  await open();
  fireEvent.keyDown(window, { key: "2" });
  expect(calls("refine_text")).toHaveLength(0);
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pending[0].presetId).toBe("p1");
});

it("Esc while loading cancels: the late answer is neither shown nor applied", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" }); // aplicar ao chegar…
  fireEvent.keyDown(window, { key: "Escape" }); // …mas o usuário desistiu
  expect(hide).toHaveBeenCalled();
  await act(async () => { pending[0].resolve("Too late"); });
  await flush();
  expect(calls("deliver_result")).toHaveLength(0);
  expect(screen.queryByText("Too late")).toBeNull();
});

it("an answer for the previous capture never lands on a reused popup", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  act(() => events.get("captured-text")!({ payload: "second text" }));
  await act(async () => { pending[0].resolve("Answer for the first text"); });
  await flush();
  expect(screen.getByText("second text")).toBeTruthy();
  expect(screen.queryByText("Answer for the first text")).toBeNull();
  // E o popup segue utilizável pro texto novo.
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pending[1]).toMatchObject({ text: "second text" });
});

it("a preset picked before the settings arrive is not overridden by the default", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  settings = async () => { await gate; return { ...SETTINGS, default_preset: "p3" }; };
  render(<Palette />);
  await screen.findByText("Preset 3");
  fireEvent.keyDown(window, { key: "2" });
  await act(async () => { release(); });
  await flush();
  expect(screen.getByRole("button", { name: "Preset 1" }).getAttribute("aria-pressed")).toBe("true");
});

it("the preset list is refreshed every time the popup is reused", async () => {
  // A janela nasce na inicialização do app: presets criados/excluídos depois
  // precisam aparecer na próxima abertura, sem reiniciar.
  await open();
  fireEvent.keyDown(window, { key: "4" }); // escolhe o Preset 3…
  const fresh = [presets[0], presets[1], { ...presets[0], id: "novo", label: "Brand new" }];
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) =>
    cmd === "list_presets" ? Promise.resolve(fresh) : (original as (c: string, a?: unknown) => Promise<unknown>)(cmd, args));
  act(() => events.get("captured-text")!({ payload: "second text" }));
  expect(await screen.findByRole("button", { name: "Brand new" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Preset 3" })).toBeNull(); // …que foi excluído
  // A seleção cai num preset que existe (o padrão), e é com ele que refina.
  fireEvent.keyDown(window, { key: "Enter" });
  expect(pending[0].presetId).toBe("p0");
});

it("clicking into another window cancels the queued apply", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" }); // aplica ao chegar…
  fireEvent.blur(window); // …mas o usuário foi pra outra janela
  await act(async () => { pending[0].resolve("Better text"); });
  expect(await screen.findByText("Better text")).toBeTruthy(); // fica esperando o Enter
  expect(calls("deliver_result")).toHaveLength(0);
});

it("Enter right after Esc does not apply the result being dismissed", async () => {
  // Movimento ligado: o Esc toca 130 ms de saída antes de esconder a janela.
  vi.stubGlobal("matchMedia", () => ({
    matches: false, media: "", onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  try {
    await open();
    fireEvent.keyDown(window, { key: "Enter" });
    await act(async () => { pending[0].resolve("Better text"); });
    await screen.findByText("Better text");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "2" });
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(calls("deliver_result")).toHaveLength(0);
    expect(calls("refine_text")).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("Enter still applies after a mouse click on Copy", async () => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Better text"); });
  const copy = await screen.findByRole("button", { name: "Copy" });
  copy.focus();
  await act(async () => { fireEvent.click(copy, { detail: 1 }); }); // clique de mouse
  fireEvent.keyDown(document.activeElement ?? window, { key: "Enter" });
  await waitFor(() => expect(calls("deliver_result")).toHaveLength(1));
});

it("Enter on a focused preset chip refines with that preset", async () => {
  await open();
  const chip = screen.getByRole("button", { name: "Preset 2" });
  chip.focus();
  fireEvent.keyDown(chip, { key: "Enter" });
  expect(pending[0].presetId).toBe("p2");
});

// O relato do usuário, passo a passo: gera com um preset, troca enquanto ele
// carrega e fica apertando Enter. Tem que gerar com o NOVO, e é o resultado do
// novo que entra — nunca o do primeiro.
it("generate with one preset, switch while it loads, keep pressing Enter: the new preset is generated and inserted", async () => {
  await open();
  const clicked = screen.getByRole("button", { name: "Preset 2" });
  clicked.focus(); // o clique de mouse foca o botão
  fireEvent.click(clicked, { detail: 1 });
  fireEvent.keyDown(document.activeElement ?? window, { key: "Enter" });
  expect(pending[0].presetId).toBe("p2");
  fireEvent.keyDown(document.activeElement ?? window, { key: "2" }); // troca pro Preset 1
  await tap(4); // fica apertando Enter, no ritmo de uma pessoa
  expect(pending).toHaveLength(2);
  expect(pending[1].presetId).toBe("p1"); // o 1º Enter gerou com o novo
  expect(screen.getByRole("button", { name: "Preset 1" }).getAttribute("aria-pressed")).toBe("true");
  expect(calls("deliver_result")).toHaveLength(0);
  await act(async () => { pending[0].resolve("Result of p2"); pending[1].resolve("Result of p1"); });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Result of p1", presetId: "p1" }), { timeout: 2000 });
  expect(calls("deliver_result")).toHaveLength(1);
  expect(calls("refine_text")).toHaveLength(2);
}, 15000);

it("same thing with the first result already on screen: the old result is never inserted", async () => {
  await open();
  const clicked = screen.getByRole("button", { name: "Preset 2" });
  clicked.focus();
  fireEvent.click(clicked, { detail: 1 });
  fireEvent.keyDown(document.activeElement ?? window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Result of p2"); });
  await screen.findByText("Result of p2");
  await calm();
  fireEvent.keyDown(document.activeElement ?? window, { key: "4" }); // troca pro Preset 3
  await tap(3);
  expect(calls("deliver_result")).toHaveLength(0); // o resultado do p2 NÃO entrou
  expect(hide).not.toHaveBeenCalled();
  expect(pending).toHaveLength(2);
  expect(pending[1].presetId).toBe("p3");
  await act(async () => { pending[1].resolve("Result of p3"); });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Result of p3", presetId: "p3" }), { timeout: 2000 });
  expect(calls("deliver_result")).toHaveLength(1);
}, 15000);

it("a number key wins over a chip that only has keyboard focus", async () => {
  await open();
  screen.getByRole("button", { name: "Preset 3" }).focus(); // Tab até o chip, sem escolher
  fireEvent.keyDown(document.activeElement ?? window, { key: "2" });
  fireEvent.keyDown(document.activeElement ?? window, { key: "Enter" });
  expect(pending).toHaveLength(1);
  expect(pending[0].presetId).toBe("p1");
});

it("pressing the number of the preset already selected still wins over a focused chip", async () => {
  await open();
  screen.getByRole("button", { name: "Preset 3" }).focus();
  fireEvent.keyDown(document.activeElement ?? window, { key: "1" }); // o Preset 0 já é o selecionado
  fireEvent.keyDown(document.activeElement ?? window, { key: "Enter" });
  expect(pending).toHaveLength(1);
  expect(pending[0].presetId).toBe("p0");
});

// Rajada de Enter ("fico apertando Enter"). Quando o popup fecha, o próximo
// Enter cai no app de origem — num chat, isso ENVIA o texto cru. Então nada é
// colado enquanto as teclas não pararem.
it("a fast Enter burst after a switch: generates the new preset, pastes nothing mid-burst, then inserts the new result", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Result of p0"); });
  await screen.findByText("Result of p0");
  await calm();
  fireEvent.click(screen.getByRole("button", { name: "Preset 1" })); // troca pro p1
  for (let i = 0; i < 4; i++) fireEvent.keyDown(window, { key: "Enter" }); // rajada
  expect(calls("deliver_result")).toHaveLength(0); // o resultado do p0 NÃO entra
  expect(hide).not.toHaveBeenCalled();
  expect(pending).toHaveLength(2);
  expect(pending[1].presetId).toBe("p1");
  await act(async () => { pending[1].resolve("Result of p1"); });
  fireEvent.keyDown(window, { key: "Enter" }); // ainda apertando quando chegou
  await flush();
  expect(hide).not.toHaveBeenCalled(); // não fecha no meio da rajada
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Result of p1", presetId: "p1" }));
  expect(calls("deliver_result")).toHaveLength(1);
});

it("going back to the first preset after a switch generates again; nothing stale is inserted", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Result of p0"); });
  await screen.findByText("Result of p0");
  fireEvent.keyDown(window, { key: "2" });
  fireEvent.keyDown(window, { key: "1" }); // voltou pro p0: o resultado antigo já saiu da tela
  expect(screen.queryByText("Result of p0")).toBeNull();
  await calm();
  fireEvent.keyDown(window, { key: "Enter" });
  expect(calls("deliver_result")).toHaveLength(0);
  expect(pending).toHaveLength(2);
  expect(pending[1].presetId).toBe("p0");
});

it("at a human pace, Enter taps on the same preset paste only after they stop", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await tap(2);
  await act(async () => { pending[0].resolve("Better text"); });
  await tap(4); // 1,4 s apertando depois que a resposta chegou
  expect(hide).not.toHaveBeenCalled();
  expect(calls("deliver_result")).toHaveLength(0);
  await waitFor(() => expect(calls("deliver_result")).toHaveLength(1), { timeout: 2000 });
  expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Better text", presetId: "p0" });
}, 15000);

// Sem o nome do preset no resultado, não dá pra VER que o popup entendeu a troca.
it("the result card names the preset being generated and the one that produced the result", async () => {
  await open();
  const live = () => within(document.querySelector<HTMLElement>(".result-live")!);
  fireEvent.keyDown(window, { key: "Enter" });
  expect(live().getByText("Preset 0")).toBeTruthy(); // gerando com o p0
  await act(async () => { pending[0].resolve("Result of p0"); });
  await screen.findByText("Result of p0");
  expect(live().getByText("Preset 0")).toBeTruthy();
  fireEvent.keyDown(window, { key: "3" }); // troca: o card do p0 some
  expect(live().queryByText("Preset 0")).toBeNull();
  fireEvent.keyDown(window, { key: "Enter" });
  expect(live().getByText("Preset 2")).toBeTruthy(); // gerando com o p2
  await act(async () => { pending[1].resolve("Result of p2"); });
  await screen.findByText("Result of p2");
  expect(live().getByText("Preset 2")).toBeTruthy();
});

it("an Enter burst on the same preset pastes only after the keys stop", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Better text"); });
  fireEvent.keyDown(window, { key: "Enter" }); // ainda apertando quando a resposta chegou
  await flush();
  // O popup NÃO fecha no meio da rajada (o próximo Enter iria pro app de origem).
  expect(hide).not.toHaveBeenCalled();
  expect(calls("deliver_result")).toHaveLength(0);
  await waitFor(() => expect(calls("deliver_result")).toHaveLength(1));
  expect(invoke).toHaveBeenCalledWith("deliver_result", { text: "Better text", presetId: "p0" });
});

it("Enter, Enter typed before the answer still pastes the instant it arrives", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" });
  await calm(); // a API demora mais que a digitação: as teclas já pararam
  await act(async () => { pending[0].resolve("Better text"); });
  await flush();
  expect(calls("deliver_result")).toHaveLength(1);
});

it("R while an insert is pending asks for another result and does not insert it unseen", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" }); // inserir ao chegar…
  await act(async () => { pending[0].resolve("First try"); });
  await screen.findByText("First try"); // …esperando as teclas pararem
  fireEvent.keyDown(window, { key: "r" }); // mas pediu outro resultado
  expect(pending).toHaveLength(2);
  await act(async () => { pending[1].resolve("Second try"); });
  await screen.findByText("Second try");
  await calm();
  expect(calls("deliver_result")).toHaveLength(0); // o novo espera um Enter
});

it("Esc during a burst cancels the pending paste", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Better text"); });
  fireEvent.keyDown(window, { key: "Enter" });
  fireEvent.keyDown(window, { key: "Escape" });
  await calm();
  expect(calls("deliver_result")).toHaveLength(0);
});

// Rastro de diagnóstico: o popup anota teclas, presets e tempos (pra dar pra ver
// o que aconteceu quando alguém relata um comportamento estranho). O texto do
// usuário e o resultado NUNCA entram nele.
it("leaves a diagnostic trail of keys and presets, never of the text", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => { pending[0].resolve("Secret result"); });
  await screen.findByText("Secret result");
  fireEvent.keyDown(window, { key: "2" });
  fireEvent.keyDown(window, { key: "Escape" });
  await flush();
  const sent = calls("popup_trace").map(([, args]) => JSON.stringify(args)).join("\n");
  expect(sent).toContain("enter");
  expect(sent).toContain("p1"); // o preset escolhido
  expect(sent).not.toContain("make this better");
  expect(sent).not.toContain("Secret result");
});

it("Enter in the same instant the answer lands applies it instead of refining again", async () => {
  await open();
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => {
    pending[0].resolve("Better text");
    await new Promise((resolve) => setTimeout(resolve, 0)); // resposta processada, tela ainda não
    fireEvent.keyDown(window, { key: "Enter" });
  });
  await waitFor(() => expect(calls("deliver_result")).toHaveLength(1));
  expect(calls("refine_text")).toHaveLength(1);
});

it("a copy of the Reply preset is also announced as copy-only", async () => {
  const withReply = [...presets, { ...presets[0], id: "reply-copy", label: "My reply", reply: true }];
  const original = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) =>
    cmd === "list_presets" ? Promise.resolve(withReply) : (original as (c: string, a?: unknown) => Promise<unknown>)(cmd, args));
  render(<Palette />);
  await screen.findByText("make this better");
  fireEvent.click(await screen.findByRole("button", { name: "My reply" }));
  expect(screen.getByText("will copy the reply — paste it with Ctrl+V")).toBeTruthy();
});
