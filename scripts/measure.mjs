/**
 * Print what a reply costs, per topic, against the pages it would have returned.
 *
 * The point of the four retrieval levels is a smaller reply, and a claim like
 * "40% smaller" has to be re-measurable after any change to the ranking. This
 * is that measurement: it drives the real tool through a mock context against a
 * real map and prints bytes, so a tuning change is judged on numbers rather
 * than on how the reply reads.
 *
 * Asserts nothing and exits 0 either way.
 *
 * Usage: node scripts/measure.mjs [project-directory] [topic ...]
 */

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { listPages } from '../lib/map.js'
import { apply } from '../lib/index.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const target = resolve(process.argv[2] ?? join(here, '..', 'reference', 'PingLatencyOverlay'))
const topics = process.argv.slice(3)
const list = topics.length
  ? topics
  : ['glow sweep', 'sample cursor easing', 'probes icmp cadence', 'config storage migration']

/** A Cordis context that records what the plugin registers and nothing else. */
function mockContext() {
  const tools = []
  return {
    tools,
    ctx: {
      systemPrompt: { section: () => () => {}, getSectionOrder: () => 1100 },
      tools: {
        register: (definition) => {
          tools.push(definition)
          return () => {}
        },
        guard: () => () => {},
        get: () => ({}),
      },
      get: () => undefined,
      effect: () => () => {},
      on: () => () => {},
    },
  }
}

const bytes = (text) => Buffer.byteLength(String(text ?? ''), 'utf8')
const { tools, ctx } = mockContext()
apply(ctx, {})
const map = tools.find((tool) => tool.name === 'feature_map')
const exec = { agent: { session: { header: { cwd: target } } } }
const pages = await listPages(target)
const pageFor = (rel) => pages.find((page) => page.rel === rel)

console.log(`reply cost: ${target}\n`)
console.log('topic'.padEnd(30) + 'page'.padStart(8) + 'reply'.padStart(8) + 'saved'.padStart(7) + '  sections')
let whole = 0
let reply = 0
for (const topic of list) {
  const out = await map.execute({ topic }, exec)
  const pageBytes = (out.pages ?? []).reduce((sum, rel) => sum + bytes(pageFor(rel)?.text), 0)
  const replyBytes = bytes(out.text)
  whole += pageBytes
  reply += replyBytes
  const saved = pageBytes ? `${Math.round(100 - (replyBytes / pageBytes) * 100)}%` : '-'
  const sections = (out.sections ?? []).map((entry) => entry.split('/').pop()).join(', ')
  console.log(topic.padEnd(30) + String(pageBytes).padStart(8) + String(replyBytes).padStart(8) + saved.padStart(7) + '  ' + sections)
}
if (list.length > 1) {
  console.log(
    'TOTAL'.padEnd(30) +
      String(whole).padStart(8) +
      String(reply).padStart(8) +
      `${Math.round(100 - (reply / whole) * 100)}%`.padStart(7),
  )
}

const skeleton = await map.execute({ topic: list[0], skeleton: true }, exec)
console.log(`\nskeleton for "${list[0]}": ${bytes(skeleton.text)} B`)
for (const [page, section] of [
  ['overlays/glow.md', 'How & why'],
  ['config/window.md', 'How & why'],
]) {
  if (!pageFor(`docs/features/${page}`)) continue
  const out = await map.execute({ page, section }, exec)
  console.log(`one section ${page} → ${section}: ${bytes(out.text)} B of ${bytes(pageFor(`docs/features/${page}`).text)} B`)
}
