'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { today } = require('./format');

function readJSON(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function sleepSync(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {} }
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const body = JSON.stringify(data);
  fs.writeFileSync(tmp, body);
  // atomic swap so the daemon never reads a half-written file. Windows refuses the rename (EPERM) while
  // another process has the target open, so retry briefly, then fall back to a direct write.
  for (let i = 0; i < 6; i++) {
    try { fs.renameSync(tmp, file); return; } catch (_) { sleepSync(25 * (i + 1)); }
  }
  try { fs.writeFileSync(file, body); } catch (_) {}
  try { fs.unlinkSync(tmp); } catch (_) {}
}

const readState = () => readJSON(P.state);
const writeState = (s) => writeJSON(P.state, s);

const emptyTokens = () => ({ input: 0, output: 0, cached: 0, thoughts: 0, tool: 0, total: 0 });

function newState(sessionId, cwd) {
  const now = Date.now();
  return {
    sessionId, cwd, project: cwd ? path.basename(cwd) : '',
    model: null, status: 'idle', tool: null, ended: false,
    startedAt: now, updatedAt: now,
    prompts: 0, toolCalls: 0, requests: 0,
    tokens: emptyTokens(), costUsd: 0, estimated: false,
    ids: [], quota: {}, last: null,
    currentFile: null, justShipped: 0, justShippedKind: '', justShippedSubject: '', justShippedBranch: '', compactedAt: 0,
  };
}

function emptyAgg() {
  return {
    firstSeen: Date.now(),
    totals: { input: 0, output: 0, cached: 0, thoughts: 0, total: 0, costUsd: 0, prompts: 0, toolCalls: 0, requests: 0, sessions: 0, activeSec: 0, linesAdded: 0, linesRemoved: 0 },
    days: {},
    tools: {},     // tool name -> calls
    langs: {},     // language -> { edits }
    files: {},     // edited file path -> { n, last }
    modelCost: {}, // model id -> simulated USD
  };
}
const readAgg = () => readJSON(P.aggregate(), null) || emptyAgg();
const writeAgg = (a) => writeJSON(P.aggregate(), a);

// numeric fields kept per lifetime / per day (older aggregate files lack the newer ones, so always default to 0)
const TOTAL_KEYS = ['input', 'output', 'cached', 'thoughts', 'total', 'costUsd', 'prompts', 'toolCalls', 'requests', 'sessions', 'activeSec', 'linesAdded', 'linesRemoved'];
const DAY_KEYS = ['total', 'input', 'output', 'cached', 'costUsd', 'requests', 'prompts', 'toolCalls', 'activeSec', 'sessions', 'linesAdded', 'linesRemoved'];
const HISTORY_DAYS = 400; // long enough for the 365-day streak milestone

// add a delta object ({input, output, total, costUsd, prompts, ...}) to lifetime totals and today's bucket
function bump(agg, delta) {
  const day = (agg.days[today()] ||= {});
  if (!day.firstTs) day.firstTs = Date.now();
  for (const [k, v] of Object.entries(delta)) {
    if (!v) continue;
    if (TOTAL_KEYS.includes(k)) agg.totals[k] = (agg.totals[k] || 0) + v;
    if (DAY_KEYS.includes(k)) day[k] = (day[k] || 0) + v;
  }
  const keys = Object.keys(agg.days).sort();
  while (keys.length > HISTORY_DAYS) delete agg.days[keys.shift()];
}

// counter maps on the aggregate: note(agg, 'tools', 'run_command'), note(agg, 'modelCost', model, 0.02)
function note(agg, group, key, inc = 1) {
  if (!key) return;
  const m = (agg[group] ||= {});
  m[key] = (m[key] || 0) + inc;
}
function noteLang(agg, lang) {
  if (!lang) return;
  const m = (agg.langs ||= {});
  (m[lang] ||= { edits: 0 }).edits++;
}
function noteFile(agg, file, now = Date.now()) {
  if (!file) return;
  const m = (agg.files ||= {});
  const e = (m[file] ||= { n: 0, last: now });
  e.n++; e.last = now;
  const keys = Object.keys(m);
  if (keys.length > 500) { // keep the map small: drop the least-edited, oldest entries
    keys.sort((a, b) => m[a].n - m[b].n || m[a].last - m[b].last).slice(0, keys.length - 400).forEach((k) => delete m[k]);
  }
}

function streak(agg) {
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const key = d.toLocaleDateString('sv-SE');
    const day = agg.days[key];
    if (day && (day.requests > 0 || day.activeSec > 0)) n++;
    else if (i > 0) break; // today may still be empty
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// Which saved session does a hook / statusLine call belong to? agy payloads are not guaranteed to carry
// the same id in both places, so match on any known id, else on the working folder (recent state only).
function sameSession(st, ids, cwd, now = Date.now()) {
  if (!st || st.ended) return false;
  if (!ids.length && !cwd) return now - (st.updatedAt || 0) < 15 * 60 * 1000; // payload without identity: assume the live session
  if (ids.length && (st.ids || []).some((i) => ids.includes(i))) return true;
  if (ids.length && (st.ids || []).length && !cwd) return false;
  return !!cwd && st.cwd === cwd && now - (st.updatedAt || 0) < 15 * 60 * 1000;
}
function remember(st, ids) {
  st.ids = [...new Set([...(st.ids || []), ...ids])].slice(-6);
}

module.exports = { sameSession, remember, readJSON, writeJSON, readState, writeState, newState, emptyTokens, readAgg, writeAgg, bump, note, noteLang, noteFile, streak };
