import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type TableSortButtonProps = {
  active: boolean;
  direction: "asc" | "desc";
  label: string;
  onClick: () => void;
};

export function TableSortButton({
  active,
  direction,
  label,
  onClick,
}: TableSortButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 font-medium text-stone-600 transition hover:text-stone-950"
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )
      ) : (
        <ArrowUpDown className="h-4 w-4 opacity-60" />
      )}
    </button>
  );
}
