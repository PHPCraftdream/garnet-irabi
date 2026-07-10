<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use Throwable;

    /**
     * Token-gated POST endpoint that runs opcache_reset() inside an FPM
     * worker. Auth is by shared secret — the request must carry header
     * `X-Garnet-Opcache-Token: <token>` matching the `opcache_token` param
     * in app.ini. Constant-time compare via hash_equals.
     *
     * Sibling to the owner-only /admin/system/~opcacheReset button — that
     * one wants a logged-in admin session, this one is called by the
     * post-deploy hook in GarnetDeployDiffCommand where no session exists.
     *
     * If `opcache_token` is missing/empty in app.ini the endpoint refuses
     * every request (503 token_not_configured) — never silently allow.
     *
     * The reset itself is wrapped in @ because PHP CLI / Lite SAPI returns
     * false (and emits a warning) when OPcache is not loaded — that's a
     * legitimate "nothing to reset", not an error from the caller's view.
     */
    class SysOpcacheResetController extends FrameworkController {
        public const URL = '/sys/opcache-reset';

        public static function post__run(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $expected = '';
            try {
                $expected = (string)IniConfig::app()->paramString('opcache_token', '');
            } catch (Throwable) {
                // app.ini unreadable — fall through to the empty-token check.
            }

            $expected = trim($expected);
            if ($expected === '') {
                return ControllerTools::JSON(['ok' => false, 'error' => 'token_not_configured'], status: 503);
            }

            $provided = (string)$globals->readServerValue('HTTP_X_GARNET_OPCACHE_TOKEN', '');
            if ($provided === '' || !hash_equals($expected, $provided)) {
                return ControllerTools::JSON(['ok' => false, 'error' => 'denied'], status: 403);
            }

            if (!function_exists('opcache_reset')) {
                return ControllerTools::JSON([
                    'ok' => true,
                    'opcache_reset' => false,
                    'reason' => 'opcache_unavailable_in_sapi',
                    'sapi' => PHP_SAPI,
                ]);
            }

            $reset = (bool)@opcache_reset();
            return ControllerTools::JSON([
                'ok' => true,
                'opcache_reset' => $reset,
                'sapi' => PHP_SAPI,
            ]);
        }
    }
}
