// motion.ts — o vocabulário de movimento do Imprompt, num lugar só.
//
// Molas do Motion para o que desliza/entra, curvas para fades, e dois ganchos:
// entrada em cascata das seções de uma aba e números que "contam". Tudo respeita
// o "reduzir animações" do sistema; sem matchMedia (testes em jsdom) também
// conta como reduzido, então os testes veem o estado final na hora.
import { useLayoutEffect, type RefObject } from "react";
import { animate, stagger, type Transition } from "motion/react";

export const spring = {
  /** Indicadores que deslizam (menu, segmentado, contornos, presets do popup). */
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.9 } as Transition,
  /** Entradas de seções e cards. */
  soft: { type: "spring", stiffness: 260, damping: 28 } as Transition,
  /** Pequenos "pops" (selo Conectado, número do preset). */
  pop: { type: "spring", stiffness: 600, damping: 22 } as Transition,
};

export const ease = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  in: [0.4, 0, 1, 1] as [number, number, number, number],
};

/** true quando o sistema pede menos movimento (ou não dá pra saber, ex.: testes). */
export function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Entrada em cascata dos elementos `[data-enter]` visíveis dentro de `ref` sempre
 * que `key` muda (ex.: a aba). `dir` 1 = entram de baixo, -1 = de cima. A troca de
 * estado nunca espera a animação; se outra entrada começar antes, a anterior é
 * concluída (nada fica preso transparente).
 */
export function usePageEnter(ref: RefObject<HTMLElement | null>, key: unknown, dir: 1 | -1): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion()) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-enter]")).filter((el) => el.getClientRects().length > 0);
    if (!els.length) return;
    const controls = animate(els, { opacity: [0, 1], y: [16 * dir, 0] }, { ...spring.soft, delay: stagger(0.045) });
    return () => controls.complete();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
