import { LEVEL_THRESHOLDS } from '../../services/cmoScoringEngine';

type ScorePoint = { id: string; label: string; score: number };

const WIDTH = 640;
const HEIGHT = 180;
const PAD = { top: 16, right: 24, bottom: 28, left: 40 };

// Evolución de la puntuación CMO con las bandas de nivel del motor de estratificación.
// Arriba = mayor puntuación = mayor complejidad (Nivel 1).
export function ScoreTrendChart({ points }: { points: ScorePoint[] }) {
  if (points.length < 2) return null;

  const thresholds = LEVEL_THRESHOLDS.filter((item) => item.minScore > 0).map((item) => item.minScore);
  const maxThreshold = Math.max(...thresholds);
  const yMax = Math.max(...points.map((p) => p.score), maxThreshold) + 6;
  const lowestCut = Math.min(...thresholds);
  const yMin = Math.max(0, Math.min(...points.map((p) => p.score), lowestCut) - 8);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const y = (value: number) => PAD.top + innerH - ((value - yMin) / (yMax - yMin)) * innerH;
  const x = (index: number) => PAD.left + (innerW * index) / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');

  const bands = [...LEVEL_THRESHOLDS]
    .sort((a, b) => b.minScore - a.minScore)
    .map((band, index, sorted) => ({
      level: band.level,
      from: Math.max(band.minScore, yMin),
      to: index === 0 ? yMax : sorted[index - 1].minScore,
    }));

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Puntuación CMO en ${points.length} visitas: de ${points[0].score} a ${points[points.length - 1].score} puntos`}
    >
      {bands.map((band) => (
        <g key={band.level}>
          <rect
            x={PAD.left}
            width={innerW}
            y={y(band.to)}
            height={Math.max(0, y(band.from) - y(band.to))}
            fill={band.level === 1 ? '#e2eff3' : band.level === 2 ? '#f0f7f9' : '#ffffff'}
          />
          <text x={WIDTH - PAD.right + 4} y={(y(band.to) + y(band.from)) / 2} dominantBaseline="middle" fontSize={10} fill="#5c717a">
            N{band.level}
          </text>
        </g>
      ))}
      {thresholds.map((value) => (
        <g key={value}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} stroke="#c3d0d8" strokeDasharray="3 3" />
          <text x={PAD.left - 6} y={y(value)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#5c717a">
            {value}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#0e5e78" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={point.id}>
          <circle cx={x(index)} cy={y(point.score)} r={4.5} fill="#0e5e78" stroke="#ffffff" strokeWidth={1.5}>
            <title>{`${point.label}: ${point.score} pts`}</title>
          </circle>
          <text x={x(index)} y={y(point.score) - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill="#14282f">
            {point.score}
          </text>
          <text
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            fill="#5c717a"
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
