'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = process.env.ANTIGRAVITY_RPC_TMP || path.join(os.tmpdir(), 'antigravity-rpc');
const home = process.env.ANTIGRAVITY_RPC_HOME || path.join(os.homedir(), '.antigravity-rpc');

// agy reads hooks from hooks.json (NOT settings.json). Global default: ~/.gemini/config/hooks.json.
// statusLine lives in agy's settings.json. Both can be overridden: `setup --hooks-file F --settings-file F`.
const hooksFile = process.env.ANTIGRAVITY_HOOKS_FILE || path.join(os.homedir(), '.gemini', 'config', 'hooks.json');
function settingsFile() {
  if (process.env.ANTIGRAVITY_SETTINGS_FILE) return process.env.ANTIGRAVITY_SETTINGS_FILE;
  const main = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
  const alt = process.env.APPDATA ? path.join(process.env.APPDATA, 'antigravity-cli', 'settings.json') : null;
  if (!fs.existsSync(main) && alt && fs.existsSync(alt)) return alt; // some Windows installs use %APPDATA%
  return main;
}

module.exports = {
  tmp,
  home,
  state: path.join(tmp, 'state.json'),
  pause: path.join(tmp, 'pause.json'),
  pid: path.join(tmp, 'daemon.pid'),
  log: path.join(tmp, 'daemon.log'),
  samples: path.join(tmp, 'samples.json'),
  config: path.join(home, 'config.json'),
  // demo mode writes lifetime stats to a separate file so real stats stay clean
  aggregate: () => path.join(home, process.env.ANTIGRAVITY_RPC_DEMO ? 'aggregate.demo.json' : 'aggregate.json'),
  hooksFile,
  settingsFile,
};
