<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Bundle\Modules\EntityHistory\EntityHistoryService;
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\FwStaticPagesService;
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\Tables\FwStaticPageBlocks;
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\Tables\FwStaticPages;
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\Tables\FwStaticSnippets;
    use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
    use PHPCraftdream\IRabi\Common\Tables\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;
    use PHPCraftdream\IRabi\Common\Tables\StaticSnippets;

    class StaticPagesService extends FwStaticPagesService {
        protected static function pagesTable(): FwStaticPages {
            return StaticPages::get();
        }

        protected static function blocksTable(): FwStaticPageBlocks {
            return StaticPageBlocks::get();
        }

        protected static function snippetsTable(): FwStaticSnippets {
            return StaticSnippets::get();
        }

        // ── Audit hooks ───────────────────────────────────────────────────
        // Override the framework methods so every page-level mutation is
        // recorded into ir_entity_history. We touch only meta-update and
        // bulk block-save calls — those are the entry points the admin UI
        // actually uses. Per-block updates are excluded to keep history
        // readable (one event per save, not per dragged block).

        public static function updatePage(int $pageId, array $fields, int $updatedBy): void {
            $before = static::pagesTable()->selectOneByField('id', $pageId) ?: [];
            parent::updatePage($pageId, $fields, $updatedBy);
            $after = static::pagesTable()->selectOneByField('id', $pageId) ?: [];

            $diff = EntityHistoryService::diff($before, $after, ignoredFields: ['updated_at', 'updated_by']);
            if ($diff !== []) {
                EntityHistoryService::record(
                    tableClass: EntityHistory::class,
                    entityType: 'static_page',
                    entityId:   $pageId,
                    action:     'update',
                    diff:       $diff,
                );
            }
        }

        public static function deletePage(int $pageId): void {
            $before = static::pagesTable()->selectOneByField('id', $pageId) ?: [];
            parent::deletePage($pageId);
            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'static_page',
                entityId:   $pageId,
                action:     'delete',
                snapshot:   $before,
            );
        }

        public static function saveAllBlocks(int $pageId, array $blocks): void {
            $beforeCount = count(static::getBlocksForPage($pageId));
            parent::saveAllBlocks($pageId, $blocks);
            $afterCount = count(static::getBlocksForPage($pageId));

            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'static_page',
                entityId:   $pageId,
                action:     'blocks_saved',
                diff:       ['blocks_count' => ['old' => $beforeCount, 'new' => $afterCount]],
            );
        }
    }
}
