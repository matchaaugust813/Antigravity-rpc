'use strict';

const tok = (n) => {
  n = Math.max(0, Math.round(n || 0));
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
};
const usd = (n) => '$' + ((n || 0) < 0.01 ? (n || 0).toFixed(4) : (n || 0).toFixed(2));
const idr = (n, rate) => 'Rp ' + Math.round((n || 0) * rate).toLocaleString('id-ID');
const dur = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${sec}s`;
};
const prettyModel = (id) => {
  if (!id) return 'Antigravity';
  return String(id).replace(/^models\//, '').split('-')
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
};
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time


// ---- helpers ported from claude-rpc (card templates) ----
const fmtNum = tok;
// seconds -> "42m" / "2.5h" / "12h" (claude-rpc fmtHours, but takes seconds)
const hours = (sec) => {
  const mins = Math.round(Math.max(0, sec || 0) / 60);
  if (mins < 60) return `${mins}m`;
  const h = mins / 60;
  return h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`;
};
const plural = (n, sing, plur) => `${tok(n)} ${n === 1 ? sing : (plur || sing + 's')}`;
const linesNet = (n) => (!n ? '0' : `${n > 0 ? '+' : '−'}${tok(Math.abs(n))}`);

const TOOL_NAMES = {
  run_command: 'Run command', command_status: 'Command status', send_command_input: 'Terminal input',
  view_file: 'Read file', view_file_outline: 'File outline', view_code_item: 'Read code',
  write_to_file: 'Write file', replace_file_content: 'Edit file', multi_replace_file_content: 'Edit file',
  list_dir: 'List files', find_by_name: 'Find files', grep_search: 'Search code', codebase_search: 'Search code',
  read_url_content: 'Fetch URL', search_web: 'Web search', browser_subagent: 'Browser', generate_image: 'Image',
};
const humanTool = (name) => {
  if (!name) return '';
  if (TOOL_NAMES[name]) return TOOL_NAMES[name];
  const n = String(name).replace(/^mcp[_-]+/i, '').replace(/[_-]+/g, ' ').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
};
// "C:\repo\src\app\page.tsx" -> "src/app/page.tsx" (last 3 segments)
const prettyFile = (p) => {
  if (!p) return '';
  const parts = String(p).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.slice(-3).join('/');
};
const baseName = (p) => String(p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';

// "{a} · {b}" templates: drop empty segments so a missing value leaves no orphan separator
function collapse(s) {
  if (!s.includes('·')) return s;
  return s.split('·').map((p) => p.trim()).filter(Boolean).join(' · ');
}
function fillTemplate(tpl, vars) {
  if (typeof tpl !== 'string') return tpl;
  return collapse(tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)));
}
// a frame is shown only when every var in `requires` is non-empty / non-zero
function framePasses(frame, vars) {
  const req = frame.requires;
  if (!req) return true;
  for (const k of Array.isArray(req) ? req : [req]) {
    const v = vars[k];
    if (v === undefined || v === null || v === 0 || v === '' || v === '0' || v === '—') return false;
  }
  return true;
}

module.exports = { tok, fmtNum, usd, idr, dur, hours, plural, linesNet, humanTool, prettyFile, baseName, fillTemplate, framePasses, prettyModel, today };
