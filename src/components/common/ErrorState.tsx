type ErrorStateProps = {
  title?: string;
  message: string;
};

export function ErrorState({ title = 'Ha ocurrido un error', message }: ErrorStateProps) {
  return (
    <section className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}
