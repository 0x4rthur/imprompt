// HandHeartIcon.tsx — ícone hand-heart (lucide) para a doação, portado do
// componente animado do itshover (originalmente em framer-motion) para SVG puro.
// A animação (coração pulsa + mão balança no hover) vive em CSS na seção
// SUPORTE/DOAÇÃO de styles.css, disparada por `.donate:hover` — sem dependência
// nova, no mesmo espírito do BrandMark. Herda a cor via `currentColor`.

type Props = { size?: number; className?: string };

export default function HandHeartIcon({ size = 20, className = "" }: Props) {
  return (
    <svg
      className={"hh " + className}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="hh-hand">
        <path d="M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" />
        <path d="m2 15 6 6" />
        <path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91" />
      </g>
      <path
        className="hh-heart"
        d="m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95"
      />
    </svg>
  );
}
