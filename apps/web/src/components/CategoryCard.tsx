import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type CategoryCardProps = {
  label: string;
  to: string;
  description?: string;
};

export function CategoryCard({ label, to, description }: CategoryCardProps) {
  return (
    <Link to={to} className="block group">
      <Card className="shadow-sm hover:shadow-md transition-all cursor-pointer">
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <span className="inline-flex items-center text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
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
        </CardContent>
      </Card>
    </Link>
  );
}
