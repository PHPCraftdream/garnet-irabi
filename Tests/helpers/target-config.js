// Single source of truth for "does `npm test` (no explicit --config) target
// the local dev server or the remote (prod) box". Plain CommonJS so both
// scripts/run-target.js (executed via bare `node`) and any TS helper
// (`require('../helpers/target-config')` under ts-node) share one resolver
// instead of each re-implementing the same env-var read.
//
// #395: the choice of default is itself configurable (not hardcoded either
// way) — set PW_TARGET=remote in the shell/CI env to flip it persistently,
// or pass it for one invocation: `PW_TARGET=remote npm test`. Ships with
// 'local' as the literal fallback so an unconfigured `npm test` behaves
// exactly as it always has — zero behavior change for anyone who hasn't
// opted in.
//
// Going remote this way only decides WHICH command `npm test` runs
// (`playwright test` vs `php garnet test:remote`) — it does not bypass any
// of TestScope's server-side gating (Kernel/Core/Env/TestScope.php): a
// remote run still needs the token that `php garnet test:remote` provisions
// over SSH, so misconfiguring this can make `npm test` fail loudly (missing
// BASE_URL/token), never silently touch live tables.

/** @returns {'local' | 'remote'} */
function resolveTarget() {
    const raw = (process.env.PW_TARGET || '').trim().toLowerCase();

    return raw === 'remote' ? 'remote' : 'local';
}

module.exports = { resolveTarget };
