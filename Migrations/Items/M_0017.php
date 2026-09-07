<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\StaticSnippets;

    /**
     * Развести пункт «вход» на два: «Войти» для гостя и «Личный кабинет» для
     * вошедшего.
     *
     * M_0016 переименовала единственный пункт, потому что публичные страницы
     * тогда не умели различать состояние входа. Теперь умеют: пункты меню
     * поддерживают то же поле `visibility`, что страницы и блоки
     * (`all` / `guest` / `auth` / `moderator`), и подпись не нужно больше
     * подбирать компромиссно — каждый посетитель видит верную.
     *
     * Миграция доводит уже установленные инсталляции до этого состояния:
     * помечает существующий пункт на /system/ как `auth` с подписью «Личный
     * кабинет» и добавляет рядом гостевой «Войти», если его ещё нет.
     * Идемпотентна: повторный прогон видит оба пункта на месте и ничего не
     * пишет. Остальные пункты меню не трогаются — владелец мог добавить свои.
     */
    class M_0017 implements IMigrationItem {
        private const TARGET_URL = '/system/';
        private const GUEST_LABEL = 'Войти';
        private const AUTH_LABEL = 'Личный кабинет';

        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $snippets = StaticSnippets::get();

            foreach (['main-nav', 'main-footer'] as $slug) {
                $row = $snippets->selectOneByField('slug', $slug);

                if (empty($row)) {
                    $stdio->outln("M_0017: сниппет {$slug} не найден, пропуск");

                    continue;
                }
                $content = json_decode((string)$row['content'], true);

                if (!is_array($content)) {
                    $stdio->outln("M_0017: сниппет {$slug} — контент не JSON, пропуск");

                    continue;
                }
                $changed = 0;
                self::splitLoginItem($content, $changed);

                if ($changed === 0) {
                    $stdio->outln("M_0017: сниппет {$slug} — уже разведён, менять нечего");

                    continue;
                }

                $pool->query(
                    "UPDATE {$snippets->getTableName()} SET content = ? WHERE id = ?",
                    [(string)json_encode($content, JSON_UNESCAPED_UNICODE), (int)$row['id']]
                );
                $stdio->outln("M_0017: сниппет {$slug} — пункт входа разведён на гостевой и авторизованный");
            }
        }

        /**
         * Найти список пунктов и заменить в нём вход на пару.
         *
         * Списки лежат на разной глубине: в шапке это `items`, в подвале —
         * `columns[].items`. Ищем по ключу `items` рекурсивно, чтобы не
         * писать два почти одинаковых обхода.
         */
        private static function splitLoginItem(array &$node, int &$changed): void {
            foreach ($node as $key => &$value) {
                if (!is_array($value)) {
                    continue;
                }

                if ($key === 'items') {
                    $changed += self::rewriteItems($value);

                    continue;
                }
                self::splitLoginItem($value, $changed);
            }
        }

        /** @param array<int, mixed> $items */
        private static function rewriteItems(array &$items): int {
            $hasGuest = false;
            $hasAuth = false;

            foreach ($items as $item) {
                if (!is_array($item) || ($item['url'] ?? null) !== self::TARGET_URL) {
                    continue;
                }
                $visibility = (string)($item['visibility'] ?? 'all');
                $hasGuest = $hasGuest || $visibility === 'guest';
                $hasAuth = $hasAuth || $visibility === 'auth';
            }

            if ($hasGuest && $hasAuth) {
                return 0;
            }
            $rewritten = [];
            $changed = 0;

            foreach ($items as $item) {
                $isLoginItem = is_array($item) && ($item['url'] ?? null) === self::TARGET_URL;

                if (!$isLoginItem || $changed > 0) {
                    // Всё, что не пункт входа, — как было. Если пунктов на тот
                    // же адрес почему-то несколько, трогаем только первый:
                    // остальные мог добавить владелец осознанно.
                    $rewritten[] = $item;

                    continue;
                }

                // Пара встаёт на место найденного пункта, а не в конец списка:
                // владелец мог передвинуть вход в меню, и после миграции он
                // должен остаться там же.
                $rewritten[] = ['type' => 'link', 'label' => self::GUEST_LABEL, 'url' => self::TARGET_URL, 'external' => false, 'visibility' => 'guest'];
                $rewritten[] = ['type' => 'link', 'label' => self::AUTH_LABEL, 'url' => self::TARGET_URL, 'external' => false, 'visibility' => 'auth'];
                $changed++;
            }

            if ($changed > 0) {
                $items = $rewritten;
            }

            return $changed;
        }
    }
}
