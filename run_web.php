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
    use Psr\Http\Message\ResponseInterface;
    use Throwable;

    // -------------------------------
    BenchmarkLog::init(($_SERVER['REQUEST_METHOD'] ?? 'GET') . ': ' . ($_SERVER['REQUEST_URI'] ?? '/'));

    gc_disable();

    $errorCallback = [FrameworkController::class, 'internal_error_500'](...);
    $globalParams = GlobalReqParams::from($_SERVER, $_GET, GlobalReqParams::currentPost(), $_COOKIE, $_FILES);
    $isDev = $globalParams->isDev() && Env::isDevDir();

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
