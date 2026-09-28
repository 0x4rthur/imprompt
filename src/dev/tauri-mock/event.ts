// dev/tauri-mock/event.ts — listen() falso (nenhum evento chega no modo mock).
export type Event<T> = { event: string; id: number; payload: T };
export type UnlistenFn = () => void;

export async function listen<T>(_event: string, _handler: (event: Event<T>) => void): Promise<UnlistenFn> {
  return () => {};
}
