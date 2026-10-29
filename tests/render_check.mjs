/**
 * skill-branches — the desktop page, driven like the app drives it: real React in jsdom, the SDK
 * replaced by a stub, the route contribution mounted the way the host mounts it.
 *
 * Run: npm ci      (once, in tests/: React and jsdom pinned to the core desktop app's versions)
 *      node tests/render_check.mjs      (exit 0 = passed)
 * The colour-token check reads the desktop app's compiled stylesheet: set HERMES_APP_CSS to an
 * index-*.css, or it is looked up under <hermes home>/hermes-agent/apps/desktop/dist/assets.
 *
 * Locks:
 *   1. Registration: one route (/skill-branches) and one sidebar nav row, no pane, one English bundle.
 *   2. The tree: branch rows, skills with descriptions, a branch skill that is not installed marked
 *      as such, seeds grouped by folder (a skill with no category under "No folder"), the folder list
 *      cut at 8 with "Show N more folders", counts in the header of the map.
 *   3. Search: by skill name, skill description and branch description; the count; no-hit message;
 *      Escape clears.
 *   4. Controls: a branch toggles open and closed; arrow keys move between toggles.
 *   5. Branch file states: invalid -> an alert with the reason and the file path, no branch rows;
 *      missing -> a note with the path; ignored fields -> a warning listing them.
 *   6. New: the first visit records the installed skills; a skill that arrives later is listed
 *      under "New since the branch file last changed" until the branch file changes. Ask the
 *      assistant writes into the chat box, or copies when no chat box answers.
 *   7. Read-only: the only REST call is GET /tree; the only storage key written is "seen"; no
 *      skill or toolset is toggled.
 *   8. Errors: a failed /tree or skill list is one alert naming the error.
 *   9. Copy and theme: no raw i18n key on screen or in labels; every var(--x) in the plugin is
 *      defined by the app's stylesheet (negative control included); no literal colour; no font
 *      under 12px; motion is off under prefers-reduced-motion. React logs no warning.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '..', 'desktop', 'plugin.js')
const OUT = path.join(HERE, '.out')
const NM = path.join(HERE, 'node_modules')
if (!['react', 'react-dom', 'jsdom'].every(p => existsSync(path.join(NM, p, 'package.json')))) {
  console.log(`FAIL  React, react-dom or jsdom missing in ${NM} — run \`npm ci\` in tests/ first`)
  process.exit(1)
}
const ANCHOR = path.join(HERE, 'package.json')
const require = createRequire(ANCHOR)
mkdirSync(OUT, { recursive: true })

const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
for (const k of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle']) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? dom.window : dom.window[k], configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React

const anchor = JSON.stringify(ANCHOR)
writeFileSync(path.join(OUT, 'react-jsx.mjs'), `import { createRequire } from 'node:module'
const m = createRequire(${anchor})('react/jsx-runtime')
export const jsx = m.jsx, jsxs = m.jsxs, Fragment = m.Fragment
`)
writeFileSync(path.join(OUT, 'react-hooks.mjs'), `import { createRequire } from 'node:module'
const R = createRequire(${anchor})('react')
export const useEffect = R.useEffect, useId = R.useId, useRef = R.useRef, useState = R.useState
`)
writeFileSync(path.join(OUT, 'sdk-stub.mjs'), `import { createRequire } from 'node:module'
const React = createRequire(${anchor})('react')
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar.nav'
export const i18n = { bundle: null }
export function usePluginI18n() {
  return (key, ...args) => {
    let node = i18n.bundle?.en
    for (const part of key.split('.')) node = node?.[part]
    return typeof node === 'function' ? node(...args) : typeof node === 'string' ? node : key
  }
}
export function useQuery({ queryFn }) {
  const [s, set] = React.useState({ isLoading: true })
  React.useEffect(() => {
    let live = true
    Promise.resolve().then(queryFn).then(data => live && set({ data }), error => live && set({ error }))
    return () => { live = false }
  }, [])
  return s
}
export const calls = { insert: [], setEnabled: [] }
export const state = { skills: [], skillsFail: null, insertResult: true }
export const host = {
  skills: {
    list: async () => { if (state.skillsFail) throw new Error(state.skillsFail); return state.skills },
    setEnabled: async (...a) => { calls.setEnabled.push(a) }
  },
  toolsets: { setEnabled: async (...a) => { calls.setEnabled.push(a) } },
  composer: { insertText: async (...a) => { calls.insert.push(a); return state.insertResult } }
}
`)
const source = readFileSync(SRC, 'utf8')
const href = f => `'${pathToFileURL(path.join(OUT, f)).href}'`
writeFileSync(path.join(OUT, 'plugin-under-test.mjs'), source.replace("'@hermes/plugin-sdk'", href('sdk-stub.mjs'))
  .replace("'react/jsx-runtime'", href('react-jsx.mjs')).replace("from 'react'", `from ${href('react-hooks.mjs')}`))
const stub = await import(pathToFileURL(path.join(OUT, 'sdk-stub.mjs')).href)
const mod = await import(pathToFileURL(path.join(OUT, 'plugin-under-test.mjs')).href + `?v=${statSync(SRC).mtimeMs}`)

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) failures++
}
const settle = () => new Promise(r => setTimeout(r, 0))
const reactWarnings = []
console.error = (...a) => { reactWarnings.push(a.map(String).join(' ')) }

// ── fake ctx ────────────────────────────────────────────────────────────────
const registered = []
const restCalls = []
const storage = new Map()
const storageWrites = []
const clipboard = []
let treeAnswer = null
const ctx = {
  register: c => { registered.push(c); return () => {} },
  registerMany: cs => { registered.push(...cs); return () => {} },
  i18n: { register: b => { ctx.bundle = b; stub.i18n.bundle = b }, t: key => key.split('.').reduce((n, p) => n?.[p], ctx.bundle?.en) ?? key },
  rest: async (p, opts) => {
    restCalls.push([p, opts])
    if (treeAnswer instanceof Error) throw treeAnswer
    return treeAnswer
  },
  storage: {
    get: (k, d) => (storage.has(k) ? JSON.parse(storage.get(k)) : d),
    set: (k, v) => { storageWrites.push(k); storage.set(k, JSON.stringify(v)) },
    remove: k => { storageWrites.push(k); storage.delete(k) }
  },
  setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id) },
  os: { writeClipboard: async text => { clipboard.push(text); return true } }
}

// ── fixtures (neutral names) ────────────────────────────────────────────────
const LONG_NAME = 'a-very-long-unbreakable-skill-name-that-should-wrap-inside-its-cell'
const tree = (over = {}) => ({
  state: 'ok', problem: null, group: 'Code', ignored: [], modified: 100, path: 'C:/home/plugin-data/skill-branches/branches.json',
  branches: [
    { name: 'alpha', description: 'Changes to the alpha service.', skills: ['skill-a', 'skill-b', 'skill-gone'] },
    { name: 'beta', description: 'Release notes and changelogs.', skills: ['skill-c'] }
  ],
  ...over
})
const skill = (name, category, description = `Does ${name} things.`) => ({ name, category, description, enabled: true })
const baseSkills = () => [
  skill('skill-a', 'dev', 'Rules for alpha code; mentions zebra.'), skill('skill-b', 'dev'), skill('skill-c', null),
  skill(LONG_NAME, 'writing', 'x'.repeat(900)),
  ...Array.from({ length: 10 }, (_, i) => skill(`seed-${i}`, `folder-${String(i).padStart(2, '0')}`)),
  skill('seed-x', 'folder-00'), skill('seed-y', 'folder-00'), skill('seed-z', null)
]

// ── mounting ────────────────────────────────────────────────────────────────
const $ = (el, sel) => el.querySelector(sel)
const $$ = (el, sel) => [...el.querySelectorAll(sel)]
const text = el => (el?.textContent ?? '').trim()
const mounted = []
async function mountPage(t, skills, opts = {}) {
  treeAnswer = t
  stub.state.skills = skills
  stub.state.skillsFail = opts.skillsFail || null
  const el = document.createElement('div')
  document.body.append(el)
  const root = createRoot(el)
  const route = registered.find(r => r.area === 'routes')
  await act(async () => { root.render(route.render()); await settle(); await settle() })
  mounted.push(root)
  return el
}
const unmountAll = async () => { for (const r of mounted.splice(0)) await act(async () => r.unmount()); document.body.replaceChildren() }
const click = el => act(async () => { if (!el) throw new Error('clicked an element that is not on the page'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await settle() })
const typeInto = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  await act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await settle() })
}
const key = (el, k) => act(async () => { el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true })); await settle() })
const visibleRows = el => $$(el, '.skb-sk:not([hidden]) li b').map(text)

process.on('uncaughtException', e => { console.log(`FAIL  harness stopped: ${e.message}`); process.exitCode = 1 })
process.on('unhandledRejection', e => { console.log(`FAIL  harness stopped: ${e?.message || e}`); process.exitCode = 1 })

// 1. registration
mod.default.register(ctx)
const route = registered.find(r => r.area === 'routes')
const nav = registered.find(r => r.area === 'sidebar.nav')
check(registered.length === 2, `two contributions (got ${registered.length})`)
check(route?.data?.path === '/skill-branches' && typeof route.render === 'function', 'route /skill-branches with a render')
check(nav?.data?.path === '/skill-branches' && nav.data.label === 'Skill branches' && !!nav.data.codicon, 'sidebar nav row "Skill branches"')
check(!registered.some(r => r.area === 'panes'), 'no pane contribution')
check(!!ctx.bundle?.en && Object.keys(ctx.bundle).length === 1, 'one English bundle')

// 2. the tree
let el = await mountPage(tree(), baseSkills())
check(text($(el, 'h2')) === 'Skill branches', 'page title')
check($$(el, '.skb-br').length === 2, 'two branch rows')
check(visibleRows(el).join(',') === 'skill-a,skill-b,skill-gone,skill-c', `branch skills listed open (${visibleRows(el).join(',')})`)
const gone = $$(el, '.skb-br li').find(li => text($(li, 'b')) === 'skill-gone')
check(gone?.classList.contains('skb-miss') && text($(gone, 'span')) === 'Not installed, or turned off on this profile.', 'missing skill marked not installed')
check(text($(el, '.skb-fh')).includes('17 skills') && text($(el, '.skb-fh')).includes('3 on branches · 14 seeds'), `map header counts (${text($(el, '.skb-fh'))})`)
const folderNames = $$(el, '.skb-fold .skb-n').map(text)
check(folderNames.length === 8, `folders cut at 8 (got ${folderNames.length})`)
check(folderNames[0] === 'folder-00' && folderNames.includes('No folder'), `largest folder first, uncategorised as "No folder" (${folderNames.join(',')})`)
const more = $(el, '.skb-more')
check(text(more) === 'Show 4 more folders', `show-more button (${text(more)})`)
await click(more)
check($$(el, '.skb-fold').length === 12 && text($(el, '.skb-more')) === 'Show fewer folders', 'show-more reveals every folder')
check($$(el, '.skb-sprout').length === 0 && storage.has('seen'), 'first visit: no New list, installed skills recorded')
check($$(el, '.skb-brp').length === 2 && $$(el, '.skb-seedp').length >= 1, 'map has a plot per branch and seed plots')
check($$(el, '.skb-tiles i.skb-miss').length === 1, 'missing skill drawn as a hollow tile')

// 3. search
const input = $(el, 'input[type=search]')
await typeInto(input, 'zebra')
check(visibleRows(el).join(',') === 'skill-a' && text($(el, 'output')) === '1 of 17', `search by description (${visibleRows(el)} / ${text($(el, 'output'))})`)
check(!!$(el, '.skb-sk mark'), 'match highlighted')
await typeInto(input, 'changelog')
check(visibleRows(el).join(',') === 'skill-c', `search by branch description shows its skills (${visibleRows(el)})`)
await typeInto(input, 'seed-x')
check(visibleRows(el).join(',') === 'seed-x', `search reaches seeds (${visibleRows(el)})`)
await typeInto(input, 'nothing-matches-this')
check(text($(el, '.skb-empty')) === 'No branch, skill name or description contains "nothing-matches-this".', 'no-hit message')
await key(input, 'Escape')
check(input.value === '' && visibleRows(el).length === 4, 'Escape clears the search')

// 4. controls
const togs = () => $$(el, '.skb-br .skb-tog')
await click(togs()[0])
check(togs()[0].getAttribute('aria-expanded') === 'false' && document.getElementById(togs()[0].getAttribute('aria-controls')).hidden, 'branch collapses')
await click(togs()[0])
check(togs()[0].getAttribute('aria-expanded') === 'true', 'branch opens again')
togs()[0].focus()
await key(togs()[0], 'ArrowDown')
check(document.activeElement === togs()[1], 'ArrowDown moves to the next toggle')
await key(togs()[1], 'Home')
check(document.activeElement === togs()[0], 'Home moves to the first toggle')
await unmountAll()

// 5. branch file states
el = await mountPage(tree({ state: 'invalid', problem: 'Branch 2 ("beta"): "skills" must be a list of skill names.', branches: [] }), baseSkills())
const alert = $(el, '.skb-banner[role=alert]')
check(text(alert).includes('Branch file is invalid — routing is off') && text(alert).includes('"skills" must be a list') && text(alert).includes('branches.json'), 'invalid file: alert with reason and path')
check($$(el, '.skb-br').length === 0 && text($(el, '.skb-seeds .skb-turn em')) === '17', 'invalid file: no branches, every skill a seed')
await unmountAll()
el = await mountPage(tree({ state: 'missing', branches: [], modified: null }), baseSkills())
check(text($(el, '.skb-banner')).includes('No branch file — routing is off') && text($(el, '.skb-banner')).includes('branches.json'), 'missing file: note with path')
check(!text($(el, '.skb-banner')).includes('branches.example.json'), 'missing file: no hand-editing instruction')
stub.calls.insert.length = 0
stub.state.insertResult = true
await click($(el, '.skb-banner .skb-ask'))
check(stub.calls.insert.length === 1 && stub.calls.insert[0][1] === 'Load skill-branches:setup and help me set up my skill branches.', 'missing file: Set up writes the setup request into the chat box')
check(text($(el, '.skb-banner .skb-ask')) === 'Added to the chat box', 'missing file: Set up reports the chat box')
await unmountAll()
el = await mountPage(tree({ state: 'missing', branches: [], modified: null }), baseSkills())
stub.state.insertResult = false
await click($(el, '.skb-banner .skb-ask'))
check(clipboard.at(-1) === 'Load skill-branches:setup and help me set up my skill branches.' && text($(el, '.skb-banner .skb-ask')) === 'Copied — paste it into a chat', 'missing file: no chat box, Set up copies instead')
stub.state.insertResult = true
stub.calls.insert.length = 0
await unmountAll()
el = await mountPage(tree({ ignored: ['Branch "alpha": "branches"'] }), baseSkills())
const warn = $(el, '.skb-banner.skb-warn')
check(text(warn).includes('Nested branches are not supported') && text(warn).includes('Branch "alpha": "branches"'), 'ignored fields listed')
await unmountAll()

// 5b. plugin skills (listed by the plugin's /tree, not by the app's skill list)
const plug = (name, description = `Does ${name} things.`) => ({ name, description, category: name.split(':')[0] })
const withPlugins = (over = {}) => tree({ plugin_skills: [plug('toolkit:helper'), plug('toolkit:spare'), plug('skill-c')], ...over })
storage.clear()
storage.set('seen', JSON.stringify({ modified: 100, names: baseSkills().map(s => s.name) }))
el = await mountPage(withPlugins({ branches: [{ name: 'alpha', description: 'Changes to the alpha service.', skills: ['skill-a', 'toolkit:helper'] }] }), baseSkills())
const helper = $$(el, '.skb-br li').find(li => text($(li, 'b')) === 'toolkit:helper')
check(helper && !helper.classList.contains('skb-miss'), 'a plugin skill on a branch counts as installed')
await click($(el, '.skb-more'))
const toolkit = $$(el, '.skb-fold').find(f => text($(f, '.skb-n')) === 'toolkit')
check(!!toolkit && text(toolkit).includes('toolkit:spare'), 'plugin skills off a branch are seeds in a folder named after the plugin')
check(text($(el, '.skb-fh')).includes('19 skills'), `a name both lists carry is counted once (${text($(el, '.skb-fh'))})`)
check($$(el, '.skb-sprout').length === 0, 'upgrade: plugin skills that were already there are not listed as New')
check(JSON.parse(storage.get('seen')).v === 2 && JSON.parse(storage.get('seen')).names.includes('toolkit:spare'), 'upgrade: the record now includes plugin skills')
await unmountAll()
el = await mountPage(withPlugins({ plugin_skills: [plug('toolkit:helper'), plug('toolkit:spare'), plug('toolkit:later')] }), baseSkills())
check($$(el, '.skb-sprout b').map(text).join(',') === 'toolkit:later', 'a plugin skill that arrives later is listed as New')
await unmountAll()

// 6. New
storage.clear()
el = await mountPage(tree(), baseSkills())
await unmountAll()
el = await mountPage(tree(), [...baseSkills(), skill('fresh-one', 'dev', 'Arrived later.')])
const sprout = $(el, '.skb-sprout')
check(text($(el, '.skb-newh')) === 'New since the branch file last changed' && text($(sprout, 'b')) === 'fresh-one', 'a later skill is listed as New')
check($$(el, '.skb-fold li.skb-nw b').map(text).join(',') === 'fresh-one', 'the New skill is also marked in its folder')
stub.state.insertResult = true
await click($(sprout, '.skb-ask'))
check(stub.calls.insert.length === 1 && stub.calls.insert[0][0] === null && stub.calls.insert[0][1] === 'Put the fresh-one skill on a skill branch; suggest which one and why.' && stub.calls.insert[0][2]?.mode === 'block', 'Ask writes the message into the chat box')
check(text($(sprout, '.skb-ask')) === 'Added to the chat box', 'Ask reports the chat box')
await unmountAll()
el = await mountPage(tree(), [...baseSkills(), skill('fresh-one', 'dev', 'Arrived later.')])
check($$(el, '.skb-sprout').length === 1, 'New stays listed on the next visit while the branch file is unchanged')
stub.state.insertResult = false
await click($(el, '.skb-sprout .skb-ask'))
check(clipboard.at(-1) === 'Put the fresh-one skill on a skill branch; suggest which one and why.' && text($(el, '.skb-ask')) === 'Copied — paste it into a chat', 'no chat box: Ask copies instead')
await unmountAll()
el = await mountPage(tree({ modified: 200 }), [...baseSkills(), skill('fresh-one', 'dev', 'Arrived later.')])
check($$(el, '.skb-sprout').length === 0 && JSON.parse(storage.get('seen')).modified === 200, 'branch file changed: New list resets')
await unmountAll()

// 7. read-only
check(restCalls.every(([p, o]) => p === '/tree' && (o === undefined || !o.method || o.method === 'GET')), `only GET /tree (${JSON.stringify([...new Set(restCalls.map(c => c[0]))])})`)
check(storageWrites.every(k => k === 'seen'), `only the "seen" storage key is written (${[...new Set(storageWrites)]})`)
check(stub.calls.setEnabled.length === 0, 'nothing toggled')

// 8. errors
el = await mountPage(new Error('HTTP 404'), baseSkills())
check(text($(el, '[role=alert]')) === 'Could not read the branch file: HTTP 404. If you just installed this version, restart Hermes.', 'tree failure named')
await unmountAll()
el = await mountPage(tree(), baseSkills(), { skillsFail: 'offline' })
check(text($(el, '[role=alert]')) === 'Could not list your skills: offline.', 'skill-list failure named')
await unmountAll()

// 9. copy and theme
el = await mountPage(tree({ ignored: ['"x"'] }), [...baseSkills(), skill('fresh-one', 'dev')])
const labels = $$(el, '*').flatMap(n => [n.getAttribute('aria-label'), n.getAttribute('title'), n.getAttribute('placeholder')]).filter(Boolean)
check(!/\bskb\.[a-zA-Z]/.test(el.textContent + labels.join(' ')), 'no raw i18n key on screen or in labels')
await unmountAll()

const cssText = source.match(/const CSS = `([\s\S]*?)`/)[1]
const vars = [...new Set([...source.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))].filter(v => !['--ground', '--ground2', '--h', '--tone', '--nw', '--dl'].includes(v))
const findAppCss = () => {
  if (process.env.HERMES_APP_CSS) return process.env.HERMES_APP_CSS
  const homes = [process.env.HERMES_HOME, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'hermes'), path.join(os.homedir(), '.hermes')].filter(Boolean)
  for (const home of homes) {
    const dir = path.join(home, 'hermes-agent', 'apps', 'desktop', 'dist', 'assets')
    if (!existsSync(dir)) continue
    const css = readdirSync(dir).filter(f => /^index-.*\.css$/.test(f)).map(f => path.join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    if (css.length) return css[0]
  }
  return null
}
const appCssPath = findAppCss()
if (!appCssPath) check(false, 'app stylesheet not found: set HERMES_APP_CSS to the desktop app\'s dist/assets/index-*.css')
else {
  const appCss = readFileSync(appCssPath, 'utf8')
  const defined = v => appCss.includes(`${v}:`)
  const missing = vars.filter(v => !defined(v))
  check(vars.length >= 10 && !missing.length, `every theme token is defined by the app (${vars.length} tokens; missing: ${missing.join(', ') || 'none'})`)
  check(!defined('--ui-not-a-real-token'), 'negative control: an unknown token is reported missing')
}
check(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(cssText), 'no literal colour in the CSS')
const sizes = [...cssText.matchAll(/font-size:([\d.]+)px/g)].map(m => Number(m[1]))
check(sizes.length > 0 && Math.min(...sizes) >= 12, `no font under 12px (smallest ${Math.min(...sizes)}px)`)
check(/@media \(prefers-reduced-motion:reduce\)\{\.skb \*\{animation:none!important;transition:none!important\}\}/.test(cssText), 'motion off under reduced motion')
check((cssText.match(/@keyframes/g) || []).length === 1, 'one animation')
check(reactWarnings.length === 0, `React logged no warning${reactWarnings.length ? `: ${reactWarnings[0].slice(0, 300)}` : ''}`)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exitCode = failures ? 1 : 0
