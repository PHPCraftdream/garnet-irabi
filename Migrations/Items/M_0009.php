<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;

    /**
     * Per-page SEO columns on static_pages: seo_title (overrides the <title> /
     * og:title) and og_image (per-page social-sharing image). Idempotent —
     * checks SHOW COLUMNS before each ALTER.
     */
    class M_0009 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = StaticPages::get()->getTableName();

            $columns = [
                'seo_title' => "VARCHAR(255) NOT NULL DEFAULT '' AFTER `meta_description`",
                'og_image' => "VARCHAR(500) NOT NULL DEFAULT '' AFTER `seo_title`",
            ];

            foreach ($columns as $name => $definition) {
                $exists = $pool->query("SHOW COLUMNS FROM `{$table}` LIKE '{$name}'");
                if (empty($exists)) {
                    $pool->query("ALTER TABLE `{$table}` ADD COLUMN `{$name}` {$definition}");
                    $stdio->outln("M_0009: added {$table}.{$name}");
                } else {
                    $stdio->outln("M_0009: {$table}.{$name} already exists, skipped");
                }
            }
        }
    }
}
