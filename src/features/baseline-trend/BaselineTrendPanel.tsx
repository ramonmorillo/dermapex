import { useMemo, useState } from 'react';

import { Notice } from '../../components/ui/Notice';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { TrendDelta } from '../../components/ui/TrendDelta';
import type { ClinicalAssessmentHistoryEntry } from '../../services/assessmentService';
import {
  TREND_PARAMETERS,
  TREND_PARAMETER_GROUP_LABELS,
  type TrendParameterKey,
} from './parameterCatalog';

type BaselineTrendPanelProps = {
  entries: ClinicalAssessmentHistoryEntry[];
  warning?: string | null;
};

type TrendPoint = {
  visitId: string;
  label: string;
  value: number;
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 32, left: 48 };
const LINE_COLOR = '#0e5e78';
const GRID_COLOR = '#dde5ea';
const AXIS_TEXT_COLOR = '#5c717a';
const MAX_DIRECT_LABELS = 8;

function formatVisitLabel(entry: ClinicalAssessmentHistoryEntry): string {
  const date = entry.visit_date ?? entry.scheduled_date;
  if (date) return date;
  return entry.visit_number ? `Visita ${entry.visit_number}` : 'Visita';
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildPoints(entries: ClinicalAssessmentHistoryEntry[], key: TrendParameterKey): TrendPoint[] {
  return entries
    .map((entry) => ({
      visitId: entry.visit_id,
      label: formatVisitLabel(entry),
      value: entry[key],
    }))
    .filter((p): p is TrendPoint => typeof p.value === 'number' && Number.isFinite(p.value));
}

export function BaselineTrendPanel({ entries, warning }: BaselineTrendPanelProps) {
  const [selectedKey, setSelectedKey] = useState<TrendParameterKey>(TREND_PARAMETERS[0].key);
  const [showTable, setShowTable] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const selectedParameter = TREND_PARAMETERS.find((p) => p.key === selectedKey) ?? TREND_PARAMETERS[0];
  const points = useMemo(() => buildPoints(entries, selectedKey), [entries, selectedKey]);

  const chartGeometry = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.map((p) => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || Math.abs(rawMax) || 1;
    const yMin = rawMin - span * 0.15;
    const yMax = rawMax + span * 0.15;

    const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
    const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

    const plotted = points.map((point, index) => {
      const x = PADDING.left + (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / (points.length - 1));
      const y = PADDING.top + innerHeight - ((point.value - yMin) / (yMax - yMin)) * innerHeight;
      return { ...point, x, y };
    });

    const pathD = plotted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    return { plotted, pathD, yMin, yMax, innerHeight };
  }, [points]);

  return (
    <section className="card" aria-labelledby="baseline-trend-title">
      <SectionHeader
        id="baseline-trend-title"
        title="Evolución de parámetros basales"
        description="Valores registrados en cada visita, en orden cronológico."
      />

      {warning ? <Notice tone="warning" className="trend-warning">{warning}</Notice> : null}

      <div className="trend-controls">
        <label>
          <span>Parámetro</span>
          <select
            value={selectedKey}
            onChange={(e) => {
              setSelectedKey(e.target.value as TrendParameterKey);
              setHoverIndex(null);
            }}
          >
            {(['vitals', 'labs', 'risk'] as const).map((group) => (
              <optgroup key={group} label={TREND_PARAMETER_GROUP_LABELS[group]}>
                {TREND_PARAMETERS.filter((p) => p.group === group).map((p) => (
                  <option key={p.key} value={p.key}>{p.label} ({p.unit})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {points.length >= 2 ? (
          <button type="button" className="button-secondary" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Ver gráfico' : 'Ver como tabla'}
          </button>
        ) : null}
      </div>

      {points.length >= 2 ? (
        <p className="trend-summary">
          <span>
            Primera: <strong>{formatValue(points[0].value)}</strong> {selectedParameter.unit} ({points[0].label})
          </span>
          <span>
            Última: <strong>{formatValue(points[points.length - 1].value)}</strong> {selectedParameter.unit} ({points[points.length - 1].label})
          </span>
          <span>
            Cambio: <TrendDelta value={points[points.length - 1].value - points[0].value} decimals={Number.isInteger(points[0].value) && Number.isInteger(points[points.length - 1].value) ? 0 : 1} unit={selectedParameter.unit} />
          </span>
        </p>
      ) : null}

      {points.length < 2 ? (
        <p className="empty-inline">
          Aún no hay suficientes visitas con "{selectedParameter.label}" registrado para representar una evolución
          ({points.length} {points.length === 1 ? 'valor disponible' : 'valores disponibles'}; se necesitan al menos 2).
        </p>
      ) : showTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Visita</th>
                <th className="num">{selectedParameter.label} ({selectedParameter.unit})</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.visitId}>
                  <td>{point.label}</td>
                  <td className="num strong">{formatValue(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : chartGeometry ? (
        <svg
          role="img"
          aria-label={`Evolución de ${selectedParameter.label} a lo largo de ${points.length} visitas, de ${formatValue(points[0].value)} a ${formatValue(points[points.length - 1].value)} ${selectedParameter.unit}`}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="trend-chart trend-chart-parameter"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {[0, 0.5, 1].map((fraction) => {
            const y = PADDING.top + chartGeometry.innerHeight * fraction;
            const value = chartGeometry.yMax - (chartGeometry.yMax - chartGeometry.yMin) * fraction;
            return (
              <g key={fraction}>
                <line x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
                <text x={PADDING.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT_COLOR}>
                  {formatValue(value)}
                </text>
              </g>
            );
          })}

          <path d={chartGeometry.pathD} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {chartGeometry.plotted.map((point, index) => {
            const showDirectLabel = chartGeometry.plotted.length <= MAX_DIRECT_LABELS || index === 0 || index === chartGeometry.plotted.length - 1;
            return (
              <g key={point.visitId}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={12}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(index)}
                  onFocus={() => setHoverIndex(index)}
                  tabIndex={0}
                  aria-label={`${point.label}: ${formatValue(point.value)} ${selectedParameter.unit}`}
                >
                  <title>{`${point.label}: ${formatValue(point.value)} ${selectedParameter.unit}`}</title>
                </circle>
                <circle cx={point.x} cy={point.y} r={5} fill={LINE_COLOR} stroke="#ffffff" strokeWidth={1.5} />
                {showDirectLabel ? (
                  <text
                    x={point.x}
                    y={Math.max(point.y - 12, PADDING.top + 8)}
                    textAnchor={index === 0 ? 'start' : index === chartGeometry.plotted.length - 1 ? 'end' : 'middle'}
                    fontSize={10}
                    fill="#26414a"
                    fontWeight={600}
                  >
                    {formatValue(point.value)}
                  </text>
                ) : null}
                <text
                  x={point.x}
                  y={CHART_HEIGHT - 10}
                  textAnchor={index === 0 ? 'start' : index === chartGeometry.plotted.length - 1 ? 'end' : 'middle'}
                  fontSize={9}
                  fill={AXIS_TEXT_COLOR}
                >
                  {point.label}
                </text>
              </g>
            );
          })}

          {hoverIndex !== null ? (
            <line
              x1={chartGeometry.plotted[hoverIndex].x}
              x2={chartGeometry.plotted[hoverIndex].x}
              y1={PADDING.top}
              y2={PADDING.top + chartGeometry.innerHeight}
              stroke={AXIS_TEXT_COLOR}
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          ) : null}
        </svg>
      ) : null}
    </section>
  );
}
