# The boilerplate — the documents this plugin hands to a new project

Status: shipped (0.1.0) · Read when: editing `templates/`,
`lib/templates.js`, `feature_map_init`, or the placeholder set

## What it does

- Ships four documents: `AGENTS.md` (process and hard rules), `HANDOFF.md`
  (volatile session state), `docs/SPEC.md` (user-visible behavior) and
  `docs/features/README.md` (the map index and the page template).
- `feature_map_init` renders them with the project's name and summary and, by
  default, returns their content for the caller to write with its own tools.
- `feature_map_init` with `write: true` writes them through `ctx.fs`, behind
  the profile's sandbox policy.
- Refuses to replace a file that exists unless `force: true`, and reports what
  it left alone.

## Map

- `templates/AGENTS.md.tmpl`, `templates/HANDOFF.md.tmpl`,
  `templates/docs/SPEC.md.tmpl`, `templates/docs/features/README.md.tmpl`.
- `lib/templates.js` — `TEMPLATES`, `TEMPLATE_DIR`, `substitute()`,
  `templateVariables()`, `targetPath()`, `planScaffold()`, `applyScaffold()`,
  `SUMMARY_PLACEHOLDER`.
- `lib/index.js` — the `feature_map_init` tool, and `writeThrough()`, the seam
  every writing tool shares.

## How & why

**The `.tmpl` suffix is load-bearing.** DSH loads `AGENTS.md` and `CLAUDE.md`
from the project root down to the working directory, so a file named
`templates/AGENTS.md` in this repository would be injected as live instructions
into every session working here — with `{{PROJECT_NAME}}` unsubstituted and the
guidance comments still in it. The suffix is the entire mechanism that keeps the
boilerplate data rather than instructions, which is why
`the shipped boilerplate keeps its .tmpl suffix and never claims an instruction
name` is a test rather than a convention. (This was not hypothetical: the first
draft of `templates/AGENTS.md` was loaded as instructions within seconds of
being written.)

An unresolved placeholder stays visible. `substitute()` reports the names it
had no value for and leaves the token in place, because a silently blanked
`{{PROJECT_NAME}}` produces a document that looks finished and says nothing —
and the report is what lets `feature_map_init` tell the caller which tokens to
fill in.

The plan is the default and the write is opt-in. `planScaffold()` renders every
file, checks what exists, and returns the content; the caller can then write it
with the tools whose writes the user's policy already governs, or ask for
`write: true`.

### The write seam carries the sandbox policy

`writeThrough()` in `lib/index.js` is the one place every writing tool goes
through: `feature_map_init`'s `write`, `feature_map_adopt`'s `apply` and
`feature_map_regen`'s `apply` all hand it their content. It resolves the path
with `ctx.fs.resolve()` and writes with `ctx.fs.writeText()` rather than
`node:fs`, because a write is exactly the operation a sandbox policy exists to
decide — a plugin that wrote around the seam would be enforcing its own rules
instead of the user's. Directory creation is the one exception: `ctx.fs` has no
`mkdir`, so the parent directories come from `node:fs`, bounded to the files
being written.

**`writeText`'s fifth argument is not optional in practice.** Its contract says
the policy is what a sandboxing backend fences the write by, and that omitting it
"leaves the backend its own default" — which is read-only. Every write this plugin
made therefore failed on a `workspace-write` profile while reporting nothing but a
count of zero, and the first live `feature_map_regen` is what found it. The policy
comes from `ctx.sandboxPolicy.resolve({ session })`, resolved per call so the
session's own mode and cwd travel with it. `sandboxPolicy` is an optional service
exactly as `fs` is: a profile composing neither gets the backend default, and the
plugin still declares no hard dependency on either.

### Naming what is still a placeholder

The scaffold's second job is telling the project what to do with the files:
`planScaffold()` returns the per-file status, and the tool's reply names the
sections that are still placeholders — the layout, the commands and the hard
rules in `AGENTS.md`, and the first row of the index. A project that ships the
boilerplate unfilled has documents that read as authoritative and say nothing.

### Traps

- `templates/` must stay project-agnostic: no language, no build tool, no
  command a new project would not have. The only substitutions are
  `PROJECT_NAME`, `PROJECT_SUMMARY`, `HANDOFF_COMMIT` and `HANDOFF_DATE`.
- The templates and this repository's own documents are the same text with the
  placeholders resolved. A change to one is a change to the other in the same
  commit, or the next scaffolded project gets a version nobody uses.
- `{{...}}` in a *prompt section* is a strict interpolation and throws on an
  unknown name. The placeholder syntax is safe in these files because they are
  file content, never prompt text; that distinction is why `SECTION_TEXT` in
  `lib/index.js` contains no braces.

## Config keys / UI

| Key | Default | Range | Set by |
| --- | --- | --- | --- |
| `root` | session cwd | any absolute path | `feature_map_init` argument |
| `project` | last path segment of `root` | any string | `feature_map_init` argument |
| `summary` | a visible fill-in comment | any string | `feature_map_init` argument |
| `write` | `false` | boolean | `feature_map_init` argument |
| `force` | `false` | boolean | `feature_map_init` argument |
| `only` | all four | template ids | `feature_map_init` argument |

## Tests that pin it

`test/plugin.test.mjs`: `the shipped boilerplate keeps its .tmpl suffix and
never claims an instruction name`, `the scaffold plans every file, then writes
it`, `a placeholder with no value stays visible instead of blanking the
document`.

`test/contract.test.mjs`: `a write carries the session's sandbox policy, and a
failure is reported`.

## Related

[map-tool.md](map-tool.md) · [enforcement.md](enforcement.md)
