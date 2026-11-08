'use strict';
const fs = require('fs');
const P = require('./paths');

const DEFAULTS = {
  // Create an app at https://discord.com/developers/applications and paste its Application ID here.
  clientId: '1566421233719840768',
  dashboardPort: 4790,        // gemini-rpc uses 4789, so both can coexist
  idleAfterSec: 300,          // thinking/working with no events for this long => shown as idle
  hideAfterSec: 1800,         // agy has no SessionEnd event: hide the card after this long without any activity
  showProject: true,
  showCost: true,             // cost is a SIMULATION (see src/pricing.js)
  priceAs: 'sonnet',          // bill every model at Claude prices: sonnet | opus | haiku | fable  ("" = per-model table)
  idrRate: 16500,             // 1 USD in IDR for the dashboard; set 0 to hide IDR
  appName: 'Antigravity',     // shown instead of the project when it would leak your OS username (home folder)
  shippedFrameSec: 60,        // how long the "Pushed to main" card stays after a git push / commit
  compactFrameSec: 10,        // how long the "Compacting context" card stays after a context drop
  goals: { dailyHours: 0, dailyPrompts: 0, weeklyHours: 0 }, // > 0 enables the "Daily goal" card
  budget: { monthly: 0, warnAtPct: 80 },                      // USD; > 0 enables the "Monthly budget" card
  showQuota: false,           // quota page (agy 5h / weekly limits) on the card
  rotate: true,
  rotateSec: 15,              // >= 15 (Discord rate limit)
  showSmallImage: true,
  largeImageKey: 'antigravity', // upload art assets with these names in your Discord app
  largeImages: {},
  gifBaseUrl: 'https://raw.githubusercontent.com/matchaaugust813/alien_ungu/main/alien',
  smallImages: { working: 'working', thinking: 'thinking', waiting: 'waiting', idle: 'idle' },
  pricing: {},                // override per-model prices, e.g. {"gemini-3-pro":{"in":1.25,"out":10,"cache":0.31}}
  nodeCommand: '',            // override the node executable used in hooks, e.g. "C:\\Program Files\\nodejs\\node.exe"
  chainStatusLine: true,      // keep running your previous statusLine command and show its output
  debug: false,               // record the SHAPE (keys/types only, no values) of agy payloads -> `antigravity-rpc debug show`
};


// Card templates, ported 1:1 from claude-rpc. Each status renders one base frame; frames in `rotation` cycle after it.
// A frame with `requires` is skipped until every listed variable is non-empty / non-zero. Override any part in
// config.json under "presence" (e.g. {"presence":{"byStatus":{"idle":{"details":"..."}}}}).
const IDLE_ROTATION = [
  { details: 'This week · {weekHours}',              state: '{weekPromptsLabel} · {weekTokensFmt} tokens',      requires: ['weekActiveMs'] },
  { details: '{streakLabel}',                        state: '{daysSinceFirstLabel} · {allSessionsLabel}',       requires: ['streakIsMilestone'] },
  { details: 'Hotspot · {topEditedFile}',            state: '{topEditedCountLabel} · {topEditedAgeLabel}',      requires: ['topEditedCount'] },
  { details: 'Model split',                          state: '{modelSplitLabel}',                                requires: ['modelSplitLabel'] },
  { details: '{allHours} on Antigravity all-time',   state: '{allSessionsLabel} · {allMessagesFmt} prompts',    requires: ['allSessions'] },
  { details: 'Lifetime · {allTokensFmt} tokens',     state: '{allToolsFmt} tool calls · {allFilesFmt} files',   requires: ['allTools'] },
  { details: '{allFreshTokensFmt} fresh tokens',     state: '{allCachePctLabel}',                               requires: ['allCachePctLabel'] },
  { details: 'Code churn · {linesAddedFmt} added',   state: '{linesNetFmt} net · {topLanguage}',                requires: ['topLanguage'] },
  { details: 'Cost · {todayCostFmt} today',          state: '{allCostFmt} all-time',                            requires: ['allCost'] },
  { details: 'Usage · {usageWeeklyPct}% weekly',     state: '{usageStateLabel}',                                requires: ['usageWeeklyPct', 'usageStateLabel'] },
  { details: 'Daily goal',                           state: '{goalLabel}',                                      requires: ['goalLabel'] },
  { details: 'Monthly budget',                       state: '{budgetLabel}',                                    requires: ['budgetLabel'] },
];

const DEFAULT_PRESENCE = {
  largeImageText: '{modelPretty} · {allHours} on Antigravity · {streakLabel}',
  smallImageText: '{statusVerbose}',
  byStatus: {
    working: {
      details: 'Working in {project}',
      state: '{currentToolPretty} · {currentFilePretty} · {tokensLabel}',
      largeImageText: 'Working on a {fileLang} file',
      rotation: [
        { details: '{sessionMilestoneLabel} · {project}', state: '{tokensLabel} · {messagesLabel}', requires: ['sessionMilestoneHit'] },
        { details: 'Usage · {usageWeeklyPct}% weekly', state: '{usageStateLabel}', requires: ['usageWeeklyPct', 'usageStateLabel'] },
      ],
    },
    thinking: {
      details: 'Thinking in {project}',
      state: '{modelPretty} · {messagesLabel} · {tokensLabel}',
      largeImageText: 'Reasoning with {modelPretty}',
    },
    compacting: {
      details: 'Compacting context in {project}',
      state: '{modelPretty} · {messagesLabel}',
      largeImageText: 'Compacting · {compactTriggerLabel}',
    },
    shipped: {
      details: '{justShippedLabel} · {project}',
      state: '{lastCommit}',
      largeImageText: '{justShippedLabel}',
    },
    // agy finished its turn and waits for you (claude-rpc: "notification"), then cycles through the stat cards
    waiting: {
      details: 'Waiting on you · {project}',
      state: '{modelPretty} · {messagesLabel}',
      largeImageText: 'Your turn',
      rotation: IDLE_ROTATION,
    },
    idle: {
      details: 'Idle in {project}',
      state: '{modelPretty} · {todayHours} today',
      largeImageText: 'Idle · {modelPretty}',
      rotation: IDLE_ROTATION,
    },
  },
};

function loadConfig() {
  let user = {};
  try { user = JSON.parse(fs.readFileSync(P.config, 'utf8')); } catch (_) {}
  return {
    ...DEFAULTS, ...user,
    freeTier: { enabled: false, dailyLimit: 0, perMinuteLimit: 0 },
    smallImages: { ...DEFAULTS.smallImages, ...(user.smallImages || {}) },
    largeImages: { ...(user.largeImages || {}) },
    pricing: { ...(user.pricing || {}) },
    goals: { ...DEFAULTS.goals, ...(user.goals || {}) },
    budget: { ...DEFAULTS.budget, ...(user.budget || {}) },
    presence: mergePresence(user.presence),
  };
}

function mergePresence(user) {
  user = user && typeof user === 'object' ? user : {};
  const byStatus = {};
  for (const k of new Set([...Object.keys(DEFAULT_PRESENCE.byStatus), ...Object.keys(user.byStatus || {})])) {
    byStatus[k] = { ...(DEFAULT_PRESENCE.byStatus[k] || {}), ...((user.byStatus || {})[k] || {}) };
  }
  return { ...DEFAULT_PRESENCE, ...user, byStatus };
}

function saveConfig(patch) {
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(P.config, 'utf8')); } catch (_) {}
  fs.mkdirSync(P.home, { recursive: true });
  fs.writeFileSync(P.config, JSON.stringify({ ...cur, ...patch }, null, 2));
}

module.exports = { DEFAULTS, DEFAULT_PRESENCE, loadConfig, saveConfig };
