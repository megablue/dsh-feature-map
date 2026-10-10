# Session handoff — dsh-feature-map

Next: `docs/features/README.md` — the feature map. Read only the page for
your area before the code.

**A snapshot, not a source of truth.** This file goes stale by design. If it
disagrees with the code, the code is right. `AGENTS.md` is the process doc,
`docs/features/` is the feature map and `docs/SPEC.md` is the behaviour spec.
This file is the volatile one — it exists so a new session knows *where things
stand*, not *how they work*.

As of 0.2.0 — 2026-10-10 (the repository is public at
`github.com/megablue/dsh-feature-map` with `origin` tracking `main`; the README
now leads *Install* with the copy-paste command and the hub's listing badge; the
submission to dsh-plugin.org is filed as issue
[dshplugin/dsh-plugin-hub#138](https://github.com/dshplugin/dsh-plugin-hub/issues/138),
awaiting the hub's next refresh; funding is wired to PayPal in the README and
`.github/FUNDING.yml`).

## State

- **The repository is public and pushes to `origin`.** `main` tracks
  `https://github.com/megablue/dsh-feature-map`, the `dsh-plugin` topic is set
  (the hub's crawler key), and CI is green on both pushed commits. The
  `HANDOFF.md`/`README.md` rename follow-up is `f34a1dc`, the publishable
  install command is `b35e584`, and the badge line came with them.
- **Funding is wired to PayPal.** The README's header strip gained a
  *Buy me a coffee* badge and the closing section a matching link, and
  `.github/FUNDING.yml` carries `custom: ["https://www.paypal.me/mega3dp"]` —
  the row the repository's Sponsor button reads. The badge trap in
  [packaging.md](docs/features/packaging.md) was rewritten count-free and names
  the FUNDING row; both URLs were probed before writing (the PayPal link 301s
  to `paypal.com/paypalme/mega3dp`, 200; the badge is 200/SVG).
- **`package.json` names the remote**: `repository`, `homepage` and `bugs` are
  filled in, closing the note that deferred them until a remote existed.
  `"private": true` stays — it guards publish, not install.
- **The README's first Install line is a *measured* claim, not a guess.** The
  `github:` spec was probed in a scratch directory (`pnpm add --dir <scratch>
  github:megablue/dsh-feature-map` → tarball, bundle patch, `node --check` on
  the entry) because `npm` refuses the same spec with `EALLOWGIT`. The `dsh` CLI
  wrapper itself was never driven — it is not on this machine's PATH — so the
  wrapper is untested even though the underlying install path is proven.
- **The workspace is a git repository on `main`.** `.gitattributes` pins LF in
  the working directory and in history, `.gitignore` covers `node_modules/` and
  logs, `LICENSE` is MIT (matching `package.json`), and
  `.github/workflows/ci.yml` runs the gate on every push and pull request. The
  one content change that came with it: the two CRLF files in the reference
  fixture are LF now, so a fresh clone is byte-identical to this tree. Verified:
  the suite passes with the fixture normalized (58 tests).
- The plugin is installed in the desktop profile as a bundle (entry
  `include:feature-map`, `fiberPhase: active`), linked to this working tree.
- **A fifth tool.** `feature_map_regen` reads the map that exists and rewrites
  it into a shape the plugin can read: the six headings and a `Status:` line
  where they are missing, every section over `maxSectionBytes` divided at
  paragraph and bullet boundaries, a chunk named from the author's own bold
  lead-in when it is paragraph-initial and ≤60 characters, and the index
  reconciled with the pages. Structure only — no prose is added, moved or
  reworded, the one text edit is dropping `**` around a promoted lead-in — and
  `docs/features/` is the only directory it touches. Plan by default; `apply`
  writes; `show` returns the text.
- **The index rewrite is reconciled, not regenerated.** Measured on the
  reference map: a row matched to a page by path → file name → label → a label
  that heads the page title is emitted byte-identical, and a naive regenerate
  would have rewritten 13 of 13 rows of a healthy index. On a conformant map the
  result is `unchanged`, `kept: 13`.
- **This repository's own map was the first real use of it** — the five
  oversized `## How & why` sections are now divided and named, `### Traps` and
  `### Acceptance` are addressable, and the open thread about the 5 oversized
  sections is closed. A second run reports 0 changes.
- **`feature_map_adopt` gained no write power.** Its `[deterministic]` plan item
  for an existing index now points at `feature_map_regen`, so there is exactly
  one thing that replaces existing map content.
- **No write ever landed, and the live run is what found it.** `ctx.fs.writeText`'s
  fifth argument is the sandbox policy, and omitting it leaves a sandboxing
  backend on its read-only default — so `feature_map_init`'s `write`,
  `feature_map_adopt`'s `apply` and `feature_map_regen`'s `apply` all failed on
  this profile. The fix is `writeThrough()` in `lib/index.js`, which resolves
  `ctx.sandboxPolicy.resolve({ session })` per call; the reply now also names
  every file that could not be written, with its reason. See
  [templates.md](docs/features/templates.md) → *The write seam carries the sandbox
  policy*. Verified live after the restart: `feature_map_regen {apply: true}` on a
  scratch project wrote 2 files (`wrote: [widgets.md, README.md]`, page 468 → 567 B
  with the inserted `Status:` line, index 167 → 238 B with the stale row replaced),
  the bytes are UTF-8 with no BOM and no line-ending change, the checker saw
  0 unindexed and 0 unresolved, and a second call reported nothing to write.
- The gate passes: `node --check lib/index.js` (+ `lib/map.js`, `lib/regen.js`),
  `node scripts/test.mjs` (58 tests), `node scripts/smoke.mjs .` (its regen block
  prints the plan without writing), `node scripts/measure.mjs .` (38% smaller over
  two topics).
- `package.json` is `0.2.0`; `docs/features/regen.md` is the new page and the
  index has its row.

## Open threads

- **The live acceptance run is complete** (0.2.0 generation, twice): the first
  `read` of a session was refused once with the documented wording, `feature_map`
  with a topic returned the new page's sections, the next `read` proceeded,
  `feature_map_regen` reported 0 changes for this repository, `feature_map_check`
  was clean, and after the write-seam fix a live `apply` wrote files that landed
  on disk. Nothing here is waiting on a restart any more.
- **`feature_map_init`'s `force` and `feature_map_adopt`'s `apply` have still
  never been driven live** — they share the seam that was just fixed, so they are
  expected to work, but regen is the only one that has actually written a file
  through the live profile.
- **The reference map is a rehearsal target only.** It is a frozen fixture whose
  oversized sections are asserted by tests, so it is deliberately *not*
  regenerated: on a temp copy, regen splits 9 sections into 18 chunks, the
  checker goes from 10 splits to 1, and that one is `runtime.md → ## How & why`
  with a 2,347 B `###` chunk no boundary divides.
- **Adoption has never seen a genuinely non-conformant docs tree.** No project on
  this machine has one; those paths are covered by synthetic fixtures only, and
  regen's own edge cases (a page with no `##` headings, a foreign table, an
  ambiguous row) are pinned by fixtures for the same reason.
- **A slash command** (`/feature-map` printing the index) remains unbuilt and
  deliberately so; `ctx.inject(['commands'], …)` is the pattern.
- **The hub submission is filed and waiting on the hub.** Issue
  [dshplugin/dsh-plugin-hub#138](https://github.com/dshplugin/dsh-plugin-hub/issues/138)
  (Category: Tools & Capabilities) was opened after the topic was set; it is
  still OPEN with no comment, and
  `https://dsh-plugin.org/plugins/megablue/dsh-feature-map` still 404s, so the
  listing has not been generated. The hub claims one refresh cycle, so this is
  the thing to re-check first next session.
- **The badge slug is a placeholder until that page exists.** The README carries
  the hub's template line with `your-owner`/`your-plugin-slug` untouched, which
  is what the submit page instructs: substitute them "once your plugin is
  listed". The slug is predictable — detail pages are
  `/plugins/<owner>/<repo>`, the hub's own being
  `/plugins/dshplugin/dsh-plugin-hub` — but a guessed URL that looks specific and
  404s is worse than a placeholder that reads as one. Swap it, do not guess it.
  The trap is recorded in [packaging.md](docs/features/packaging.md).

## Known gaps (volatile; the durable traps live in the feature pages)

- The split is greedy: the first chunk fills to the budget, so a following chunk
  can be small (455 B in one reference page). Balanced splitting was not worth a
  second weighting to argue about; an author who dislikes a boundary moves it.
- A page whose `## How & why` divides but whose largest `###` chunk is still over
  the limit is *reported*, never re-split: the plugin has no level below `###`,
  and inventing one would be structure the author did not ask for. The live
  instance is `packaging.md → ### Traps` (3,772 B).
- The chunker treats a bullet as a unit and never cuts inside one, so a single
  bullet larger than the budget is reported rather than broken.
- The tier list (`What it does`, `Map`, `Tests that pin it`) is a constant in
  `lib/map.js`, overridable through the function's options but not through
  plugin config.

## Local-only state (not on the remote)

- **The checkout is at `C:\Users\mega\projects\dsh-feature-map`**, renamed from
  `…\projects\workflow` so the directory matches the package name. The move is
  path-only: the bundle row, the patch, `package.json` and every doc are
  path-free. Four things named the old path and all four now point at the new
  one — the profile's `package.json` dependency spec, `pnpm-lock.yaml`,
  `node_modules/.pnpm/lock.yaml`, and the `node_modules/dsh-feature-map` symlink
  (all rewritten by re-installing the bundle from the new path), plus
  workspace `6fc224b0-…` in `~/.dsh/storages/workspace.json`. `README.md`'s
  install line was the only in-repo mention. **Sessions started before the move
  have a working directory that no longer exists**: a shell needs an explicit
  `workdir`, and relative paths resolve against a dead path. That is inherent to
  moving a directory under a running session, not a defect.
- **The remote is configured and named in the manifest.** `origin` is
  `https://github.com/megablue/dsh-feature-map`, `main` tracks it, and
  `package.json` carries `repository`, `homepage` and `bugs`. Nothing local-only
  remains about the remote. Pushing is a plain `git push`, and the CI workflow is
  what a reader sees on GitHub rather than a machine name.
- The install lives in the profile, not here: `~/.dsh/profiles/desktop`
  `package.json` gained `dsh-feature-map` and `pnpm-lock.yaml` was written.
  Removing the bundle from the profile is a plugin-manager action, not a file
  deletion here.
- `reference/PingLatencyOverlay/` is a copy of another project's documents kept
  for comparison; it is not part of the plugin and is not shipped.
