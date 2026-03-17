export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("hr-HR").format(value ?? 0);
}

export function formatDecimal(value: number | null | undefined, digits = 2) {
  return new Intl.NumberFormat("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

export function formatPercent(value: number | null | undefined) {
  return `${formatDecimal(value, 2)}%`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Nema podatka";
  }

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("hr-HR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
