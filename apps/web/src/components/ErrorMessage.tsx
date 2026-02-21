type ErrorMessageProps = {
  message: string;
};

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded-lg mb-6">
      {message}
    </div>
  );
}
