<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;

    /**
     * Terms of use: re-sync the /terms block with the canonical seed, which now
     * forbids asking the counterparty to cancel a booking on your behalf (each
     * party cancels from their own account so cancellation stats stay honest).
     *
     * Targeted UPDATE of the single text block — does NOT wipe static pages, so
     * any unrelated admin edits to other pages are preserved. Idempotent.
     */
    class M_0006 implements IMigrationItem {
        private static function readSeed(string $filename): string {
            $path = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'SeedData' . DIRECTORY_SEPARATOR . $filename;
            return is_file($path) ? trim((string)file_get_contents($path)) : '';
        }

        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $pagesTable = StaticPages::get();
            $blocksTable = StaticPageBlocks::get();

            $termsRow = $pagesTable->selectOneByField('slug', 'terms');
            if (empty($termsRow)) {
                $stdio->outln('M_0006: /terms page not found, skipped');
                return;
            }

            $termsId = (int)$termsRow['id'];
            $termsContent = self::readSeed('page-terms-block-1.md');
            if ($termsContent === '') {
                $stdio->outln('M_0006: terms seed empty, skipped');
                return;
            }

            $pool->query(
                "UPDATE {$blocksTable->getTableName()} SET content = ? WHERE page_id = ? AND sort_order = 0",
                [$termsContent, $termsId]
            );
            $stdio->outln('M_0006: re-synced /terms block content (cancellation clause)');
        }
    }
}
