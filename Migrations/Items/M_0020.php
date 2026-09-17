<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\Comments;

    /**
     * Состояние модерации отзыва.
     *
     * Отзывы становятся анонимными для читателей и проходят проверку до
     * публикации. Для этого нужно состояние, которого раньше не было:
     * `is_hidden` отвечает на другой вопрос — «одобренный отзыв потом убрали
     * с глаз», и различить по нему «ещё не смотрели» и «посмотрели и
     * отклонили» невозможно. Одним флагом модератор разбирал бы отклонённые
     * снова и снова, не понимая, что уже их видел.
     *
     * Новые отзывы получают `pending` по умолчанию.
     *
     * **Уже опубликованные — `approved`, и это главное в миграции.** Выкат не
     * имеет права спрятать то, что люди уже видят: отзыв, написанный неделю
     * назад и висящий на странице преподавателя, не становится непроверенным
     * оттого, что мы завели проверку. Поэтому строки, видимые на момент
     * миграции (`is_hidden = 0`), объявляются одобренными, а скрытые остаются
     * в `pending` — их и правда никто не одобрял.
     *
     * Идемпотентна: и ALTER, и перенос состояния выполняются только когда
     * колонки ещё нет. Иначе повторный прогон воскресил бы отклонённые.
     */
    class M_0020 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = Comments::get()->getTableName();

            $exists = $pool->query("SHOW COLUMNS FROM `{$table}` LIKE 'moderation_status'");

            if (!empty($exists)) {
                $stdio->outln("M_0020: {$table}.moderation_status уже есть, пропуск");

                return;
            }

            $pool->query(
                "ALTER TABLE `{$table}`
                 ADD COLUMN `moderation_status` ENUM('pending','approved','rejected')
                 NOT NULL DEFAULT 'pending' AFTER `is_hidden`"
            );
            $stdio->outln("M_0020: добавлена {$table}.moderation_status");

            $pool->query("UPDATE `{$table}` SET `moderation_status` = 'approved' WHERE `is_hidden` = 0");
            $stdio->outln('M_0020: уже видимые отзывы помечены одобренными');
        }
    }
}
