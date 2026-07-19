<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi {
    require_once __DIR__ . '/autoload.php';

    use PHPCraftdream\Garnet\Bundle\Middlewares\WorkerScopeMiddleware;
    use PHPCraftdream\Garnet\Kernel\Core\Benchmark\BenchmarkLog;
    use PHPCraftdream\Garnet\Kernel\Core\Env\Env;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Core\GlobalReqParams\GlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Io\Emitter\Emitter;
    use PHPCraftdream\Garnet\Kernel\Io\ErrorCatcher\ErrorCatcher;
    use PHPCraftdream\Garnet\Kernel\Io\IoRun\IoRunWeb;
    use PHPCraftdream\Garnet\Kernel\Io\Logs\Logger;
    use PHPCraftdream\Garnet\Kernel\Io\Router\RouterDevFile;
    use PHPCraftdream\Garnet\Kernel\Io\Router\RouterUriParams;
    use PHPCraftdream\IRabi\Common\Services\AccountStaticCacheResetter;
    use PHPCraftdream\IRabi\Common\Services\HttpsRedirectService;
    use PHPCraftdream\IRabi\Common\Services\SessionStaticCacheResetter;
    use Psr\Http\Message\ResponseInterface;
    use Throwable;

    // -------------------------------
    // Always clear first — same defensive intent as
    // WorkerScopeMiddleware (which plays this role for the IniConfig
    // runtime override). The framework's Session / Account hold
    // process-static caches ($instance / $sessionAccount / $items) that
    // are NEVER cleared between requests. On the current php-cgi
    // infrastructure (one OS process per request) the clear below is a
    // no-op because the statics start cold anyway. On any
    // persistent-worker runtime (php-fpm with reused workers /
    // RoadRunner / Swoole / FrankenPHP) the first request served by a
    // worker would otherwise "seal" its Session/Account values and
    // leak them to every later request on the same worker — a
    // confirmed cross-user account-takeover mechanism (audit
    // 04-concurrency-race-conditions.md, finding C-1 → L-3). Must run
    // BEFORE ErrorCatcher::init / IRabi construction / any middleware
    // — anything that could lazily populate the cache first.
    AccountStaticCacheResetter::reset();
    SessionStaticCacheResetter::reset();

    // -------------------------------
    BenchmarkLog::init(($_SERVER['REQUEST_METHOD'] ?? 'GET') . ': ' . ($_SERVER['REQUEST_URI'] ?? '/'));

    gc_disable();

    $errorCallback = [FrameworkController::class, 'internal_error_500'](...);
    $globalParams = GlobalReqParams::from($_SERVER, $_GET, GlobalReqParams::currentPost(), $_COOKIE, $_FILES);
    $isDev = $globalParams->isDev() && Env::isDevDir();

    // -------------------------------
    // Force HTTPS in production: redirect plaintext requests AND emit HSTS.
    // Runs BEFORE ErrorCatcher init / IRabi construction / routing so the
    // redirect is as cheap as possible — none of the heavy bootstrap fires
    // for an HTTP→HTTPS bump. Gated on !$isDev so the local `php garnet
    // serve` dev server (always isDev=true, plain HTTP by design — the
    // Playwright e2e stack talks to it that way) is never touched. This is
    // defense-in-depth on TOP of the hosting-level nginx redirect, not a
    // replacement for it — if the panel is also configured to redirect, an
    // upstream request never reaches PHP here, so the two never conflict.
    //
    // HSTS is intentionally NOT sent on the 301 redirect response itself:
    // RFC 6797 §7.2 forbids HSTS on plaintext responses — it is only sent
    // on the HTTPS response that the browser lands on after following the
    // redirect (or on any direct HTTPS hit). The very first plaintext hit
    // is therefore not pinned, which is the inherent HSTS bootstrap
    // limitation — addressable only via the preload list, out of scope here.
    if (!$isDev) {
        $httpsRedirectTarget = HttpsRedirectService::redirectTarget($_SERVER, false);
        if ($httpsRedirectTarget !== null) {
            header('Location: ' . $httpsRedirectTarget, true, 301);
            exit;
        }

        if (HttpsRedirectService::isHttps($_SERVER)) {
            header(HttpsRedirectService::HSTS_HEADER);
        }
    }

    // -------------------------------

    ErrorCatcher::init(
        static function (string $type, string $message) use (&$globalParams, &$errorCallback): void {
            $uriParams = RouterUriParams::fromGlobals(GlobalReqParams::makeGet4Tests('/'));

            try {
                Logger::get(Logger::ERROR_LOGGER)->write($type, $message);
            } catch (Throwable $e) {
            }

            $result = $errorCallback($globalParams, $uriParams, $message);
            Emitter::emit($result);
        }
    );

    $app = new IRabi($isDev);
    $app->webInit();

    // -------------------------------

    if ($isDev && defined('PUBLIC_DIR')) {
        $fileRouter = new RouterDevFile();
        $fileRouter->addFilesDir('/', PUBLIC_DIR);

        $result = $fileRouter->dispatch($globalParams);

        if ($result instanceof ResponseInterface) {
            Emitter::emit($result);

            exit;
        }
    }

    BenchmarkLog::log('config_done');

    // -------------------------------

    $isEnabledDb = !!DbPool::get()->getDbConfig()->paramInt('enabled') !== 0;

    if ($isEnabledDb) {
        DbPool::get()->newLink();
        BenchmarkLog::log('db_connected');
    }

    // Apply the per-worker DB prefix override BEFORE IoRunWeb::run, since
    // that loads the user's Session from the DB before any in-app middleware
    // gets a chance to flip the prefix. Without this hook the session is
    // pulled from the legacy `db_session`, then written back to the per-
    // worker `test_worker_N_session` on flush — and the next request finds
    // an empty session, defeating the whole isolation.
    $uriParamsForWorkerScope = RouterUriParams::fromGlobals($globalParams);
    WorkerScopeMiddleware::process($globalParams, $uriParamsForWorkerScope);

    IoRunWeb::run(
        $globalParams,
        [$app, 'runWebApp'](...),
        $errorCallback,
    );

    BenchmarkLog::log('output_done');

    if ($isEnabledDb) {
        DbPool::get()->pollFinishAll();
    }

    BenchmarkLog::log('loop_done');

    // Skip benchmark fwrite for Playwright traffic — the suite makes
    // thousands of requests and the file IO shows up in profiles.
    // `X-Test-Worker` is set by playwright.config.ts on every request;
    // it's a no-op header in production so this never trips for real users.
    $isTestRequest = ($_SERVER['HTTP_X_TEST_WORKER'] ?? '') !== '';
    if (!$isTestRequest && BenchmarkLog::last() > 0.5) {
        Logger::get(Logger::SYSTEM_LOGGER)->append('benchmark', BenchmarkLog::printItems());
    }
}
