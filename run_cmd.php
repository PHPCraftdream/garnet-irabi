<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi {
    require_once __DIR__ . '/autoload.php';

    use PHPCraftdream\Garnet\Kernel\Core\Env\Env;
    use PHPCraftdream\Garnet\Kernel\Core\Env\TestScope;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\IoRun\IoRunConsole;

    gc_disable();

    IRabi::setPublicDirInit(__DIR__ . DS . 'WorkDir' . DS . 'public' . DS);

    $isDev = Env::isDevDir();
    $app = new IRabi($isDev);
    $app->consoleInit();

    // DB prefix override for CLI commands (migrate, seed, test:provision)
    // when preparing test scopes. The web request path uses
    // WorkerScopeMiddleware reading the X-Test-Worker header instead;
    // CLI tools have no HTTP context, so they read the override from
    // an env var. Two authorization paths:
    //   - $isDev: the local per-worker isolation pipeline (DB_PREFIX_OVERRIDE
    //     = test_worker_N), gated on a dev directory.
    //   - TestScope::isActive(): a server-side prod run authorized by the
    //     `.allow_tests` token + a matching GARNET_TEST_TOKEN env var. This
    //     is the ONLY way the override applies outside a dev directory, so a
    //     stray env var on a real prod box can never flip the prefix.
    if ($isDev || TestScope::isActive()) {
        $prefixOverride = getenv('DB_PREFIX_OVERRIDE');
        if (is_string($prefixOverride) && $prefixOverride !== '') {
            // Whitelist: alphanumerics + underscore, length-bounded, so a
            // bad value can't smuggle SQL or land us in an unintended schema.
            if (preg_match('/^[A-Za-z0-9_]{1,40}$/', $prefixOverride) === 1) {
                IniConfig::db()->setRuntimeOverride('prefix', $prefixOverride);
            }
        }
    }

    IoRunConsole::run();
}
