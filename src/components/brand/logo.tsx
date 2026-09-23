import brand from "./brand.json";

export const BRAND = brand.colors;

type Props = { size?: number; className?: string; title?: string };

/**
 * Símbolo de Nexo: una N hecha de dos nodos unidos. El trazo toma el color
 * del texto y los nodos el azul de la marca.
 */
export function NexoMark({ size = 24, className, title = "Nexo" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} role="img" aria-label={title}>
      <path d={brand.mark} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {brand.nodes.map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="2.2" fill="var(--brand, #4f6bff)" />
      ))}
    </svg>
  );
}

/**
 * Logo completo: símbolo más la palabra "nexo" dibujada con el mismo trazo.
 * Con `product="code"` agrega la sub-marca de Nexo Code.
 */
export function NexoLogo({ size = 24, className, product }: Props & { product?: "code" }) {
  const width = product ? brand.codeWidth : 72;
  return (
    <svg
      height={size}
      width={(size * width) / 24}
      viewBox={`0 0 ${width} 24`}
      fill="none"
      className={className}
      role="img"
      aria-label={product ? "Nexo Code" : "Nexo"}
    >
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={brand.mark} />
        <path d={brand.word} />
        <circle {...brand.wordO} />
      </g>
      {product && (
        <g stroke="var(--brand, #4f6bff)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d={brand.code} />
          {brand.codeCircles.map((c) => (
            <circle key={c.cx} {...c} />
          ))}
        </g>
      )}
      {brand.nodes.map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="2.2" fill="var(--brand, #4f6bff)" />
      ))}
    </svg>
  );
}
