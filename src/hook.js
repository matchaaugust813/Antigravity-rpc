'use strict';
/*
 * Entry point for agy (Antigravity CLI) hooks. The event name comes from the command line
 * (`antigravity-rpc hook PreInvocation`), with the payload's own event field as a fallback.
 * Hooks run inside the agent loop: be fast, print only JSON, ALWAYS exit 0.
 * PreToolUse is deliberately NOT used: agy requires a permission decision from it and fails closed.
 *
 * PostToolUse payload (agy docs): { toolCall: { name, args }, stepIdx, error?, modelName, workspacePaths, ... }
 * Tool args are PascalCase: CommandLine/Cwd (run_command), TargetFile (write_to_file, replace_file_content),
 * AbsolutePath (view_file). Everything below is tolerant: a missing field just means that card stays empty.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('./state');
const C = require('./common');
const { loadConfig } = require('./config');
const { languageOf } = require('./languages');
const { classifyShip } = require('./ships');

const ACTIVE = new Set(['thinking', 'working']);
const EDIT_TOOL = /write|replace|edit|patch/i;

function parseArgs(a) {
  if (a && typeof a === 'object') return a;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch (_) {} }
  return {};
}
function toolCallOf(input) {
  const tc = input.toolCall || input.tool_call || {};
  return {
    name: tc.name || input.toolName || input.tool_name || 'tool',
    args: parseArgs(tc.args || tc.arguments || tc.input || input.toolInput || input.tool_input),
  };
}
const str = (v) => (typeof v === 'string' ? v : '');
const firstStr = (o, keys) => { for (const k of keys) if (str(o[k])) return o[k]; return ''; };
const countLines = (s) => (s ? String(s).replace(/\n$/, '').split('\n').length : 0);

function fileOf(args) {
  return firstStr(args, ['TargetFile', 'AbsolutePath', 'targetFile', 'absolutePath', 'file_path', 'filePath', 'path', 'File', 'file']);
}
function commandOf(args) {
  return firstStr(args, ['CommandLine', 'commandLine', 'command', 'Command', 'cmd']);
}
// lines written / removed by an edit tool, from whatever content arguments agy sent
function churn(args) {
  let add = countLines(firstStr(args, ['CodeContent', 'codeContent', 'content', 'Content', 'new_string', 'newString', 'ReplacementContent', 'replacementContent']));
  let rem = countLines(firstStr(args, ['TargetContent', 'targetContent', 'old_string', 'oldString']));
  const chunks = args.ReplacementChunks || args.replacementChunks;
  if (Array.isArray(chunks)) {
    for (const c of chunks) {
      if (!c || typeof c !== 'object') continue;
      add += countLines(firstStr(c, ['ReplacementContent', 'replacementContent']));
      rem += countLines(firstStr(c, ['TargetContent', 'targetContent']));
    }
  }
  return { add, rem };
}

function gitBranch(cwd) {
  try {
    const head = fs.readFileSync(path.join(cwd, '.git', 'HEAD'), 'utf8').trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return m ? m[1] : '';
  } catch (_) { return ''; }
}
function lastCommitSubject(cwd) {
  try {
    return execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd, encoding: 'utf8', timeout: 1200, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim().slice(0, 120);
  } catch (_) { return ''; }
}

function onTool(input, st, agg, cfg, now) {
  const { name, args } = toolCallOf(input);
  const failed = !!str(input.error);
  const file = fileOf(args);
  const cmd = commandOf(args);

  st.status = 'working'; st.tool = name; st.toolCalls++;
  st.currentFile = file || null;
  S.bump(agg, { toolCalls: 1 });
  S.note(agg, 'tools', name);

  if (file && EDIT_TOOL.test(name) && !failed) {
    const { add, rem } = churn(args);
    S.bump(agg, { linesAdded: add, linesRemoved: rem });
    S.noteLang(agg, languageOf(file));
    S.noteFile(agg, file, now);
  }

  // "just shipped": a shell command that pushed / committed / opened a PR or issue (a failed command shipped nothing)
  if (cmd && !failed) {
    const kind = classifyShip(cmd);
    if (kind) {
      const cwd = str(args.Cwd) || str(args.cwd) || st.cwd || process.cwd();
      st.justShipped = now;
      st.justShippedKind = kind;
      st.justShippedBranch = gitBranch(cwd);
      st.justShippedSubject = (kind === 'commit' || kind === 'push') ? lastCommitSubject(cwd) : '';
    }
  }
}

function handle(input, eventArg) {
  const cfg = loadConfig();
  const ev = eventArg || input.hookEventName || input.hook_event_name || input.event || '';
  const now = Date.now();
  const agg = S.readAgg();
  C.sample('hook:' + ev, input, cfg);

  const { st, fresh } = C.resolveSession(input, agg, now);
  if (!st.model && str(input.modelName)) st.model = input.modelName; // statusLine may refine it later

  // active time: only count gaps while the agent was actually thinking/working
  const gap = (now - (st.updatedAt || now)) / 1000;
  if (!fresh && ACTIVE.has(st.status) && gap > 0 && gap < 300) S.bump(agg, { activeSec: gap });

  st.ended = false;
  switch (ev) {
    case 'SessionStart':
      st.status = 'idle'; st.tool = null; st.currentFile = null;
      C.ensureDaemon();
      break;
    case 'PreInvocation':
      if (!st.turnOpen) { st.turnOpen = true; st.prompts++; S.bump(agg, { prompts: 1 }); } // first invocation of a turn = one prompt
      st.status = 'thinking'; st.tool = null; st.currentFile = null; st.requests++;
      S.bump(agg, { requests: 1 });
      C.ensureDaemon();
      break;
    case 'PostInvocation':
      st.status = 'thinking'; st.tool = null; st.currentFile = null;
      break;
    case 'PostToolUse':
      onTool(input, st, agg, cfg, now);
      break;
    case 'Stop':
      st.turnOpen = false;
      st.status = 'waiting'; st.tool = null; st.currentFile = null;
      break;
    default:
      break;
  }
  st.updatedAt = now;
  S.writeState(st);
  S.writeAgg(agg);
  return st;
}

async function main(args = []) {
  try {
    const raw = await C.readStdin(1500);
    const input = C.parseJSON(raw) || {};
    handle(input, args[0]);
  } catch (e) { C.logErr('hook', e); }
  process.stdout.write('{}\n', () => process.exit(0));
}

module.exports = { handle, main };
