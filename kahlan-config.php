<?php declare(strict_types=1);

use PHPCraftdream\Garnet\Kernel\Core\GlobalVars\GlobalVars;

require_once __DIR__ . '/TestsInit/init.php';

GlobalVars::set('phpRunCmd', 'php');
GlobalVars::set('ErrorCatcherTestEnabled', true);
