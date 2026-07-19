<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;

    /**
     * Fix broken cross-links between the Privacy and Cookies legal pages
     * (content audit 15-content-copywriting-seo.md, B-1/B-2). Both pages
     * linked to non-existent routes (/cookies and /privacy) instead of the
     * real static-page route /page/view~{slug}.
     *
     * Targeted UPDATE of each page's single text block — does NOT wipe
     * static pages, so unrelated admin edits are preserved. Idempotent.
     */
    class M_0013 implements IMigrationItem {
        private static function readSeed(string $filename): string {
            $path = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'SeedData' . DIRECTORY_SEPARATOR . $filename;
            return is_file($path) ? trim((string)file_get_contents($path)) : '';
        }

        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $pagesTable = StaticPages::get();
            $blocksTable = StaticPageBlocks::get();

            foreach (['privacy', 'cookies'] as $slug) {
                $pageRow = $pagesTable->selectOneByField('slug', $slug);
                if (empty($pageRow)) {
                    $stdio->outln("M_0013: /{$slug} page not found, skipped");
                    continue;
                }

                $content = self::readSeed("page-{$slug}-block-1.md");
                if ($content === '') {
                    $stdio->outln("M_0013: {$slug} seed empty, skipped");
                    continue;
                }

                $pageId = (int)$pageRow['id'];
                $pool->query(
                    "UPDATE {$blocksTable->getTableName()} SET content = ? WHERE page_id = ? AND sort_order = 0",
                    [$content, $pageId]
                );
                $stdio->outln("M_0013: re-synced /{$slug} block content (fixed cross-link route)");
            }
        }
    }
}
