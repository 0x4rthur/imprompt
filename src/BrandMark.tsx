// BrandMark.tsx — o logo [I] do Imprompt (cursor de texto / letra I entre colchetes).
// Geometria pura: TODOS os traços com a mesma espessura (5 de 62×40), topo/base
// alinhados. Colchetes em cinza neutro (--bracket), o I em preto (--ink).
// Uso: <BrandMark size={23} /> no header (substitui a antiga <div className="mark"/>)
//      e dentro de .ph-mark no popup ( size={20} ), e no loader.

type Props = { size?: number; /** cor do I; padrão usa a tinta preta */ ink?: string; bracket?: string };

export default function BrandMark({ size = 23, ink = "#18181b", bracket = "#c4c4cd" }: Props) {
  const w = Math.round((size * 62) / 40); // mantém a proporção 62:40
  return (
    <svg viewBox="0 0 62 40" width={w} height={size} aria-label="Imprompt" role="img">
      <g fill={bracket}>
        <rect x="2" y="4" width="5" height="32" />
        <rect x="2" y="4" width="14" height="5" />
        <rect x="2" y="31" width="14" height="5" />
        <rect x="55" y="4" width="5" height="32" />
        <rect x="46" y="4" width="14" height="5" />
        <rect x="46" y="31" width="14" height="5" />
      </g>
      <g fill={ink}>
        <rect x="28.5" y="4" width="5" height="32" />
        <rect x="22" y="4" width="18" height="5" />
        <rect x="22" y="31" width="18" height="5" />
      </g>
    </svg>
  );
}
