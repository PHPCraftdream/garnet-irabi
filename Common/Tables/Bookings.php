<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class Bookings extends DbTable {
        protected string $tableName = 'bookings';
        protected string $primaryKey = 'id';

        /** Чьё это было решение — см. комментарий у колонки `cancelled_role`. */
        public const CANCELLED_BY_USER = 'user';
        public const CANCELLED_BY_EXPERT = 'expert';
        public const CANCELLED_BY_MODERATOR = 'moderator';
        public const CANCELLED_BY_SYSTEM = 'system';

        /**
         * Единый источник счётчиков брони для профиля пользователя — было три
         * независимые копии (UserProfileController, MainController,
         * UsersController::post__preview, DashboardUsersController), каждая
         * со своей версией «Снятий»/«Отмен»; часть всё ещё читала
         * user_cancellations, которая пишется только при отмене самим
         * студентом и молчит про отмену экспертом/модератором/кроном
         * (D-146, D-150, D-151). confirmed_at переживает отмену (ставится
         * только при подтверждении), поэтому именно он, а не отдельный
         * журнал, решает «сняла заявку» vs «отменили подтверждённую бронь».
         *
         * @return array{completed:int,total:int,cancellations:int,declines:int,active:int}
         */
        public static function userOutcomeCounts(int $userId): array {
            $completed = static::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND status = ?', [$userId, 'completed']);
            });
            $total = static::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ?', [$userId]);
            });
            $cancellations = static::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND status = ? AND confirmed_at IS NOT NULL', [$userId, 'cancelled']);
            });
            $declines = static::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND status = ? AND confirmed_at IS NULL', [$userId, 'cancelled']);
            });

            // D-160: the profile page showed "Всего"/"Завершено"/"Отмен"/"Снятий"
            // side by side, and none of those four summed to "Всего" whenever the
            // user had a still-open booking (pending, or confirmed but the lesson
            // hasn't happened yet) — the arithmetic looked broken. Derived, not a
            // fifth query: guaranteed to reconcile with the other three by
            // construction instead of racing a separate COUNT against them.
            $active = $total - $completed - $cancellations - $declines;

            return [
                'completed' => $completed,
                'total' => $total,
                'cancellations' => $cancellations,
                'declines' => $declines,
                'active' => $active,
            ];
        }

        /**
         * Единый источник «Проведено»/«Предстоящих» эксперта — было два
         * разных SQL-запроса на одни и те же два факта (полный профиль vs
         * мини-превью), которые уже однажды разошлись («мини-карточка
         * говорила 6, полная страница — 4», D-121).
         *
         * D-190: заявка, которую преподаватель не подтвердил до начала
         * занятия, снимается кроном с полным возвратом ученику. У ученика
         * это видно («Снято до подтверждения»), у преподавателя не видно
         * нигде. Отменой преподавателя это не считается — молчать он
         * вправе, — но и пропадать бесследно факт не должен: считаем
         * отдельной величиной. Выводим из самих броней, а не заводим
         * четвёртый журнал: три расходящихся журнала мы уже разбирали
         * (D-146/D-150/D-151). Условие по confirmed_at избыточно сегодня
         * (крон трогает только 'pending'), но оно и есть определение
         * «не дождалась ответа» — без него будущий системный путь по
         * подтверждённой брони молча попал бы в этот счётчик.
         *
         * @return array{conducted:int,upcoming:int,missed:int}
         */
        public static function expertOutcomeCounts(int $expertId): array {
            $slotsTbl = TimeSlots::get()->getTableName();
            $bookingsTbl = static::get()->getTableName();

            $conducted = static::get()->getCount(function (SelectInterface $q) use ($slotsTbl, $bookingsTbl, $expertId): void {
                $q->join('INNER', $slotsTbl, "{$slotsTbl}.id = {$bookingsTbl}.bookable_id");
                $q->where("{$bookingsTbl}.bookable_type = ?", ['time_slot']);
                $q->where("{$bookingsTbl}.status = ?", ['completed']);
                $q->where("{$slotsTbl}.expert_id = ?", [$expertId]);
            });

            $upcoming = static::get()->getCount(function (SelectInterface $q) use ($slotsTbl, $bookingsTbl, $expertId): void {
                $q->join('INNER', $slotsTbl, "{$slotsTbl}.id = {$bookingsTbl}.bookable_id");
                $q->where("{$bookingsTbl}.bookable_type = ?", ['time_slot']);
                $q->where("{$slotsTbl}.expert_id = ?", [$expertId]);
                $q->where("{$bookingsTbl}.status IN ('pending', 'confirmed')");
                $q->where("{$slotsTbl}.start_at > UNIX_TIMESTAMP()");
            });

            $missed = static::get()->getCount(function (SelectInterface $q) use ($slotsTbl, $bookingsTbl, $expertId): void {
                $q->join('INNER', $slotsTbl, "{$slotsTbl}.id = {$bookingsTbl}.bookable_id");
                $q->where("{$bookingsTbl}.bookable_type = ?", ['time_slot']);
                $q->where("{$bookingsTbl}.status = ?", ['cancelled']);
                $q->where("{$bookingsTbl}.cancelled_role = ?", [static::CANCELLED_BY_SYSTEM]);
                $q->where("{$bookingsTbl}.confirmed_at IS NULL");
                $q->where("{$slotsTbl}.expert_id = ?", [$expertId]);
            });

            return ['conducted' => $conducted, 'upcoming' => $upcoming, 'missed' => $missed];
        }

        /**
         * Есть ли у пользователя хоть одно завершённое занятие у этого
         * эксперта — условие права оставить отзыв (D-173: раньше отзыв
         * можно было оставить, даже не бронируя занятие).
         */
        public static function hasCompletedBookingWith(int $userId, int $expertId): bool {
            $slotsTbl = TimeSlots::get()->getTableName();
            $bookingsTbl = static::get()->getTableName();

            $count = static::get()->getCount(function (SelectInterface $q) use ($slotsTbl, $bookingsTbl, $userId, $expertId): void {
                $q->join('INNER', $slotsTbl, "{$slotsTbl}.id = {$bookingsTbl}.bookable_id");
                $q->where("{$bookingsTbl}.bookable_type = ?", ['time_slot']);
                $q->where("{$bookingsTbl}.user_id = ?", [$userId]);
                $q->where("{$bookingsTbl}.status = ?", ['completed']);
                $q->where("{$slotsTbl}.expert_id = ?", [$expertId]);
            });

            return $count > 0;
        }

        /**
         * 'cancel' для брони, которая успела дойти до confirmed, иначе
         * 'decline' — формула переизобреталась одинаково в каждом месте
         * отмены (эксперт/модератор/студент); теперь один источник.
         */
        public static function cancellationKind(string $statusBeforeCancel): string {
            return $statusBeforeCancel === 'confirmed' ? 'cancel' : 'decline';
        }

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'user_id', type: 'INT', length: '11')
                ->addColumn(column: 'bookable_type', type: 'ENUM', length: "'time_slot'")
                ->addColumn(column: 'bookable_id', type: 'INT', length: '11')
                ->addColumn(column: 'status', type: 'ENUM', length: "'pending','confirmed','cancelled','completed'")
                ->addColumn(column: 'created_at',   type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'confirmed_at', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'cancelled_at', type: 'INT', length: '11', null: true)
                // Кто отменил и почему. Три способа потерять бронь — отменил
                // сам, отклонил преподаватель, сняла система — на экране
                // выглядели одинаково; разницу мы знали в момент отмены и
                // выбрасывали. Роль пишется явно, а не выводится по
                // `cancelled_by`: администратор, отменивший чужую бронь, тоже
                // аккаунт, и от самого ученика его отличает только контекст
                // вызова. У системной отмены автора нет — `cancelled_by` NULL.
                ->addColumn(column: 'cancelled_by', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'cancelled_role', type: 'ENUM', length: "'user','expert','moderator','system'", null: true)
                ->addColumn(column: 'cancel_reason', type: 'VARCHAR', length: '500', null: false, default: '')
                // Отметки об отправленных напоминаниях ученику: NULL — ещё не
                // отправляли. Отметка нужна именно в брони, а не в слоте:
                // напоминание адресовано конкретному записавшемуся, и отмена
                // его брони не должна влиять на остальных.
                ->addColumn(column: 'reminded_1d_at', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'reminded_2h_at', type: 'INT', length: '11', null: true)
                ->addIndex(indexName: 'user_id', indexes: ['user_id'])
                ->addIndex(indexName: 'user_status', indexes: ['user_id', 'status'])
                ->addIndex(indexName: 'bookable', indexes: ['bookable_type', 'bookable_id'])
            ;
        }
    }
}
