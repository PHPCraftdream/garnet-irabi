<?php declare(strict_types=1);

use PHPCraftdream\Garnet\Kernel\Core\Benchmark\BenchmarkLog;
use PHPCraftdream\Garnet\Kernel\Db\Link\ExtPDO;
use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;

require_once __DIR__ . '/../../../Framework/vendor/autoload.php';
require_once __DIR__ . '/../vendor/autoload.php';

$envIniDir = __DIR__ . '/TestConfig/';

IniConfig::defineAppIni($envIniDir . 'app.ini');
IniConfig::defineDbIni($envIniDir . 'db.ini');
IniConfig::defineEmailIni($envIniDir . 'email.ini');
BenchmarkLog::init('init IRabi tests');

$pdo = ExtPDO::get();
