// When a library set last changed, as the mockup words it: "Today",
// "Yesterday", "3 days ago", "Last week", "2 weeks ago", then the date.

const DAY_MS = 86_400_000;

export function ago(at: Date, now: Date): string {
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(at)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 56) return `${Math.floor(days / 7)} weeks ago`;
  return at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: at.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
