import * as Babel from '@babel/standalone';
import loopProtect from 'loop-protect';

let registeredTimeout = null;

function ensureRegistered(timeoutMs) {
  if (registeredTimeout === timeoutMs) return;
  Babel.registerPlugin('loopProtection', loopProtect(timeoutMs));
  registeredTimeout = timeoutMs;
}

// Rewrites while/for/do loops to auto-break after `timeoutMs` of wall-clock
// time. This does NOT replace the Worker-thread isolation (that's what keeps
// the page itself responsive) — it's what lets a runaway loop's *own script*
// recover and keep going instead of needing a hard Stop.
export function protectLoops(code, timeoutMs = 2000) {
  ensureRegistered(timeoutMs);
  const result = Babel.transform(code, { plugins: ['loopProtection'] });
  return result.code;
}
