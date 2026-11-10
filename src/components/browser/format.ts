// Durations as the browser shows them: a card's length as a clock, the
// drawer's running total in whole minutes ("50 m", "1 h 10 m"). A duration is
// null once its cache row has expired, and then counts as zero.

const pad = (n: number) => String(n).padStart(2, "0");

export function clock(seconds: number | null): string {
  if (seconds === null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function total(durations: (number | null)[]): string {
  const minutes = Math.round(
    durations.reduce<number>((sum, s) => sum + (s ?? 0), 0) / 60,
  );
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}
