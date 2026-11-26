// Reads the eval prompt table in docs/evals/prompts.md (its header defines the
// columns).
import { moodChip, type BriefInput } from "@/contracts";

export const INSTRUCTION_TYPES = [
  "energy",
  "source",
  "familiarity",
  "structure",
  "format",
] as const;
export type InstructionType = (typeof INSTRUCTION_TYPES)[number];

export type EvalPrompt = {
  n: number;
  mood: BriefInput["mood"];
  durationS: number;
  seeds: { name: string; mustInclude: boolean }[];
  // 0-based track indexes pinned before the second run.
  pins: { index: number; pinned: "position" | "include" }[];
  types: InstructionType[];
  text: string;
  expectation: string;
};

const NONE = "—";

export function parsePrompts(markdown: string): EvalPrompt[] {
  return markdown
    .split("\n")
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length !== 8) throw new Error(`Expected 8 cells: ${line}`);
      const [n, chip, length, seeds, pins, types, text, expectation] = cells;
      return {
        n: Number(n),
        mood: chip === NONE ? undefined : moodChip.parse(chip),
        durationS: parseLength(length),
        seeds: list(seeds, ";").map((s) => ({
          name: s.replace(/!$/, "").trim(),
          mustInclude: s.endsWith("!"),
        })),
        pins: list(pins, " ").map(parsePin),
        types: list(types, ",").map(parseType),
        text,
        expectation,
      };
    });
}

function list(cell: string, separator: string): string[] {
  if (cell === NONE) return [];
  return cell
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseLength(cell: string): number {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(cell);
  if (!match || cell === "") throw new Error(`Bad length: ${cell}`);
  return (Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 60;
}

function parsePin(token: string): EvalPrompt["pins"][number] {
  const match = /^([@+])(\d+)$/.exec(token);
  if (!match || Number(match[2]) < 1) throw new Error(`Bad pin: ${token}`);
  return {
    index: Number(match[2]) - 1,
    pinned: match[1] === "@" ? "position" : "include",
  };
}

function parseType(token: string): InstructionType {
  const type = INSTRUCTION_TYPES.find((t) => t === token);
  if (!type) throw new Error(`Bad instruction type: ${token}`);
  return type;
}
