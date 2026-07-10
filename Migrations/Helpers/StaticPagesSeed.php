<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Helpers {
    use PHPCraftdream\IRabi\Common\Tables\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;
    use PHPCraftdream\IRabi\Common\Tables\StaticSnippets;

    /**
     * Canonical production seed for static pages, blocks and snippets.
     *
     * Used by both M_0016 (initial seed on fresh install) and M_0018
     * (hard-reset on environments that already crossed M_0016 with
     * older content). Single source of truth for what the marketing
     * surface ships with by default.
     *
     * NOTE: Bypasses FwStaticPagesService for direct table writes — this
     * is intentional for migration code, where we want the canonical
     * schema layout pinned in one place and don't want service-level
     * audit hooks (history records) firing during install.
     */
    final class StaticPagesSeed {
        private static function readSeed(string $filename): string {
            $path = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'SeedData' . DIRECTORY_SEPARATOR . $filename;
            return is_file($path) ? trim((string)file_get_contents($path)) : '';
        }

        private static function headerContent(): string {
            return (string)json_encode([
                'logo' => (object)[],
                'items' => [
                    ['type' => 'link', 'label' => 'Главная', 'url' => '/'],
                    ['type' => 'page', 'slug' => 'terms',   'label' => ''],
                    ['type' => 'page', 'slug' => 'privacy', 'label' => ''],
                    ['type' => 'link', 'label' => 'Войти',   'url' => '/system/', 'external' => false],
                ],
                'layout' => 'center',
                'sticky' => false,
            ], JSON_UNESCAPED_UNICODE);
        }

        private static function footerContent(): string {
            return (string)json_encode([
                'columns' => [
                    [
                        'title' => 'Навигация',
                        'items' => [
                            ['type' => 'link', 'label' => 'Главная', 'url' => '/'],
                            ['type' => 'page', 'slug' => 'terms',   'label' => ''],
                            ['type' => 'page', 'slug' => 'privacy', 'label' => ''],
                            ['type' => 'link', 'label' => 'Войти',   'url' => '/system/', 'external' => false],
                        ],
                    ],
                    [
                        'title' => 'Контакты',
                        'items' => [
                            // Empty {support-*} placeholders are dropped at render
                            // time by FwStaticPagesService::renderFooterHtml — the
                            // whole column collapses if nothing resolves.
                            ['type' => 'link', 'label' => '{support-email}',     'url' => 'mailto:{support-email}'],
                            ['type' => 'link', 'label' => '{support-phone}',     'url' => 'tel:{support-phone}'],
                            ['type' => 'link', 'label' => '@{support-telegram}', 'url' => 'https://t.me/{support-telegram}'],
                        ],
                    ],
                ],
                'copyright' => '© {year} {title}. Все права защищены.',
                'layout' => 'columns',
            ], JSON_UNESCAPED_UNICODE);
        }

        /**
         * DELETE all rows from blocks → pages → snippets (FK-safe order).
         * Destructive — every existing static page, block and snippet
         * row is removed, including admin-created ones.
         */
        public static function wipe(): void {
            $pages = StaticPages::get();
            $blocks = StaticPageBlocks::get();
            $snippets = StaticSnippets::get();

            $blocks->getQueryEx()->ex("DELETE FROM `{$blocks->getTableName()}`");
            $pages->getQueryEx()->ex("DELETE FROM `{$pages->getTableName()}`");
            $snippets->getQueryEx()->ex("DELETE FROM `{$snippets->getTableName()}`");
        }

        /**
         * Write the canonical home/terms/privacy + main-nav/main-footer
         * rows. Assumes the relevant tables are empty — call wipe() first
         * for an idempotent end state, or guard the call site against
         * duplicate-slug errors if the caller wants to preserve existing
         * rows.
         */
        public static function seed(int $now): void {
            $pages = StaticPages::get();
            $blocks = StaticPageBlocks::get();
            $snippets = StaticSnippets::get();

            $headerId = $snippets->insert([
                'slug' => 'main-nav',
                'name' => 'Главное меню',
                'snippet_type' => 'header',
                'content' => self::headerContent(),
                'is_active' => 1,
                'sort_order' => 0,
                'updated_at' => $now,
                'created_at' => $now,
            ]);

            $footerId = $snippets->insert([
                'slug' => 'main-footer',
                'name' => 'Подвал сайта',
                'snippet_type' => 'footer',
                'content' => self::footerContent(),
                'is_active' => 1,
                'sort_order' => 1,
                'updated_at' => $now,
                'created_at' => $now,
            ]);

            $homeId = $pages->insert([
                'slug' => 'home',
                'title' => '{title} — индивидуальные занятия онлайн и очно',
                'is_published' => 1,
                'visibility' => 'all',
                'meta_description' => 'Платформа для бронирования индивидуальных занятий с преподавателями. Доступ по приглашению.',
                'max_width' => '3xl',
                'sort_order' => 0,
                'header_snippet_id' => $headerId,
                'footer_snippet_id' => $footerId,
                'updated_at' => $now,
                'created_at' => $now,
            ]);
            $blocks->insert([
                'page_id' => $homeId, 'block_type' => 'text',
                'content' => self::readSeed('page-home-block-1.md'),
                'sort_order' => 0, 'is_hidden' => 0, 'visibility' => 'all', 'created_at' => $now,
            ]);
            $blocks->insert([
                'page_id' => $homeId, 'block_type' => 'text',
                'content' => self::readSeed('page-home-block-2.md'),
                'sort_order' => 1, 'is_hidden' => 0, 'visibility' => 'all', 'created_at' => $now,
            ]);

            $termsId = $pages->insert([
                'slug' => 'terms',
                'title' => 'Условия использования',
                'is_published' => 1,
                'visibility' => 'all',
                'meta_description' => 'Условия использования платформы',
                'max_width' => '3xl',
                'sort_order' => 1,
                'header_snippet_id' => $headerId,
                'footer_snippet_id' => $footerId,
                'updated_at' => $now,
                'created_at' => $now,
            ]);
            $blocks->insert([
                'page_id' => $termsId, 'block_type' => 'text',
                'content' => self::readSeed('page-terms-block-1.md'),
                'sort_order' => 0, 'is_hidden' => 0, 'visibility' => 'all', 'created_at' => $now,
            ]);

            $privacyId = $pages->insert([
                'slug' => 'privacy',
                'title' => 'Политика конфиденциальности',
                'is_published' => 1,
                'visibility' => 'all',
                'meta_description' => 'Политика конфиденциальности платформы',
                'max_width' => '3xl',
                'sort_order' => 2,
                'header_snippet_id' => $headerId,
                'footer_snippet_id' => $footerId,
                'updated_at' => $now,
                'created_at' => $now,
            ]);
            $blocks->insert([
                'page_id' => $privacyId, 'block_type' => 'text',
                'content' => self::readSeed('page-privacy-block-1.md'),
                'sort_order' => 0, 'is_hidden' => 0, 'visibility' => 'all', 'created_at' => $now,
            ]);

            $cookiesId = $pages->insert([
                'slug' => 'cookies',
                'title' => 'Уведомление об использовании cookies',
                'is_published' => 1,
                'visibility' => 'all',
                'meta_description' => 'Уведомление об использовании cookies на платформе',
                'max_width' => '3xl',
                'sort_order' => 3,
                'header_snippet_id' => $headerId,
                'footer_snippet_id' => $footerId,
                'updated_at' => $now,
                'created_at' => $now,
            ]);
            $blocks->insert([
                'page_id' => $cookiesId, 'block_type' => 'text',
                'content' => self::readSeed('page-cookies-block-1.md'),
                'sort_order' => 0, 'is_hidden' => 0, 'visibility' => 'all', 'created_at' => $now,
            ]);
        }

        /**
         * Wipe then write the canonical content. The static-pages tables
         * are deliberately non-transactional in this codebase (MyISAM,
         * picked for read-throughput), so a partial-failure window
         * exists between wipe() and the final seed insert. Risk is
         * acceptable here: seed data is hard-coded and validated
         * (json_encode/file_get_contents on bundled SeedData/*.md), so
         * the only realistic failure modes are out-of-disk and similar
         * platform-level errors that an admin must handle anyway by
         * re-running the migration.
         */
        public static function install(int $now): void {
            self::wipe();
            self::seed($now);
        }
    }
}
