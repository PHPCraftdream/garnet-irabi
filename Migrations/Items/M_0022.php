<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\ExpertCancellations;

    /**
     * Кто отменил бронь и почему.
     *
     * Потерять бронь можно тремя разными способами: отменить самому,
     * получить отказ преподавателя или дождаться, пока систему снимет её
     * автоматически — потому что преподаватель промолчал до самого начала
     * занятия. На экране все три давали одну и ту же красную надпись
     * «Отменён», без единого слова о том, кто и за что.
     *
     * Разница между ними огромная: в первом случае человек отвечает за
     * решение сам, во втором за него отвечает конкретный преподаватель, в
     * третьем — никто, и деньги возвращаются молча. Мы знали её в момент
     * отмены и выбрасывали, оставляя человека выяснять причину по косвенным
     * признакам: примечанию в истории операций или письму, если оно дошло.
     *
     * `cancelled_role` — не то же самое, что `cancelled_by`. Роль отвечает на
     * вопрос «чьё это было решение», и её нельзя восстановить по одному
     * идентификатору: администратор, отменивший чужую бронь, — тоже аккаунт,
     * и от ученика его отличает только контекст вызова, которого в строке
     * уже не будет. Поэтому роль пишется явно, а не выводится задним числом.
     *
     * Отмена системой не имеет автора: `cancelled_by` остаётся NULL, роль —
     * `system`.
     *
     * Задним числом заполняются отмены преподавателя: они уже записаны в
     * `expert_cancellations` вместе с причиной. Остальным прошлым отменам
     * достоверной роли взять неоткуда, и они остаются с NULL — экран
     * покажет прежнюю сухую «Отменён», честно говоря то же, что и раньше,
     * вместо выдуманной причины.
     *
     * Идемпотентна: колонки добавляются по SHOW COLUMNS, backfill трогает
     * только строки с ещё не заполненной ролью.
     */
    class M_0022 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = Bookings::get()->getTableName();

            $columns = [
                'cancelled_by' => 'INT(11) NULL DEFAULT NULL AFTER `cancelled_at`',
                'cancelled_role' => "ENUM('user','expert','moderator','system') NULL DEFAULT NULL AFTER `cancelled_by`",
                'cancel_reason' => "VARCHAR(500) NOT NULL DEFAULT '' AFTER `cancelled_role`",
            ];

            foreach ($columns as $name => $definition) {
                $exists = $pool->query("SHOW COLUMNS FROM `{$table}` LIKE '{$name}'");

                if (!empty($exists)) {
                    $stdio->outln("M_0022: {$table}.{$name} уже есть, пропуск");

                    continue;
                }

                $pool->query("ALTER TABLE `{$table}` ADD COLUMN `{$name}` {$definition}");
                $stdio->outln("M_0022: добавлена {$table}.{$name}");
            }

            // Backfill по аудиту отмен преподавателя. Берётся самая ранняя
            // запись на бронь: повторный вызов отмены идемпотентен и мог
            // дописать вторую строку, но решение принималось один раз.
            $cancellations = ExpertCancellations::get()->getTableName();

            $pool->query(
                "UPDATE `{$table}` b
                 JOIN (
                     SELECT booking_id, MIN(id) AS first_id
                     FROM `{$cancellations}`
                     GROUP BY booking_id
                 ) f ON f.booking_id = b.id
                 JOIN `{$cancellations}` c ON c.id = f.first_id
                 SET b.cancelled_by = c.expert_id,
                     b.cancelled_role = 'expert',
                     b.cancel_reason = LEFT(c.reason, 500)
                 WHERE b.status = 'cancelled'
                   AND b.cancelled_role IS NULL"
            );

            $stdio->outln("M_0022: прошлые отмены преподавателя размечены по {$cancellations}");
        }
    }
}
