import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type UpdateProgress = { phase: "downloading" | "installing"; downloaded: number; total: number | null };
type State = { version: string | null; checking: boolean; checked: boolean; installing: boolean; error: string; progress: UpdateProgress | null };

export function useAppUpdater() {
  const [state, setState] = useState<State>({ version: null, checking: false, checked: false, installing: false, error: "", progress: null });
  const busy = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const available = listen<string>("update-available", ({ payload }) => {
      if (disposed) return;
      revision.current += 1;
      setState((s) => ({ ...s, version: payload, checked: true, error: "" }));
    });
    const none = listen("update-none", () => {
      if (disposed) return;
      revision.current += 1;
      setState((s) => ({ ...s, version: null, checked: true }));
    });
    const progress = listen<UpdateProgress>("update-progress", ({ payload }) => {
      if (!disposed && busy.current) setState((s) => ({ ...s, progress: payload }));
    });
    // Subscribe before reading pending state, and don't let the initial read
    // overwrite a newer check or event.
    void Promise.all([available, none, progress].map((subscription) => subscription.then((off) => {
      if (disposed) off(); else unlisteners.push(off);
    }))).then(async () => {
      if (disposed) return;
      const current = revision.current;
      const version = await invoke<string | null>("get_pending_update");
      if (!disposed && current === revision.current && version) setState((s) => ({ ...s, version }));
    }).catch(console.error);
    return () => { disposed = true; unlisteners.forEach((off) => off()); };
  }, []);

  async function check() {
    if (busy.current) return;
    busy.current = true;
    revision.current += 1;
    setState((s) => ({ ...s, checking: true, error: "" }));
    try {
      const version = await invoke<string | null>("check_for_updates");
      setState((s) => ({ ...s, version, checked: true }));
    } catch (error) {
      setState((s) => ({ ...s, error: String(error) }));
    } finally {
      busy.current = false;
      setState((s) => ({ ...s, checking: false }));
    }
  }

  async function install() {
    if (busy.current) return;
    busy.current = true;
    revision.current += 1;
    setState((s) => ({ ...s, installing: true, error: "", progress: null }));
    try {
      await invoke("install_update");
      // A successful real installation restarts the process. Returning means
      // the recheck found no update; release the controls instead of spinning.
      setState((s) => ({ ...s, version: null, checked: true }));
    } catch (error) {
      setState((s) => ({ ...s, error: String(error) }));
    } finally {
      busy.current = false;
      setState((s) => ({ ...s, installing: false, progress: null }));
    }
  }

  return { ...state, check, install };
}

export type AppUpdater = ReturnType<typeof useAppUpdater>;
