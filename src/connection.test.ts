import { describe, expect, it, vi } from "vitest";
import { configId, createConnectionService, type ApiConfig } from "./connection";
import type { Settings } from "./types";

const config: ApiConfig = { baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", format: "auto" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("connection coordination", () => {
  it("normalizes URL paths without merging different query parameters", () => {
    expect(configId(config)).toBe(configId({ ...config, baseUrl: `${config.baseUrl}/` }));
    expect(configId(config)).not.toBe(configId({ ...config, fastMode: false }));
    expect(configId({ ...config, baseUrl: `${config.baseUrl}?deployment=team/` })).not.toBe(configId({ ...config, baseUrl: `${config.baseUrl}?deployment=team` }));
  });
  it("shares overlapping probes and reuses a completed test on navigation", async () => {
    const probe = deferred<string>();
    const call = vi.fn().mockReturnValue(probe.promise);
    const service = createConnectionService(call);
    const first = service.check(config);
    const second = service.check(config);
    expect(first).toBe(second);
    expect(call).toHaveBeenCalledTimes(1);
    probe.resolve("OK");
    await first;
    await service.check(config);
    expect(call).toHaveBeenCalledTimes(1);
    expect(service.snapshot(config).health).toBe("connected");
    await service.check(config, true);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not let an old failed probe overwrite a successful key change", async () => {
    const probe = deferred<string>();
    const apply = deferred<Settings>();
    const call = vi.fn().mockReturnValueOnce(probe.promise).mockReturnValueOnce(apply.promise);
    const service = createConnectionService(call);
    const old = service.check(config);
    const saving = service.apply(config, "test-key");
    apply.resolve({ api_model: config.model } as Settings);
    await saving;
    probe.reject("old key rejected");
    await old;
    expect(service.snapshot(config)).toEqual({ health: "connected", detail: "" });
    await service.check(config);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("keeps the working configuration healthy when a candidate key fails", async () => {
    const call = vi.fn().mockResolvedValueOnce("OK").mockRejectedValueOnce("invalid candidate key");
    const service = createConnectionService(call);
    await service.check(config);
    await expect(service.apply(config, "bad-key")).rejects.toBe("invalid candidate key");
    expect(service.snapshot(config).health).toBe("connected");
    expect(call).toHaveBeenLastCalledWith("apply_api_configuration", { ...config, custom: false, key: "bad-key" });
  });

  it("separates providers and API formats and permits keyless localhost probes", async () => {
    const call = vi.fn().mockResolvedValue("OK");
    const service = createConnectionService(call);
    const local: ApiConfig = { baseUrl: "http://localhost:1234/v1", model: "custom", format: "auto" };
    await service.check(local);
    await service.check(config);
    await service.check({ ...config, format: "responses" });
    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls.every(([command]) => command === "test_api_connection")).toBe(true);
  });
});
