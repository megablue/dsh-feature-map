# AGENTS.md

**Before you grep, glob or open a source file: read `HANDOFF.md`, then
`docs/features/README.md`, then only the feature page(s) for the area you are
about to change. The feature pages name the files, functions and tests you
would otherwise hunt for — the code comes after them, not before.**

dsh-feature-map is a DeepSeek Harness host plugin. It makes an agent read a
project's `docs/features/` map before it opens source — a prompt section, five
tools (`feature_map`, `feature_map_check`, `feature_map_init`,
`feature_map_adopt`, `feature_map_regen`) and a tool guard — and it either
scaffolds that map into a project that has none, brings an existing project's
documentation up to it, or rewrites a map that has outgrown its shape.

Three kinds of document, and keeping them apart is the point:

- **`docs/SPEC.md` is product behavior** — what the plugin does and what a
  session sees, readable without knowing the code. Behavior belongs there even
  when the code is where the reason for it lives.
- **`docs/features/` is the feature map** — one page per feature with its
  files, mechanisms, traps and pinning tests. Read the page for the area you
  are about to change; keep it true in the same commit.
- **This file is process and hard rules** — the commands, the workflow and
  the constraints that apply across every feature.

Where a rule has a behavior half and a mechanism half, the behavior half is a
pointer to `docs/SPEC.md` and the mechanism half to its feature page rather
than a second copy: two copies of a default value is one more thing that can
be wrong.

## Read first
`HANDOFF.md` holds the current state; if it is missing, carry on with the
feature map and the code. Then `docs/features/README.md` — the feature map —
and only the feature doc(s) for what you are about to change.
`docs/SPEC.md` is user-visible behavior; this file is process and hard rules;
the feature docs are the map, the mechanism and the traps.

## Layout
- `README.md` — the user-facing document: what the plugin is for, how to
  install it, how to start a new project, and how to bring an existing one.
  It is the one file written for someone who is not working on the plugin, so
  implementation detail belongs in `docs/SPEC.md` and the feature pages
  instead. Ask the user before adding technical detail here.
- `lib/index.js` — the host half: the prompt section, the five tools and the
  guard. Loaded from the profile with no build step, so a change is a reload
  rather than a build, and a plugin that needs a bundler cannot be edited in
  place by the session it is running in.
- `lib/map.js` — finding the map, splitting a page into its sections and a
  section into its subsections, ranking both against a topic, resuming a capped
  reply, deriving index rows from the pages that exist, and checking that the
  index and the pages still agree. Pure functions over strings plus one
  directory read, so the behavior is testable without a project.
- `lib/regen.js` — rewriting a map that already exists: the missing headings and
  the `Status:` line, an oversized section divided at the boundaries its author
  already wrote, and the index reconciled with the pages. Structure only — it
  never adds, moves or rewords a sentence, and the one heading it cannot name
  from the author's own words it leaves as a visible placeholder.
- `lib/templates.js` — finds the shipped boilerplate, substitutes
  `{{PLACEHOLDER}}` tokens, and reports what a write would change.
- `templates/` — the boilerplate itself, one `.tmpl` file per file it writes
  into a project. See *Hard rules* for why the suffix is load-bearing.
- `test/plugin.test.mjs` — the map, template and regeneration half: against
  `reference/PingLatencyOverlay/`, a real map with traps in it.
- `test/contract.test.mjs` — the half that only exists inside a session: that
  the module loads, that `apply()` registers what the harness expects, that
  every tool reply matches the schema the harness validates it against, and
  that the guard denies once and then yields. It drives a mock context and a
  scratch project, so it needs no profile.
- `scripts/test.mjs` — the suite entry point; see *Commands* for why not
  `node --test`.
- `scripts/smoke.mjs` — prints what the map reader sees for a directory, what
  each template renders to, and what a regeneration would change. Asserts
  nothing, so it is safe against an unfinished map.
- `cordis.patch.yml` and `package.json` — the bundle declaration: the plugin
  reaches a profile through one row in this patch. See
  `docs/features/packaging.md`.
- `docs/features/` — this plugin's own feature map, in the shape the plugin
  ships.
- `reference/PingLatencyOverlay/` — the docs the boilerplate was stripped from,
  kept for comparison. Not loaded and not shipped: its instruction file is
  renamed to `AGENTS.md.reference` so DSH does not inject it into a session
  here.
- `.github/workflows/ci.yml` — the gate under *Commands*, as a workflow: the
  same commands on every push and pull request, on the Node this plugin is
  developed against. There is nothing to install and nothing to cache.
- `.gitattributes`, `.gitignore`, `LICENSE` — repository plumbing. The
  attributes file is the load-bearing one: LF in the working directory and in
  history, because `templates/` ships byte-for-byte and the map measures a
  section in bytes, so a CRLF checkout would change what a scaffolded project
  receives.

## Commands
Run from the repository root:

- `node --check lib/index.js` — syntax gate, and every other file under `lib/`
  the same way (`map.js`, `regen.js`, `templates.js`). There is no build step
  and no compiler, so a typo in a tool schema is caught by the contract tests
  instead.
- `node scripts/test.mjs` — the whole suite in one process. **`node --test`
  cannot be used here**: it spawns one child per test file with piped stdio and
  the file sandbox denies the pipe with `EPERM`. Running the files in one
  process is the same suite without the child.
- `node scripts/smoke.mjs [dir]` — print the map's numbers for a directory
  (default: `reference/PingLatencyOverlay/`), including the sections that have
  outgrown a single read.
- `node scripts/measure.mjs [dir] [topic …]` — print what a reply costs per
  topic against the pages it would have returned. This is the harness that keeps
  a claim like "40% smaller" honest after a change to the ranking; re-run it
  rather than reasoning about the weights.

The gate before a commit is every check, not just the tests:

    node --check lib/index.js → node scripts/test.mjs → node scripts/smoke.mjs

`.github/workflows/ci.yml` runs that same sequence on every push and pull
request, one `node --check` per file under `lib/`.

The real check is a session: the plugin is exercised by the harness it runs in.
It is installed in the desktop profile as a bundle, and a code change is only
visible to the running app after a restart — the profile does not watch module
files, so an edit is followed by a restart, not by a reload. See
`docs/features/packaging.md` for the install and the reload semantics, and
`HANDOFF.md` for when the running generation was last matched to the tree.

## Workflow
- **Read the map before the code, and keep the map worth reading.** A feature
  page is an anti-hunting payload: the file, type, function and test names for
  one area, and the traps that cost someone an afternoon. Opening the source
  first and writing the page afterwards spends the tokens twice. If a page is
  wrong, fix it in the same commit rather than working around it — a map
  nobody trusts is worse than no map.
- **A section is the unit a later session reads, so keep one under about two
  kilobytes.** `feature_map` hands over one section at a time, and a section
  that outgrew a single read has to be split with `###` before it can be handed
  over whole. `feature_map_check` reports the ones that have. The headings in
  the doc template are load-bearing twice over: they are what makes a page
  greppable and what makes it divisible.
- **The features map is part of the change, not the cleanup.** Before staging a
  commit, update the feature doc(s) for whatever you changed
  (`docs/features/`), and add an index row if the doc is new. User-visible
  behavior also updates `docs/SPEC.md` in the same commit. A docs-only
  follow-up commit is the one that gets skipped. Pure refactors with no
  behavior, mechanism, config or test change need no doc edit — do not churn
  the map.
- **Search the map in the same breath as the code.** A grep for a feature, a
  symbol or a behaviour runs over `docs/features/` too: the feature pages name
  the identifiers and the tests, so the page you need is usually one hop from
  the hit.
- **Dogfood the templates.** The boilerplate in `templates/` and this
  repository's own `AGENTS.md`, `HANDOFF.md` and `docs/` are the same text with
  the placeholders resolved. A change to one is a change to the other, in the
  same commit, or the next project scaffolded gets the version nobody used.
- **`HANDOFF.md` is refreshed at the end of a session, not per commit.** It
  carries what only the passing session knows — open threads, next steps, the
  last thing delivered — under an `As of` stamp. It is allowed to lag the tip:
  its header says the code wins. Refresh it before you hand the work over.
- **The guard must never be able to deadlock a session.** It denies once, and
  the denial is itself the instruction that clears it. Any change that can
  produce a second denial for the same session, or a denial whose remedy the
  agent cannot reach, is a bug in the guard rather than a stricter guard.
- **Measure, don't deduce it.** Reading the code and doing the arithmetic in
  your head is how geometry, layout and formatting bugs ship. Print the real
  numbers from the real thing — a headless run, a scratch script, the actual
  command — and assert both the good and the broken case, so each test carries
  its own failure mode.
- **Gate on the whole check set, not just the tests.** The linter catches the
  classes of defect the test run compiles straight past; here the linter is
  `node --check` plus the smoke script, because there is no compiler to catch a
  typo in a tool schema.
- **Commit messages go through a file.** Write the message to a scratch file
  (this machine uses `%LOCALAPPDATA%\Temp\opencode\<project>-commit-msg.txt`)
  and run `git commit -F <path>`; a PowerShell here-string gets its terminator
  mangled by the shell tool.
- **No AI attribution in a commit message, ever, without being asked.** No
  `Co-Authored-By` trailer, no `Generated with` footer, nothing that reads as
  crediting a model or tool. These commits are the user's. This is enforced,
  not merely preferred: a machine-wide `commit-msg` hook
  (`core.hooksPath` = `C:/Users/mega/.githooks`) rejects the commit outright,
  and it blocks human co-authors too, so the only ways past it are `--no-verify`
  or `ALLOW_COAUTHOR=1`. **Use neither without the user asking in that
  conversation.** If the hook blocks something, report it and stop; do not
  reword the message to slip a trailer past the pattern.
- **Do not commit before the user has looked at it.** Hand a behavior change
  over as a live session and wait for confirmation.

## Where the working knowledge lives

The per-feature working knowledge lives in `docs/features/`; its `README.md` is
the index. This file keeps the process rules and the hard rules that apply
across features; the feature pages keep the maps, mechanisms and traps.

## Hard rules
- **The package declares no dependencies and no peer dependencies, and no file
  under `lib/` imports anything but a Node builtin or a relative path.** A
  profile installs a local plugin by linking its directory and Node resolves a
  bare import from the link's real path, so a dependency is a plugin that does
  not load — and a `@deepseek-ai/dsh-*` peer range cannot be satisfied at all,
  because those packages are published only to a registry this runtime does not
  use. `the package stays installable as a link` pins it. The cost is that there
  is no schemastery `Config`; configuration is normalized by hand in
  `resolveConfig()`, where an unrecognised value falls back to the strict one.
- **Every shipped template keeps its `.tmpl` suffix, and no file under
  `templates/` is ever named `AGENTS.md` or `CLAUDE.md`.** DSH loads
  instruction files from every directory from the project root down to the
  working directory, so a `templates/AGENTS.md` is injected as live
  instructions into every session in this repository — with `{{PROJECT_NAME}}`
  unsubstituted and the guidance comments still in it. The suffix is the whole
  mechanism that keeps the boilerplate data rather than instructions.
- **The templates stay project-agnostic.** Nothing in `templates/` names this
  plugin, a language, a build tool or a command that a new project would not
  have; a project-specific line belongs in the document the project writes for
  itself. The only substitutions are the project name and its one-line summary.
- **The plugin ships no source-code knowledge of its own.** It reads the
  project's map and hands it back; it never parses the project's source, caches
  a symbol index, or guesses a file path from a feature name. A map tool that
  answers when the map is stale is worse than one that reads the map.
- **A tool the guard inspects is matched by name against the live tool
  registry.** The guard degrades to allow when the fs tools are absent, renamed
  or restricted away, so the plugin can be enabled beside any profile without
  blocking a session that has no fs tools at all.
- The README is for users. Implementation detail belongs in `docs/SPEC.md` for
  behavior and here for working knowledge, and the user must be consulted
  before technical detail is added to the README.
