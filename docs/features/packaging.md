# Packaging — how this plugin reaches a profile and stays loadable

Status: shipped (0.1.0) · Read when: changing `package.json`,
`cordis.patch.yml`, `inject`, the exported names, or installing the plugin

## What it does

- Declares itself a **bundle** (`dsh.bundle.patch`), so adding it to a profile
  is one plugin-manager action and its loader row comes from its own patch.
- Inserts exactly one row, `id: feature-map`, `name: dsh-feature-map`.
- Ships **no dependencies at all** — no `dependencies`, no
  `peerDependencies` — and registers its tools with raw JSON Schema rather
  than the harness's `defineTool` helper.
- Registers one prompt section, five tools and one guard; the tools are the
  whole public surface.

## Map

- `package.json` — `type: module`, `main: lib/index.js`, `files`,
  `repository`/`homepage`/`bugs`, `dsh.bundle`.
- `cordis.patch.yml` — the one-row insert.
- `lib/index.js` — `name`, `inject`, `apply`, the exported module surface.
- `lib/index.js` — `DEFAULT_CONFIG` and `resolveConfig()`, the hand-written
  replacement for a schemastery `Config`.

## How & why

**A local plugin is installed by linking its directory, and Node resolves a
bare import from the link's real path.** That single fact decides three
things. It is why this package has no dependencies: `@deepseek-ai/schemastery`
(or any harness package) would have to be installed beside this source rather
than in the profile, and the harness packages are published only to a registry
this runtime does not use — the public registry serves
`@deepseek-ai/dsh-tools@0.0.1-rc.1` while the application runs `0.2.0-rc.2`.
It is why the tools use `ctx.tools.register({ … })` with a real JSON Schema
instead of `defineTool({ parameters: <property map> })`: the helper is a
runtime import, and a plugin that resolves a second copy of the harness to
declare a schema has two versions that can disagree. And it is why `Config` is
a plain object normalized in `resolveConfig()` rather than a schemastery
schema: exporting no `Config` makes the loader pass configuration through
unvalidated, which is exactly what a hand-written normalizer wants.

The cost of that last choice is real and is stated rather than hidden: the
plugin's configuration has no projected schema, so a settings surface shows no
form for it and a typo in a patch is normalized rather than rejected. An
unrecognised `mode` falls back to `enforce` — the strict one — so a mistake
cannot silently disable the rule.

**Peer ranges are deliberately absent.** The compatibility gate reads
`@deepseek-ai/dsh-*` peers and compares them with the running version, and no
range can be satisfied here: `^0.1.5-rc.2` tops out below `0.2.0-rc.2`, and
`^0.2.0-rc.2` cannot be resolved from the public registry. Declaring one would
turn an install into `incompatible-version`. The contract this plugin expects
from the runtime — `systemPrompt.section`, `tools.register`/`guard`,
`agent.session.header.cwd` — therefore lives in these pages instead of in the
manifest, and the harness will load the plugin without checking it.

### Activation is live; a code change is not

`install_bundle` with an absolute
path spec runs `pnpm add` in the profile, appends the package to
`dsh.profile.bundles`, and recomposes — the row mounts in the running session
with no restart. Editing `lib/*.js` afterwards is a different matter: the
profile's HMR row is configured with `root: []`, so module files are not
watched, and an already-imported module URL stays in the module cache.
Toggling the row off and on re-runs the composition and **re-imports from the
cache** — the patch is reapplied, the old generation still runs. Only a
restart loads a fresh generation. The one exception observed: a row whose
import *failed* is retried after a toggle, which is how the first
"failed to import" was cleared without a restart.

### Traps

- **The README's install command is a pnpm command, and the reason is measured.**
  `dsh plugin --profile desktop add github:megablue/dsh-feature-map` resolves —
  probed with `pnpm add --dir <scratch> github:megablue/dsh-feature-map`, which
  fetched the tarball, kept the bundle patch and passed `node --check` on the
  entry. `npm install github:…` on the same machine answers `EALLOWGIT`
  ("Fetching packages of type git have been disabled"), so a copy-pasted npm
  invocation is the failure mode this bullet exists for. The line is also
  load-bearing outside this repo: dsh-plugin.org refuses to list a repository
  whose README does not carry a `dsh plugin --profile … add <package>` command,
  so deleting it as noise un-lists the plugin.
- **The hub's listing badge goes in before it can point at the listing.** The
  submit page's instruction is to paste
  `[![Listed on dsh-plugin.org](…/badges/listed.svg)](https://dsh-plugin.org/plugins/your-owner/your-plugin-slug)`
  into the README with the template slug untouched, and to substitute `your-owner`
  and `your-plugin-slug` "once your plugin is listed". So the badge link 404s
  until then, and that is the documented state rather than a mistake to fix.
  The slug is predictable — listings sit at `/plugins/<owner>/<repo>`, and the
  hub's own is `/plugins/dshplugin/dsh-plugin-hub` — but a guessed URL that
  looks specific and is wrong is worse than a placeholder that reads as one,
  so the substitution waits on the real detail page. It lives in the header
  strip under the title, beside the other badges, so the edit is one line at
  the top of the README rather than a hunt.
- **Six badges in the header strip, and each is either derived or linked.** CI
  and the version badge are read from the live sources — the `gate` workflow
  and `package.json` — so neither can drift; the topic and `Listed on` badges
  link to the GitHub topic page and the hub. License, Node and
  `dependencies: none` are static claims, which is why the last two link to
  `ci.yml` and `package.json` respectively: the badge asserts, the link lets a
  reader check. Every URL was probed with a `200` before it was written down.
- **The banner is a relative link, so it resolves on GitHub and nowhere else.**
  `docs/assets/header.svg` is referenced from the top of the README; `files`
  ships only `lib`, `templates` and `cordis.patch.yml`, so a published npm page
  would show a broken image. GitHub refuses SVG as a social preview — PNG, JPG
  or GIF, under 1 MB, 1280×640 recommended — so `.github/social-preview.png` is
  the rasterized copy, and uploading it is a Settings → Social preview click
  with no API. The PNG is committed rather than left in a scratch directory
  precisely because that click is manual: the preview is regenerated by
  rasterizing the SVG, not hand-drawn twice.
- A failed import is reported by the manager as
  `1 entry did not activate` with `failed to import` and nothing else. The real
  error is not in that message; reproduce it by importing the entry from the
  profile directory with plain `node`, which prints the resolution failure.
- `link:` is what pnpm records for an absolute path spec. Do not expect
  `file:` semantics — a linked package does not get its dependencies installed.
- The row's bare `name` resolves from the profile directory, so the package must
  be installed as a profile dependency first; the path alone is not enough.
- Every `plugin_manager` action is approval-gated and needs
  `danger-full-access`, so an install can be refused by policy rather than by
  the plugin manager.

## Config keys / UI

| Key | Default | Range | Set by |
| --- | --- | --- | --- |
| `mode` | `enforce` | `enforce`, `prompt`, `off` (unknown → `enforce`) | plugin config |
| `sourceTools` | `['read','grep','glob']` | tool names | plugin config |
| `exemptPaths` | `['docs/','AGENTS.md','CLAUDE.md','HANDOFF.md','README.md']` | project-relative prefixes | plugin config |
| `maxBytes` | `12000` | positive integer; non-positive disables the cap | plugin config |
| `sectionsPerTopic` | `3` | positive integer | plugin config |
| `maxSectionBytes` | `2048` | positive integer | plugin config |
| `sectionOrder` | the read tool's slot (1100) | finite number | plugin config |

## Tests that pin it

`test/contract.test.mjs`: `the plugin declares the services it needs and
nothing it does not`, `apply registers one section, five tools and one guard`,
`every tool declares a renderer, a closed schema and a JSON Schema parameter
block`, `a tool reply matches the schema the harness validates it against`,
`the scaffold writes through the fs service when the profile composes one`.

`test/plugin.test.mjs` is the map and template half. The install itself was
verified by hand against the live profile; see `HANDOFF.md`.

## Related

[enforcement.md](enforcement.md) · [map-tool.md](map-tool.md) ·
[templates.md](templates.md)
