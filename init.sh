#!/usr/bin/env bash
# One-shot local dev bootstrap for a fresh checkout of IRabi.
#
# Covers everything the Quick Start in README.md lists PLUS two steps that
# are easy to miss because nothing prints an error pointing at them directly:
#   - WorkDir/public/ must exist (CLI tooling stubs `publicDirInit` there;
#     missing it fails with "$publicDirInit is not dir: .../WorkDir/public\").
#   - Env::isDevDir() detects a dev checkout by walking up for an IDE-marker
#     directory (.vscode/.idea/...) — without one, CLI tooling reads
#     WorkDir/Config/ (prod) instead of WorkDir/ConfigDev/ (local) and fails
#     on a config file that was never created.
#
# Idempotent: safe to re-run on an already-set-up tree.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "=== IRabi local dev bootstrap ==="

if [ ! -f .env ]; then
    cp .env.example .env
    echo "  .env created from .env.example"
else
    echo "  .env already present"
fi

if [ ! -f .mcp.json ]; then
    cp .mcp.example.json .mcp.json
    echo "  .mcp.json created from .mcp.example.json"
else
    echo "  .mcp.json already present"
fi

echo "  composer install"
composer install --quiet

echo "  php garnet setup --skip-composer"
php garnet setup --skip-composer

if [ ! -f WorkDir/ConfigDev/db.ini ]; then
    echo "  php garnet config:init --dev"
    php garnet config:init --dev
else
    echo "  WorkDir/ConfigDev already seeded"
fi

# Dev-checkout marker so Env::isDevDir() picks WorkDir/ConfigDev over
# WorkDir/Config — see Kernel/Core/Env/Env.php. Any of .idea/.vs/.xcodeproj/
# .vscode/.atom works; .vscode is the cheapest to create unconditionally.
if [ ! -d .vscode ] && [ ! -d .idea ]; then
    mkdir -p .vscode
    echo "  .vscode/ created (dev-checkout marker for Env::isDevDir())"
else
    echo "  dev-checkout marker already present"
fi

# WorkDir/public — CLI tooling's stand-in public dir (run_cmd.php calls
# setPublicDirInit() unconditionally; `php garnet serve` itself serves from
# Public/ directly and doesn't need this, but every other CLI command does).
if [ ! -e WorkDir/public ]; then
    APP_ROOT="$(pwd)"
    if [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* || "$OSTYPE" == "win32"* ]]; then
        powershell -NoProfile -Command \
            "New-Item -ItemType Junction -Path '$APP_ROOT\\WorkDir\\public' -Target '$APP_ROOT\\Public' | Out-Null"
    else
        ln -s "$APP_ROOT/Public" "$APP_ROOT/WorkDir/public"
    fi
    echo "  WorkDir/public -> Public (junction/symlink) created"
else
    echo "  WorkDir/public already present"
fi

echo
echo "=== Done ==="
echo "Next:"
echo "  1. Edit WorkDir/ConfigDev/{db,ssh,deploy,email}.ini with real local values."
echo "  2. php garnet migration"
echo "  3. php garnet build"
echo "  4. php garnet serve"
