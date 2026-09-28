// icons.tsx — ícones de linha compartilhados (geométricos, herdam a cor via
// currentColor, decorativos: aria-hidden). Um lugar só, pra que o mesmo gesto
// tenha o mesmo desenho em todas as telas.
import type { ReactNode, SVGProps } from "react";

type P = { size?: number; className?: string };

function Line({ size = 16, className, children, strokeWidth = 1.7, ...rest }: P & { children: ReactNode; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const ArrowRightIcon = (p: P) => <Line {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Line>;
export const ChevronDownIcon = (p: P) => <Line {...p} strokeWidth={1.8}><path d="M6 9l6 6 6-6" /></Line>;
export const CheckIcon = (p: P) => <Line {...p} strokeWidth={2}><path d="M5 12l5 5 9-10" /></Line>;
export const KeyboardIcon = (p: P) => (
  <Line {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01" /><path d="M8 14.2h8" /></Line>
);
/** Saída "substituir": o resultado entra no lugar da seleção. */
export const ReplaceIcon = (p: P) => <Line {...p}><path d="M4 8h13l-3-3" /><path d="M20 16H7l3 3" /></Line>;
/** Saída "copiar": vai pra área de transferência. */
export const ClipboardIcon = (p: P) => (
  <Line {...p}><rect x="7" y="4" width="10" height="4" rx="1.5" /><path d="M17 6h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1" /></Line>
);
export const ThemeIcon = ({ size = 16, className }: P) => (
  <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
    <circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
  </svg>
);
export const LockIcon = (p: P) => <Line {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Line>;
export const ArrowOutIcon = (p: P) => <Line {...p} strokeWidth={1.8}><path d="M7 17 17 7" /><path d="M9 7h8v8" /></Line>;
export const TrashIcon = (p: P) => (
  <Line {...p} strokeWidth={1.6}>
    <path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </Line>
);
export const PlusIcon = (p: P) => <Line {...p} strokeWidth={1.9}><path d="M12 5v14" /><path d="M5 12h14" /></Line>;
export const RestoreIcon = (p: P) => <Line {...p}><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></Line>;
