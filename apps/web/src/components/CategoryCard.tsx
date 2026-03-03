import { Link } from "react-router-dom";

type CategoryCardProps = {
  label: string;
  to: string;
  description?: string;
};

export function CategoryCard({ label, to, description }: CategoryCardProps) {
  return (
    <Link
      to={to}
      className="group block p-6 bg-white rounded-xl shadow-sm border border-stone-200 hover:shadow-md hover:border-stone-300 transition-all"
    >
      <h3 className="font-semibold text-stone-900">{label}</h3>
      {description && (
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      )}
      <span className="mt-2 inline-flex items-center text-sm font-medium text-stone-600 group-hover:text-stone-900">
        View deals
        <svg
          className="ml-1 w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </span>
    </Link>
  );
}
