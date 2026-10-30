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
 *   6. Edits: Remove, Add (from a seed or a branch's Add row), New branch, Edit and Delete each open
 *      one popover that previews the change; only its primary button posts one change to
 *      POST /change with the page's revision, then the tree is read again. Refusals stay in the
 *      popover. Cancel, Escape and a click outside write nothing. No chat is opened for an edit.
 *   7. What the page touches: GET /tree and POST /change only; the old "seen" key is removed and
 *      nothing else is stored; no skill or toolset is toggled.
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
export const useEffect = R.useEffect, useId = R.useId, useLayoutEffect = R.useLayoutEffect, useRef = R.useRef, useState = R.useState
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
  const live = React.useRef(true)
  const run = () => Promise.resolve().then(queryFn).then(data => live.current && set({ data }), error => live.current && set({ error }))
  React.useEffect(() => { live.current = true; run(); return () => { live.current = false } }, [])
  return { ...s, refetch: run }
}
export const calls = { insert: [], setEnabled: [], newChat: [], notify: [] }
export const state = { skills: [], skillsFail: null, insertResult: true, insertFailTimes: 0, oldDesktop: false, lostDrafts: 0 }
export const host = {
  get newChat() { return state.oldDesktop ? undefined : (...a) => { calls.newChat.push(a) } },
  notify: n => { calls.notify.push(n); return 'id' },
  skills: {
    list: async () => { if (state.skillsFail) throw new Error(state.skillsFail); return state.skills },
    setEnabled: async (...a) => { calls.setEnabled.push(a) }
  },
  toolsets: { setEnabled: async (...a) => { calls.setEnabled.push(a) } },
  composer: {
    insertText: async (...a) => { calls.insert.push(a); if (state.insertFailTimes > 0) { state.insertFailTimes--; return false } return state.insertResult },
    getDraft: async () => { if (state.lostDrafts > 0) { state.lostDrafts--; return '' } return calls.insert.at(-1)?.[1] ?? null }
  }
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
let clipboardWorks = true
let treeAnswer = null
let changeAnswer = { ok: true, problem: null }
const changeCalls = []
const ctx = {
  register: c => { registered.push(c); return () => {} },
  registerMany: cs => { registered.push(...cs); return () => {} },
  i18n: { register: b => { ctx.bundle = b; stub.i18n.bundle = b }, t: key => key.split('.').reduce((n, p) => n?.[p], ctx.bundle?.en) ?? key },
  rest: async (p, opts) => {
    restCalls.push([p, opts])
    if (p === '/change') {
      changeCalls.push(opts?.body)
      if (changeAnswer instanceof Error) throw changeAnswer
      return changeAnswer
    }
    if (treeAnswer instanceof Error) throw treeAnswer
    return treeAnswer
  },
  storage: {
    get: (k, d) => (storage.has(k) ? JSON.parse(storage.get(k)) : d),
    set: (k, v) => { storageWrites.push(k); storage.set(k, JSON.stringify(v)) },
    remove: k => { storageWrites.push(k); storage.delete(k) }
  },
  setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id) },
  os: { writeClipboard: async text => { if (!clipboardWorks) return false; clipboard.push(text); return true } }
}

// ── fixtures (neutral names) ────────────────────────────────────────────────
const LONG_NAME = 'a-very-long-unbreakable-skill-name-that-should-wrap-inside-its-cell'
const tree = (over = {}) => ({
  state: 'ok', problem: null, group: 'Code', ignored: [], modified: 100, rev: 'r1', path: 'C:/home/plugin-data/skill-branches/branches.json',
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
// A request button waits for the new chat's box before writing, so give it time to finish.
const send = el => act(async () => { if (!el) throw new Error('clicked an element that is not on the page'); el.click(); await new Promise(r => setTimeout(r, 400)) })
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
await send($(el, '.skb-banner .skb-ask'))
check(stub.calls.insert.length === 1 && stub.calls.insert[0][1] === 'Load skill-branches:setup and help me set up my skill branches.', 'missing file: Set up writes the setup request into the chat box')
check(text($(el, '.skb-banner .skb-ask')) === 'Opened in a new chat', 'missing file: Set up reports the chat box')
await unmountAll()
el = await mountPage(tree({ state: 'missing', branches: [], modified: null }), baseSkills())
stub.state.insertResult = false
await act(async () => { $(el, '.skb-banner .skb-ask').click(); await new Promise(r => setTimeout(r, 2000)) })
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
el = await mountPage(withPlugins({ branches: [{ name: 'alpha', description: 'Changes to the alpha service.', skills: ['skill-a', 'toolkit:helper'] }] }), baseSkills())
const helper = $$(el, '.skb-br li').find(li => text($(li, 'b')) === 'toolkit:helper')
check(helper && !helper.classList.contains('skb-miss'), 'a plugin skill on a branch counts as installed')
await click($(el, '.skb-more'))
const toolkit = $$(el, '.skb-fold').find(f => text($(f, '.skb-n')) === 'toolkit')
check(!!toolkit && text(toolkit).includes('toolkit:spare'), 'plugin skills off a branch are seeds in a folder named after the plugin')
check(text($(el, '.skb-fh')).includes('19 skills'), `a name both lists carry is counted once (${text($(el, '.skb-fh'))})`)
await unmountAll()

// 6. Edits: each button opens a popover that previews the change; only its primary button writes,
// through POST /change with the revision the page was drawn from; the tree is then read again.
const pops = el => $$(el, '.skb-pop[role=dialog]')
const btnText = (el, label) => $$(el, '.skb-pop button').find(b => text(b) === label)
const lastChange = () => changeCalls.at(-1)
changeAnswer = { ok: true, problem: null }
stub.calls.insert.length = 0; stub.calls.newChat.length = 0
storage.clear()
storage.set('seen', JSON.stringify({ v: 2, modified: 100, names: [] }))
el = await mountPage(tree(), baseSkills())
check(!storage.has('seen'), 'the old New-list record is cleared')
check($$(el, '.skb-sprout').length === 0 && $$(el, '.skb-ask').length === 0, 'no New list and no Ask buttons')

// 6a. remove
const alphaRow = name => $$(el, '.skb-br')[0].querySelectorAll('li:not(.skb-addrow)') && [...$$(el, '.skb-br')[0].querySelectorAll('li:not(.skb-addrow)')].find(li => text($(li, 'b')) === name)
let rm = $(alphaRow('skill-b'), 'button.skb-rm')
check(!!rm && rm.title === 'Remove from branch' && text(rm) === '' && !!$(rm, 'svg[aria-hidden="true"]') && rm.getAttribute('aria-label') === 'Take skill-b off alpha', 'every skill on a branch has a Remove icon button naming the skill and the branch')
check(!!$(alphaRow('skill-gone'), 'button.skb-rm'), 'a skill marked not installed can be removed too')
let focusTop = null
const onFocusIn = e => { const p = e.target.closest?.('.skb-pop'); if (p) focusTop = p.style.top }
document.addEventListener('focusin', onFocusIn)
await click(rm)
document.removeEventListener('focusin', onFocusIn)
let pop = pops(el)[0]
check(focusTop !== null && focusTop !== '', `focus enters the popover only once it is placed under its button (top at focus: ${JSON.stringify(focusTop)})`)
check(pops(el).length === 1 && pop.getAttribute('aria-label') === 'Take skill-b off alpha?' && rm.getAttribute('aria-expanded') === 'true', 'Remove opens one popover titled with the change')
check(text($(pop, 'p')) === 'It stays installed and still loads by its own description.', 'the popover says the skill stays installed')
check($$(pop, '.skb-pv li.skb-out b').map(text).join(',') === 'skill-b' && text($(pop, '.skb-pv li.skb-out em')) === 'leaves' && $$(pop, '.skb-pv li').length === 3, 'the preview draws the branch with the leaving skill marked')
check(text($(pop, '.skb-pf small')) === 'A backup is kept', 'the popover says a backup is kept')
check(changeCalls.length === 0, 'opening a popover writes nothing')
await click(btnText(el, 'Cancel'))
check(pops(el).length === 0 && changeCalls.length === 0, 'Cancel closes without writing')
await click(rm)
await key(pops(el)[0], 'Escape')
check(pops(el).length === 0 && changeCalls.length === 0, 'Escape closes without writing')
await settle()
check(document.activeElement === rm, 'focus returns to the button that opened it')
await click(rm)
await act(async () => { document.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await settle() })
check(pops(el).length === 0, 'a click outside closes it')
await click(rm)
const treeReads = restCalls.filter(c => c[0] === '/tree').length
stub.calls.notify.length = 0
await click(btnText(el, 'Remove'))
check(JSON.stringify(lastChange()) === JSON.stringify({ op: 'remove', branch: 'alpha', skill: 'skill-b', rev: 'r1' }), `Remove posts one change with the page's revision (${JSON.stringify(lastChange())})`)
check(pops(el).length === 0 && restCalls.filter(c => c[0] === '/tree').length === treeReads + 1, 'after saving, the popover closes and the tree is read again')
check(stub.calls.notify.at(-1)?.kind === 'success' && stub.calls.notify.at(-1)?.message === 'Saved. New chats use the change.', 'a notice confirms the save')
await settle()
check(document.activeElement !== document.body && el.contains(document.activeElement), 'after saving, focus stays in the tree')
check(stub.calls.insert.length === 0 && stub.calls.newChat.length === 0, 'no chat is opened for an edit')

// 6b. refusals and failures keep the popover open with the reason
changeAnswer = { ok: false, problem: 'The branch file changed since this page loaded.' }
rm = $(alphaRow('skill-a'), 'button.skb-rm')
await click(rm)
await click(btnText(el, 'Remove'))
check(pops(el).length === 1 && text($(pops(el)[0], '[role=alert]')) === 'The branch file changed since this page loaded.', 'a refusal is shown in the popover, which stays open')
changeAnswer = new Error('HTTP 404')
await click(btnText(el, 'Remove'))
check(text($(pops(el)[0], '[role=alert]')) === 'Could not save: HTTP 404. If you just installed this version, restart Hermes.', 'a failed request is named')
changeAnswer = { ok: true, problem: null }
await click(btnText(el, 'Cancel'))

// 6c. a seed goes onto a branch the user picks
await click($(el, '.skb-more'))
const seedFold = $$(el, '.skb-fold').find(f => text($(f, '.skb-n')) === 'folder-03')
await click($(seedFold, '.skb-tog'))
const seedAdd = $($$(seedFold, 'li').find(li => text($(li, 'b')) === 'seed-3'), 'button.skb-add')
check(!!seedAdd && seedAdd.title === 'Add to a branch' && seedAdd.getAttribute('aria-label') === 'Put seed-3 on a branch' && !!$(seedAdd, 'svg[aria-hidden="true"]'), 'every seed row has an Add icon button named after its skill')
await click(seedAdd)
pop = pops(el)[0]
check(pop?.getAttribute('aria-label') === 'Put seed-3 on a branch' && $$(pop, '.skb-pick input[type=radio]').length === 2, 'the popover offers every branch as a choice')
const goPlace = $(pop, '.skb-go')
check(goPlace.disabled && !$(pop, '.skb-pv'), 'nothing to save until a branch is picked')
await click($$(pop, '.skb-tile input')[1])
check(!$(pop, '.skb-go').disabled && text($(pop, '.skb-go')) === 'Add to beta' && $$(pop, '.skb-pv li.skb-in b').map(text).join(',') === 'seed-3', 'picking beta previews seed-3 joining it')
await click($(pop, '.skb-go'))
check(JSON.stringify(lastChange()) === JSON.stringify({ op: 'add', branch: 'beta', skill: 'seed-3', rev: 'r1' }), 'Add to beta posts the change')

// 6d. the branch's own Add row picks from every skill not on it, including skills on other branches
const addRows = $$(el, '.skb-br .skb-addrow button')
check(addRows.map(text).join('|') === 'Add a skill to alpha|Add a skill to beta' && addRows.every(b => $(b, 'svg[aria-hidden="true"]')), 'each branch ends with an Add row with a drawn plus')
await click(addRows[1])
pop = pops(el)[0]
await settle()
check(document.activeElement === $(pop, 'input[type=search]'), 'the skill search is focused')
const optNames = () => $$(pops(el)[0], '.skb-opt b').map(text)
check(!optNames().includes('skill-c') && optNames().includes('skill-a') && optNames().includes('seed-0'), 'skills already on beta are not offered; skills on other branches are')
const optA = $$(pop, '.skb-opt').find(o => text($(o, 'b')) === 'skill-a')
check(text($(optA, 'small')) === 'on alpha', 'a skill on another branch says where it already is')
check(optNames().indexOf('seed-0') < optNames().indexOf('skill-a'), 'seeds come first')
await typeInto($(pop, 'input[type=search]'), 'seed-x')
check(optNames().join(',') === 'seed-x', 'the search narrows the list')
await typeInto($(pop, 'input[type=search]'), 'nothing-here')
check(text($(pops(el)[0], '.skb-opts p')) === 'No skill off this branch matches "nothing-here".', 'no match is said')
await typeInto($(pop, 'input[type=search]'), 'skill-a')
await click($(pops(el)[0], '.skb-opt input'))
check($$(pops(el)[0], '.skb-pv li.skb-in b').map(text).join(',') === 'skill-a', 'the picked skill is previewed joining beta')
await click($(pops(el)[0], '.skb-go'))
check(JSON.stringify(lastChange()) === JSON.stringify({ op: 'add', branch: 'beta', skill: 'skill-a', rev: 'r1' }), 'one skill can be added to a second branch')

// 6e. new branch
const nb = $(el, '.skb-nbb')
check(text(nb) === 'New branch' && !!$(nb, 'svg[aria-hidden="true"]'), 'the tree ends with New branch')
await click(nb)
pop = pops(el)[0]
const [nameIn] = $$(pop, 'input[type=text]')
await typeInto(nameIn, 'Bad Name')
check(nameIn.getAttribute('aria-invalid') === 'true' && text($(pop, '.skb-fl small')) === 'Use lowercase letters, digits and dashes, starting with a letter or digit (up to 32).', 'a bad name is flagged as typed')
await typeInto(nameIn, 'alpha')
check(text($(pop, '.skb-fl small')) === 'There is already a branch named alpha.', 'a taken name is flagged')
await typeInto(nameIn, 'docs')
const setText = async (area, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
  await act(async () => { setter.call(area, value); area.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await settle() })
}
await setText($(pop, 'textarea'), 'Writing docs.')
check($(pop, '.skb-go').disabled, 'a branch needs at least one skill')
const pickOpt = name => click($($$(pops(el)[0], '.skb-opt').find(o => text($(o, 'b')) === name), 'input'))
await pickOpt('seed-1')
await pickOpt('skill-c')
check($$(pop, '.skb-pv li.skb-in b').map(text).join(',') === 'seed-1,skill-c' && text($(pop, '.skb-pvh')).startsWith('docs'), 'the new branch is previewed with its skills')
await typeInto(nameIn, 'alpha')
check($(pop, '.skb-go').disabled, 'a taken name cannot be saved')
await typeInto(nameIn, 'docs')
check(!$(pop, '.skb-go').disabled, 'name, text and skills given: Create branch is on')
await click($(pop, '.skb-go'))
check(JSON.stringify(lastChange()) === JSON.stringify({ op: 'create', name: 'docs', description: 'Writing docs.', skills: ['seed-1', 'skill-c'], rev: 'r1' }), `Create branch posts the new branch (${JSON.stringify(lastChange())})`)

// 6f. edit and delete a branch
const ed = $($$(el, '.skb-br')[0], 'button.skb-ed')
check(!!ed && ed.getAttribute('aria-label') === 'Edit alpha' && !!$(ed, 'svg[aria-hidden="true"]'), 'each branch head has an Edit icon button')
await click(ed)
pop = pops(el)[0]
check($(pop, 'input[type=text]').value === 'alpha' && $(pop, 'textarea').value === 'Changes to the alpha service.' && $(pop, '.skb-go').disabled, 'Edit starts from the current name and text; nothing to save yet')
check($(pop, 'textarea').maxLength === 300, 'the branch text is capped at 300 characters')
await setText($(pop, 'textarea'), 'The alpha service.')
await click($(pop, '.skb-go'))
check(JSON.stringify(lastChange()) === JSON.stringify({ op: 'edit', branch: 'alpha', name: 'alpha', description: 'The alpha service.', rev: 'r1' }), 'Save posts the edit')
await click(ed)
const callsBefore = changeCalls.length
await click(btnText(el, 'Delete branch'))
pop = pops(el)[0]
check(pop.getAttribute('aria-label') === 'Delete alpha?' && text($(pop, 'p')) === 'Its 3 skills leave this branch. Skills on no other branch become seeds; every skill stays installed.' && changeCalls.length === callsBefore, 'Delete asks again and names what happens')
await click(btnText(el, 'Delete'))
check(JSON.stringify(lastChange()) === JSON.stringify({ op: 'delete', branch: 'alpha', rev: 'r1' }), 'the second Delete posts it')
// a popover whose skill left the branch elsewhere closes when the page reads the file again
await click($(alphaRow('skill-b'), 'button.skb-rm'))
changeAnswer = { ok: false, problem: 'The branch file changed since this page loaded.' }
const t0 = tree()
treeAnswer = { ...t0, branches: t0.branches.map(x => (x.name === 'alpha' ? { ...x, skills: x.skills.filter(s => s !== 'skill-b') } : x)) }
await click(btnText(el, 'Remove'))
await settle()
check(pops(el).length === 0, 'a Remove popover closes once its skill is no longer on the branch')
changeAnswer = { ok: true, problem: null }
treeAnswer = tree()
check($$(el, 'button button').length === 0, 'no button inside another button')
await unmountAll()

// 6g. when editing is off, and while searching
// a name that differs from another only in case can keep its name while its text is edited
el = await mountPage(tree({ branches: [{ name: 'Alpha', description: 'A.', skills: ['skill-a'] }, { name: 'alpha', description: 'B.', skills: ['skill-b'] }] }), baseSkills())
await click($($$(el, '.skb-br')[0], 'button.skb-ed'))
await setText($(pops(el)[0], 'textarea'), 'A, edited.')
check(!$(pops(el)[0], '.skb-go').disabled, 'an unchanged name is not flagged as taken')
await unmountAll()
el = await mountPage(tree({ state: 'invalid', problem: 'x', branches: [] }), baseSkills())
check($$(el, '.skb-add, .skb-nbb, .skb-addrow').length === 0, 'an invalid file offers no edits')
await unmountAll()
el = await mountPage(tree({ state: 'missing', branches: [], modified: null, rev: null }), baseSkills())
check(!!$(el, '.skb-nbb') && $$(el, '.skb-add').length === 0, 'with no file, New branch is the way in')
await click($(el, '.skb-nbb'))
check(pops(el).length === 1, 'New branch opens with no file')
await unmountAll()
el = await mountPage(tree(), baseSkills())
await typeInto($(el, '.skb-find input'), 'zebra')
check($$(el, '.skb-addrow, .skb-nbb').length === 0, 'while searching, the Add rows and New branch step aside')
await unmountAll()
check(mod.previewWindow(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], ['j']).rows.join('') === 'efghij', 'a long preview keeps the joining skill in view')
check(JSON.stringify(mod.previewWindow(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], ['c'])) === JSON.stringify({ rows: ['b', 'c', 'd', 'e', 'f', 'g'], above: 1, below: 1 }), 'a long preview counts the rows it hides')

// 7. what the page touches
check(restCalls.every(([p, o]) => (p === '/tree' && (o === undefined || !o.method || o.method === 'GET')) || (p === '/change' && o?.method === 'POST')), `only GET /tree and POST /change (${JSON.stringify([...new Set(restCalls.map(c => c[0]))])})`)
check(storageWrites.every(k => k === 'seen'), `storage: only the old "seen" key is removed (${[...new Set(storageWrites)]})`)
check(stub.calls.setEnabled.length === 0, 'nothing toggled')

// 8. errors
el = await mountPage(new Error('HTTP 404'), baseSkills())
check(text($(el, '[role=alert]')) === 'Could not read the branch file: HTTP 404. If you just installed this version, restart Hermes.', 'tree failure named')
await unmountAll()
el = await mountPage(tree(), baseSkills(), { skillsFail: 'offline' })
check(text($(el, '[role=alert]')) === 'Could not list your skills: offline.', 'skill-list failure named')
await unmountAll()

// 9. copy and theme
el = await mountPage(tree({ ignored: ['"x"'] }), baseSkills())
const labels = $$(el, '*').flatMap(n => [n.getAttribute('aria-label'), n.getAttribute('title'), n.getAttribute('placeholder')]).filter(Boolean)
check(!/\bskb\.[a-zA-Z]/.test(el.textContent + labels.join(' ')), 'no raw i18n key on screen or in labels')
await unmountAll()

const cssText = source.match(/const CSS = `([\s\S]*?)`/)[1]
const vars = [...new Set([...source.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))].filter(v => !['--ground', '--ground2', '--h', '--tone', '--nw', '--dl', '--ar'].includes(v))
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
check(!/content:"[^"\s]+"/.test(cssText), 'no typed glyph stands in for an icon')
const actRule = cssText.match(/\.skb \.skb-add\{([^}]*)\}/)?.[1] ?? ''
check(actRule !== '' && !/position:absolute/.test(actRule), 'row buttons sit in their own column and never cover the description')
check(/width:24px/.test(actRule) && /height:24px/.test(actRule), 'row buttons have a 24px target')
check(/@media \(hover:none\)\{[^}]*\.skb-add[^}]*opacity:1/.test(cssText), 'on touch screens the row buttons are always shown')
check(reactWarnings.length === 0, `React logged no warning${reactWarnings.length ? `: ${reactWarnings[0].slice(0, 300)}` : ''}`)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exitCode = failures ? 1 : 0
