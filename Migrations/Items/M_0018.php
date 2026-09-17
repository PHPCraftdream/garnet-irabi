<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Content\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\Content\StaticPages;

    /**
     * Пересинхронизировать второй блок главной: текст называл кнопку по имени.
     *
     * После M_0017 подпись пункта зависит от того, вошёл посетитель или нет,
     * поэтому текст «нажмите „Личный кабинет“» стал врать ровно тем, кому он
     * и адресован, — незарегистрированным, которые видят «Войти». Ссылаться
     * на подпись, которой у читателя может не быть, больше нельзя: текст
     * указывает на место в меню, а не на слово на кнопке.
     */
    class M_0018 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $pages = StaticPages::get();
            $blocks = StaticPageBlocks::get();

            $page = $pages->selectOneByField('slug', 'home');

            if (empty($page)) {
                $stdio->outln('M_0018: страница /home не найдена, пропуск');

                return;
            }
            $path = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR
                . 'SeedData' . DIRECTORY_SEPARATOR . 'page-home-block-2.md';
            $content = is_file($path) ? trim((string)file_get_contents($path)) : '';

            if ($content === '') {
                $stdio->outln('M_0018: сид page-home-block-2.md пуст, пропуск');

                return;
            }

            $pool->query(
                "UPDATE {$blocks->getTableName()} SET content = ? WHERE page_id = ? AND sort_order = 1",
                [$content, (int)$page['id']]
            );
            $stdio->outln('M_0018: текст главной больше не ссылается на подпись кнопки');
        }
    }
}
