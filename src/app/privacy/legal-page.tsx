import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

// A page from docs/legal/, rendered to HTML when the site builds. The Markdown
// is ours, in the repo, so its HTML goes in as is. /terms renders through this
// too.
export function LegalPage({ file }: { file: "privacy.md" | "terms.md" }) {
  const markdown = readFileSync(
    join(process.cwd(), "docs/legal", file),
    "utf8",
  );
  return (
    <main
      className="mx-auto w-full max-w-[720px] px-5 py-10 break-words [&_a]:underline [&_h1]:mt-0 [&_h1]:mb-6 [&_h1]:text-heading [&_h1]:font-bold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-title [&_h2]:font-semibold [&_li]:my-2 [&_p]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{
        __html: marked.parse(markdown, { async: false }),
      }}
    />
  );
}
