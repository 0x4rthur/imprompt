// dev/tauri-mock/event.ts — listen() do modo de teste no navegador. Nenhum evento
// chega sozinho; quem simula o backend (core.ts) dispara com emitMock().
export type Event<T> = { event: string; id: number; payload: T };
export type UnlistenFn = () => void;

type Handler = (event: Event<unknown>) => void;
const handlers = new Map<string, Set<Handler>>();

export async function listen<T>(event: string, handler: (event: Event<T>) => void): Promise<UnlistenFn> {
  const set = handlers.get(event) ?? new Set<Handler>();
  handlers.set(event, set);
  set.add(handler as Handler);
  return () => { set.delete(handler as Handler); };
}

/** Só no modo de teste: dispara um evento como se viesse do backend. */
export function emitMock(event: string, payload: unknown): void {
  handlers.get(event)?.forEach((handler) => handler({ event, id: 0, payload }));
}
