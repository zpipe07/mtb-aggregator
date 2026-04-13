import type { FilterSidebarProps } from "./FilterSidebar";
import { FilterSidebar } from "./FilterSidebar";
import { Button } from "./ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";

type FilterDrawerProps = FilterSidebarProps & {
  isOpen: boolean;
  onClose: () => void;
};

export function FilterDrawer(props: FilterDrawerProps) {
  const { isOpen, onClose, ...sidebarProps } = props;

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      direction="bottom"
      shouldScaleBackground={false}
    >
      <DrawerContent
        showDragHandle={false}
        className="h-[85vh] max-h-[85vh] gap-0 overflow-hidden p-0 lg:hidden"
      >
        <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-4 border-b border-border px-4 py-3 text-left">
          <DrawerTitle className="text-lg">Filters</DrawerTitle>
          <DrawerDescription className="sr-only">
            Narrow results by brand, store, discount, and product attributes.
          </DrawerDescription>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
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
          </DrawerClose>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <FilterSidebar {...sidebarProps} />
        </div>
        <div className="flex-shrink-0 border-t border-border p-4">
          <DrawerClose asChild>
            <Button type="button" className="w-full">
              Done
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
