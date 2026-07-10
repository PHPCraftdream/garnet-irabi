<?php declare(strict_types=1);

// App-mode docroot entry.
//
// The framework is resolved through this app's own composer autoload
// (vendor/phpcraftdream/garnet-framework, a path-repo link) — there is no
// monorepo `Framework/` sibling to require directly. We load the app
// autoload, point the framework at this Public/ dir (the app constructor
// in run_web.php reads it), and hand off to run_web.php for the full web
// request flow. Mirrors the CLI entry in ../run_cmd.php.

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'autoload.php';

// App-mode admin root: the /__garnet/ panel (AdminAuth/AdminApp) keys its
// token file and `garnet` exec off $_ENV['GARNET_ROOT']. In app-mode that
// is the app dir (this docroot's parent) — the panel manages THIS app, and
// the CLI `garnet admin` writes the token to the same app-root location.
if (!isset($_ENV['GARNET_ROOT'])) {
    $_ENV['GARNET_ROOT'] = dirname(__DIR__);
}

// Framework admin panel intercept (/__garnet/*). Self-exits for those
// routes; returns normally for everything else. Must run after the app
// autoload (so AdminApp is loadable) and before the app boots.
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'vendor'
    . DIRECTORY_SEPARATOR . 'phpcraftdream' . DIRECTORY_SEPARATOR . 'garnet-framework'
    . DIRECTORY_SEPARATOR . 'Kernel' . DIRECTORY_SEPARATOR . 'Io'
    . DIRECTORY_SEPARATOR . 'GarnetCli' . DIRECTORY_SEPARATOR . 'Admin'
    . DIRECTORY_SEPARATOR . 'AdminIntercept.php';

define('PUBLIC_DIR', __DIR__ . DIRECTORY_SEPARATOR);
PHPCraftdream\IRabi\IRabi::setPublicDirInit(PUBLIC_DIR);

require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'run_web.php';
