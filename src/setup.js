'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { loadConfig, saveConfig } = require('./config');

const NAME = 'antigravity-rpc';
// agy has no SessionEnd. PreToolUse is skipped on purpose: it needs a permission decision and agy fails
// closed on a missing one (it would also bypass the permission prompts). Tool events use the grouped shape,
// the others a flat handler array.
const FLAT = ['SessionStart', 'PreInvocation', 'PostInvocation', 'Stop'];
const TOOL = ['PostToolUse'];
const EVENTS = [...FLAT, ...TOOL];

function stripComments(s) {
  return s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '');
}
function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch (_) {}
  return JSON.parse(stripComments(raw).replace(/,(\s*[}\]])/g, '$1')); // throws if still invalid
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bak = file + '.antigravity-rpc.bak';
  if (fs.existsSync(file) && !fs.existsSync(bak)) fs.copyFileSync(file, bak);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function bin() { return path.resolve(__dirname, '..', 'bin', 'antigravity-rpc.js'); }
// agy wants an absolute path to the script; `node` itself is resolved from PATH on Windows
// (set "nodeCommand" in config.json to pin a full node.exe path).
function command(sub) {
  const cfg = loadConfig();
  const node = cfg.nodeCommand || (process.platform === 'win32' ? 'node' : process.execPath);
  // agy splits the command itself (no shell): literal quote characters end up inside the path and break it,
  // so only quote when the path really contains a space.
  const q = (s) => (/\s/.test(s) ? `"${s}"` : s);
  return `${q(node)} ${q(bin())} ${sub}`;
}

function installHooks(file = P.hooksFile) {
  const doc = readJson(file);
  const group = {};
  for (const ev of FLAT) group[ev] = [{ type: 'command', command: command(`hook ${ev}`), timeout: 5 }];
  for (const ev of TOOL) group[ev] = [{ matcher: '*', hooks: [{ type: 'command', command: command(`hook ${ev}`), timeout: 5 }] }];
  doc[NAME] = group;
  writeJson(file, doc);
  return file;
}
function uninstallHooks(file = P.hooksFile) {
  if (!fs.existsSync(file)) return false;
  const doc = readJson(file);
  if (!(NAME in doc)) return false;
  delete doc[NAME];
  writeJson(file, doc);
  return true;
}

const isOurs = (sl) => !!(sl && typeof sl.command === 'string' && sl.command.includes('antigravity-rpc') && sl.command.includes('statusline'));

function installStatusLine(file = P.settingsFile()) {
  const doc = readJson(file);
  if (doc.statusLine && !isOurs(doc.statusLine)) saveConfig({ previousStatusLine: doc.statusLine }); // keep it to chain / restore
  doc.statusLine = { type: 'command', command: command('statusline'), padding: 0 };
  writeJson(file, doc);
  return file;
}
function uninstallStatusLine(file = P.settingsFile()) {
  if (!fs.existsSync(file)) return false;
  const doc = readJson(file);
  if (!isOurs(doc.statusLine)) return false;
  const prev = loadConfig().previousStatusLine;
  if (prev) doc.statusLine = prev; else delete doc.statusLine;
  writeJson(file, doc);
  return true;
}

module.exports = { installHooks, uninstallHooks, installStatusLine, uninstallStatusLine, command, EVENTS };
