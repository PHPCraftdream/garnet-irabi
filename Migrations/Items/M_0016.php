<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;
    use PHPCraftdream\IRabi\Common\Tables\StaticSnippets;

    /**
     * Переименовать пункт меню «Войти» в «Личный кабинет» в шапке и подвале.
     *
     * Публичные страницы намеренно рендерятся без учёта состояния входа
     * (см. комментарий в DevLoginController::post__main), поэтому
     * авторизованный пользователь видел в шапке «Войти» и делал единственный
     * разумный вывод — что его разлогинило. Дальше он шёл запрашивать код
     * заново, то есть подпись сама создавала обращения в поддержку.
     * «Личный кабинет» верно называет место назначения при обоих состояниях.
     *
     * Правка точечная: меняется только label у пункта, ведущего на /system/,
     * остальная структура меню сохраняется — владелец мог добавить свои
     * пункты через админку, и сносить их ради одной подписи нельзя.
     * Идемпотентна: повторный прогон ничего не находит и ничего не пишет.
     */
    class M_0016 implements IMigrationItem {
        private const OLD_LABEL = 'Войти';
        private const NEW_LABEL = 'Личный кабинет';
        private const TARGET_URL = '/system/';

        public static function update(Stdio $stdio): void {
            self::renameInSnippets($stdio);
            self::resyncHomeBlock($stdio);
        }

        /** Пункт меню в сниппетах main-nav (items[]) и main-footer (columns[].items[]). */
        private static function renameInSnippets(Stdio $stdio): void {
            $pool = DbPool::get();
            $snippets = StaticSnippets::get();

            foreach (['main-nav', 'main-footer'] as $slug) {
                $row = $snippets->selectOneByField('slug', $slug);
                if (empty($row)) {
                    $stdio->outln("M_0016: сниппет {$slug} не найден, пропуск");
                    continue;
                }

                $content = json_decode((string)$row['content'], true);
                if (!is_array($content)) {
                    $stdio->outln("M_0016: сниппет {$slug} — контент не JSON, пропуск");
                    continue;
                }

                $changed = 0;
                self::walkItems($content, $changed);

                if ($changed === 0) {
                    $stdio->outln("M_0016: сниппет {$slug} — менять нечего");
                    continue;
                }

                $pool->query(
                    "UPDATE {$snippets->getTableName()} SET content = ? WHERE id = ?",
                    [(string)json_encode($content, JSON_UNESCAPED_UNICODE), (int)$row['id']]
                );
                $stdio->outln("M_0016: сниппет {$slug} — переименован пункт меню ({$changed})");
            }
        }

        /**
         * Пункты лежат на разной глубине: в шапке это items[], в подвале —
         * columns[].items[]. Рекурсия по массиву избавляет от дублирования
         * двух почти одинаковых обходов и переживёт добавление третьего
         * места, если структура меню когда-нибудь усложнится.
         */
        private static function walkItems(array &$node, int &$changed): void {
            $isTargetLink = ($node['url'] ?? null) === self::TARGET_URL
                && ($node['label'] ?? null) === self::OLD_LABEL;

            if ($isTargetLink) {
                $node['label'] = self::NEW_LABEL;
                $changed++;
                return;
            }

            foreach ($node as &$child) {
                if (is_array($child)) {
                    self::walkItems($child, $changed);
                }
            }
        }

        /** Текст на главной ссылался на кнопку по старому названию. */
        private static function resyncHomeBlock(Stdio $stdio): void {
            $pool = DbPool::get();
            $pages = StaticPages::get();
            $blocks = StaticPageBlocks::get();

            $page = $pages->selectOneByField('slug', 'home');
            if (empty($page)) {
                $stdio->outln('M_0016: страница /home не найдена, пропуск');
                return;
            }

            $path = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR
                . 'SeedData' . DIRECTORY_SEPARATOR . 'page-home-block-2.md';
            $content = is_file($path) ? trim((string)file_get_contents($path)) : '';
            if ($content === '') {
                $stdio->outln('M_0016: сид page-home-block-2.md пуст, пропуск');
                return;
            }

            $pool->query(
                "UPDATE {$blocks->getTableName()} SET content = ? WHERE page_id = ? AND sort_order = 1",
                [$content, (int)$page['id']]
            );
            $stdio->outln('M_0016: блок главной пересинхронизирован');
        }
    }
}
