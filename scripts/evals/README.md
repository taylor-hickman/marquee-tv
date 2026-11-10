Curator eval runner (architecture 6.5). `run.mts` documents its flags; `docs/evals/prompts.md` holds the prompts and defines their columns.

Results land in `evals/results/<date>.json`, which git ignores: they hold YouTube API Data, so they stay local or in the `eval-results` Actions artifact, which expires after 30 days.
