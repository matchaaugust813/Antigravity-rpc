'use strict';
/* Shared helpers for hook.js and statusline.js: tolerant payload reading, daemon spawn, session resolve. */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const S = require('./state');

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return undefined; };

// Every id-looking field we know of; payloads are protojson (camelCase) or snake_case depending on the feed.
function idsOf(input) {
  const out = [];
  for (const k of ['conversationId', 'conversation_id', 'sessionId', 'session_id', 'trajectoryId', 'trajectory_id', 'cascadeId', 'cascade_id']) {
    if (typeof input[k] === 'string' && input[k]) out.push(input[k]);
  }
  return out;
}
function cwdOf(input) {
  const wp = pick(input, ['workspacePaths', 'workspace_paths']);
  const ws = input.workspace || {};
  const c = pick(input, ['cwd']) || pick(ws, ['current_dir', 'project_dir']) || (Array.isArray(wp) ? wp[0] : undefined);
  return typeof c === 'string' ? c : '';
}

function daemonRunning() {
  try { process.kill(Number(fs.readFileSync(P.pid, 'utf8')), 0); return true; } catch (_) { return false; }
}
function ensureDaemon() {
  if (daemonRunning()) return;
  try {
    fs.mkdirSync(P.tmp, { recursive: true });
    const out = fs.openSync(P.log, 'a');
    const bin = path.resolve(__dirname, '..', 'bin', 'antigravity-rpc.js');
    spawn(process.execPath, [bin, 'start', '--foreground'], { detached: true, stdio: ['ignore', out, out], windowsHide: true }).unref();
  } catch (_) {}
}

// Returns {st, agg, fresh}. Creates a new session when the call doesn't belong to the saved one.
function resolveSession(input, agg, now = Date.now()) {
  const ids = idsOf(input), cwd = cwdOf(input);
  let st = S.readState();
  let fresh = false;
  if (!S.sameSession(st, ids, cwd, now)) {
    st = S.newState(ids[0] || `s${now}`, cwd || process.cwd());
    fresh = true;
    S.bump(agg, { sessions: 1 });
  }
  S.remember(st, ids);
  if (cwd) { st.cwd = cwd; st.project = path.basename(cwd); }
  return { st, fresh };
}

function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    const t = setTimeout(() => resolve(data), timeoutMs); // agy can keep stdin open: never wait forever
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => { clearTimeout(t); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(t); resolve(data); });
  });
}
const parseJSON = (raw) => { try { return raw ? JSON.parse(String(raw).replace(/^﻿/, '')) : {}; } catch (_) { return null; } };

function logErr(tag, e) {
  try { fs.mkdirSync(P.tmp, { recursive: true }); fs.appendFileSync(P.log, `[${tag}] ${e && e.stack || e}\n`); } catch (_) {}
}

// debug: remember only the SHAPE (key paths -> type) of payloads, never values (no email / paths / ids)
function sample(kind, obj, cfg) {
  if (!cfg.debug || !obj || typeof obj !== 'object') return;
  const shape = {};
  const walk = (v, p, d) => {
    if (d > 4) return;
    if (Array.isArray(v)) { shape[p] = 'array'; if (v[0] && typeof v[0] === 'object') walk(v[0], p + '[]', d + 1); return; }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], p ? `${p}.${k}` : k, d + 1); return; }
    shape[p] = v === null ? 'null' : typeof v;
  };
  walk(obj, '', 0);
  const all = S.readJSON(P.samples, {});
  all[kind] = shape;
  S.writeJSON(P.samples, all);
}

module.exports = { pick, idsOf, cwdOf, ensureDaemon, daemonRunning, resolveSession, readStdin, parseJSON, logErr, sample };
