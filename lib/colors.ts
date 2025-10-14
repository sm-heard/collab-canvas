const PALETTE = [
  "#0EA5E9",
  "#22C55E",
  "#A855F7",
  "#F59E0B",
  "#E11D48",
  "#14B8A6",
  "#6366F1",
  "#EC4899",
  "#F97316",
  "#2DD4BF",
  "#8B5CF6",
  "#F43F5E",
];

function hashString(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

export function colorFromUserId(id: string | null | undefined): string {
  if (!id) {
    return PALETTE[0];
  }

  const hash = hashString(id);
  const color = PALETTE[hash % PALETTE.length];
  return color;
}

export function getContrastColor(hex: string): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0F172A" : "#F8FAFC";
}
