'use strict';
// "Ship" classification — deciding whether a shell command published work to
// the world (commit, push, PR, issue, release). Shared by the hook (live
// celebration frame) and the scanner (per-day ship counts in aggregate.json),
// so both surfaces agree on what counts as shipping.

// Precedence when a command ships more than one way (`git commit && git push`
// → push). Highest first.
const SHIP_PRECEDENCE = ['push', 'commit', 'pr', 'issue', 'tag'];

// Tokenize one command segment the way a shell roughly would for our purposes:
// strip leading env assignments (FOO=bar) and sudo/time wrappers, drop the path
// from the leading binary (/usr/bin/git → git), lowercase it.
function tokenizeSegment(seg) {
  const stripped = seg.replace(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+/, '').trim();
  let toks = stripped.split(/\s+/).filter(Boolean);
  while (toks.length && (toks[0] === 'sudo' || toks[0] === 'time')) toks = toks.slice(1);
  if (toks.length) {
    const slash = toks[0].lastIndexOf('/');
    if (slash !== -1) toks[0] = toks[0].slice(slash + 1);
    toks[0] = toks[0].toLowerCase();
  }
  return toks;
}

// First real git subcommand, skipping global flags and their values
// (`git -C /repo -c k=v push` → push).
function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-C' || a === '-c') { i++; continue; } // flag that takes a value
    if (a.startsWith('-')) continue;
    return a.toLowerCase();
  }
  return null;
}

// First two gh positionals (noun, verb), skipping global flags so the canonical
// targeted form `gh -R owner/repo pr create` still classifies. -R/--repo take a
// value; other globals here don't precede a create, so skipping the rest is safe.
function ghSubcommand(args) {
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-R' || a === '--repo') { i++; continue; } // flag that takes a value
    if (a.startsWith('-')) continue;
    pos.push(a.toLowerCase());
    if (pos.length === 2) break;
  }
  return { noun: pos[0], verb: pos[1] };
}

function shipKindForSegment(seg) {
  const toks = tokenizeSegment(seg);
  if (!toks.length) return null;
  if (toks[0] === 'git') {
    const sub = gitSubcommand(toks.slice(1));
    if (sub === 'push') return 'push';
    if (sub === 'commit') return 'commit';
  } else if (toks[0] === 'gh') {
    const { noun, verb } = ghSubcommand(toks.slice(1));
    if (noun === 'pr' && verb === 'create') return 'pr';
    if (noun === 'issue' && verb === 'create') return 'issue';
    if (noun === 'release' && verb === 'create') return 'tag';
  }
  return null;
}

// Return the "shipped" kind for a shell command, or null. Exported for tests.
// Splits on shell separators and only classifies a segment whose *actual*
// leading command is git/gh — so a quoted mention ("git push later" inside an
// echo or a commit message) no longer false-fires. Tolerates env prefixes,
// sudo/time, chained commands, and git global flags.
//
// Quoted spans are blanked BEFORE splitting: separators inside quotes
// (`echo "run git push && rejoice"`) used to create a fake segment whose
// leading command was git. The real command's own quoted args (`git commit
// -m "msg"`) classify the same with or without the message text, so blanking
// is lossless for detection. An unbalanced quote leaves the string untouched.
function classifyShip(cmd) {
  const blanked = String(cmd || '')
    .replace(/'[^']*'/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ');
  const segments = blanked.split(/[;&|\n]+/);
  const found = new Set();
  for (const seg of segments) {
    const k = shipKindForSegment(seg);
    if (k) found.add(k);
  }
  for (const kind of SHIP_PRECEDENCE) if (found.has(kind)) return kind;
  return null;
}

module.exports = { classifyShip };
