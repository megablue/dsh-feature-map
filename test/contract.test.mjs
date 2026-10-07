/**
 * The plugin's contract with the harness, checked without the harness.
 *
 * The unit tests next door cover the map and the templates; this file covers
 * the half that only exists inside a session: that the module loads with no
 * dependencies (a linked local plugin resolves bare imports from its real path,
 * so a dependency here is a plugin that will not load), that `apply()` registers
 * one prompt section, five tools and one guard, that every value a tool
 * returns is declared by that tool's `output.schema` — the harness validates it
 * and turns a mismatch into a `ToolOutputError` rather than a rendered message
 * — and that the guard denies exactly once and always yields.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { checkMap } from '../lib/map.js'
import { apply, inject, name } from '../lib/index.js'

/** A Cordis context that records what the plugin registers. */
function mockContext(options = {}) {
  const record = { sections: [], tools: [], guards: [] }
  const visible = options.visibleTools ?? ['read', 'grep', 'glob']
  const ctx = {
    record,
    systemPrompt: {
      section: (section) => {
        record.sections.push(section)
        return () => {}
      },
      getSectionOrder: (key) => (key === 'TOOL_READ' ? 1100 : undefined),
    },
    tools: {
      register: (definition) => {
        record.tools.push(definition)
        return () => {}
      },
      guard: (guard) => {
        record.guards.push(guard)
        return () => {}
      },
      get: (tool) => (visible.includes(tool) ? { name: tool } : undefined),
    },
    get: (service) =>
      service === 'fs'
        ? options.fs
        : service === 'sandboxPolicy'
          ? options.sandboxPolicy
          : undefined,
    effect: () => () => {},
    on: () => () => {},
  }
  return ctx
}

/** A fake agent, as a tool call and a guard see one. */
function mockAgent(cwd) {
  return { session: { header: { cwd } } }
}

/** The tool definition the plugin registered under a name. */
function toolNamed(ctx, toolName) {
  const found = ctx.record.tools.find((tool) => tool.name === toolName)
  assert.ok(found, `expected a tool named ${toolName}`)
  return found
}

/** Every key a value returns must be declared, and every required key present. */
function assertMatchesSchema(value, schema, where) {
  const declared = Object.keys(schema.properties ?? {})
  for (const key of Object.keys(value)) {
    assert.ok(declared.includes(key), `${where} returned undeclared "${key}"`)
  }
  for (const key of schema.required ?? []) {
    assert.ok(key in value, `${where} omitted required "${key}"`)
  }
  assert.equal(schema.type, 'object')
  assert.equal(schema.additionalProperties, false)
}

/** A project with a map and one source file. */
async function scratchProject() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-feature-map-contract-'))
  await mkdir(join(root, 'docs', 'features'), { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(
    join(root, 'docs', 'features', 'README.md'),
    [
      '# scratch — features map',
      '',
      '| Feature | Doc | Read when |',
      '| --- | --- | --- |',
      '| Widgets | [widgets.md](widgets.md) | the widget pipeline |',
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    join(root, 'docs', 'features', 'widgets.md'),
    [
      '# Widgets — the widget pipeline',
      '',
      'Status: shipped (0.1.0) · Read when: the widget pipeline',
      '',
      '## What it does',
      '',
      '- Turns widgets into gadgets.',
      '',
      '## Map',
      '',
      '- `src/widgets.js` — `makeWidget()`, `WIDGET_LIMIT`.',
      '',
      '## How & why',
      '',
      'The pipeline is a queue that drains on idle.',
      '',
      '### The queue',
      '',
      'One queue per widget, kept in `WIDGET_LIMIT` order.',
      '',
      '### The drain',
      '',
      'The queue drains when the loop is idle.',
      '',
      '## Tests that pin it',
      '',
      '- `widgets.test.mjs`: `makes a widget`.',
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(join(root, 'src', 'widgets.js'), 'export const widget = 1\n', 'utf8')
  return root
}

test('the plugin declares the services it needs and nothing it does not', () => {
  assert.equal(name, 'feature-map')
  assert.deepEqual(inject, ['systemPrompt', 'tools'])
})

test('the package stays installable as a link', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.main, 'lib/index.js')
  assert.equal(manifest.dependencies, undefined, 'a dependency cannot resolve from a linked install')
  assert.equal(
    manifest.peerDependencies,
    undefined,
    'a dsh peer range cannot be satisfied by this runtime, and the gate rejects it',
  )
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.ok(manifest.files.includes('cordis.patch.yml'), 'the bundle patch must ship')

  for (const file of ['index.js', 'map.js', 'templates.js']) {
    const source = await readFile(new URL(`../lib/${file}`, import.meta.url), 'utf8')
    for (const [, specifier] of source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
      assert.ok(
        specifier.startsWith('node:') || specifier.startsWith('.'),
        `lib/${file} imports "${specifier}", which will not resolve from a linked install`,
      )
    }
  }
})

test('apply registers one section, five tools and one guard', () => {
  const ctx = mockContext()
  apply(ctx, {})
  assert.equal(ctx.record.sections.length, 1)
  assert.deepEqual(
    ctx.record.tools.map((tool) => tool.name).sort(),
    [
      'feature_map',
      'feature_map_adopt',
      'feature_map_check',
      'feature_map_init',
      'feature_map_regen',
    ],
  )
  assert.equal(ctx.record.guards.length, 1)
})

test('the section sits before the read tool and renders nothing without fs tools', () => {
  const ctx = mockContext()
  apply(ctx, {})
  const section = ctx.record.sections[0]
  assert.equal(section.name, 'tool:feature-map')
  assert.equal(section.order, 1100)
  assert.ok(section.order < 1200, 'the section must sort into the read tool slot')
  assert.ok(section.text({ scope: {} }).includes('feature_map'))

  const blind = mockContext({ visibleTools: [] })
  apply(blind, {})
  assert.equal(blind.record.sections[0].text({ scope: {} }), '')
})

test('every tool declares a renderer, a closed schema and a JSON Schema parameter block', () => {
  const ctx = mockContext()
  apply(ctx, {})
  for (const tool of ctx.record.tools) {
    assert.equal(typeof tool.description, 'string')
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function', `${tool.name} needs output.render`)
    assert.equal(tool.output.schema.additionalProperties, false)
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
    assert.deepEqual(
      tool.output.render({}, { text: 'hi' }),
      [{ type: 'text', text: 'hi' }],
      `${tool.name}'s renderer must return text blocks`,
    )
  }
})

test('no arguments returns the index, which is the entry point', async () => {
  const root = await scratchProject()
  try {
    const ctx = mockContext()
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const tool = toolNamed(ctx, 'feature_map')
    const index = await tool.execute({}, exec)
    assertMatchesSchema(index, tool.output.schema, 'feature_map(index)')
    assert.equal(index.kind, 'index')
    assert.equal(index.rows, 1)
    assert.equal(index.pageCount, 1)
    assert.ok(index.text.includes('Widgets'), 'the index should carry the feature table')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a topic returns the cheap sections, not the whole page', async () => {
  const root = await scratchProject()
  try {
    const ctx = mockContext()
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const tool = toolNamed(ctx, 'feature_map')

    const topic = await tool.execute({ topic: 'widget pipeline' }, exec)
    assertMatchesSchema(topic, tool.output.schema, 'feature_map(topic)')
    assert.equal(topic.kind, 'sections')
    assert.ok(topic.text.includes('src/widgets.js'), 'the sections should name the file')
    assert.ok(topic.text.includes('makes a widget'), 'the tests section should be there')
    assert.ok(
      topic.sections.some((entry) => entry.endsWith('#map')),
      'the Map section is the anti-hunting payload and should be returned',
    )
    assert.ok(
      !topic.text.includes('The pipeline is a queue that drains on idle.'),
      'How & why is the prose, and a topic reply should not spend bytes on it',
    )
    assert.ok(
      topic.omitted.some((entry) => entry.endsWith('#how-why')),
      'the omitted sections must be named so they can be asked for',
    )
    assert.ok(
      topic.text.includes('Not returned from'),
      'the reply must say how to reach what it left out',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a page alone is its shape, and section, sub and full go deeper', async () => {
  const root = await scratchProject()
  try {
    const ctx = mockContext()
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const tool = toolNamed(ctx, 'feature_map')

    const shape = await tool.execute({ page: 'widgets' }, exec)
    assertMatchesSchema(shape, tool.output.schema, 'feature_map(page)')
    assert.equal(shape.kind, 'skeleton')
    assert.ok(shape.text.includes('## How & why'), 'the shape lists the headings')
    assert.ok(shape.text.includes(' B'), 'the shape lists the sizes')
    assert.ok(!shape.text.includes('drains on idle'), 'the shape carries no content')

    const section = await tool.execute({ page: 'widgets', section: 'how' }, exec)
    assertMatchesSchema(section, tool.output.schema, 'feature_map(section)')
    assert.equal(section.kind, 'section')
    assert.equal(section.section, 'How & why')
    assert.ok(section.text.includes('drains on idle'))
    assert.ok(
      section.text.includes('Widgets — the widget pipeline'),
      'a requested section still arrives under its page title and status line',
    )
    assert.ok(
      !section.text.includes('Turns widgets into gadgets'),
      'a section the caller named needs no summary prepended — only a guessed one does',
    )
    assert.ok(!section.text.includes('makes a widget'), 'and not the whole page either')

    const sub = await tool.execute({ page: 'widgets', section: 'how', sub: 'queue' }, exec)
    assertMatchesSchema(sub, tool.output.schema, 'feature_map(sub)')
    assert.equal(sub.kind, 'subsection')
    assert.ok(
      sub.text.includes('One queue per widget'),
      `the subsection reply should carry its own content, got: ${JSON.stringify(sub.text)}`,
    )
    assert.ok(!sub.text.includes('drains when the loop is idle'), 'only the one subsection')

    const full = await tool.execute({ page: 'widgets', full: true }, exec)
    assertMatchesSchema(full, tool.output.schema, 'feature_map(full)')
    assert.equal(full.kind, 'page')
    assert.ok(full.text.includes('drains on idle') && full.text.includes('makes a widget'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a topic can be asked for as shapes, and a capped reply can be resumed', async () => {
  const root = await scratchProject()
  try {
    const ctx = mockContext()
    apply(ctx, { maxBytes: 200 })
    const exec = { agent: mockAgent(root), signal: undefined }
    const tool = toolNamed(ctx, 'feature_map')

    const shape = await tool.execute({ topic: 'widget pipeline', skeleton: true }, exec)
    assertMatchesSchema(shape, tool.output.schema, 'feature_map(skeleton)')
    assert.equal(shape.kind, 'skeleton')
    assert.ok(shape.text.includes('## Map'), 'the shapes name the sections')
    assert.ok(!shape.text.includes('makeWidget'), 'and none of their content')

    const first = await tool.execute({ topic: 'widget pipeline' }, exec)
    assertMatchesSchema(first, tool.output.schema, 'feature_map(capped)')
    assert.ok(first.nextOffset > 0, 'a reply over the budget must say where to resume')
    assert.ok(first.text.includes(`offset:${first.nextOffset}`), 'and how to ask for the rest')

    // Walking the continuation must terminate and must reach the end of the
    // reply: a window that never advances would loop a session forever.
    let cursor = 0
    let accumulated = ''
    let windows = 0
    for (; windows < 12; windows += 1) {
      const chunk = await tool.execute({ topic: 'widget pipeline', offset: cursor }, exec)
      assertMatchesSchema(chunk, tool.output.schema, 'feature_map(resumed)')
      accumulated += chunk.text
      if (!chunk.nextOffset) break
      assert.ok(chunk.nextOffset > cursor, 'a continuation must always advance')
      cursor = chunk.nextOffset
    }
    assert.ok(windows < 12, 'the continuation must reach the end within a few windows')
    assert.ok(accumulated.includes('makes a widget'), 'and must reach the tests section')
    assert.ok(accumulated.includes('Not returned from'), 'and the line naming what is left out')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the checker separates drift from size advice', async () => {
  const root = await scratchProject()
  try {
    const strict = mockContext()
    apply(strict, { maxSectionBytes: 40 })
    const exec = { agent: mockAgent(root), signal: undefined }
    const check = await toolNamed(strict, 'feature_map_check').execute({}, exec)
    assertMatchesSchema(check, toolNamed(strict, 'feature_map_check').output.schema, 'check')
    assert.equal(check.clean, true, 'a consistent index is clean even when a section wants splitting')
    assert.ok(check.oversized.length >= 1, 'the size advice is still reported')
    assert.ok(check.oversized.every((entry) => entry.bytes > 40))
    assert.ok(check.text.includes('feature_map_regen'), 'and it names the tool that does the split')
    assert.ok(check.text.includes('On size:'), 'and it is labelled as size, not as drift')

    // A page that no index row links is drift, and drift is what `clean` means.
    await writeFile(join(root, 'docs', 'features', 'loose.md'), '# Loose\n\n## Map\n\n- none\n', 'utf8')
    const drifted = await toolNamed(strict, 'feature_map_check').execute({}, exec)
    assert.equal(drifted.clean, false)
    assert.ok(drifted.text.includes('The map has drifted'))
    assert.ok(drifted.text.includes('docs/features/loose.md'))

    const lenient = mockContext()
    apply(lenient, {})
    const ok = await toolNamed(lenient, 'feature_map_check').execute({}, exec)
    assert.equal(ok.clean, false, 'the loose page is still unlinked')
    assert.ok(ok.text.includes('docs/features/loose.md'), 'and it is named in the drift report')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the scaffold plans without writing, and needs no fs service to plan', async () => {
  const root = await scratchProject()
  try {
    const ctx = mockContext()
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const init = toolNamed(ctx, 'feature_map_init')
    const planned = await init.execute({ project: 'scratch' }, exec)
    assertMatchesSchema(planned, init.output.schema, 'feature_map_init(plan)')
    assert.deepEqual(planned.wrote, [])
    assert.ok(planned.text.includes('scratch'), 'the plan should name the project')
    assert.ok(planned.text.includes('## Layout'), 'the plan should carry the content')

    const written = await init.execute({ project: 'scratch', write: true }, exec)
    assertMatchesSchema(written, init.output.schema, 'feature_map_init(write)')
    assert.deepEqual(written.wrote, [], 'without an fs service nothing may be written')
    assert.ok(written.text.includes('Cannot write'), 'the refusal should say why')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the scaffold writes through the fs service when the profile composes one', async () => {
  const root = await scratchProject()
  const written = []
  try {
    const fs = {
      resolve: async (path) => ({ displayPath: path }),
      writeText: async (target, content) => {
        written.push({ path: target.displayPath, content })
        await mkdir(join(target.displayPath, '..'), { recursive: true })
        await writeFile(target.displayPath, content, 'utf8')
      },
    }
    const ctx = mockContext({ fs })
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const result = await toolNamed(ctx, 'feature_map_init').execute(
      { project: 'scratch', write: true, only: ['handoff'] },
      exec,
    )
    assertMatchesSchema(result, toolNamed(ctx, 'feature_map_init').output.schema, 'feature_map_init(fs)')
    assert.deepEqual(result.wrote, ['HANDOFF.md'])
    assert.equal(written.length, 1)
    assert.ok(written[0].content.includes('scratch'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the guard denies the first source lookup once, and always yields', async () => {
  const root = await scratchProject()
  try {
    const ctx = mockContext()
    apply(ctx, {})
    const guard = ctx.record.guards[0]
    const agent = mockAgent(root)

    const first = guard({ name: 'read', arguments: { file_path: 'src/widgets.js' }, agent })
    assert.equal(typeof first, 'string', 'the first source lookup should be refused')
    assert.ok(first.includes('feature_map'), 'the refusal must name the remedy')
    assert.ok(first.includes('src/widgets.js'), 'the refusal should name the path')

    const retry = guard({ name: 'read', arguments: { file_path: 'src/widgets.js' }, agent })
    assert.equal(retry, undefined, 'the retry must always proceed')

    const other = mockAgent(root)
    assert.equal(
      guard({ name: 'read', arguments: { file_path: 'docs/SPEC.md' }, agent: other }),
      undefined,
      'a document read is not a source lookup',
    )
    assert.equal(
      guard({ name: 'read', arguments: { file_path: 'docs/features/widgets.md' }, agent: other }),
      undefined,
      'reading the map is not a source lookup',
    )
    assert.equal(
      typeof guard({ name: 'grep', arguments: { pattern: 'widget' }, agent: other }),
      'string',
      'a whole-project search counts as a source lookup',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the guard stands down once the map is read or regenerated, and in a project without one', async () => {
  const root = await scratchProject()
  const bare = await mkdtemp(join(tmpdir(), 'dsh-feature-map-bare-'))
  try {
    const ctx = mockContext()
    apply(ctx, {})
    const guard = ctx.record.guards[0]
    const agent = mockAgent(root)
    await toolNamed(ctx, 'feature_map').execute({}, { agent, signal: undefined })
    assert.equal(
      guard({ name: 'read', arguments: { file_path: 'src/widgets.js' }, agent }),
      undefined,
      'a session that consulted the map is never asked again',
    )

    const regenCtx = mockContext()
    apply(regenCtx, {})
    const regenGuard = regenCtx.record.guards[0]
    const regenAgent = mockAgent(root)
    await toolNamed(regenCtx, 'feature_map_regen').execute({}, { agent: regenAgent, signal: undefined })
    assert.equal(
      regenGuard({ name: 'read', arguments: { file_path: 'src/widgets.js' }, agent: regenAgent }),
      undefined,
      'a session that rewrote the map has read it',
    )

    const mapless = mockAgent(bare)
    assert.equal(
      guard({ name: 'read', arguments: { file_path: 'src/widgets.js' }, agent: mapless }),
      undefined,
      'a project with no map is never nagged',
    )
    assert.equal(
      guard({ name: 'read', arguments: { file_path: 'src/widgets.js' }, agent: mapless }),
      undefined,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(bare, { recursive: true, force: true })
  }
})

test('mode prompt keeps the instruction and drops the guard', () => {
  const ctx = mockContext()
  apply(ctx, { mode: 'prompt' })
  assert.equal(ctx.record.sections.length, 1)
  assert.equal(ctx.record.guards.length, 0)
  assert.equal(ctx.record.tools.length, 5)

  const off = mockContext()
  apply(off, { mode: 'off' })
  assert.equal(off.record.sections.length, 0)
  assert.equal(off.record.guards.length, 0)

  const nonsense = mockContext()
  apply(nonsense, { mode: 'whatever' })
  assert.equal(nonsense.record.guards.length, 1, 'an unknown mode falls back to enforce')
})

test('a guard never fires for a call it cannot attribute to a session', () => {
  const ctx = mockContext()
  apply(ctx, {})
  const guard = ctx.record.guards[0]
  assert.equal(guard({ name: 'read', arguments: { file_path: 'src/widgets.js' } }), undefined)
  assert.equal(
    guard({ name: 'read', arguments: { file_path: 'src/widgets.js' }, agent: { session: { header: {} } } }),
    undefined,
  )
  assert.equal(guard({ name: 'todowrite', arguments: {}, agent: mockAgent('C:\\') }), undefined)
})

/** A page that carries all six headings and a trigger. */
const CONFORMANT_PAGE = [
  '# Widgets — the widget pipeline',
  '',
  'Status: shipped (0.1.0) · Read when: the widget pipeline',
  '',
  '## What it does',
  '',
  '- Turns widgets into gadgets.',
  '',
  '## Map',
  '',
  '- `src/widgets.js` — `makeWidget()`.',
  '',
  '## How & why',
  '',
  'The queue drains on idle.',
  '',
  '## Config keys / UI',
  '',
  'None yet.',
  '',
  '## Tests that pin it',
  '',
  '- `widgets.test.mjs`: `makes a widget`.',
  '',
  '## Related',
  '',
  '- none',
  '',
].join('\n')

test('adoption writes what is missing and never edits what exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-feature-map-adopt-'))
  const writes = []
  try {
    await mkdir(join(root, 'docs', 'features'), { recursive: true })
    await writeFile(join(root, 'docs', 'features', 'widgets.md'), CONFORMANT_PAGE, 'utf8')
    const ownAgents = '# AGENTS.md\n\nMy own instructions, thank you.\n\n## House rules\n\n- Be brief.\n'
    await writeFile(join(root, 'AGENTS.md'), ownAgents, 'utf8')

    const fs = {
      resolve: async (path) => ({ displayPath: path }),
      writeText: async (target, content) => {
        writes.push(target.displayPath)
        await writeFile(target.displayPath, content, 'utf8')
      },
    }
    const ctx = mockContext({ fs })
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const adopt = toolNamed(ctx, 'feature_map_adopt')

    const plan = await adopt.execute({}, exec)
    assertMatchesSchema(plan, adopt.output.schema, 'feature_map_adopt(plan)')
    assert.deepEqual(plan.wrote, [], 'the default is a plan, not a write')
    assert.equal(writes.length, 0)
    assert.ok(plan.text.includes('AGENTS.md present'), 'the summary says what is already there')
    assert.ok(plan.text.includes('docs/features/widgets.md'), 'the unlinked page is named')

    const applied = await adopt.execute({ apply: true }, exec)
    assertMatchesSchema(applied, adopt.output.schema, 'feature_map_adopt(apply)')
    assert.ok(applied.wrote.includes('docs/features/README.md'), 'the missing index is written')
    assert.ok(!applied.wrote.includes('AGENTS.md'), 'an existing AGENTS.md is never written')
    assert.ok(!applied.wrote.includes('HANDOFF.md') === false, 'a missing HANDOFF.md is written')
    assert.equal(
      await readFile(join(root, 'AGENTS.md'), 'utf8'),
      ownAgents,
      'and it is byte-for-byte unchanged',
    )

    const after = await checkMap(root)
    assert.deepEqual(after.unindexed, [], 'the generated index links every page')
    assert.deepEqual(after.unresolved, [], 'and every link resolves')
    assert.equal(after.rowsWithoutTrigger, 0, 'and the trigger was read from the page')
    assert.deepEqual(after.findings.flatMap((finding) => finding.missingHeadings), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a project with nothing is sent to the scaffold instead', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-feature-map-empty-'))
  try {
    const ctx = mockContext()
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const adopt = toolNamed(ctx, 'feature_map_adopt')
    const out = await adopt.execute({ apply: true }, exec)
    assertMatchesSchema(out, adopt.output.schema, 'feature_map_adopt(empty)')
    assert.equal(out.summary, 'no docs')
    assert.deepEqual(out.wrote, [], 'nothing is written into an empty project')
    assert.ok(out.text.includes('feature_map_init'), 'the reply names the tool that fits')
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('documents outside the map are reported and never converted', async () => {
  const root = await scratchProject()
  try {
    await writeFile(join(root, 'docs', 'notes.md'), '# Notes\n\nLoose notes.\n', 'utf8')
    const ctx = mockContext()
    apply(ctx, {})
    const exec = { agent: mockAgent(root), signal: undefined }
    const adopt = toolNamed(ctx, 'feature_map_adopt')

    const candidates = await adopt.execute({ focus: 'candidates' }, exec)
    assertMatchesSchema(candidates, adopt.output.schema, 'feature_map_adopt(candidates)')
    assert.ok(candidates.text.includes('Outside the map'))
    assert.ok(candidates.text.includes('docs/notes.md'))
    assert.ok(!candidates.text.includes('### Index'), 'a focus keeps the reply to one area')

    const everything = await adopt.execute({}, exec)
    assert.ok(everything.text.includes('### Index'))
    assert.ok(everything.text.includes('### Sections'))
    assert.ok(everything.text.includes('Plan (deterministic items'), 'the plan is always offered')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the drift report asks only for the splits that are really missing', async () => {
  const root = await scratchProject()
  try {
    const ctx = mockContext()
    apply(ctx, { maxSectionBytes: 100 })
    const exec = { agent: mockAgent(root), signal: undefined }
    const check = await toolNamed(ctx, 'feature_map_check').execute({}, exec)
    assertMatchesSchema(check, toolNamed(ctx, 'feature_map_check').output.schema, 'check')
    assert.ok(
      check.text.includes('already divide at `###` level'),
      'a section that divides is not work',
    )
    assert.ok(!check.text.includes('split it with'), 'and it is not reported as needing a split')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

/** A project whose map exists but has outgrown its shape. */
async function regenProject() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-feature-map-regen-'))
  await mkdir(join(root, 'docs', 'features'), { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(
    join(root, 'docs', 'features', 'widgets.md'),
    [
      '# Widgets — the widget pipeline',
      '',
      '## What it does',
      '',
      '- turns widgets into gadgets.',
      '',
      '## Map',
      '',
      '- `src/widgets.js` — `makeWidget()`.',
      '',
      '## How & why',
      '',
      '- the queue drains on idle, and each widget keeps its own place in it',
      '- the drain walks the queue once per tick and never blocks the loop',
      '- a widget that arrives mid-drain is queued for the next pass instead',
      '',
      '## Config keys / UI',
      '',
      'None yet.',
      '',
      '## Tests that pin it',
      '',
      '- `widgets.test.mjs`: `makes a widget`.',
      '',
      '## Related',
      '',
      '- none',
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    join(root, 'docs', 'features', 'README.md'),
    [
      '# Widgets — features map',
      '',
      'Read this before touching code.',
      '',
      '| Feature | Doc | Read when |',
      '| --- | --- | --- |',
      '| Gone | [gone.md](gone.md) | a page that was deleted |',
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(join(root, 'AGENTS.md'), '# AGENTS.md\n\nMy own instructions, thank you.\n', 'utf8')
  await writeFile(join(root, 'docs', 'SPEC.md'), '# Spec\n\nMy own behaviour spec.\n', 'utf8')
  await writeFile(join(root, 'HANDOFF.md'), '# Handoff\n\nMy own notes.\n', 'utf8')
  await writeFile(join(root, 'src', 'widgets.js'), 'export const widget = 1\n', 'utf8')
  return root
}

test('regen plans without writing and writes only with apply', async () => {
  const root = await regenProject()
  const writes = []
  try {
    const fs = {
      resolve: async (path) => ({ displayPath: path }),
      writeText: async (target, content) => {
        writes.push(target.displayPath)
        await writeFile(target.displayPath, content, 'utf8')
      },
    }
    const ctx = mockContext({ fs })
    apply(ctx, { maxSectionBytes: 200 })
    const exec = { agent: mockAgent(root), signal: undefined }
    const regen = toolNamed(ctx, 'feature_map_regen')

    const plan = await regen.execute({}, exec)
    assertMatchesSchema(plan, regen.output.schema, 'feature_map_regen(plan)')
    assert.deepEqual(plan.wrote, [], 'the default is a plan, not a write')
    assert.equal(writes.length, 0)
    assert.ok(plan.splits >= 1, 'the oversized section is reported')
    assert.ok(plan.placeholders >= 1, 'and the heading it cannot name')
    assert.ok(plan.text.includes('Plan only'), 'the reply says nothing was written')
    assert.ok(plan.text.includes('Placeholders to name'), 'and lists what to name')

    const applied = await regen.execute({ apply: true }, exec)
    assertMatchesSchema(applied, regen.output.schema, 'feature_map_regen(apply)')
    assert.ok(applied.wrote.includes('docs/features/widgets.md'), 'the page is written')
    assert.ok(applied.wrote.includes('docs/features/README.md'), 'and the reconciled index')
    assert.ok(applied.text.includes('Wrote'), 'the reply says what happened')

    const page = await readFile(join(root, 'docs', 'features', 'widgets.md'), 'utf8')
    assert.ok(page.includes('Status: shipped (vX.Y) · Read when:'), 'the page gained a status line')
    assert.ok(page.includes('### <!-- chunk 1/'), 'and a visible placeholder heading')
    const index = await readFile(join(root, 'docs', 'features', 'README.md'), 'utf8')
    assert.ok(index.includes('widgets.md'), 'the index links the page')
    assert.ok(!index.includes('gone.md'), 'and dropped the row no page claimed')
    assert.ok(index.startsWith('# Widgets — features map\n\nRead this before touching code.'))

    const again = await regen.execute({ apply: true }, exec)
    assert.deepEqual(again.wrote, [], 'a second run has nothing to write')
    assert.ok(again.text.includes('already readable'), 'and says so')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('regen leaves every file outside the map byte-for-byte alone', async () => {
  const root = await regenProject()
  try {
    const outside = ['AGENTS.md', 'docs/SPEC.md', 'HANDOFF.md', 'src/widgets.js']
    const before = new Map()
    for (const rel of outside) before.set(rel, await readFile(join(root, ...rel.split('/')), 'utf8'))

    const ctx = mockContext({
      fs: {
        resolve: async (path) => ({ displayPath: path }),
        writeText: async (target, content) => writeFile(target.displayPath, content, 'utf8'),
      },
    })
    apply(ctx, { maxSectionBytes: 200 })
    const exec = { agent: mockAgent(root), signal: undefined }
    const applied = await toolNamed(ctx, 'feature_map_regen').execute({ apply: true }, exec)
    assert.ok(applied.wrote.length >= 2)

    for (const rel of outside) {
      assert.equal(
        await readFile(join(root, ...rel.split('/')), 'utf8'),
        before.get(rel),
        `${rel} must be byte-for-byte unchanged`,
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a table that cannot be identified is refused, and nothing is written for it', async () => {
  const root = await regenProject()
  try {
    const indexPath = join(root, 'docs', 'features', 'README.md')
    const foreign = [
      '# Widgets — features map',
      '',
      '| Name | Purpose |',
      '| --- | --- |',
      '| Widgets | somewhere else entirely |',
      '',
    ].join('\n')
    await writeFile(indexPath, foreign, 'utf8')

    const ctx = mockContext({
      fs: {
        resolve: async (path) => ({ displayPath: path }),
        writeText: async (target, content) => writeFile(target.displayPath, content, 'utf8'),
      },
    })
    apply(ctx, { maxSectionBytes: 200 })
    const exec = { agent: mockAgent(root), signal: undefined }
    const regen = toolNamed(ctx, 'feature_map_regen')

    const plan = await regen.execute({}, exec)
    assert.equal(plan.refused.length, 1, 'the plan names the file it will not touch')
    assert.ok(plan.refused[0].startsWith('docs/features/README.md'), plan.refused[0])
    assert.ok(plan.text.includes('left alone'), 'and says so in the reply')

    const applied = await regen.execute({ apply: true }, exec)
    assertMatchesSchema(applied, regen.output.schema, 'feature_map_regen(refused)')
    assert.equal(applied.refused.length, 1, 'a refusal is reported once, not twice')
    assert.ok(applied.wrote.includes('docs/features/widgets.md'), 'the page is still rewritten')
    assert.ok(!applied.wrote.includes('docs/features/README.md'))
    assert.equal(await readFile(indexPath, 'utf8'), foreign, 'the foreign table is byte-identical')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a write carries the session\u2019s sandbox policy, and a failure is reported', async () => {
  const root = await regenProject()
  try {
    const policy = { mode: 'workspace-write', workspaceRoot: root }
    const asked = []
    const passed = []
    const ctx = mockContext({
      fs: {
        resolve: async (path) => ({ displayPath: path }),
        writeText: async (target, content, _expected, _signal, sandboxPolicy) => {
          passed.push(sandboxPolicy)
          await writeFile(target.displayPath, content, 'utf8')
        },
      },
      sandboxPolicy: {
        resolve: (request) => {
          asked.push(request)
          return policy
        },
      },
    })
    apply(ctx, { maxSectionBytes: 200 })
    const exec = { agent: mockAgent(root), signal: undefined }

    // The scaffold writes through the same seam, so it is checked here too.
    const made = await mkdtemp(join(tmpdir(), 'dsh-feature-map-policy-'))
    try {
      const init = await toolNamed(ctx, 'feature_map_init').execute(
        { root: made, write: true },
        exec,
      )
      assert.ok(init.wrote.length > 0, 'the scaffold writes')
    } finally {
      await rm(made, { recursive: true, force: true })
    }
    const regen = await toolNamed(ctx, 'feature_map_regen').execute({ apply: true }, exec)
    assert.ok(regen.wrote.length > 0, 'the regeneration writes')

    assert.ok(passed.length >= 2, 'both tools wrote through the fs service')
    assert.ok(
      passed.every((entry) => entry === policy),
      'every write carries the policy the sandbox service resolved, not undefined',
    )
    assert.ok(
      asked.every((request) => request.session === exec.agent.session),
      'and it is resolved for the session the call belongs to',
    )

    // A refused write must be visible in the reply, not only in a count.
    const deniedRoot = await regenProject()
    const denied = mockContext({
      fs: {
        resolve: async (path) => ({ displayPath: path }),
        writeText: async () => {
          throw new Error('FS_PERMISSION_DENIED: outside the workspace')
        },
      },
      sandboxPolicy: { resolve: () => policy },
    })
    try {
      apply(denied, { maxSectionBytes: 200 })
      const deniedExec = { agent: mockAgent(deniedRoot), signal: undefined }
      const refused = await toolNamed(denied, 'feature_map_regen').execute(
        { apply: true },
        deniedExec,
      )
      assert.deepEqual(refused.wrote, [], 'nothing is reported as written')
      assert.equal(
        refused.refused.length,
        2,
        'both files that needed writing are named as failed, not summarised as zero',
      )
      assert.ok(refused.text.includes('Could not be written'), 'and in the text the model reads')
      assert.ok(
        refused.text.includes('FS_PERMISSION_DENIED'),
        `the reason must travel with it, got:\n${refused.text}`,
      )
    } finally {
      await rm(deniedRoot, { recursive: true, force: true })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a regenerated map then satisfies the checker', async () => {
  const root = await regenProject()
  try {
    const before = await checkMap(root, { maxSectionBytes: 200 })
    assert.ok(before.splits.length >= 1, 'the fixture starts out needing work')
    assert.deepEqual(before.unindexed, ['docs/features/widgets.md'], 'and with an unindexed page')

    const ctx = mockContext({
      fs: {
        resolve: async (path) => ({ displayPath: path }),
        writeText: async (target, content) => writeFile(target.displayPath, content, 'utf8'),
      },
    })
    apply(ctx, { maxSectionBytes: 200 })
    const exec = { agent: mockAgent(root), signal: undefined }
    await toolNamed(ctx, 'feature_map_regen').execute({ apply: true }, exec)

    const after = await checkMap(root, { maxSectionBytes: 200 })
    assert.deepEqual(after.splits, [], 'no section is left wanting a split')
    assert.deepEqual(after.unindexed, [], 'every page is linked')
    assert.deepEqual(after.unresolved, [], 'every link resolves')
    const check = await toolNamed(ctx, 'feature_map_check').execute({}, exec)
    assert.equal(check.clean, true, 'and the checker calls the map clean')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
