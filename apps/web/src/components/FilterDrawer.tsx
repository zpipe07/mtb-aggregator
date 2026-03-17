import { useEffect } from "react";
import type { FilterSidebarProps } from "./FilterSidebar";
import { FilterSidebar } from "./FilterSidebar";
import { Button } from "./ui/button";

type FilterDrawerProps = FilterSidebarProps & {
  isOpen: boolean;
  onClose: () => void;
};

export function FilterDrawer(props: FilterDrawerProps) {
  const { isOpen, onClose, ...sidebarProps } = props;

  useEffect(() => {
    if (isOpen) {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", onKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-background rounded-t-2xl shadow-xl h-[85vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Filters</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close filters"
          >
            <svg
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <FilterSidebar {...sidebarProps} />
        </div>
        <div className="flex-shrink-0 p-4 border-t border-border">
          <Button
            type="button"
            onClick={onClose}
            className="w-full"
          >
            Done
          </Button>
        </div>
      </div>
    </>
  );
}
