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
      className="inline-flex items-center gap-2 font-medium text-slate-400 transition hover:text-blue-200"
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-4 w-4 text-blue-400" />
        ) : (
          <ArrowDown className="h-4 w-4 text-blue-400" />
        )
      ) : (
        <ArrowUpDown className="h-4 w-4 opacity-40" />
      )}
    </button>
  );
}
