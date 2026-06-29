import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
  totalItems?: number;
}

export function TablePagination({
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  totalItems,
}: TablePaginationProps) {
  if (totalPages <= 1) return null;

  // Build page number array: 1,2,3,...,X,X+1,...,lastPage
  // Always show first 3, last 1, and a window of 2 around currentPage.
  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];

  const addPage = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };

  const HEAD = 3;   // always show first N pages
  const TAIL = 1;   // always show last N pages
  const WING = 1;   // pages around current on each side

  const showHead = new Set<number>();
  const showTail = new Set<number>();
  const showWindow = new Set<number>();

  for (let i = 1; i <= Math.min(HEAD, totalPages); i++) showHead.add(i);
  for (let i = Math.max(1, totalPages - TAIL + 1); i <= totalPages; i++) showTail.add(i);
  for (
    let i = Math.max(1, currentPage - WING);
    i <= Math.min(totalPages, currentPage + WING);
    i++
  )
    showWindow.add(i);

  const visible = [...new Set([...showHead, ...showWindow, ...showTail])].sort((a, b) => a - b);

  let prev = 0;
  for (const p of visible) {
    if (p - prev === 2) {
      // Only one page gap — just show the page, no ellipsis
      pages.push(prev + 1);
    } else if (p - prev > 2) {
      if (prev > 0) pages.push("ellipsis-start");
    }
    pages.push(p);
    prev = p;
  }

  const start = totalItems != null && itemsPerPage != null
    ? (currentPage - 1) * itemsPerPage + 1
    : null;
  const end = totalItems != null && itemsPerPage != null
    ? Math.min(currentPage * itemsPerPage, totalItems)
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      {totalItems != null && start != null && end != null ? (
        <span className="text-xs text-muted-foreground">
          Showing {start}–{end} of {totalItems}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pages.map((p, i) =>
          p === "ellipsis-start" || p === "ellipsis-end" ? (
            <span
              key={`${p}-${i}`}
              className="h-8 w-8 flex items-center justify-center text-muted-foreground text-sm select-none"
            >
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? "default" : "outline"}
              size="icon"
              className="h-8 w-8 text-xs"
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}