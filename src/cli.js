'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const S = require('./state');
const F = require('./format');
const { loadConfig, saveConfig } = require('./config');

const HELP = `antigravity-rpc — Discord Rich Presence for Antigravity CLI (agy)

  antigravity-rpc setup [--client-id ID]   install hooks + statusLine (+ save your Discord app ID)
        [--hooks-file F] [--settings-file F]   override agy's file locations if yours differ
  antigravity-rpc uninstall                remove hooks + statusLine again (restores your old statusLine)
  antigravity-rpc start [--foreground]     start the background daemon
  antigravity-rpc stop                     stop the daemon (clears the Discord card)
  antigravity-rpc status                   live state, tokens, simulated cost
  antigravity-rpc stats                    lifetime stats
  antigravity-rpc pause | resume           hide / show the Discord card
  antigravity-rpc dashboard                open the local dashboard
  antigravity-rpc demo                     fake an agy session to preview the card
  antigravity-rpc debug on|off|show        record the SHAPE of agy payloads (keys only) to help fix mismatches
`;

const flag = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function startDetached() {
  const D = require('./daemon');
  if (D.isRunning()) return false;
  fs.mkdirSync(P.tmp, { recursive: true });
  const out = fs.openSync(P.log, 'a');
  spawn(process.execPath, [path.resolve(__dirname, '..', 'bin', 'antigravity-rpc.js'), 'start', '--foreground'],
    { detached: true, stdio: ['ignore', out, out], windowsHide: true }).unref();
  return true;
}

function openUrl(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (_) {}
}

function printStatus() {
  const cfg = loadConfig();
  const { effective } = require('./presence');
  const st = effective(S.readState(), cfg);
  const D = require('./daemon');
  console.log(`daemon     : ${D.isRunning() ? 'running' : 'stopped'}${fs.existsSync(P.pause) ? ' (card paused)' : ''}`);
  console.log(`discord id : ${/^YOUR/.test(cfg.clientId) ? 'NOT SET — run: antigravity-rpc setup --client-id 123456789012345678' : cfg.clientId}`);
  if (!st) { console.log('session    : none (start agy)'); return; }
  const t = st.tokens;
  console.log(`session    : ${st.project || '-'} · ${F.prettyModel(st.model)} · ${st.status}${st.tool ? ' (' + st.tool + ')' : ''} · ${F.dur((Date.now() - st.startedAt) / 1000)}`);
  console.log(`tokens     : ${F.tok(t.total)} total (in ${F.tok(t.input)}, out ${F.tok(t.output)}, cached ${F.tok(t.cached)})${t.total ? '' : '  [no token data yet — is the statusLine on? run /statusline on in agy]'}`);
  console.log(`prompts    : ${st.prompts} · tool calls ${st.toolCalls} · requests ${st.requests}`);
  console.log(`est. cost  : ${F.usd(st.costUsd)}${cfg.idrRate ? ' (' + F.idr(st.costUsd, cfg.idrRate) + ')' : ''}  [SIMULATION]`);
  const q = st.quota || {};
  const a = q['gemini-5h'], w = q['gemini-weekly'];
  if (a || w) console.log(`quota      : 5h ${a ? Math.round(a.rem * 100) + '% left' : '-'} · weekly ${w ? Math.round(w.rem * 100) + '% left' : '-'}`);
}

function printStats() {
  const cfg = loadConfig(), a = S.readAgg(), t = a.totals;
  console.log(`tokens     : ${F.tok(t.total)} (in ${F.tok(t.input)}, out ${F.tok(t.output)}, cached ${F.tok(t.cached)})`);
  console.log(`est. cost  : ${F.usd(t.costUsd)}${cfg.idrRate ? ' (' + F.idr(t.costUsd, cfg.idrRate) + ')' : ''}  [simulation]`);
  console.log(`sessions   : ${t.sessions} · prompts ${t.prompts} · tool calls ${t.toolCalls} · requests ${t.requests}`);
  console.log(`active time: ${F.dur(t.activeSec)} · streak ${S.streak(a)} day(s)`);
}

async function demo() {
  const { handle } = require('./hook');
  const { applyStatus } = require('./statusline');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  startDetached();                          // daemon must NOT inherit demo mode (it reads real stats)
  process.env.ANTIGRAVITY_RPC_DEMO = '1';   // from here on only this process writes to the demo aggregate
  const cfg = loadConfig();
  const sid = 'demo-' + Date.now();
  const base = { conversationId: sid, workspacePaths: [process.cwd()] };
  let inT = 0, outT = 0;
  const model = { id: 'gemini-3-pro', display_name: 'Gemini 3 Pro' };
  const ev = (name, extra = {}) => handle({ ...base, ...extra }, name);
  const sl = (state) => applyStatus({ conversation_id: sid, cwd: process.cwd(), model, agent_state: state,
    context_window: { total_input_tokens: inT, total_output_tokens: outT, current_usage: { cache_read_input_tokens: Math.round(inT * 0.4) } },
    quota: { 'gemini-5h': { remaining_fraction: 0.82, reset_in_seconds: 9000 }, 'gemini-weekly': { remaining_fraction: 0.64 } } }, cfg);
  console.log('Running demo session (~25s). Watch your Discord profile / dashboard. Ctrl+C to stop.');
  ev('SessionStart'); sl('idle'); await sleep(2000);
  for (let turn = 1; turn <= 3; turn++) {
    ev('PreInvocation'); sl('thinking'); inT += 6000; await sleep(1500);
    const cwd = process.cwd();
    const tools = [
      { name: 'view_file', args: { AbsolutePath: path.join(cwd, 'src', 'index.ts') } },
      { name: 'write_to_file', args: { TargetFile: path.join(cwd, 'src', 'index.ts'), CodeContent: 'export const a = 1;\nexport const b = 2;\n' } },
      turn === 3 ? { name: 'run_command', args: { CommandLine: 'git commit -m "demo"', Cwd: cwd } } : { name: 'run_command', args: { CommandLine: 'npm test', Cwd: cwd } },
    ];
    for (const toolCall of tools) {
      sl('tool_use'); ev('PostToolUse', { toolCall }); outT += 300; inT += 2500; sl('working'); await sleep(1500);
      sl('thinking'); await sleep(500);
    }
    ev('PostInvocation'); outT += 900; sl('thinking'); await sleep(1000);
    ev('Stop'); sl('idle'); await sleep(2500);
  }
  console.log('Demo finished.');
  printStatus();
}

function debugCmd(args) {
  const sub = args[1];
  if (sub === 'on' || sub === 'off') { saveConfig({ debug: sub === 'on' }); console.log(`debug ${sub}`); return; }
  const all = S.readJSON(P.samples, null);
  if (!all) { console.log('no samples yet. Run: antigravity-rpc debug on — then use agy for a minute.'); return; }
  console.log(JSON.stringify(all, null, 2));
}

async function main(args) {
  const cmd = args[0];
  switch (cmd) {
    case 'hook': return require('./hook').main(args.slice(1));
    case 'statusline': return require('./statusline').main();
    case 'setup': {
      const id = flag(args, '--client-id');
      if (id) saveConfig({ clientId: id });
      else if (!fs.existsSync(P.config)) saveConfig({});
      const Setup = require('./setup');
      try { console.log(`✓ Hooks installed in ${Setup.installHooks(flag(args, '--hooks-file') || P.hooksFile)}`); }
      catch (e) { console.error(`! Could not edit hooks file: ${e.message}\n  Add the hooks manually (see README).`); }
      try { console.log(`✓ statusLine (token feed) in ${Setup.installStatusLine(flag(args, '--settings-file') || P.settingsFile())}`); }
      catch (e) { console.error(`! Could not edit agy settings: ${e.message}\n  Tokens need the statusLine — see README.`); }
      console.log(`✓ Config: ${P.config}`);
      if (!id && /^YOUR/.test(loadConfig().clientId)) console.log('! Set your Discord Application ID:  antigravity-rpc setup --client-id 123456789012345678');
      console.log('Restart agy. Inside agy: /hooks to check the hooks, /statusline on if the status bar is off.');
      return;
    }
    case 'uninstall': {
      const Setup = require('./setup');
      console.log(Setup.uninstallHooks(flag(args, '--hooks-file') || P.hooksFile) ? '✓ Hooks removed' : 'No hooks to remove');
      console.log(Setup.uninstallStatusLine(flag(args, '--settings-file') || P.settingsFile()) ? '✓ statusLine removed/restored' : 'No statusLine to remove');
      require('./daemon').stop();
      return;
    }
    case 'start':
      if (args.includes('--foreground')) return require('./daemon').run();
      console.log(startDetached() ? 'daemon started' : 'daemon already running');
      return;
    case 'stop': console.log(require('./daemon').stop() ? 'daemon stopped' : 'daemon not running'); return;
    case 'status': return printStatus();
    case 'stats': return printStats();
    case 'pause': fs.mkdirSync(P.tmp, { recursive: true }); fs.writeFileSync(P.pause, JSON.stringify({ at: Date.now() })); console.log('card paused'); return;
    case 'resume': try { fs.unlinkSync(P.pause); } catch (_) {} console.log('card resumed'); return;
    case 'dashboard': {
      startDetached();
      const url = `http://localhost:${loadConfig().dashboardPort}`;
      console.log(url); setTimeout(() => openUrl(url), 800); setTimeout(() => process.exit(0), 1200);
      return;
    }
    case 'demo': return demo();
    case 'debug': return debugCmd(args);
    default: console.log(HELP);
  }
}

module.exports = { main };
