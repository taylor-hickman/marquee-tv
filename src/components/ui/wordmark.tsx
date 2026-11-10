import Link from "next/link";

// Archivo 900, 125% wide, uppercase, with the amber square (Foundations).
export function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex items-baseline gap-[5px] text-[24px] leading-none font-black tracking-[-0.01em] whitespace-nowrap uppercase no-underline [font-stretch:125%]"
    >
      Marquee TV
      <span aria-hidden="true" className="inline-block size-[7px] bg-accent" />
    </Link>
  );
}
