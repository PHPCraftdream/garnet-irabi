<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;
    use PHPCraftdream\IRabi\Common\Tables\StaticSnippets;

    /**
     * Cookie disclosure pages: updates privacy block §7 with a concrete
     * cookie table and creates a dedicated /cookies page. Idempotent —
     * re-running re-syncs the block content without creating duplicates.
     */
    class M_0004 implements IMigrationItem {
        private static function readSeed(string $filename): string {
            $path = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'SeedData' . DIRECTORY_SEPARATOR . $filename;
            return is_file($path) ? trim((string)file_get_contents($path)) : '';
        }

        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $pagesTable = StaticPages::get();
            $blocksTable = StaticPageBlocks::get();
            $snippetsTable = StaticSnippets::get();

            // 1. Update privacy block content
            $privacyRow = $pagesTable->selectOneByField('slug', 'privacy');
            if (!empty($privacyRow)) {
                $privacyId = (int)$privacyRow['id'];
                $privacyContent = self::readSeed('page-privacy-block-1.md');
                $pool->query(
                    "UPDATE {$blocksTable->getTableName()} SET content = ? WHERE page_id = ? AND sort_order = 0",
                    [$privacyContent, $privacyId]
                );
                $stdio->outln('M_0004: updated /privacy block content');
            } else {
                $stdio->outln('M_0004: /privacy page not found, skipped');
            }

            // 2. Upsert /cookies page
            $cookiesRow = $pagesTable->selectOneByField('slug', 'cookies');

            if (empty($cookiesRow)) {
                $navRow = $snippetsTable->selectOneByField('slug', 'main-nav');
                $footerRow = $snippetsTable->selectOneByField('slug', 'main-footer');
                $headerSnippetId = $navRow['id'] ?? null;
                $footerSnippetId = $footerRow['id'] ?? null;

                $now = time();
                $cookiesId = $pagesTable->insert([
                    'slug' => 'cookies',
                    'title' => 'Уведомление об использовании cookies',
                    'is_published' => 1,
                    'visibility' => 'all',
                    'meta_description' => 'Уведомление об использовании cookies на платформе',
                    'max_width' => '3xl',
                    'sort_order' => 3,
                    'header_snippet_id' => $headerSnippetId,
                    'footer_snippet_id' => $footerSnippetId,
                    'updated_at' => $now,
                    'created_at' => $now,
                ]);
                $blocksTable->insert([
                    'page_id' => $cookiesId, 'block_type' => 'text',
                    'content' => self::readSeed('page-cookies-block-1.md'),
                    'sort_order' => 0, 'is_hidden' => 0, 'visibility' => 'all', 'created_at' => $now,
                ]);
                $stdio->outln('M_0004: created /cookies page');
            } else {
                $cookiesId = (int)$cookiesRow['id'];
                $cookiesContent = self::readSeed('page-cookies-block-1.md');
                $pool->query(
                    "UPDATE {$blocksTable->getTableName()} SET content = ? WHERE page_id = ? AND sort_order = 0",
                    [$cookiesContent, $cookiesId]
                );
                $stdio->outln('M_0004: re-synced /cookies block content');
            }
        }
    }
}
