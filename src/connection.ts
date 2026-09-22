import { invoke } from "@tauri-apps/api/core";
import type { ApiFormat, Settings } from "./types";

export type ApiConfig = { baseUrl: string; model: string; format: ApiFormat; custom?: boolean };
export type ConnectionHealth = { health: "checking" | "connected" | "error"; detail: string };
const CHECKING: ConnectionHealth = { health: "checking", detail: "" };

export function apiConfig(settings: Settings): ApiConfig {
  return { baseUrl: settings.api_base_url, model: settings.api_model, format: settings.api_format ?? "auto", custom: settings.api_custom ?? false };
}

export function configId(config: ApiConfig): string {
  let base = config.baseUrl.trim();
  try {
    const url = new URL(base);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    base = url.toString();
  } catch { /* Invalid drafts still need distinct status entries. */ }
  return JSON.stringify([base, config.model.trim(), config.format]);
}

type Invoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;

// Shared by the form and rail: one probe per configuration, with stale response
// protection. No secrets enter snapshots, keys, storage or error logs.
export function createConnectionService(call: Invoke) {
  const states = new Map<string, ConnectionHealth>();
  const pending = new Map<string, Promise<void>>();
  const generations = new Map<string, number>();
  const listeners = new Set<() => void>();
  const publish = (id: string, state: ConnectionHealth) => {
    states.set(id, state);
    listeners.forEach((listener) => listener());
  };
  const nextGeneration = (id: string) => {
    const generation = (generations.get(id) ?? 0) + 1;
    generations.set(id, generation);
    return generation;
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot(config: ApiConfig) { return states.get(configId(config)) ?? CHECKING; },
    check(config: ApiConfig, force = false): Promise<void> {
      const id = configId(config);
      const running = pending.get(id);
      if (running) return running;
      if (!force && states.has(id)) return Promise.resolve();
      const generation = nextGeneration(id);
      publish(id, CHECKING);
      const request = call<string>("test_api_connection", config).then(
        () => { if (generation === generations.get(id)) publish(id, { health: "connected", detail: "" }); },
        (error) => { if (generation === generations.get(id)) publish(id, { health: "error", detail: String(error) }); },
      ).finally(() => { if (generation === generations.get(id)) pending.delete(id); });
      pending.set(id, request);
      return request;
    },
    async apply(config: ApiConfig, key: string): Promise<Settings> {
      const id = configId(config);
      const previous = states.get(id);
      const generation = nextGeneration(id);
      publish(id, CHECKING);
      const request = call<Settings>("apply_api_configuration", { ...config, custom: config.custom ?? false, key: key.trim() || null });
      const finished = request.then(
        () => { if (generation === generations.get(id)) publish(id, { health: "connected", detail: "" }); },
        (error) => {
          // A failed candidate leaves the saved settings and key untouched.
          if (generation === generations.get(id)) publish(id, previous?.health === "connected" ? previous : { health: "error", detail: String(error) });
        },
      ).finally(() => { if (generation === generations.get(id)) pending.delete(id); });
      pending.set(id, finished);
      try { return await request; } finally { await finished; }
    },
  };
}

export const connection = createConnectionService(invoke);
