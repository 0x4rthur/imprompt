// Segmented.tsx — escolha exclusiva num trilho afundado.
//
// A opção ativa ganha uma peça clara que DESLIZA até ela (layoutId do Motion) em
// vez de piscar de um botão pro outro. Semântica: grupo rotulado de botões com
// aria-pressed (a peça é decorativa, fora do nome acessível).
import { useId } from "react";
import { motion } from "motion/react";
import { spring } from "../motion";

export type SegOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
};

export default function Segmented<T extends string>({ options, value, onChange, ariaLabel, className }: Props<T>) {
  const id = useId();
  return (
    <div className={"seg" + (className ? " " + className : "")} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} className={on ? "active" : ""} onClick={() => onChange(o.value)}>
            {on && <motion.span className="seg-pill" layoutId={"seg-" + id} transition={spring.snappy} aria-hidden="true" />}
            <span className="seg-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
