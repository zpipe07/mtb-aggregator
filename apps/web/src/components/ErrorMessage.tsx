type ErrorMessageProps = {
  message: string;
};

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div
      className="mb-6 rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-sm text-destructive"
      role="alert"
    >
      <span className="mr-2 font-semibold uppercase tracking-wide">
        {"// error"}
      </span>
      {message}
    </div>
  );
}
