<?php declare(strict_types=1);

/**
 * Static third-party vendor assets (cropper, gridjs/mermaid) copied under
 * Public/assets/framework/assets/ — NOT built or hashed by FrontBuilder
 * (unlike the `/gen/` bundle output), and gitignored, so a fresh checkout
 * (a real deploy, or CI) may not have them on disk yet.
 *
 * Each accessor checks the real file on disk (via PUBLIC_DIR, set at
 * request bootstrap) and returns '' when absent, matching the same
 * graceful-degradation convention FrontBuilder's own generated
 * FrameworkJsGen::vendor_react()/vendor_other() use for a chunk that
 * didn't materialise — callers array_filter() the resulting list so a
 * missing asset never renders a broken empty href/src.
 */

namespace PHPCraftdream\IRabi\Common\System {
    final class ThirdPartyAssets {
        public static function cropperJs(): string {
            return self::urlIfExists('cropper/cropper.min.js');
        }

        public static function cropperStylesCss(): string {
            return self::urlIfExists('cropper/cropper.styles.css');
        }

        public static function gridjsMermaidCss(): string {
            return self::urlIfExists('gridjs/mermaid.min.css');
        }

        private static function urlIfExists(string $relPath): string {
            $fsPath = PUBLIC_DIR . 'assets' . DIRECTORY_SEPARATOR . 'framework' . DIRECTORY_SEPARATOR
                . 'assets' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relPath);

            return is_file($fsPath) ? '/assets/framework/assets/' . $relPath : '';
        }
    }
}
