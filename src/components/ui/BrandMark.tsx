type BrandMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

// Isotipo provisional de DERMAPEX (monograma). Reutiliza las clases CSS heredadas de IRIS
// (iris-mark-*) para no reescribir la hoja de estilos en esta fase de migración.
export function BrandMark({ size = 28, className, title }: BrandMarkProps) {
  return (
    <svg
      className={['iris-mark', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <rect className="iris-mark-bg" width="32" height="32" rx="8" />
      <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">
        D
      </text>
    </svg>
  );
}
