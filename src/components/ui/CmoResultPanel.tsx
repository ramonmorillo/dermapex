import { CMO_LEVEL_META, toCmoLevel } from '../../constants/cmoLevels';
import { LEVEL_THRESHOLDS } from '../../services/cmoScoringEngine';

type CmoResultPanelProps = {
  score: number;
  level: unknown;
  statusText: string;
  sticky?: boolean;
};

// Resultado de estratificación. La escala se dibuja de menor (izquierda, N3) a mayor
// complejidad (derecha, N1) con los umbrales reales del motor; no se recalcula nada aquí.
export function CmoResultPanel({ score, level, statusText, sticky = false }: CmoResultPanelProps) {
  const value = toCmoLevel(level);
  const meta = value ? CMO_LEVEL_META[value] : null;

  const cutoffs = LEVEL_THRESHOLDS.filter((item) => item.minScore > 0)
    .map((item) => item.minScore)
    .sort((a, b) => a - b);
  const highest = cutoffs[cutoffs.length - 1] ?? 0;
  const scaleMax = Math.max(highest + Math.round(highest * 0.35), score + 2, 1);
  const position = (points: number) => `${Math.min(100, Math.max(0, (points / scaleMax) * 100))}%`;
  const bounds = [0, ...cutoffs, scaleMax];
  const segmentClass = ['seg-cmo-3', 'seg-cmo-2', 'seg-cmo-1'];

  return (
    <section
      className={['cmo-result', value ? `cmo-result-${value}` : '', sticky ? 'cmo-result-sticky' : ''].filter(Boolean).join(' ')}
      aria-live="polite"
      aria-label="Resultado de estratificación CMO"
    >
      <div className="cmo-result-level">
        <span className="cmo-result-number" aria-hidden="true">
          {value ?? '–'}
        </span>
        <div>
          <span className="cmo-result-eyebrow">Nivel CMO</span>
          <span className="cmo-result-label">{meta ? meta.label : 'Sin nivel'}</span>
          {meta ? <span className="cmo-result-complexity">{meta.complexity}</span> : null}
        </div>
      </div>

      <div>
        <div className="cmo-result-score">
          <strong>{score}</strong>
          <span>{statusText}</span>
        </div>
        <div className="cmo-scale">
          <div className="cmo-scale-track" aria-hidden="true">
            {bounds.slice(0, -1).map((from, index) => (
              <span key={from} className={segmentClass[index] ?? 'seg-cmo-1'} style={{ flexBasis: `${((bounds[index + 1] - from) / scaleMax) * 100}%` }} />
            ))}
          </div>
          <span className="cmo-scale-marker" style={{ left: position(score) }} aria-hidden="true" />
          <div className="cmo-scale-labels" aria-hidden="true">
            <span style={{ left: 0 }}>0</span>
            {cutoffs.map((cutoff) => (
              <span key={cutoff} style={{ left: position(cutoff) }}>
                {cutoff}
              </span>
            ))}
          </div>
          <div className="cmo-scale-legend">
            <span>← Menor complejidad (N3)</span>
            <span>Mayor complejidad (N1) →</span>
          </div>
        </div>
      </div>
    </section>
  );
}
