import type { Plan } from "./session";

// What the plan screen offers and the account page names (PRD 16.1). Prices
// match the Stripe prices; they are copy here, never charged from here.
export const plans: Record<
  Plan,
  { name: string; price: string; per: string; notes: string[] }
> = {
  session_pass: {
    name: "One set",
    price: "$2.99",
    per: "once",
    notes: ["7 days of edits"],
  },
  subscription: {
    name: "Every set",
    price: "$4.99",
    per: "a month",
    notes: ["Cancel anytime", "Library"],
  },
};

export function PlanCards({
  selected,
  onSelect,
}: {
  selected: Plan;
  onSelect: (plan: Plan) => void;
}) {
  return (
    <div role="group" aria-label="Plan" className="grid grid-cols-2 gap-3">
      {(Object.keys(plans) as Plan[]).map((id) => {
        const plan = plans[id];
        const on = id === selected;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(id)}
            className="group flex flex-col gap-2 border-2 border-fg bg-bg p-4 text-left text-fg aria-pressed:bg-fg aria-pressed:text-bg"
          >
            <span className="meta group-aria-pressed:text-bg">{plan.name}</span>
            <span className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-[40px] leading-none font-extrabold tracking-[-0.03em]">
                {plan.price}
              </span>
              <span className="text-meta">{plan.per}</span>
            </span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-meta">
              {plan.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
