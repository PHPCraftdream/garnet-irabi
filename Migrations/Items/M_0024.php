<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

    /**
     * Занятие состоялось — и занятие не состоялось. Это разные вещи.
     *
     * У слота было четыре состояния, и прошедшее время укладывалось ровно в
     * одно из них: «Завершено». Туда попадало и занятие, которое преподаватель
     * реально провёл, и час, на который никто так и не записался, и час, чью
     * единственную заявку система сняла сама, не дождавшись ответа. На
     * карточке в календаре все три выглядели одинаково.
     *
     * Для преподавателя это не мелочь формулировки: он смотрит на свой месяц и
     * не может отличить проведённое от пустого, не открывая каждое занятие и
     * не вспоминая, кто там был. Счётчик «Проведено» при этом всегда считал
     * честно — он идёт по броням, а не по слотам, — и именно поэтому
     * расхождение было заметным: числа говорили одно, карточки другое.
     *
     * Добавляем пятое состояние, `expired`. Граница между ним и `completed`
     * проходит по факту, а не по намерению: остался ли на слоте хоть один
     * состоявшийся визит. Ни одного — значит, занятия не было.
     *
     * Задним числом размечается всё прошлое: слоты в `completed`, под которыми
     * нет ни одной завершённой брони, переводятся в `expired`. Слоты с
     * завершённой бронью остаются как есть — там занятие действительно было.
     *
     * Идемпотентна: ENUM расширяется только если `expired` в нём ещё нет,
     * backfill по своему же условию второй раз не находит ничего.
     */
    class M_0024 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $slots = TimeSlots::get()->getTableName();
            $bookings = Bookings::get()->getTableName();

            $column = $pool->query("SHOW COLUMNS FROM `{$slots}` LIKE 'status'");
            $type = (string)($column[0]['Type'] ?? '');

            if ($type !== '' && !str_contains($type, "'expired'")) {
                $pool->query(
                    "ALTER TABLE `{$slots}`
                     MODIFY COLUMN `status` ENUM('free','booked','completed','expired','cancelled')"
                );
                $stdio->outln("M_0024: {$slots}.status расширен значением 'expired'");
            } else {
                $stdio->outln("M_0024: {$slots}.status уже знает 'expired', схема не тронута");
            }

            // NOT EXISTS, а не JOIN: нужны именно слоты БЕЗ единой завершённой
            // брони, и таких строк в bookings по определению нет — соединять
            // не с чем.
            $pool->query(
                "UPDATE `{$slots}` s
                 SET s.status = 'expired'
                 WHERE s.status = 'completed'
                   AND NOT EXISTS (
                       SELECT 1 FROM `{$bookings}` b
                       WHERE b.bookable_type = 'time_slot'
                         AND b.bookable_id = s.id
                         AND b.status = 'completed'
                   )"
            );

            $stdio->outln('M_0024: прошлые занятия без единого состоявшегося визита помечены как не состоявшиеся');
        }
    }
}
