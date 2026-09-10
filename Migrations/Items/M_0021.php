<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Comments;

    /**
     * Четвёртое состояние отзыва — «помечен как опасный».
     *
     * Модерация отзывов стала слепой: модератор читает текст и не знает, кто
     * его написал. Это защищает автора от того, перед кем он беззащитнее
     * всего, — от человека, который может встретить его на занятии.
     *
     * Но слепота не должна означать безнаказанность. Если в отзыве угроза,
     * травля или что-то, с чем надо разбираться не текстом, а с человеком, —
     * модератор помечает отзыв флагом. Помеченные попадают в отдельный
     * раздел, где имя автора видно **владельцу платформы**, а не модератору:
     * тот, кто вскрывает анонимность, должен за это отвечать своим
     * положением.
     *
     * Отдельно от `rejected` намеренно. Отклонённый — просто не годится к
     * публикации, таких большинство и они никого не интересуют. Помеченный —
     * повод для разбирательства. Сложить их в одно значение значит утопить
     * десяток опасных в сотне обычных отказов.
     *
     * Идемпотентна: значение добавляется, только если его ещё нет в
     * определении колонки.
     */
    class M_0021 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = Comments::get()->getTableName();

            $rows = $pool->query("SHOW COLUMNS FROM `{$table}` LIKE 'moderation_status'");
            $type = (string)($rows[0]['Type'] ?? '');

            if ($type === '') {
                $stdio->errln("M_0021: {$table}.moderation_status не найдена — сначала M_0020");

                return;
            }

            if (str_contains($type, "'flagged'")) {
                $stdio->outln("M_0021: значение 'flagged' уже есть, пропуск");

                return;
            }

            $pool->query(
                "ALTER TABLE `{$table}`
                 MODIFY COLUMN `moderation_status` ENUM('pending','approved','rejected','flagged')
                 NOT NULL DEFAULT 'pending'"
            );
            $stdio->outln("M_0021: {$table}.moderation_status дополнена значением 'flagged'");
        }
    }
}
