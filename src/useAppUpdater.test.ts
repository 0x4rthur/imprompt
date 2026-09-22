// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import { useAppUpdater } from "./useAppUpdater";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const events = new Map<string, (event: Event<unknown>) => void>();

beforeEach(() => {
  events.clear();
  vi.mocked(invoke).mockReset().mockResolvedValue(null);
  vi.mocked(listen).mockReset().mockImplementation(async (event, handler) => {
    events.set(event, handler as (event: Event<unknown>) => void);
    return () => { events.delete(event); };
  });
});
afterEach(cleanup);

async function setup() {
  const hook = renderHook(useAppUpdater);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_pending_update"));
  return hook;
}
function emit(name: string, payload: unknown) {
  events.get(name)?.({ event: name, id: 1, payload });
}

describe("app updates", () => {
  it("checks, offers the new version, and clears an obsolete offer on recheck", async () => {
    const { result } = await setup();
    vi.mocked(invoke).mockResolvedValueOnce("0.1.3");
    await act(() => result.current.check());
    expect(result.current.version).toBe("0.1.3");
    expect(result.current.checked).toBe(true);
    vi.mocked(invoke).mockResolvedValueOnce(null);
    await act(() => result.current.check());
    expect(result.current.version).toBeNull();
    expect(result.current.checking).toBe(false);
  });

  it("reports a failed check and allows retry", async () => {
    const { result } = await setup();
    vi.mocked(invoke).mockRejectedValueOnce("network unavailable");
    await act(() => result.current.check());
    expect(result.current.error).toBe("network unavailable");
    expect(result.current.checked).toBe(false);
    vi.mocked(invoke).mockResolvedValueOnce("0.1.3");
    await act(() => result.current.check());
    expect(result.current.error).toBe("");
    expect(result.current.version).toBe("0.1.3");
  });

  it("shows download progress, prevents duplicate installs and preserves retry after a signature failure", async () => {
    const { result } = await setup();
    act(() => emit("update-available", "0.1.3"));
    let reject!: (reason: string) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    let pending!: Promise<void>;
    act(() => { pending = result.current.install(); });
    await act(() => result.current.install());
    await act(() => result.current.check());
    act(() => emit("update-progress", { phase: "downloading", downloaded: 50, total: 100 }));
    expect(result.current.progress?.downloaded).toBe(50);
    expect(result.current.installing).toBe(true);
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === "install_update")).toHaveLength(1);
    await act(async () => { reject("invalid signature"); await pending; });
    expect(result.current.error).toBe("invalid signature");
    expect(result.current.version).toBe("0.1.3");
    expect(result.current.installing).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it("unlocks controls when the installer recheck finds no update", async () => {
    const { result } = await setup();
    act(() => emit("update-available", "0.1.3"));
    await act(() => result.current.install());
    expect(result.current.installing).toBe(false);
    expect(result.current.version).toBeNull();
    expect(result.current.checked).toBe(true);
  });

  it("ignores a stale initial lookup and removes event listeners on unmount", async () => {
    let resolve!: (value: string) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { result, unmount } = await setup();
    act(() => emit("update-available", "0.1.3"));
    await act(async () => { resolve("0.1.2"); });
    expect(result.current.version).toBe("0.1.3");
    unmount();
    expect(events.size).toBe(0);
  });
});
