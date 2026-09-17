<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;

    /**
     * Отметки об отправленных напоминаниях о занятии — за сутки и за два часа.
     *
     * У брони они про ученика, у слота — про преподавателя: в слоте может быть
     * несколько записавшихся, и преподавателю нужно одно письмо про занятие, а
     * не по одному на каждого.
     *
     * NULL означает «ещё не отправляли», поэтому существующие строки после
     * миграции получают напоминания на общих основаниях — и это правильно:
     * занятия, до которых меньше суток, уже запланированы, и их участники ждут
     * напоминания не меньше, чем те, кто записался после релиза.
     *
     * Идемпотентна: перед каждым ALTER проверяется SHOW COLUMNS.
     */
    class M_0019 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();

            $targets = [
                Bookings::get()->getTableName() => 'cancelled_at',
                TimeSlots::get()->getTableName() => 'cancellation_penalty_percent',
            ];

            foreach ($targets as $table => $after) {
                $previous = $after;

                foreach (['reminded_1d_at', 'reminded_2h_at'] as $name) {
                    $exists = $pool->query("SHOW COLUMNS FROM `{$table}` LIKE '{$name}'");

                    if (!empty($exists)) {
                        $stdio->outln("M_0019: {$table}.{$name} уже есть, пропуск");
                        $previous = $name;

                        continue;
                    }

                    $pool->query("ALTER TABLE `{$table}` ADD COLUMN `{$name}` INT(11) NULL DEFAULT NULL AFTER `{$previous}`");
                    $stdio->outln("M_0019: добавлена {$table}.{$name}");
                    $previous = $name;
                }
            }
        }
    }
}
