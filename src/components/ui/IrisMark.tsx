type IrisMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

// Isotipo IRIS: anillo abierto (seguimiento longitudinal), nodo de intervención y núcleo (paciente).
export function IrisMark({ size = 28, className, title }: IrisMarkProps) {
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
      <path className="iris-mark-ring" d="M12.9 24.5A9 9 0 1 0 8.6 21.2" />
      <circle className="iris-mark-node" cx="8.6" cy="21.2" r="2" />
      <circle className="iris-mark-core" cx="16" cy="16" r="3.4" />
    </svg>
  );
}
