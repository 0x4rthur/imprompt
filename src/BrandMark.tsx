// BrandMark.tsx — o logo [I] do Imprompt (cursor de texto / letra I entre colchetes).
// Geometria pura: TODOS os traços com a mesma espessura (5 de 62×40), topo/base
// alinhados. Cores vêm do tema (CSS: .bm-bracket → --bracket, .bm-ink → --ink), então
// o logo acompanha claro/escuro; as props ink/bracket forçam uma cor específica.
// Uso: <BrandMark size={23} /> no header (substitui a antiga <div className="mark"/>)
//      e dentro de .ph-mark no popup ( size={20} ), e no loader.

type Props = { size?: number; /** cor do I; padrão usa a tinta do tema */ ink?: string; bracket?: string };

export default function BrandMark({ size = 23, ink, bracket }: Props) {
  const w = Math.round((size * 62) / 40); // mantém a proporção 62:40
  return (
    <svg viewBox="0 0 62 40" width={w} height={size} aria-label="Imprompt" role="img">
      <g className="bm-bracket" style={bracket ? { fill: bracket } : undefined}>
        <rect x="2" y="4" width="5" height="32" />
        <rect x="2" y="4" width="14" height="5" />
        <rect x="2" y="31" width="14" height="5" />
        <rect x="55" y="4" width="5" height="32" />
        <rect x="46" y="4" width="14" height="5" />
        <rect x="46" y="31" width="14" height="5" />
      </g>
      <g className="bm-ink" style={ink ? { fill: ink } : undefined}>
        <rect x="28.5" y="4" width="5" height="32" />
        <rect x="22" y="4" width="18" height="5" />
        <rect x="22" y="31" width="18" height="5" />
      </g>
    </svg>
  );
}
