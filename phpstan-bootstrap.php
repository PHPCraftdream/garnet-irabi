<?php declare(strict_types=1);

/**
 * PUBLIC_DIR is defined at real request bootstrap (Public/index.php), never
 * at analysis time — declare it here so phpstan can see the constant exists
 * without needing a `Public/index.php`-style require.
 */
if (!defined('PUBLIC_DIR')) {
    define('PUBLIC_DIR', __DIR__ . DIRECTORY_SEPARATOR . 'Public' . DIRECTORY_SEPARATOR);
}
