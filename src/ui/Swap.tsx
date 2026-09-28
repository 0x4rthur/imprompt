// Swap.tsx — troca de conteúdo com "letreiro": o novo sobe de baixo enquanto o
// antigo sai por cima (ex.: "Copiar" → "Copiado ✓"). Com movimento reduzido
// (ou em testes), troca direto, sem manter os dois no DOM.
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { reducedMotion, spring } from "../motion";

export default function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const [animate] = useState(() => !reducedMotion());
  if (!animate) return <span className={className}>{children}</span>;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={id} className={className} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: -12, opacity: 0 }} transition={spring.snappy}>
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
