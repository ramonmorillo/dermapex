type TrendDeltaProps = {
  value: number | null;
  // Qué dirección es clínicamente favorable; 'neutral' no colorea.
  favorable?: 'lower' | 'higher' | 'neutral';
  decimals?: number;
  unit?: string;
};

export function TrendDelta({ value, favorable = 'neutral', decimals = 0, unit }: TrendDeltaProps) {
  if (value === null || !Number.isFinite(value)) return <span className="trend-delta trend-none">N/A</span>;

  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  let tone = 'neutral';
  if (favorable !== 'neutral' && value !== 0) {
    const isFavorable = (favorable === 'lower' && value < 0) || (favorable === 'higher' && value > 0);
    tone = isFavorable ? 'favorable' : 'unfavorable';
  }
  const formatted = `${value > 0 ? '+' : ''}${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;

  return (
    <span className={`trend-delta trend-${tone}`} data-direction={direction}>
      <span aria-hidden="true">{arrow}</span> {formatted}
    </span>
  );
}
