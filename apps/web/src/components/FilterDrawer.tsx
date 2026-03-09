import { useEffect } from "react";
import type { FilterSidebarProps } from "./FilterSidebar";
import { FilterSidebar } from "./FilterSidebar";

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
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-white rounded-t-2xl shadow-xl min-h-[75vh] max-h-[85vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-900">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-500 hover:text-stone-700 rounded-lg"
            aria-label="Close filters"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <FilterSidebar {...sidebarProps} />
        </div>
        <div className="flex-shrink-0 p-4 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-stone-800 hover:bg-stone-700 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
