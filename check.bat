@echo off
cd /d "%~dp0"

echo === PHPStan ===
php ..\..\Framework\phpstan.phar analyse --configuration=phpstan.neon
if errorlevel 1 (
    echo PHPStan: ERRORS FOUND
) else (
    echo PHPStan: OK
)

echo.
echo === PHP-CS-Fixer ===
php ..\..\Framework\php-cs-fixer.phar fix --dry-run --allow-risky=yes
if errorlevel 1 (
    echo CS-Fixer: FILES NEED FIXING (run "check fix" to auto-fix)
) else (
    echo CS-Fixer: OK
)

if "%1"=="fix" (
    echo.
    echo === Applying CS fixes ===
    php ..\..\Framework\php-cs-fixer.phar fix --allow-risky=yes
)
