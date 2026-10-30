import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, useQuery, usePluginI18n } from '@hermes/plugin-sdk'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

const ID = 'skill-branches'
const PATH = '/skill-branches'
const MAX_FOLDERS = 8
const INSERT_TRIES = 10
const INSERT_WAIT_MS = 150

const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

const en = {
  skb: {
    nav: 'Skill branches',
    title: 'Skill branches',
    lead: 'Each message picks one branch and loads the skills on it that fit. Skills on no branch are seeds; they still load by their own description.',
    loading: 'Reading the branch file and your skills…',
    treeFailed: detail => `Could not read the branch file: ${detail}. If you just installed this version, restart Hermes.`,
    skillsFailed: detail => `Could not list your skills: ${detail}.`,
    invalidTitle: 'Branch file is invalid — routing is off',
    invalidBody: 'Chats get no branch list until it is fixed. The file:',
    missingTitle: 'No branch file — routing is off',
    missingBody: 'Start with New branch below, or let the assistant set it up with you: it asks about your work, shows a draft, and writes it only after you approve. The file goes here:',
    setup: 'Set up with the assistant',
    setupText: 'Load skill-branches:setup and help me set up my skill branches.',
    ignoredTitle: 'Some fields are ignored',
    ignoredBody: 'Routing reads "group" and "branches" at the top, and "name", "description" and "skills" on a branch. Nested branches are not supported; these fields have no effect:',
    turn: 'Turn',
    branch: 'Branch',
    turnHint: 'one message you send',
    seeds: 'Seeds',
    seedsHint: 'not on a branch',
    skillsOn: name => `Skills on ${name}`,
    notInstalled: 'Not installed, or turned off on this profile.',
    add: 'Add to a branch',
    addLabel: name => `Put ${name} on a branch`,
    addTo: name => `Add a skill to ${name}`,
    remove: 'Remove from branch',
    removeLabel: (skill, branch) => `Take ${skill} off ${branch}`,
    edit: 'Edit or delete this branch',
    editLabel: name => `Edit ${name}`,
    newBranch: 'New branch',
    askInserted: 'Added to the chat box',
    askOpened: 'Opened in a new chat',
    sentNotice: 'Your request is in a new chat. Read it, then press Enter to send.',
    copiedNotice: 'Copied the request. Paste it into the chat box and send it.',
    failedNotice: 'Could not open a chat or copy the request.',
    askCopied: 'Copied — paste it into a chat',
    askFailed: 'Could not copy',
    backup: 'A backup is kept',
    cancel: 'Cancel',
    saving: 'Saving…',
    saved: 'Saved. New chats use the change.',
    saveFailed: detail => `Could not save: ${detail}. If you just installed this version, restart Hermes.`,
    after: name => `${name} after this`,
    joins: 'joins',
    leaves: 'leaves',
    above: n => `${n} more above`,
    below: n => `${n} more below`,
    rmTitle: (skill, branch) => `Take ${skill} off ${branch}?`,
    rmBody: 'It stays installed and still loads by its own description.',
    rmAlso: list => `It stays on ${list}.`,
    rmLast: name => `${name} will have no skills left. The branch stays until you delete it.`,
    rmGo: 'Remove',
    placeTitle: name => `Put ${name} on a branch`,
    placeBody: 'Pick where it belongs.',
    placeGo: name => `Add to ${name}`,
    pickBranch: 'Pick a branch',
    branchSkills: n => plural(n, 'skill', 'skills'),
    addTitle: name => `Add a skill to ${name}`,
    addBody: 'A skill can sit on more than one branch.',
    addFind: 'Find a skill',
    addEmpty: q => `No skill off this branch matches "${q}".`,
    addNone: 'Every skill is already on this branch.',
    alsoOn: list => `on ${list}`,
    addGo: 'Add',
    pickSkill: 'Pick a skill',
    newTitle: 'New branch',
    newBody: 'A named group of skills that load together.',
    nameLabel: 'Name',
    nameHint: 'Lowercase letters, digits and dashes.',
    nameBad: 'Use lowercase letters, digits and dashes, starting with a letter or digit (up to 32).',
    nameTaken: name => `There is already a branch named ${name}.`,
    descLabel: 'When it applies',
    descHint: 'The assistant reads this to decide when the branch loads.',
    skillsLabel: 'Skills',
    picked: n => `${n} picked`,
    treeAfter: 'The tree after this',
    createGo: 'Create branch',
    editTitle: name => `Edit ${name}`,
    saveGo: 'Save',
    deleteGo: 'Delete branch',
    delTitle: name => `Delete ${name}?`,
    delBody: n => (n === 1 ? 'Its one skill leaves this branch. It becomes a seed unless another branch has it; it stays installed.' : `Its ${n} skills leave this branch. Skills on no other branch become seeds; every skill stays installed.`),
    delConfirm: 'Delete',
    moreFolders: n => `Show ${n} more folders`,
    fewerFolders: 'Show fewer folders',
    noFolder: 'No folder',
    findLabel: 'Find a skill by name or purpose',
    findPlaceholder: 'Find a skill',
    count: n => plural(n, 'skill', 'skills'),
    hits: (n, total) => `${n} of ${total}`,
    none: q => `No branch, skill name or description contains "${q}".`,
    side: 'Find and map',
    fieldLabel: 'Every skill as one tile, grouped by branch, then seeds by folder',
    fieldSplit: (on, seeds) => `${on} on branches · ${seeds} seeds`,
    plotBranch: (name, n) => `${name}, ${plural(n, 'skill', 'skills')}; open it`,
    plotFolder: (name, n) => `${name}, ${plural(n, 'seed', 'seeds')}; open the folder`,
    smallFolders: n => plural(n, 'small folder', 'small folders'),
    plotSmall: n => `${plural(n, 'small folder', 'small folders')}; show them`,
    seedsByFolder: 'Seeds, by folder',
    glossTurn: 'one message you send. It names one branch.',
    glossBranch: 'a named group of skills; the ones that fit the message load.',
    glossSeed: 'a skill on no branch. It still loads by its own description.'
  }
}

const CSS = `
.skb-page{height:100%;overflow:auto;box-sizing:border-box;padding:24px 28px 40px}
.skb{position:relative;--ground:color-mix(in srgb,var(--ui-accent) 6%,var(--ui-bg-elevated));--ground2:color-mix(in srgb,var(--ui-accent) 9%,var(--ui-bg-elevated));container-type:inline-size;box-sizing:border-box;max-width:1120px;margin:0 auto;color:var(--ui-text-primary);font-size:13px;line-height:1.45;border:1px solid var(--ui-stroke-tertiary);border-radius:14px;background:var(--ground);padding:22px 30px 30px}
.skb ::selection{background:color-mix(in srgb,var(--ui-accent) 35%,transparent)}
.skb :focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px;border-radius:6px}
.skb button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;text-align:left}
.skb mark{background:color-mix(in srgb,var(--ui-accent) 30%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.skb .skb-k1{--h:var(--ui-blue)}.skb .skb-k2{--h:var(--ui-purple)}.skb .skb-k3{--h:var(--ui-green)}.skb .skb-k4{--h:var(--ui-orange)}.skb .skb-k5{--h:var(--ui-cyan)}.skb .skb-k6{--h:var(--ui-yellow)}
.skb-head{padding-bottom:14px;margin-bottom:20px;border-bottom:1px solid var(--ui-stroke-tertiary)}
.skb-head h2{margin:0 0 2px;font-size:22px;line-height:1.25;font-weight:600}
.skb-head p{margin:0;font-size:13.5px;color:var(--ui-text-secondary)}
.skb-status{margin:0;color:var(--ui-text-secondary)}
.skb-banner{margin:0 0 18px;padding:12px 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--tone) 60%,transparent);background:color-mix(in srgb,var(--tone) 10%,transparent)}
.skb-banner.skb-bad{--tone:var(--ui-red)}.skb-banner.skb-warn{--tone:var(--ui-yellow)}.skb-banner.skb-info{--tone:var(--ui-text-tertiary)}
.skb-banner b{display:block;font-size:14px;font-weight:600;margin-bottom:2px}
.skb-banner p{margin:0;color:var(--ui-text-secondary)}
.skb-banner p+p{margin-top:4px;color:var(--ui-text-primary);overflow-wrap:anywhere}
.skb-banner ul{margin:4px 0 0;padding-left:18px;color:var(--ui-text-primary)}
.skb-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,370px);gap:34px;align-items:start}
.skb-turn{display:flex;align-items:center;gap:10px;font-size:15px;min-height:22px}
.skb-turn b{font-weight:600}.skb-turn span{font-size:13px;color:var(--ui-text-secondary)}
.skb-turn em{margin-left:auto;font-style:normal;color:var(--ui-text-secondary);font-size:13px;font-variant-numeric:tabular-nums}
.skb-root,.skb-ring{width:11px;height:11px;box-sizing:border-box;border-radius:50%;flex:none}
.skb-root{background:var(--ui-accent);border:2px solid var(--ui-text-primary)}
.skb-ring{border:2px solid var(--ui-text-tertiary)}
.skb-bs{margin:-2px 0 0 5px}
.skb-br,.skb-fold{position:relative;padding-left:22px}
.skb-br::before{content:"";position:absolute;left:0;top:0;width:22px;height:18px;box-sizing:border-box;border:solid var(--h);border-width:0 0 2px 2px;border-radius:0 0 0 11px}
.skb-br:not(:last-child)::after{content:"";position:absolute;left:0;top:18px;bottom:0;border-left:2px solid var(--h)}
.skb-br:not(.skb-open)::before,.skb-br:not(.skb-open)::after{opacity:.45}
.skb .skb-tog{display:grid;grid-template-columns:9px var(--nw,66px) minmax(0,1fr) auto 12px;gap:2px 10px;align-items:start;width:100%;box-sizing:border-box;min-height:24px;padding:7px 6px 7px 0;border-radius:7px;transition:background-color 150ms cubic-bezier(0,0,.38,.9)}
.skb .skb-tog:hover{background:color-mix(in srgb,var(--ui-text-primary) 5%,transparent)}
.skb-dot{width:9px;height:9px;border-radius:50%;background:var(--h);margin:5px 0 0 -4px}
.skb-br:not(.skb-open) .skb-dot{opacity:.6}
.skb-n{font-size:15px;font-weight:600;line-height:19px;overflow-wrap:anywhere}
.skb-d{color:var(--ui-text-secondary);line-height:19px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.skb-tog em{font-style:normal;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;text-align:right;line-height:19px;min-width:20px}
.skb-chev{width:7px;height:7px;margin-top:5px;border:solid var(--ui-text-secondary);border-width:0 1.5px 1.5px 0;transform:rotate(-45deg);transition:transform 150ms cubic-bezier(0,0,.38,.9)}
.skb [aria-expanded=true] .skb-chev{transform:rotate(45deg) translate(-1px,-1px)}
.skb-sk{list-style:none;margin:0 0 8px;padding:0}
.skb-sk li{position:relative;display:grid;grid-template-columns:170px minmax(0,1fr) 14px;gap:4px 14px;padding:4px 6px 4px 18px;line-height:18px;border-radius:0 6px 6px 0;transition:background-color 150ms cubic-bezier(0,0,.38,.9)}
.skb-sk li:hover,.skb-sk li.skb-lit{background:color-mix(in srgb,var(--h) 10%,transparent)}
.skb-sk li::before{content:"";position:absolute;left:0;top:0;width:18px;height:13px;box-sizing:border-box;border:solid var(--h);border-width:0 0 1.5px 1.5px;border-radius:0 0 0 8px;opacity:.85}
.skb-sk li:not(:last-child)::after{content:"";position:absolute;left:0;top:13px;bottom:0;border-left:1.5px solid var(--h);opacity:.85}
.skb-sk b{display:flex;align-items:baseline;font-weight:400;overflow-wrap:anywhere;min-width:0}
.skb-sk b::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--h);margin:6px 8px 0 -3px;align-self:flex-start}
.skb-sk span{color:var(--ui-text-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.skb-sk li.skb-miss b{color:var(--ui-text-secondary)}.skb-sk li.skb-miss b::before{background:none;border:1px solid var(--h);box-sizing:border-box}
.skb-sk li.skb-miss span{font-style:italic}
.skb .skb-add{display:grid;place-items:center;justify-self:end;width:24px;height:24px;margin:-3px -8px -3px 0;padding:0;border-radius:5px;color:var(--ui-text-secondary);opacity:0;transition:opacity 120ms cubic-bezier(.2,0,.38,.9),background-color 120ms cubic-bezier(.2,0,.38,.9)}
.skb-sk li:hover .skb-add,.skb-sk li:focus-within .skb-add,.skb .skb-add[data-sent]{opacity:1}
.skb .skb-add:hover{color:var(--ui-text-primary);background:color-mix(in srgb,var(--ui-text-primary) 9%,transparent)}
.skb .skb-add[data-sent]{color:var(--ui-text-primary)}
@media (hover:none){.skb .skb-add{opacity:1}}
.skb .skb-addrow{display:block}
.skb .skb-addrow button{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--ui-text-secondary);padding:0 6px;margin-left:-6px;border-radius:6px;line-height:18px}
.skb .skb-addrow svg{flex:none}
.skb .skb-addrow button:hover{color:var(--ui-text-primary);background:color-mix(in srgb,var(--ui-text-primary) 6%,transparent)}
.skb-seeds{margin-top:22px;--h:var(--ui-text-tertiary)}
.skb-seeds>.skb-turn{margin-bottom:2px}
.skb-fs{margin-left:5px}
.skb-fold::before{content:"";position:absolute;left:0;top:0;width:22px;height:17px;box-sizing:border-box;border:dashed var(--ui-text-tertiary);border-width:0 0 1.5px 1.5px;border-radius:0 0 0 10px;opacity:.7}
.skb-fold:not(:last-child)::after{content:"";position:absolute;left:0;top:17px;bottom:0;border-left:1.5px dashed var(--ui-text-tertiary);opacity:.7}
.skb .skb-fold>.skb-tog{grid-template-columns:9px minmax(0,1fr) auto 12px;padding:5px 6px 5px 0}
.skb-fold .skb-dot{background:none;border:1.5px solid var(--ui-text-tertiary);box-sizing:border-box}
.skb-fold .skb-n{font-size:13px;font-weight:500}
.skb .skb-ask{font-size:12px;font-weight:600;border:1px solid var(--ui-stroke-secondary);border-radius:6px;padding:3px 8px;line-height:18px;white-space:nowrap}
.skb .skb-ask:hover{background:color-mix(in srgb,var(--ui-text-primary) 7%,transparent)}
.skb .skb-more{margin:4px 0 0 27px;font-size:12.5px;font-weight:600;color:var(--ui-text-secondary);padding:3px 6px;border-radius:6px}
.skb .skb-more:hover{background:color-mix(in srgb,var(--ui-text-primary) 6%,transparent);color:var(--ui-text-primary)}
.skb-empty{margin:10px 0 0 27px;color:var(--ui-text-secondary)}
.skb-side{position:sticky;top:16px;display:flex;flex-direction:column;gap:12px}
.skb-find{position:relative;display:block}
.skb-find input{width:100%;box-sizing:border-box;height:40px;font:inherit;font-size:14px;color:var(--ui-text-primary);caret-color:var(--ui-accent);appearance:none;outline:0;background:var(--ground2);border:1px solid var(--ui-stroke-secondary);border-radius:10px;padding:0 70px 0 38px;transition:border-color 150ms cubic-bezier(0,0,.38,.9)}
.skb-find input::placeholder{color:var(--ui-text-tertiary);opacity:1}
.skb-find input:focus-visible{border-color:var(--ui-accent)}
.skb-find input::-webkit-search-cancel-button{display:none}
.skb-find svg{position:absolute;left:13px;top:12px;stroke:var(--ui-text-tertiary);pointer-events:none}
.skb-find output{position:absolute;right:13px;top:11px;font-size:12px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums}
.skb-field{background:var(--ground2);border:1px solid var(--ui-stroke-tertiary);border-radius:14px;padding:16px 18px 18px}
.skb-fh{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:14px}.skb-fh b{font-size:15px;font-weight:600}.skb-fh span{font-size:12.5px;color:var(--ui-text-secondary)}
.skb-plots{display:flex;flex-wrap:wrap;gap:14px 18px;align-items:flex-start}
.skb .skb-plot{display:flex;flex-direction:column;gap:6px;padding:6px;margin:-6px;border-radius:9px;transition:background-color 150ms cubic-bezier(0,0,.38,.9)}
.skb .skb-plot:hover{background:color-mix(in srgb,var(--ui-text-primary) 6%,transparent)}
.skb-pl{font-size:12px;line-height:14px;color:var(--ui-text-secondary);white-space:nowrap}
.skb-brp .skb-pl{font-weight:600}.skb-brp.skb-lit .skb-pl{color:var(--ui-text-primary)}
.skb-tiles{display:grid;gap:3px}
.skb-tiles i{width:14px;height:14px;border-radius:4px;box-sizing:border-box;background:var(--h);transition:opacity 150ms,outline-color 150ms;outline:2px solid transparent;outline-offset:1px}
.skb-brp:not(.skb-lit) .skb-tiles i{opacity:.5}
.skb-seedp .skb-tiles i{background:none;border:1.5px solid color-mix(in srgb,var(--ui-text-tertiary) 85%,transparent)}
.skb .skb-tiles i.skb-miss{background:none;border:1.5px solid var(--h)}
.skb-fsep{flex-basis:100%;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ui-text-tertiary);margin:2px 0 -4px}
.skb-fsep::after{content:"";flex:1;border-top:1px dashed var(--ui-stroke-secondary)}
.skb-field.skb-q .skb-tiles i{opacity:.22}.skb .skb-field.skb-q .skb-tiles i.skb-on{opacity:1;outline-color:var(--ui-text-primary)}
.skb .skb-seedp .skb-tiles i.skb-on{background:var(--ui-text-secondary)}
.skb .skb-tiles i.skb-hov{outline-color:var(--ui-text-primary);opacity:1}
.skb-grow .skb-tiles i{animation:skb-fade 360ms cubic-bezier(0,0,.38,.9) both;animation-delay:var(--dl)}
@keyframes skb-fade{from{opacity:0}}
.skb-gl{margin:4px 0 0;display:grid;gap:9px;font-size:12.5px;line-height:1.45;color:var(--ui-text-secondary)}
.skb-gl div{display:flex;gap:11px}.skb-gl b{color:var(--ui-text-primary);font-weight:600}
.skb-gl i{flex:none;width:11px;height:11px;margin-top:3px;box-sizing:border-box}
.skb-gl .skb-gb{border:solid var(--ui-green);border-width:0 0 2px 2px;border-radius:0 0 0 8px}
.skb-pop{position:absolute;z-index:20;width:384px;max-width:calc(100% - 24px);box-sizing:border-box;background:var(--ui-bg-elevated);border:1px solid var(--ui-stroke-secondary);border-radius:12px;padding:14px 16px;box-shadow:0 18px 40px -14px color-mix(in srgb,var(--ui-bg-chrome) 85%,transparent);animation:skb-fade 150ms cubic-bezier(0,0,.38,.9)}
.skb-pop::before{content:"";position:absolute;top:-6px;left:var(--ar,24px);width:10px;height:10px;background:inherit;border:solid var(--ui-stroke-secondary);border-width:1px 0 0 1px;transform:rotate(45deg)}
.skb-pop h3{margin:0 0 4px;font-size:14px;font-weight:600;line-height:20px;overflow-wrap:anywhere}
.skb-pop>p{margin:0 0 10px;color:var(--ui-text-secondary)}
.skb-lbl{display:block;margin:0 0 4px;font-size:12px;font-weight:600;color:var(--ui-text-secondary)}
.skb-fl{display:block;margin:0 0 10px}
.skb-pop h3+.skb-fl{margin-top:10px}
.skb-fl small,.skb-hint{display:block;margin-top:3px;font-size:12px;color:var(--ui-text-tertiary)}
.skb-pop input[type=text],.skb-pop input[type=search],.skb-pop textarea{display:block;width:100%;box-sizing:border-box;font:inherit;color:var(--ui-text-primary);caret-color:var(--ui-accent);background:var(--ground2);border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:6px 10px;outline:0;appearance:none;transition:border-color 120ms cubic-bezier(.2,0,.38,.9)}
.skb-pop textarea{resize:vertical;min-height:52px}
.skb-pop input:focus-visible,.skb-pop textarea:focus-visible{border-color:var(--ui-accent);outline:0}
.skb-pop [aria-invalid=true]{border-color:var(--ui-red)}
.skb-opts{max-height:212px;overflow:auto;margin:6px 0 12px;padding:3px;border:1px solid var(--ui-stroke-tertiary);border-radius:8px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--ui-text-tertiary) 55%,transparent) transparent}
.skb-opt{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:1px 10px;align-items:baseline;padding:5px 7px;border-radius:6px;cursor:pointer;transition:background-color 120ms cubic-bezier(.2,0,.38,.9)}
.skb-opt:hover{background:color-mix(in srgb,var(--ui-text-primary) 5%,transparent)}
.skb-opt:has(input:checked){background:color-mix(in srgb,var(--h,var(--ui-accent)) 15%,transparent)}
.skb-opt input{margin:0;accent-color:var(--h,var(--ui-accent));align-self:center}
.skb-opt b{font-weight:500;overflow-wrap:anywhere}
.skb-opt span{grid-area:2/2/3/-1;font-size:12.5px;color:var(--ui-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.skb-opt small{grid-area:1/3;font-size:12px;color:var(--ui-text-secondary);white-space:nowrap}
.skb-opts p{margin:6px 8px;color:var(--ui-text-secondary)}
.skb-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:6px;margin:0 0 12px;padding:0;border:0}
.skb-tile{position:relative;display:flex;align-items:center;gap:7px;min-height:24px;padding:6px 9px;border-radius:8px;border:1px solid var(--ui-stroke-tertiary);font-weight:600;cursor:pointer;transition:background-color 120ms cubic-bezier(.2,0,.38,.9),border-color 120ms cubic-bezier(.2,0,.38,.9)}
.skb-tile:hover{background:color-mix(in srgb,var(--h) 8%,transparent)}
.skb-tile input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.skb-tile i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--h)}
.skb-tile em{margin-left:auto;font-style:normal;font-weight:400;font-size:12px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums}
.skb-tile:has(input:checked){border-color:var(--h);background:color-mix(in srgb,var(--h) 15%,transparent)}
.skb-tile:has(input:focus-visible){outline:2px solid var(--ui-accent);outline-offset:2px}
.skb-pv{margin:0 0 0 4px}
.skb-pv .skb-sk{margin:0}
.skb-pv .skb-sk li{grid-template-columns:minmax(0,1fr) auto;padding-right:8px}
.skb-pv .skb-sk li:hover{background:none}
.skb-pv .skb-sk li.skb-in{background:color-mix(in srgb,var(--ui-green) 14%,transparent)}
.skb-pv .skb-sk li.skb-in b{font-weight:600}
.skb-pv .skb-sk li.skb-out{background:color-mix(in srgb,var(--ui-red) 13%,transparent)}
.skb-pv .skb-sk li.skb-out b{color:var(--ui-text-secondary);text-decoration:line-through;text-decoration-color:var(--ui-red)}
.skb-pv .skb-sk li.skb-gapl{color:var(--ui-text-tertiary);font-size:12px}
.skb-pv em{font-style:normal;font-size:12px;font-weight:600;color:var(--ui-text-secondary)}
.skb-pvh{display:flex;align-items:baseline;gap:8px;margin:0 0 2px -4px;font-weight:600}
.skb-pvh i{flex:none;width:9px;height:9px;border-radius:50%;background:var(--h);align-self:center}
.skb-pvh span{font-weight:400;font-size:12px;color:var(--ui-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.skb-note{margin:8px 0 0;font-size:12px;color:var(--ui-text-secondary)}
.skb-err{margin:10px 0 0;padding:7px 10px;border-radius:8px;border:1px solid color-mix(in srgb,var(--ui-red) 55%,transparent);background:color-mix(in srgb,var(--ui-red) 10%,transparent)}
.skb-pf{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--ui-stroke-tertiary)}
.skb-pf small{font-size:12px;color:var(--ui-text-tertiary);margin-right:auto}
.skb .skb-btn{min-height:28px;box-sizing:border-box;padding:4px 12px;border-radius:7px;font-weight:600;line-height:18px;border:1px solid var(--ui-stroke-secondary);transition:background-color 120ms cubic-bezier(.2,0,.38,.9)}
.skb .skb-btn:hover{background:color-mix(in srgb,var(--ui-text-primary) 7%,transparent)}
.skb .skb-btn.skb-left{margin-right:auto}
.skb .skb-go{background:var(--ui-text-primary);color:var(--ui-bg-chrome);border-color:transparent}
.skb .skb-go:hover{background:color-mix(in srgb,var(--ui-text-primary) 86%,var(--ui-bg-chrome))}
.skb .skb-danger{background:var(--ui-red);color:var(--ui-bg-chrome);border-color:transparent}
.skb .skb-danger:hover{background:color-mix(in srgb,var(--ui-red) 86%,var(--ui-bg-chrome))}
.skb .skb-btn:disabled{opacity:.45;cursor:default}
.skb-bh{display:grid;grid-template-columns:minmax(0,1fr) 24px;gap:0 4px;align-items:start}
.skb .skb-bh .skb-add{margin:5px 0 0}
.skb-bh:hover .skb-add,.skb-bh:focus-within .skb-add{opacity:1}
.skb-nb{position:relative;padding:4px 0 0 22px}
.skb-nb::before{content:"";position:absolute;left:0;top:0;width:22px;height:18px;box-sizing:border-box;border:dashed var(--ui-text-tertiary);border-width:0 0 1.5px 1.5px;border-radius:0 0 0 11px}
.skb .skb-nbb{display:inline-flex;align-items:center;gap:7px;min-height:24px;box-sizing:border-box;padding:2px 10px;margin-left:-2px;border-radius:7px;border:1px dashed var(--ui-stroke-secondary);font-weight:600;color:var(--ui-text-secondary);transition:background-color 120ms cubic-bezier(.2,0,.38,.9),color 120ms cubic-bezier(.2,0,.38,.9)}
.skb .skb-nbb:hover{color:var(--ui-text-primary);background:color-mix(in srgb,var(--ui-text-primary) 6%,transparent)}
@container (max-width:720px){
  .skb-cols{grid-template-columns:1fr;gap:16px}.skb-side{position:static;order:-1}.skb-gl{display:none}
  .skb .skb-tog{grid-template-columns:9px minmax(0,1fr) auto 12px}.skb-tog .skb-d{grid-column:2/4;grid-row:2}
  .skb-sk li{grid-template-columns:minmax(0,1fr) 14px}.skb-sk li span{grid-area:2/1/3/-1;padding-left:11px}.skb-sk li .skb-add{grid-area:1/2}
}
@media (prefers-reduced-motion:reduce){.skb *{animation:none!important;transition:none!important}}
`

// Plus (add), minus (remove) or pencil (edit): drawn, in the text colour.
function ActIcon ({ kind }) {
  const d = { add: 'M6 2.5v7M2.5 6h7', remove: 'M2.5 6h7', edit: 'M7.6 2.6l1.8 1.8-5.3 5.3-2.3.5.5-2.3z' }[kind]
  return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d }))
}

const lower = s => (typeof s === 'string' ? s.toLowerCase() : '')
const ncol = n => (n <= 4 ? Math.max(n, 1) : Math.ceil(Math.sqrt(n * 1.8)))
const kOf = i => (i % 6) + 1

const h = (type, props, ...kids) => {
  const { key, ...rest } = props || {}
  if (!kids.length) return jsx(type, rest, key)
  return kids.length === 1 ? jsx(type, { ...rest, children: kids[0] }, key) : jsxs(type, { ...rest, children: kids }, key)
}

function Hl({ text, q }) {
  const i = q ? lower(text).indexOf(q) : -1
  if (i < 0) return text
  return jsxs(Fragment, { children: [text.slice(0, i), h('mark', null, text.slice(i, i + q.length)), text.slice(i + q.length)] })
}

export function mergeSkills(hostSkills, pluginSkills) {
  const names = new Set(hostSkills.map(s => s.name))
  const extra = (Array.isArray(pluginSkills) ? pluginSkills : []).filter(s => !names.has(s.name))
  return [...hostSkills, ...extra.map(s => ({ ...s, enabled: true, plugin: true }))]
}

export function buildModel(tree, skills) {
  const installed = new Map(skills.map(s => [s.name, s]))
  const branches = tree.state === 'ok' ? tree.branches : []
  const onBranch = new Set(branches.flatMap(b => b.skills))
  const byFolder = new Map()
  for (const s of skills) {
    if (onBranch.has(s.name)) continue
    const cat = s.category || ''
    if (!byFolder.has(cat)) byFolder.set(cat, [])
    byFolder.get(cat).push(s.name)
  }
  const folders = [...byFolder].map(([cat, names]) => ({ cat, names: names.sort() }))
    .sort((a, b) => b.names.length - a.names.length || a.cat.localeCompare(b.cat))
  const routed = [...onBranch].filter(n => installed.has(n)).length
  return { installed, branches, onBranch, folders, total: skills.length, routed, seeds: skills.length - routed }
}

// At most `size` rows of a list, kept around the marked rows; the rest is counted above and below.
export function previewWindow(names, marked, size = 6) {
  if (names.length <= size) return { rows: names, above: 0, below: 0 }
  const idx = names.map((n, i) => (marked.includes(n) ? i : -1)).filter(i => i >= 0)
  const first = idx.length ? Math.min(...idx) : 0
  const start = Math.max(0, Math.min(first - 1, names.length - size))
  return { rows: names.slice(start, start + size), above: start, below: names.length - start - size }
}

function Banner({ tone, title, body, detail, items, action }) {
  return h('div', { className: `skb-banner skb-${tone}`, role: tone === 'bad' ? 'alert' : 'status' },
    h('b', null, title), h('p', null, body),
    detail ? h('p', null, detail) : null,
    items ? h('ul', null, items.map(x => h('li', { key: x }, x))) : null,
    action || null)
}

// The guided setup still goes through the assistant: it opens a new chat with the request in its
// box for the user to read and send; older apps get the open chat box; the clipboard is last.
async function sendToChat(ctx, t, text) {
  const notice = (kind, key) => { try { host.notify?.({ kind, message: t(key) }) } catch {} }
  try {
    if (typeof host.newChat === 'function') {
      host.newChat()
      for (let i = 0; i < INSERT_TRIES; i++) {
        await new Promise(resolve => ctx.setTimeout(resolve, INSERT_WAIT_MS))
        if (!(await host.composer?.insertText?.('new', text, { mode: 'block' }))) continue
        const draft = await host.composer?.getDraft?.('new')
        if (draft == null || draft.includes(text)) {
          notice('info', 'skb.sentNotice')
          return 'opened'
        }
      }
    } else if (await host.composer?.insertText?.(null, text, { mode: 'block' })) {
      return 'inserted'
    }
  } catch {}
  try {
    if (await ctx.os?.writeClipboard?.(text)) {
      notice('warning', 'skb.copiedNotice')
      return 'copied'
    }
  } catch {}
  notice('error', 'skb.failedNotice')
  return 'failed'
}

function SetupButton({ ctx, t }) {
  const [sent, setSent] = useState(null)
  const label = { opened: t('skb.askOpened'), inserted: t('skb.askInserted'), copied: t('skb.askCopied'), failed: t('skb.askFailed') }
  return h('p', null, h('button', { type: 'button', className: 'skb-ask', onClick: async () => setSent(await sendToChat(ctx, t, t('skb.setupText'))) },
    sent ? label[sent] : t('skb.setup')))
}

// A popover under the control that opened it, inside the page: Escape or a click outside closes it.
function Pop({ anchor, label, onClose, children }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    const el = ref.current
    const root = el?.offsetParent || el?.parentElement
    const a = anchor?.getBoundingClientRect?.()
    const r = root?.getBoundingClientRect?.()
    if (!el || !a || !r) return
    const w = el.offsetWidth
    const wide = a.width > 60
    const left = Math.max(12, Math.min(wide ? a.left - r.left - 6 : a.right - r.left - w + 6, r.width - w - 12))
    setPos({ top: a.bottom - r.top + 8, left, ar: Math.max(14, Math.min(w - 26, a.left - r.left - left + Math.min(a.width / 2, 16) - 5)) })
  }, [anchor])
  useEffect(() => {
    const el = ref.current
    ;(el.querySelector('[data-autofocus]') || el.querySelector('input,textarea,button'))?.focus({ preventScroll: true })
    el.scrollIntoView?.({ block: 'nearest' })
    const down = e => { if (!el.contains(e.target) && !anchor?.contains?.(e.target)) onClose(false) }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [])
  return h('div', {
    ref, role: 'dialog', 'aria-label': label, className: 'skb-pop',
    style: pos ? { top: `${pos.top}px`, left: `${pos.left}px`, '--ar': `${pos.ar}px` } : { visibility: 'hidden' },
    onKeyDown: e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(true) } }
  }, children)
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

function Tree({ ctx, tree, skills, refresh, t }) {
  const uid = useId()
  const mainRef = useRef(null)
  const m = buildModel(tree, skills)
  const [open, setOpen] = useState(() => new Set(m.branches.map(b => b.name)))
  const [folds, setFolds] = useState(() => new Set())
  const [q, setQ] = useState('')
  const [allFolders, setAllFolders] = useState(false)
  const [hov, setHov] = useState(null)
  const [pop, setPop] = useState(null)
  const [busy, setBusy] = useState(false)
  const ql = q.trim().toLowerCase()
  const editable = tree.state === 'ok' || tree.state === 'missing'
  const desc = n => m.installed.get(n)?.description || ''
  const match = n => !ql || lower(n).includes(ql) || lower(desc(n)).includes(ql)
  const toggle = (setter, key) => setter(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const focusLater = (id, scrollId) => ctx.setTimeout(() => {
    document.getElementById(scrollId || id)?.scrollIntoView?.({ block: 'nearest' })
    document.getElementById(id)?.focus({ preventScroll: true })
  }, 0)

  const rows = m.branches.map((b, i) => {
    const branchHit = !!ql && (lower(b.name).includes(ql) || lower(b.description).includes(ql))
    const shown = ql ? b.skills.filter(s => branchHit || match(s)) : b.skills
    return { b, i, shown, isOpen: ql ? shown.length > 0 : open.has(b.name), visible: !ql || shown.length > 0 }
  })
  const folderRows = m.folders.map((f, idx) => {
    const shown = f.names.filter(match)
    return { ...f, idx, shown, isOpen: ql ? shown.length > 0 : folds.has(f.cat), visible: ql ? shown.length > 0 : allFolders || idx < MAX_FOLDERS }
  })
  const hits = rows.reduce((n, r) => n + (ql ? r.shown.length : 0), 0) + folderRows.reduce((n, f) => n + (ql ? f.shown.length : 0), 0)
  const extra = m.folders.length - MAX_FOLDERS
  const folderName = cat => cat || t('skb.noFolder')
  const nameWidth = `${Math.min(18, Math.max(5, ...m.branches.map(b => b.name.length)) + 1)}ch`
  const branchesWith = (skill, except) => m.branches.filter(b => b !== except && b.skills.includes(skill)).map(b => b.name)

  // ── edits: one popover at a time; the change goes to the plugin's own route, never to a chat ──
  const openPop = (e, spec) => { const anchor = e.currentTarget; setPop(p => (p?.key === spec.key ? null : { ...spec, anchor, problem: null })) }
  const upd = patch => setPop(p => (p ? { ...p, ...patch } : p))
  const closePop = refocus => setPop(p => {
    if (refocus && p?.anchor?.isConnected) ctx.setTimeout(() => p.anchor.focus({ preventScroll: true }), 0)
    return null
  })
  const save = async req => {
    if (busy) return
    setBusy(true)
    upd({ problem: null })
    let res
    try {
      res = await ctx.rest('/change', { method: 'POST', body: { ...req, rev: tree.rev ?? null } })
    } catch (err) {
      res = { ok: false, problem: t('skb.saveFailed', (err && err.message) || String(err)) }
    }
    setBusy(false)
    if (res?.ok) {
      closePop(false)
      try { host.notify?.({ kind: 'success', message: t('skb.saved') }) } catch {}
    } else {
      upd({ problem: res?.problem || t('skb.saveFailed', 'no answer') })
    }
    await refresh()
  }

  const preview = (k, label, names, mark, head) => {
    const marked = Object.keys(mark)
    const w = previewWindow(names, marked)
    return h('div', { className: `skb-pv skb-k${k}` },
      h('span', { className: 'skb-lbl' }, label), head || null,
      h('ul', { className: 'skb-sk' },
        w.above ? h('li', { key: '-above', className: 'skb-gapl' }, t('skb.above', w.above)) : null,
        w.rows.map(n => h('li', { key: n, className: mark[n] ? `skb-${mark[n]}` : '' },
          h('b', null, n), mark[n] ? h('em', null, t(mark[n] === 'in' ? 'skb.joins' : 'skb.leaves')) : h('span', null))),
        w.below ? h('li', { key: '-below', className: 'skb-gapl' }, t('skb.below', w.below)) : null))
  }
  const footer = (go, goLabel, ok, danger, left) => h('div', { className: 'skb-pf' },
    left || h('small', null, t('skb.backup')),
    h('button', { type: 'button', className: 'skb-btn', onClick: () => closePop(true) }, t('skb.cancel')),
    h('button', { type: 'button', className: `skb-btn ${danger ? 'skb-danger' : 'skb-go'}`, disabled: !ok || busy, onClick: go }, busy ? t('skb.saving') : goLabel))
  const problem = pop?.problem ? h('p', { className: 'skb-err', role: 'alert' }, pop.problem) : null
  const options = (list, multi, picked, onPick, k) => h('div', { className: `skb-opts skb-k${k}`, role: 'group', 'aria-label': t('skb.pickSkill') },
    list.map(n => {
      const on = branchesWith(n)
      return h('label', { key: n, className: 'skb-opt' },
        h('input', { type: multi ? 'checkbox' : 'radio', name: `${uid}opt`, checked: multi ? picked.has(n) : picked === n, onChange: () => onPick(n) }),
        h('b', null, n), h('span', { title: desc(n) }, desc(n)),
        on.length ? h('small', null, t('skb.alsoOn', on.join(', '))) : null)
    }))
  const findSkills = (exclude, query) => {
    const qq = lower(query.trim())
    return [...m.installed.keys()].filter(n => !exclude.has(n) && (!qq || lower(n).includes(qq) || lower(desc(n)).includes(qq)))
      .sort((a, b) => (m.onBranch.has(a) - m.onBranch.has(b)) || a.localeCompare(b))
  }

  const popBody = () => {
    const b = m.branches.find(x => x.name === pop.branch)
    const k = b ? kOf(m.branches.indexOf(b)) : kOf(m.branches.length)
    if (pop.kind === 'remove' && b) {
      const others = branchesWith(pop.skill, b)
      return [t('skb.rmTitle', pop.skill, b.name), h(Fragment, null,
        h('h3', null, t('skb.rmTitle', pop.skill, b.name)),
        h('p', null, [t('skb.rmBody'), others.length ? t('skb.rmAlso', others.join(', ')) : ''].filter(Boolean).join(' ')),
        preview(k, t('skb.after', b.name), b.skills, { [pop.skill]: 'out' }),
        b.skills.length === 1 ? h('p', { className: 'skb-note' }, t('skb.rmLast', b.name)) : null,
        problem,
        footer(() => save({ op: 'remove', branch: b.name, skill: pop.skill }), t('skb.rmGo'), true, true))]
    }
    if (pop.kind === 'place') {
      const targets = m.branches.map((x, i) => ({ x, i })).filter(({ x }) => !x.skills.includes(pop.skill))
      const sel = m.branches.find(x => x.name === pop.sel)
      return [t('skb.placeTitle', pop.skill), h(Fragment, null,
        h('h3', null, t('skb.placeTitle', pop.skill)),
        h('p', null, t('skb.placeBody')),
        h('div', { className: 'skb-pick', role: 'radiogroup', 'aria-label': t('skb.pickBranch') }, targets.map(({ x, i }) => h('label', { key: x.name, className: `skb-tile skb-k${kOf(i)}` },
          h('input', { type: 'radio', name: `${uid}place`, checked: pop.sel === x.name, onChange: () => upd({ sel: x.name, problem: null }) }),
          h('i', null), x.name, h('em', { 'aria-label': t('skb.branchSkills', x.skills.length) }, String(x.skills.length))))),
        sel ? preview(kOf(m.branches.indexOf(sel)), t('skb.after', sel.name), [...sel.skills, pop.skill], { [pop.skill]: 'in' }) : h('p', { className: 'skb-hint' }, t('skb.pickBranch')),
        problem,
        footer(() => save({ op: 'add', branch: sel.name, skill: pop.skill }), sel ? t('skb.placeGo', sel.name) : t('skb.addGo'), !!sel))]
    }
    if (pop.kind === 'add' && b) {
      const query = pop.q || ''
      const list = findSkills(new Set(b.skills), query)
      const pool = findSkills(new Set(b.skills), '')
      return [t('skb.addTitle', b.name), h(Fragment, null,
        h('h3', null, t('skb.addTitle', b.name)),
        h('p', null, t('skb.addBody')),
        h('input', { type: 'search', 'data-autofocus': '', value: query, placeholder: t('skb.addFind'), 'aria-label': t('skb.addFind'), onChange: e => upd({ q: e.target.value }) }),
        list.length ? options(list, false, pop.sel, n => upd({ sel: n, problem: null }), k)
          : h('div', { className: 'skb-opts' }, h('p', null, pool.length ? t('skb.addEmpty', query.trim()) : t('skb.addNone'))),
        pop.sel ? preview(k, t('skb.after', b.name), [...b.skills, pop.sel], { [pop.sel]: 'in' }) : null,
        problem,
        footer(() => save({ op: 'add', branch: b.name, skill: pop.sel }), t('skb.addGo'), !!pop.sel))]
    }
    if (pop.kind === 'create') {
      const name = pop.name || ''
      const nameBad = !!name && !NAME_RE.test(name)
      const taken = m.branches.some(x => x.name.toLowerCase() === name.toLowerCase())
      const picks = pop.picks || []
      const list = findSkills(new Set(), pop.q || '')
      const ok = NAME_RE.test(name) && !taken && !!(pop.desc || '').trim() && picks.length > 0
      const pick = n => upd({ picks: picks.includes(n) ? picks.filter(x => x !== n) : [...picks, n], problem: null })
      return [t('skb.newTitle'), h(Fragment, null,
        h('h3', null, t('skb.newTitle')),
        h('p', null, t('skb.newBody')),
        h('label', { className: 'skb-fl' }, h('span', { className: 'skb-lbl' }, t('skb.nameLabel')),
          h('input', { type: 'text', 'data-autofocus': '', value: name, spellCheck: false, autoComplete: 'off', 'aria-invalid': String(nameBad || taken), onChange: e => upd({ name: e.target.value, problem: null }) }),
          h('small', { 'aria-live': 'polite' }, taken ? t('skb.nameTaken', name) : nameBad ? t('skb.nameBad') : t('skb.nameHint'))),
        h('label', { className: 'skb-fl' }, h('span', { className: 'skb-lbl' }, t('skb.descLabel')),
          h('textarea', { rows: 2, value: pop.desc || '', onChange: e => upd({ desc: e.target.value, problem: null }) }),
          h('small', null, t('skb.descHint'))),
        h('span', { className: 'skb-lbl' }, `${t('skb.skillsLabel')} · ${t('skb.picked', picks.length)}`),
        h('input', { type: 'search', value: pop.q || '', placeholder: t('skb.addFind'), 'aria-label': t('skb.addFind'), onChange: e => upd({ q: e.target.value }) }),
        options(list, true, new Set(picks), pick, k),
        picks.length ? preview(k, t('skb.treeAfter'), picks, Object.fromEntries(picks.map(n => [n, 'in'])),
          h('div', { className: 'skb-pvh' }, h('i', null), name || '…', h('span', null, pop.desc || ''))) : null,
        problem,
        footer(() => save({ op: 'create', name, description: pop.desc || '', skills: picks }), t('skb.createGo'), ok))]
    }
    if (pop.kind === 'edit' && b) {
      if (pop.confirm) {
        return [t('skb.delTitle', b.name), h(Fragment, null,
          h('h3', null, t('skb.delTitle', b.name)),
          h('p', null, t('skb.delBody', b.skills.length)),
          problem,
          footer(() => save({ op: 'delete', branch: b.name }), t('skb.delConfirm'), true, true))]
      }
      const name = pop.name ?? b.name
      const d = pop.desc ?? b.description
      const nameBad = !NAME_RE.test(name)
      const taken = m.branches.some(x => x !== b && x.name.toLowerCase() === name.toLowerCase())
      const changed = name !== b.name || d.trim() !== b.description
      return [t('skb.editTitle', b.name), h(Fragment, null,
        h('h3', null, t('skb.editTitle', b.name)),
        h('label', { className: 'skb-fl' }, h('span', { className: 'skb-lbl' }, t('skb.nameLabel')),
          h('input', { type: 'text', 'data-autofocus': '', value: name, spellCheck: false, autoComplete: 'off', 'aria-invalid': String(nameBad || taken), onChange: e => upd({ name: e.target.value, problem: null }) }),
          h('small', { 'aria-live': 'polite' }, taken ? t('skb.nameTaken', name) : nameBad ? t('skb.nameBad') : t('skb.nameHint'))),
        h('label', { className: 'skb-fl' }, h('span', { className: 'skb-lbl' }, t('skb.descLabel')),
          h('textarea', { rows: 3, value: d, onChange: e => upd({ desc: e.target.value, problem: null }) }),
          h('small', null, t('skb.descHint'))),
        problem,
        footer(() => save({ op: 'edit', branch: b.name, name, description: d }), t('skb.saveGo'), changed && !nameBad && !taken && !!d.trim(), false,
          h('button', { type: 'button', className: 'skb-btn skb-left', onClick: () => upd({ confirm: true, problem: null }) }, t('skb.deleteGo'))))]
    }
    return null
  }
  const popNode = () => {
    if (!pop) return null
    const got = popBody()
    if (!got) return null
    return h(Pop, { key: pop.key, anchor: pop.anchor, label: got[0], onClose: closePop, children: got[1] })
  }

  const onTreeKey = e => {
    if (!e.target.classList?.contains('skb-tog')) return
    const list = [...mainRef.current.querySelectorAll('.skb-tog')]
    const i = list.indexOf(e.target)
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (step) {
      e.preventDefault()
      list[(i + step + list.length) % list.length].focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      list[e.key === 'Home' ? 0 : list.length - 1].focus()
    }
  }
  const onFindKey = e => {
    if (e.key === 'Escape') setQ('')
    if (e.key === 'Enter') mainRef.current.querySelector('.skb-sk li')?.scrollIntoView?.({ block: 'center' })
  }

  // Row buttons are icons in their own column; the label is the tooltip, the full name is for screen readers.
  const rowButton = (spec, className, label, name, icon) => h('button', {
    type: 'button', className, title: label, 'aria-label': name, 'aria-haspopup': 'dialog', 'aria-expanded': String(pop?.key === spec.key),
    onClick: e => openPop(e, spec)
  }, jsx(ActIcon, { kind: icon }))
  const addButton = n => (editable && m.branches.length ? rowButton({ key: `place:${n}`, kind: 'place', skill: n }, 'skb-add', t('skb.add'), t('skb.addLabel', n), 'add') : null)
  const removeButton = (s, b) => (editable ? rowButton({ key: `rm:${b.name}:${s}`, kind: 'remove', branch: b.name, skill: s }, 'skb-add skb-rm', t('skb.remove'), t('skb.removeLabel', s, b.name), 'remove') : null)
  const skillRow = (name, extraClass, text, action) => h('li', {
    key: name,
    className: [extraClass, hov === name || pop?.skill === name ? 'skb-lit' : ''].filter(Boolean).join(' '),
    onMouseEnter: () => setHov(name),
    onMouseLeave: () => setHov(null)
  }, h('b', null, jsx(Hl, { text: name, q: ql })), h('span', { title: text }, jsx(Hl, { text, q: ql })), action || null)
  const addRow = b => {
    const key = `add:${b.name}`
    return h('li', { key, className: 'skb-addrow' }, h('button', {
      type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': String(pop?.key === key), onClick: e => openPop(e, { key, kind: 'add', branch: b.name })
    }, jsx(ActIcon, { kind: 'add' }), t('skb.addTo', b.name)))
  }

  const branchList = h('div', { className: 'skb-bs', style: { '--nw': nameWidth } }, rows.filter(r => r.visible).map(r => h('div', {
    key: r.b.name, id: `${uid}b${r.i}`, className: `skb-br skb-k${kOf(r.i)}${r.isOpen ? ' skb-open' : ''}`
  },
  h('div', { className: 'skb-bh' },
    h('button', {
      type: 'button', className: 'skb-tog', id: `${uid}t${r.i}`, 'aria-expanded': String(r.isOpen), 'aria-controls': `${uid}l${r.i}`,
      onClick: () => toggle(setOpen, r.b.name)
    }, h('i', { className: 'skb-dot' }), h('span', { className: 'skb-n' }, jsx(Hl, { text: r.b.name, q: ql })),
    h('span', { className: 'skb-d', title: r.b.description }, jsx(Hl, { text: r.b.description, q: ql })),
    h('em', null, String(r.b.skills.length)), h('i', { className: 'skb-chev' })),
    editable ? rowButton({ key: `edit:${r.b.name}`, kind: 'edit', branch: r.b.name }, 'skb-add skb-ed', t('skb.edit'), t('skb.editLabel', r.b.name), 'edit') : null),
  h('ul', { className: 'skb-sk', id: `${uid}l${r.i}`, 'aria-label': t('skb.skillsOn', r.b.name), hidden: !r.isOpen },
    r.shown.map(s => m.installed.has(s) ? skillRow(s, '', desc(s), removeButton(s, r.b)) : skillRow(s, 'skb-miss', t('skb.notInstalled'), removeButton(s, r.b))),
    ql || !editable ? null : addRow(r.b)))),
  !ql && editable ? h('div', { key: 'new', className: 'skb-nb' }, h('button', {
    type: 'button', className: 'skb-nbb', 'aria-haspopup': 'dialog', 'aria-expanded': String(pop?.key === 'create'),
    onClick: e => openPop(e, { key: 'create', kind: 'create' })
  }, jsx(ActIcon, { kind: 'add' }), t('skb.newBranch'))) : null)

  const foldList = h('div', { className: 'skb-fs' }, folderRows.filter(f => f.visible).map(f => h('div', { key: f.cat || '-', className: 'skb-fold' },
    h('button', {
      type: 'button', className: 'skb-tog', id: `${uid}g${f.idx}`, 'aria-expanded': String(f.isOpen), 'aria-controls': `${uid}m${f.idx}`,
      onClick: () => toggle(setFolds, f.cat)
    }, h('i', { className: 'skb-dot' }), h('span', { className: 'skb-n' }, folderName(f.cat)), h('em', null, String(f.names.length)), h('i', { className: 'skb-chev' })),
    h('ul', { className: 'skb-sk', id: `${uid}m${f.idx}`, 'aria-label': folderName(f.cat), hidden: !f.isOpen },
      f.shown.map(n => skillRow(n, '', desc(n), addButton(n)))))))

  let delay = 0
  const tiles = (names, cls) => h('span', { className: 'skb-tiles', style: { gridTemplateColumns: `repeat(${ncol(names.length)},14px)` } },
    names.map(n => h('i', {
      key: n, title: n, style: { '--dl': `${(delay++) * 7}ms` },
      className: [cls(n), ql && match(n) ? 'skb-on' : '', hov === n ? 'skb-hov' : ''].filter(Boolean).join(' '),
      onMouseEnter: () => setHov(n), onMouseLeave: () => setHov(null)
    })))
  const big = m.folders.filter(f => f.names.length >= 3)
  const small = m.folders.filter(f => f.names.length < 3)
  const openFolder = f => {
    if (f.idx >= MAX_FOLDERS) setAllFolders(true)
    setFolds(prev => new Set(prev).add(f.cat))
    focusLater(`${uid}g${f.idx}`)
  }
  const field = h('div', { className: `skb-field skb-grow${ql ? ' skb-q' : ''}`, role: 'group', 'aria-label': t('skb.fieldLabel') },
    h('div', { className: 'skb-fh' }, h('b', null, t('skb.count', m.total)), h('span', null, t('skb.fieldSplit', m.routed, m.seeds))),
    h('div', { className: 'skb-plots' },
      m.branches.map((b, i) => h('button', {
        key: b.name, type: 'button', className: `skb-plot skb-brp skb-k${kOf(i)}${rows[i].isOpen ? ' skb-lit' : ''}`,
        'aria-label': t('skb.plotBranch', b.name, b.skills.length),
        onClick: () => { setOpen(prev => new Set(prev).add(b.name)); focusLater(`${uid}t${i}`, `${uid}b${i}`) }
      }, h('span', { className: 'skb-pl' }, b.name), tiles(b.skills, n => (m.installed.has(n) ? '' : 'skb-miss')))),
      m.folders.length ? h('div', { className: 'skb-fsep' }, t('skb.seedsByFolder')) : null,
      big.map(f => h('button', {
        key: f.cat || '-', type: 'button', className: 'skb-plot skb-seedp', 'aria-label': t('skb.plotFolder', folderName(f.cat), f.names.length),
        onClick: () => openFolder(folderRows.find(x => x.cat === f.cat))
      }, h('span', { className: 'skb-pl' }, folderName(f.cat)), tiles(f.names, () => ''))),
      small.length ? h('button', {
        type: 'button', className: 'skb-plot skb-seedp', 'aria-label': t('skb.plotSmall', small.length),
        onClick: () => { setAllFolders(true); focusLater(`${uid}more`) }
      }, h('span', { className: 'skb-pl' }, t('skb.smallFolders', small.length)), tiles(small.flatMap(f => f.names), () => '')) : null))

  const gloss = h('div', { className: 'skb-gl' },
    [['skb-root', 'skb.turn', 'skb.glossTurn'], ['skb-gb', 'skb.branch', 'skb.glossBranch'], ['skb-ring', 'skb.seeds', 'skb.glossSeed']]
      .map(([cls, title, text]) => h('div', { key: cls }, h('i', { className: cls }),
        h('span', null, h('b', null, t(title)), ` — ${t(text)}`))))

  return h(Fragment, null, h('div', { className: 'skb-cols' },
    h('div', { ref: mainRef, onKeyDown: onTreeKey },
      h('div', { className: 'skb-turn' }, h('i', { className: 'skb-root' }), h('b', null, t('skb.turn')), h('span', null, t('skb.turnHint'))),
      branchList,
      h('div', { className: 'skb-seeds' },
        h('div', { className: 'skb-turn' }, h('i', { className: 'skb-ring' }), h('b', null, t('skb.seeds')), h('span', null, t('skb.seedsHint')), h('em', null, String(m.seeds))),
        foldList,
        !ql && extra > 0 ? h('button', { type: 'button', id: `${uid}more`, className: 'skb-more', 'aria-expanded': String(allFolders), onClick: () => setAllFolders(v => !v) },
          allFolders ? t('skb.fewerFolders') : t('skb.moreFolders', extra)) : null),
      ql && !hits ? h('p', { className: 'skb-empty', role: 'status' }, t('skb.none', q.trim())) : null),
    h('aside', { className: 'skb-side', 'aria-label': t('skb.side') },
      h('label', { className: 'skb-find' },
        h('svg', { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': 'true' },
          h('circle', { cx: 7, cy: 7, r: 5 }), h('path', { d: 'M11 11l3.5 3.5' })),
        h('input', { type: 'search', value: q, placeholder: t('skb.findPlaceholder'), 'aria-label': t('skb.findLabel'), onChange: e => setQ(e.target.value), onKeyDown: onFindKey }),
        h('output', { 'aria-live': 'polite' }, ql ? t('skb.hits', hits, m.total) : t('skb.count', m.total))),
      field, gloss)), popNode())
}

function createPage(ctx) {
  return function SkillBranchesPage() {
    const t = usePluginI18n(ID)
    const treeQ = useQuery({ queryKey: [ID, 'tree'], queryFn: () => ctx.rest('/tree') })
    const skillsQ = useQuery({ queryKey: [ID, 'skills'], queryFn: () => host.skills.list() })
    const tree = treeQ.data
    const skills = Array.isArray(skillsQ.data) && tree ? mergeSkills(skillsQ.data, tree.plugin_skills) : null
    useEffect(() => { if (ctx.storage.get('seen', null) != null) ctx.storage.remove('seen') }, [])
    const refresh = async () => { try { await treeQ.refetch?.() } catch {} }

    const detail = err => (err && err.message) || String(err)
    let body
    if (treeQ.error) body = h('p', { className: 'skb-status', role: 'alert' }, t('skb.treeFailed', detail(treeQ.error)))
    else if (skillsQ.error) body = h('p', { className: 'skb-status', role: 'alert' }, t('skb.skillsFailed', detail(skillsQ.error)))
    else if (!tree || !skills) body = h('p', { className: 'skb-status', role: 'status' }, t('skb.loading'))
    else {
      body = h(Fragment, null,
        tree.state === 'invalid' ? jsx(Banner, { tone: 'bad', title: t('skb.invalidTitle'), body: t('skb.invalidBody'), detail: tree.path, items: [tree.problem] }) : null,
        tree.state === 'missing' ? jsx(Banner, { tone: 'info', title: t('skb.missingTitle'), body: t('skb.missingBody'), detail: tree.path, action: jsx(SetupButton, { ctx, t }) }) : null,
        tree.state === 'ok' && tree.ignored?.length ? jsx(Banner, { tone: 'warn', title: t('skb.ignoredTitle'), body: t('skb.ignoredBody'), items: tree.ignored }) : null,
        jsx(Tree, { ctx, tree, skills, refresh, t }))
    }
    return h('div', { className: 'skb-page' }, h('style', null, CSS),
      h('section', { className: 'skb' },
        h('header', { className: 'skb-head' }, h('h2', null, t('skb.title')), h('p', null, t('skb.lead'))),
        body))
  }
}

export default {
  id: ID,
  name: 'Skill Branches',
  register(ctx) {
    ctx.i18n.register({ en })
    const Page = createPage(ctx)
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => jsx(Page, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: ctx.i18n.t('skb.nav'), codicon: 'type-hierarchy' } }
    ])
  }
}
