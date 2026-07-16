<?php declare(strict_types=1);

// Local/normal composer installs put garnet-framework inside this app's own
// vendor/ (see composer.json's require). Some production deploys instead
// keep the framework in a separate sibling directory (deploy.ini's
// framework_dir) and never install it into vendor/ at all — _shared_index.php
// exposes that sibling's path via GARNET_FRAMEWORK_DIR so this file can load
// its autoloader too, without a git-untracked, deploy-clobberable server
// patch (see docs/deploy.md).
$frameworkDir = getenv('GARNET_FRAMEWORK_DIR');
if ($frameworkDir !== false && is_file($frameworkDir . '/vendor/autoload.php')) {
    require_once $frameworkDir . '/vendor/autoload.php';
}

require_once __DIR__ . '/vendor/autoload.php';
