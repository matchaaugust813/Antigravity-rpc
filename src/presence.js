'use strict';
/*
 * Discord card builder. Mirrors claude-rpc: one base frame per status (working / thinking / compacting / shipped /
 * waiting / idle) from the templates in config.js, plus a rotation of lifetime-stat frames (week, streak, hotspot,
 * model split, lifetime tokens, cache, code churn, cost, usage, goal, budget). Frames whose `requires` variables
 * are empty are skipped, so a card only shows when there is something real to say.
 */
const F = require('./format');
const { languageOf } = require('./languages');

const LABEL = { thinking: 'Thinking…', working: 'Working', waiting: 'Waiting on you', idle: 'Idle', compacting: 'Compacting', shipped: 'Shipped' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- small helpers ----------

// A cwd that equals the home folder (or is named after the OS user) would print your username on Discord.
function looksLikeUsernameLeak(cwd) {
  if (!cwd) return false;
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const c = norm(cwd);
  for (const h of [process.env.HOME, process.env.USERPROFILE].filter(Boolean)) if (c === norm(h)) return true;
  const base = c.split('/').pop() || '';
  return [process.env.USER, process.env.USERNAME].filter(Boolean).some((u) => base === u.toLowerCase());
}

const dayKey = (d) => d.toLocaleDateString('sv-SE'); // local YYYY-MM-DD
const daysBetween = (aKey, bKey) => Math.round((Date.parse(bKey + 'T00:00:00Z') - Date.parse(aKey + 'T00:00:00Z')) / 864e5);

// sum the per-day buckets from `fromKey` (inclusive) onward
function sumDays(days, fromKey, pick) {
  let n = 0;
  for (const [k, d] of Object.entries(days || {})) if (k >= fromKey) n += pick(d) || 0;
  return n;
}
function mondayKey(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
}

function topOf(map, score) {
  let best = null;
  for (const [k, v] of Object.entries(map || {})) {
    const s = score(v);
    if (!best || s > best.s) best = { k, v, s };
  }
  return best;
}

const MILESTONES_H = [1, 2, 3, 5, 8, 12];

// ---------- template variables ----------

function buildVars(st, agg, cfg, streak, now = Date.now()) {
  const t = st.tokens || {};
  const T = agg.totals || {};
  const days = agg.days || {};
  const todayK = dayKey(new Date(now));
  const day = days[todayK] || {};
  const wk = mondayKey(now);
  const appName = cfg.appName || 'Antigravity';

  const project = cfg.showProject === false || looksLikeUsernameLeak(st.cwd) ? appName : (st.project || appName);
  const modelPretty = F.prettyModel(st.model);
  const sessionTokens = t.total || 0;
  const durMs = st.startedAt ? now - st.startedAt : 0;

  // status wording
  const toolPretty = F.humanTool(st.tool);
  const idleSec = st.status === 'idle' && st.updatedAt ? Math.max(0, (now - st.updatedAt) / 1000) : 0;
  const statusVerbose = {
    working: toolPretty ? `Using ${toolPretty}` : 'Working',
    thinking: 'Thinking',
    compacting: 'Compacting context',
    waiting: 'Waiting on you',
    shipped: 'Just shipped',
    idle: idleSec > 60 ? (idleSec < 3600 ? `Idle · ${Math.floor(idleSec / 60)}m` : `Idle · ${Math.floor(idleSec / 3600)}h`) : 'Standing by',
  }[st.status] || 'Active';

  // current file
  const file = st.currentFile || '';
  const fileLang = file ? languageOf(file) || '' : '';

  // week
  const weekActiveSec = sumDays(days, wk, (d) => d.activeSec);
  const weekPrompts = sumDays(days, wk, (d) => d.prompts);
  const weekTokens = sumDays(days, wk, (d) => d.total);
  const weekCost = sumDays(days, wk, (d) => d.costUsd);

  // streak
  const streakIsMilestone = streak > 0 && (streak % 7 === 0 || [30, 60, 100, 365].includes(streak)) ? 1 : 0;
  const daysSinceFirst = agg.firstSeen ? Math.floor((now - agg.firstSeen) / 864e5) + 1 : 0;

  // hotspot (most edited file)
  const hot = topOf(agg.files, (e) => e.n || 0);
  const hotAgeDays = hot && hot.v.last ? daysBetween(dayKey(new Date(hot.v.last)), todayK) : null;

  // language + code churn
  const lang = topOf(agg.langs, (e) => e.edits || 0);
  const linesAdded = T.linesAdded || 0;
  const linesNet = linesAdded - (T.linesRemoved || 0);

  // model split (share of simulated spend, biggest first)
  const mc = agg.modelCost || {};
  const mcTotal = Object.values(mc).reduce((a, b) => a + b, 0);
  const modelSplitLabel = mcTotal > 0
    ? Object.entries(mc).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([m, c]) => ({ m, pct: Math.round((c / mcTotal) * 100) })).filter((x) => x.pct > 0)
      .map((x) => `${F.prettyModel(x.m)} ${x.pct}%`).join(' · ')
    : '';

  // tokens / cache (cached is a subset of input)
  const allCachePct = (T.input || 0) > 0 ? Math.round(((T.cached || 0) / T.input) * 100) : 0;
  const allFresh = Math.max(0, (T.input || 0) - (T.cached || 0)) + (T.output || 0);

  // cost (simulated); showCost:false hides every cost card
  const costOn = cfg.showCost !== false;
  const todayCost = costOn ? day.costUsd || 0 : 0;
  const allCost = costOn ? T.costUsd || 0 : 0;

  // goals & budget
  const g = cfg.goals || {};
  const pctOf = (cur, target) => (target > 0 ? Math.min(999, Math.round((cur / target) * 100)) : 0);
  const todayH = (day.activeSec || 0) / 3600;
  let goalLabel = '', goalHit = 0;
  if (g.dailyHours > 0) {
    const p = pctOf(todayH, g.dailyHours);
    goalLabel = `${F.hours(day.activeSec)} / ${g.dailyHours}h · ${p}%`; goalHit = p >= 100 ? 1 : 0;
  } else if (g.dailyPrompts > 0) {
    const p = pctOf(day.prompts || 0, g.dailyPrompts);
    goalLabel = `${day.prompts || 0} / ${g.dailyPrompts} prompts · ${p}%`; goalHit = p >= 100 ? 1 : 0;
  } else if (g.weeklyHours > 0) {
    const p = pctOf(weekActiveSec / 3600, g.weeklyHours);
    goalLabel = `${F.hours(weekActiveSec)} / ${g.weeklyHours}h this week · ${p}%`; goalHit = p >= 100 ? 1 : 0;
  }
  const b = cfg.budget || {};
  const mtdCost = costOn ? sumDays(days, todayK.slice(0, 7) + '-01', (d) => d.costUsd) : 0;
  const budgetPct = b.monthly > 0 ? Math.round((mtdCost / b.monthly) * 100) : 0;
  const budgetLabel = b.monthly > 0 ? `${F.usd(mtdCost)} / ${F.usd(b.monthly)} · ${budgetPct}%` : '';

  // session-hour milestone (shown for ~5 min after crossing 1h/2h/3h/5h/8h/12h)
  let sessionMilestoneHit = 0, sessionMilestoneLabel = '';
  if (durMs > 0) {
    for (const h of MILESTONES_H) {
      const ms = h * 3600e3;
      if (durMs >= ms && durMs - ms < 5 * 60e3) { sessionMilestoneHit = 1; sessionMilestoneLabel = `${h}-hour session`; }
    }
  }

  // just shipped
  const kind = st.justShippedKind;
  const branch = st.justShippedBranch;
  const justShippedLabel = {
    push: branch ? `Pushed to ${branch}` : 'Pushed',
    commit: branch ? `Committed on ${branch}` : 'Committed',
    pr: 'Opened a pull request',
    issue: 'Opened an issue',
    tag: 'Tagged a release',
  }[kind] || '';

  // subscription usage = agy quota (only with showQuota:true). The API reports what is LEFT; claude-rpc shows what is USED.
  let usageWeeklyPct = '', usageStateLabel = '';
  if (cfg.showQuota === true) {
    const q = st.quota || {};
    const wkQ = q['gemini-weekly'] || q['3p-weekly'];
    const sessQ = q['gemini-5h'] || q['3p-5h'];
    const used = (x) => (x && typeof x.rem === 'number' ? Math.max(0, Math.min(100, Math.round((1 - x.rem) * 100))) : null);
    const w = used(wkQ), s5 = used(sessQ);
    if (w != null) usageWeeklyPct = w;
    const bits = [];
    if (s5 != null) bits.push(`session ${s5}%`);
    if (wkQ && wkQ.reset > 0) bits.push(`resets ${WEEKDAYS[new Date(now + wkQ.reset * 1000).getDay()]}`);
    if (!bits.length && w != null) bits.push(`weekly ${w}%`);
    usageStateLabel = bits.join(' · ');
  }

  return {
    status: st.status, statusVerbose, project, modelPretty, appName,
    currentToolPretty: toolPretty, currentFilePretty: F.prettyFile(file), fileLang,
    tokensLabel: sessionTokens > 0 ? `${F.tok(sessionTokens)} tokens` : '',
    messagesLabel: F.plural(st.prompts || 0, 'prompt'),
    toolsLabel: F.plural(st.toolCalls || 0, 'tool call'),
    toolElapsed: '', // agy has no PreToolUse event (it fails closed), so a running-tool timer is not available

    // session / tokens
    sessionDuration: F.hours(durMs / 1000),
    inputTokens: F.tok(t.input), outputTokens: F.tok(t.output), cachedTokens: F.tok(t.cached),
    sessionCostFmt: F.usd(costOn ? st.costUsd : 0),
    sessionMilestoneHit, sessionMilestoneLabel,

    // today / week
    todayHours: F.hours(day.activeSec), todayPrompts: day.prompts || 0, todayPromptsLabel: F.plural(day.prompts || 0, 'prompt'),
    todayTokensFmt: F.tok(day.total), todayToolsFmt: F.tok(day.toolCalls), todayCostFmt: F.usd(todayCost),
    weekActiveMs: weekActiveSec * 1000, weekHours: F.hours(weekActiveSec),
    weekPrompts, weekPromptsLabel: F.plural(weekPrompts, 'prompt'), weekTokensFmt: F.tok(weekTokens), weekCostFmt: F.usd(weekCost),

    // streak / lifetime
    streak, streakLabel: streak === 0 ? 'no streak' : `${streak}-day streak`, streakIsMilestone,
    daysSinceFirst, daysSinceFirstLabel: daysSinceFirst ? `Day ${daysSinceFirst}` : '',
    allHours: F.hours(T.activeSec), allSessions: T.sessions || 0, allSessionsLabel: F.plural(T.sessions || 0, 'session'),
    allMessagesFmt: F.tok(T.prompts), allTokensFmt: F.tok(T.total), allTools: T.toolCalls || 0, allToolsFmt: F.tok(T.toolCalls),
    allFilesFmt: F.tok(Object.keys(agg.files || {}).length),
    allFreshTokensFmt: F.tok(allFresh),
    allCachePctLabel: (T.cached || 0) > 0 && allCachePct > 0 ? `${allCachePct}% from cache` : '',

    // hotspot, language, churn, model split
    topEditedFile: hot ? F.baseName(hot.k) : '', topEditedCount: hot ? hot.v.n : 0,
    topEditedCountLabel: hot ? F.plural(hot.v.n, 'edit') : '0 edits',
    topEditedAgeLabel: hotAgeDays == null ? '' : hotAgeDays <= 0 ? 'edited today' : hotAgeDays === 1 ? 'edited yesterday' : `${hotAgeDays}d since last edit`,
    topLanguage: lang ? lang.k : '',
    linesAddedFmt: F.tok(linesAdded), linesNetFmt: F.linesNet(linesNet),
    modelSplitLabel,

    // cost
    allCost, allCostFmt: F.usd(allCost),

    // goals / budget / usage
    goalLabel, goalHit, budgetLabel, budgetPct, usageWeeklyPct, usageStateLabel,

    // shipped / compacting
    justShippedLabel, lastCommit: st.justShippedSubject || '', compactTriggerLabel: 'context squeeze',
  };
}

// ---------- frame selection ----------

function makeCursor() { return { index: 0, lastAt: 0, status: null }; }

function pickFrames(p, status) {
  const sb = (p.byStatus || {})[status] || (p.byStatus || {}).idle;
  if (!sb) return { frames: [{ details: 'Antigravity', state: '' }], largeTpl: null };
  const base = { details: sb.details, state: sb.state };
  const frames = Array.isArray(sb.rotation) && sb.rotation.length ? [base, ...sb.rotation] : [base];
  return { frames, largeTpl: sb.largeImageText || null };
}

// Starts on the base frame after a status change, advances at most once per intervalMs.
function selectFrame(rawFrames, vars, status, cursor, intervalMs, now) {
  if (status !== cursor.status) { cursor.index = 0; cursor.lastAt = now; cursor.status = status; }
  const passing = rawFrames.filter((f) => F.framePasses(f, vars));
  const frames = passing.length ? passing : rawFrames.slice(0, 1);
  if (frames.length > 1 && now - cursor.lastAt >= intervalMs) {
    cursor.index = (cursor.index + 1) % frames.length;
    cursor.lastAt = now;
  }
  return frames[cursor.index % frames.length] || frames[0];
}

// ---------- public API ----------

// overlay statuses reuse the art of a base status (same idea as statusIcons in claude-rpc)
const ART = { shipped: 'working', compacting: 'thinking' };
const artOf = (status) => ART[status] || status;

function largeImage(st, cfg) {
  const s = artOf(st.status);
  const own = cfg.largeImages && cfg.largeImages[s];
  if (own) return own;
  if (cfg.gifBaseUrl) return `${String(cfg.gifBaseUrl).replace(/\/+$/, '')}/${s}.gif`;
  return cfg.largeImageKey;
}

function buildActivity(st, agg, cfg, streak, cursor, now = Date.now()) {
  const vars = buildVars(st, agg, cfg, streak, now);
  const p = cfg.presence;
  const { frames, largeTpl } = pickFrames(p, st.status);
  const intervalMs = Math.max(15, Number(cfg.rotateSec) || 15) * 1000; // Discord needs >= 15s between updates
  const frame = cfg.rotate === false ? frames[0] : selectFrame(frames, vars, st.status, cursor, intervalMs, now);

  const fill = (tpl) => F.fillTemplate(tpl || '', vars);
  const perStatus = largeTpl ? fill(largeTpl) : '';
  // "Working on a  file" (no language known) is useless: fall back to the generic lifetime line
  const largeText = perStatus && !/\s{2}/.test(perStatus) && !/\{\w+\}/.test(perStatus) ? perStatus : fill(p.largeImageText);
  const showSmall = cfg.showSmallImage !== false;
  const smallKey = (cfg.smallImages || {})[artOf(st.status)] || artOf(st.status);

  return {
    details: fill(frame.details).slice(0, 128).padEnd(2),
    state: fill(frame.state).slice(0, 128).padEnd(2),
    timestamps: { start: Math.floor(st.startedAt / 1000) },
    assets: {
      large_image: largeImage(st, cfg),
      large_text: largeText.slice(0, 128).padEnd(2),
      small_image: showSmall ? smallKey : undefined,
      small_text: showSmall ? fill(p.smallImageText).slice(0, 128).padEnd(2) : undefined,
    },
    instance: false,
  };
}

// What the card should treat the session as right now (null = hide the card).
function effective(st, cfg, now = Date.now()) {
  if (!st) return null;
  const age = (now - st.updatedAt) / 1000;
  const hideAfter = Number(cfg.hideAfterSec) > 0 ? Number(cfg.hideAfterSec) : 1800;
  if (st.ended || age > hideAfter) return null; // agy has no SessionEnd, so inactivity hides the card
  const copy = { ...st };
  if ((st.status === 'thinking' || st.status === 'working') && age > cfg.idleAfterSec) { copy.status = 'idle'; copy.tool = null; copy.currentFile = null; }
  if (st.status === 'waiting' && age > 30 * 60) { copy.status = 'idle'; }
  // brief overlays, like claude-rpc: compaction first, a fresh push / commit wins over everything
  if (st.compactedAt && now - st.compactedAt >= 0 && now - st.compactedAt < Math.max(5, Number(cfg.compactFrameSec) || 10) * 1000) copy.status = 'compacting';
  const shipSec = cfg.shippedFrameSec ?? 60;
  if (shipSec > 0 && st.justShipped && now - st.justShipped >= 0 && now - st.justShipped < Math.max(5, shipSec) * 1000) copy.status = 'shipped';
  return copy;
}

const DEFAULT_ORDER = []; // kept for compatibility: card order now comes from presence.byStatus in config.js

module.exports = { buildActivity, buildVars, makeCursor, effective, LABEL, DEFAULT_ORDER };
