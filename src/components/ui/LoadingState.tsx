type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = 'Cargando...' }: LoadingStateProps) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-indicator" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
