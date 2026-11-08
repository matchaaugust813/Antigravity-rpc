'use strict';
/*
 * agy pipes a JSON blob into the statusLine command on every state change. That blob is the ONLY place
 * Antigravity exposes token usage / model / quota, so this is where live tokens come from.
 * Rules: read stdin with a short deadline, never crash, ALWAYS print something (stdout = the status bar),
 * and keep the previous statusLine alive (chained) so nothing the user had disappears.
 */
const { spawnSync } = require('child_process');
const S = require('./state');
const F = require('./format');
const C = require('./common');
const { loadConfig } = require('./config');
const { estimate } = require('./pricing');

const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);

function mapStatus(agentState, st) {
  switch (agentState) {
    case 'thinking': return 'thinking';
    case 'working': case 'tool_use': return 'working';
    case 'idle': return st.prompts > 0 ? 'waiting' : 'idle';
    case 'initializing': return 'idle';
    default: return null;
  }
}

function applyStatus(input, cfg, now = Date.now()) {
  const agg = S.readAgg();
  C.sample('statusline', input, cfg);
  const { st, fresh } = C.resolveSession(input, agg, now);

  const m = input.model || {};
  const modelName = m.display_name || m.displayName || m.id;
  if (modelName) st.model = modelName;

  const cw = input.context_window || input.contextWindow || {};
  const inTot = num(cw.total_input_tokens ?? cw.totalInputTokens);
  const outTot = num(cw.total_output_tokens ?? cw.totalOutputTokens);
  const cu = cw.current_usage || cw.currentUsage || {};
  const cacheRead = num(cu.cache_read_input_tokens ?? cu.cacheReadInputTokens);

  if (inTot || outTot) {
    const last = st.last || { in: 0, out: 0 };
    // totals are cumulative per session: only positive deltas are added (a drop = reset/compaction, no double count)
    const dIn = Math.max(0, inTot - last.in), dOut = Math.max(0, outTot - last.out);
    if (dIn || dOut) {
      const dCached = Math.min(cacheRead, dIn);
      st.tokens.input += dIn; st.tokens.output += dOut; st.tokens.cached += dCached;
      st.tokens.total += dIn + dOut;
      const cost = estimate({ input: dIn, output: dOut, cached: dCached }, st.model, cfg.pricing);
      st.costUsd += cost; st.estimated = false;
      S.bump(agg, { input: dIn, output: dOut, cached: dCached, total: dIn + dOut, costUsd: cost });
      S.note(agg, 'modelCost', st.model || 'unknown', cost);
    }
    // a clear drop in the cumulative input total = the context was compacted (shown as the "compacting" card)
    if (cfg.compactDetect !== false && st.last && st.last.in > 2000 && inTot < st.last.in * 0.6) st.compactedAt = now;
    st.last = { in: inTot, out: outTot };
  }

  const quota = input.quota;
  if (quota && typeof quota === 'object') {
    const q = {};
    for (const [k, v] of Object.entries(quota)) {
      if (!v || typeof v !== 'object' || v.disabled) continue;
      const rem = v.remaining_fraction ?? v.remainingFraction;
      if (typeof rem === 'number') q[k] = { rem, reset: num(v.reset_in_seconds ?? v.resetInSeconds) };
    }
    st.quota = q;
  }

  const s2 = mapStatus(input.agent_state || input.agentState, st);
  if (s2) {
    const gap = (now - (st.updatedAt || now)) / 1000;
    if (!fresh && (st.status === 'thinking' || st.status === 'working') && gap > 0 && gap < 300) S.bump(agg, { activeSec: gap });
    if (s2 !== 'working') st.tool = null;
    st.status = s2;
  }
  st.ended = false;
  st.updatedAt = now;
  S.writeState(st);
  S.writeAgg(agg);
  C.ensureDaemon(); // cheap pid check; also covers agy sessions where SessionStart never fires
  return st;
}

function chained(prev, raw) {
  if (!prev || !prev.command) return '';
  try {
    const r = spawnSync(prev.command, { input: raw, shell: true, encoding: 'utf8', timeout: 1500, windowsHide: true });
    return (r.stdout || '').trim();
  } catch (_) { return ''; }
}

async function main() {
  const cfg = loadConfig();
  let raw = '', text = '';
  try {
    raw = await C.readStdin(1000);
    const input = C.parseJSON(raw);
    let st = null;
    if (input && typeof input === 'object') st = applyStatus(input, cfg);
    if (cfg.chainStatusLine !== false) {
      let prev = null;
      try { prev = S.readJSON(require('./paths').config, {}).previousStatusLine; } catch (_) {}
      text = chained(prev, raw);
    }
    if (!text) text = st ? `${F.prettyModel(st.model)} · ${F.tok(st.tokens.total)} · ${F.usd(st.costUsd)}` : 'antigravity-rpc';
  } catch (e) { C.logErr('statusline', e); text = 'antigravity-rpc'; }
  process.stdout.write(text + '\n', () => process.exit(0));
}

module.exports = { main, applyStatus };
