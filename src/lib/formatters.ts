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

export function formatSignedNumber(value: number | null | undefined) {
  const resolved = value ?? 0;
  const formatted = formatNumber(Math.abs(resolved));

  if (resolved > 0) {
    return `+${formatted}`;
  }

  if (resolved < 0) {
    return `-${formatted}`;
  }

  return "0";
}

export function formatSignedDecimal(
  value: number | null | undefined,
  digits = 2,
) {
  const resolved = value ?? 0;
  const formatted = formatDecimal(Math.abs(resolved), digits);

  if (resolved > 0) {
    return `+${formatted}`;
  }

  if (resolved < 0) {
    return `-${formatted}`;
  }

  return "0";
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
