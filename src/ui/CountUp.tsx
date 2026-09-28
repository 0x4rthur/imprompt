// CountUp.tsx — número que "conta" até o valor, SEM re-renderizar quem o usa.
//
// A animação escreve direto no texto do <span> (o React nunca é chamado a cada
// frame). O último valor mostrado fica guardado por `id`: ao voltar pra tela, o
// número aparece pronto e só anima se mudou. Movimento reduzido = valor direto.
import { useLayoutEffect, useRef } from "react";
import { animate } from "motion/react";
import { ease, reducedMotion } from "../motion";

const lastShown = new Map<string, number>();

type Props = {
  /** Identifica o número entre visitas (ex.: "home.tokens"). */
  id: string;
  value: number;
  format: (v: number) => string;
  className?: string;
};

export default function CountUp({ id, value, format, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  // Formato mudou (idioma, métrica) sem o valor mudar: reescreve o número atual.
  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = format(lastShown.get(id) ?? value);
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (v: number) => {
      lastShown.set(id, v);
      el.textContent = formatRef.current(v);
    };
    const from = lastShown.get(id) ?? 0;
    if (reducedMotion() || !Number.isFinite(value) || !Number.isFinite(from) || from === value) {
      write(value);
      return;
    }
    write(from);
    const controls = animate(from, value, { duration: 0.9, ease: ease.out, onUpdate: write });
    return () => {
      controls.stop();
      lastShown.set(id, value); // interrompido: na próxima vez já mostra o valor final
    };
  }, [id, value]);

  return <span ref={ref} className={className} />;
}
