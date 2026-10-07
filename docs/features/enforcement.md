# The guard — deny the first source lookup of a session, once

Status: shipped (0.1.0) · Read when: changing the guard, `sourceTools`,
`exemptPaths`, `mode`, or anything that runs before a tool call

## What it does

- Denies the first source lookup of a session (`read`, `grep`, `glob` by
  default) in a project that has a feature map, with a reason that names the
  remedy: call `feature_map`, then call the tool again.
- Never denies twice. The denial sets `asked`, and `asked` is checked before
  every other condition, so the retry always proceeds.
- Never fires in a project with no map: the absence sets `waived` for the
  session, so the plugin costs a mapless project exactly zero tool calls.
- Renders no prompt text, and registers no guard at all, in `mode: 'prompt'`.
- Treats a call outside the project, under `docs/`, or at an instruction file
  as not a source lookup — those are how a session talks to a project.

## Map

- `lib/index.js` — `sourceLookup()`, `denialText()`, `sessionCwd()`,
  `sessionState()`, the `settings.mode === 'enforce'` block in `apply()`.
- `lib/map.js` — `findMapRoot()`, the synchronous lookup the guard depends on.
- `lib/index.js` — `PATH_ARGUMENTS` (the argument names that carry a path),
  `DEFAULT_EXEMPT`.

## How & why

A guard is synchronous, deny-only and monotonic: it returns a string to deny
and `undefined` to leave the call alone, and no guard can turn another guard's
denial back into permission. That shape decides the whole design — there is no
"advise" return, and a synchronous check cannot `await` a filesystem call.

So the guard needs a synchronous answer to two questions: *is there a map?* and
*is this path inside the project?* Both are answered by `node:fs` rather than
by `ctx.fs`: `findMapRoot()` walks upward from the session cwd with
`statSync(path, { throwIfNoEntry: false })`, and `sourceLookup()` uses
`existsSync` for the "does this file exist" question. This is the one place the
plugin reads the filesystem directly instead of through the harness seam, and
it is a deliberate trade: the alternative is caching an async answer computed
somewhere else, and a stale cache that says "no map" silently disables the
guard for a whole session. The read is a handful of `stat` calls on a path the
session already knows. The local-filesystem assumption is real and is stated
here rather than hidden: on a profile whose filesystem backend is remote, the
guard sees the host's disk.

`sessionCwd()` reads `exec.agent.session.header.cwd` — the session's own
workspace, which is absolute and validated by the session store. There is no
session-cwd service; that accessor is the canonical one, and a non-agent call
(there is no `exec.agent`) has no cwd, so the guard allows it.

The denial message is the instruction that clears the denial. A guard's reason
is materialized as an `isError` tool result whose text is literally
`Error: <reason>`, so the reason carries the whole remedy: the tool to call,
the optional argument that makes it specific, and the fact that this is the
only time the session will ask. A denial that leaves the agent guessing costs
more than the search it prevented.

### Traps

- A denied call is not a thrown error: the agent sees a failed tool result and
  retries. Anything that makes the retry fail too is a deadlock, which is why
  `asked` is set *before* the message is returned and checked *first*.
- `settings.sourceTools` is matched against the live tool name. A profile that
  renames or restricts the fs tools away leaves the guard inert rather than
  broken — it never invents a tool.
- A pattern search with no path (`grep` with only a `pattern`) is a
  whole-project hunt: exactly the cost the map exists to avoid, so it counts as
  a source lookup and reports the pattern key in the message.
- `mode: 'prompt'` exists because a session doing an unusual job (a large
  mechanical refactor) is better served by the instruction than by the denial.
  The two modes are the same plugin and the same tools.
- **A plugin reload forgets which sessions have consulted the map.** The state
  is a `WeakMap` created per `apply()`, so a disable/enable toggle of the row
  starts every session over and the guard asks once more. Observed, not
  deduced: the toggle that cleared the first failed import also made the guard
  deny a `read` in the very session that had already read the map. The cost is
  one extra prompt after a reload, which is the right side of the trade — the
  alternative is state that outlives the code that wrote it.

## Config keys / UI

| Key | Default | Range | Set by |
| --- | --- | --- | --- |
| `mode` | `enforce` | `enforce`, `prompt`, `off` | plugin Config |
| `sourceTools` | `['read','grep','glob']` | tool names | plugin Config |
| `exemptPaths` | `['docs/','AGENTS.md','CLAUDE.md','HANDOFF.md','README.md']` | project-relative prefixes | plugin Config |

## Tests that pin it

`test/contract.test.mjs` drives the guard directly against a mock context and a
scratch project: `the guard denies the first source lookup once, and always
yields`, `the guard stands down once the map is read, and in a project without
one`, `mode prompt keeps the instruction and drops the guard`,
`a guard never fires for a call it cannot attribute to a session`.

`test/plugin.test.mjs` covers the map layer the guard stands on:
`the reference project is found from a nested directory and not from outside
it` and `a healthy map agrees with itself`.

The denial was also observed end to end in a live session against this
repository: a `read` of `lib/map.js` was refused with the message below, a
`feature_map` call with a topic returned the sections for the area, and the
next `read` proceeded. That is the loop this page describes, and it is the
acceptance test for any change here.

```
Error: read "lib/map.js" reads source in a project that keeps a feature map.
Call feature_map first — add `topic` if you know the area, otherwise it
returns the index — and read the sections for that area: they name the files,
functions and tests, which is cheaper than searching for them. This is the
only time this session will ask; call read again and it will proceed.
```

## Related

[map-tool.md](map-tool.md) · [templates.md](templates.md)
