<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers\Booking\Bookings {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\Booking\BookingRescheduleService;
    use PHPCraftdream\IRabi\Common\Services\Comms\BookingChatNotifier;
    use PHPCraftdream\IRabi\Common\Services\Comms\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\Content\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use Throwable;

    /**
     * Перенос брони: подбор вариантов, сам перенос и его сообщения.
     *
     * Переносить может любая из сторон, поэтому в ленте событий и в письмах
     * роль инициатора передаётся явно — иначе получатель не поймёт, кто
     * поменял время.
     */
    trait BookingRescheduleTrait {
        /**
         * Сопоставление кодов сервиса переноса с текстами. Каждый отказ
         * получает свой — общий 400 «Bad request» здесь запрещён: ровно на нём
         * держался D-180, когда два законных статуса тикета молча отдавали
         * ошибку без единого слова о причине.
         */
        private static function rescheduleErrorText(string $code): string {
            $t = ForegroundI18n::getInstance();

            return match ($code) {
                BookingRescheduleService::ERR_NOT_FOUND => (string)$t->Reschedule_Err_NotFound(),
                BookingRescheduleService::ERR_ACCESS => (string)$t->Reschedule_Err_Access(),
                BookingRescheduleService::ERR_STATUS => (string)$t->Reschedule_Err_Status(),
                BookingRescheduleService::ERR_SOURCE_STARTED => (string)$t->Reschedule_Err_SourceStarted(),
                BookingRescheduleService::ERR_TARGET_MISSING => (string)$t->Reschedule_Err_TargetMissing(),
                BookingRescheduleService::ERR_TARGET_PAST => (string)$t->Reschedule_Err_TargetPast(),
                BookingRescheduleService::ERR_TARGET_OTHER_EXPERT => (string)$t->Reschedule_Err_TargetOtherExpert(),
                BookingRescheduleService::ERR_TARGET_OTHER_COST => (string)$t->Reschedule_Err_TargetOtherCost(),
                BookingRescheduleService::ERR_TARGET_SAME => (string)$t->Reschedule_Err_TargetSame(),
                BookingRescheduleService::ERR_TARGET_FULL => (string)$t->Reschedule_Err_TargetFull(),
                BookingRescheduleService::ERR_ALREADY_BOOKED => (string)$t->Reschedule_Err_AlreadyBooked(),
                default => (string)$t->Reschedule_Err_Raced(),
            };
        }

        /**
         * D-193: перенос занятия на другое время того же преподавателя.
         * Появился из вопроса Анны Ковальской (тикет #19) — до этого сменить
         * время можно было только отменой с удержанием неустойки, то есть за
         * деньги. Вся логика в BookingRescheduleService; здесь — вход, права
         * по CSRF и рассылка уведомлений.
         */
        public static function post__reschedule(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $bookingId = (int)$params->getUriParam('id');
            $targetSlotId = (int)$globals->readPostValue('slot_id', 0);
            if ($targetSlotId <= 0) {
                return ControllerTools::JSON(['error' => static::rescheduleErrorText(BookingRescheduleService::ERR_TARGET_MISSING)], status: 400);
            }

            // Состояние ДО переноса нужно прочитать здесь: после успеха бронь
            // уже указывает на новый слот, и старое время из неё не достать.
            $before = Bookings::get()->selectById($bookingId);
            $oldSlot = $before ? TimeSlots::get()->selectById((int)$before['bookable_id']) : null;

            $result = BookingRescheduleService::reschedule($bookingId, $targetSlotId, $account->id());

            if ($result['ok'] !== true) {
                $code = (string)$result['error'];
                $status = match ($code) {
                    BookingRescheduleService::ERR_NOT_FOUND => 404,
                    BookingRescheduleService::ERR_ACCESS => 403,
                    BookingRescheduleService::ERR_RACED => 409,
                    default => 400,
                };

                return ControllerTools::JSON(['error' => static::rescheduleErrorText($code)], status: $status);
            }

            $newSlot = TimeSlots::get()->selectById($targetSlotId);
            $studentId = (int)($before['user_id'] ?? 0);
            $expertId = (int)($oldSlot['expert_id'] ?? 0);
            $oldStartAt = (int)($oldSlot['start_at'] ?? 0);
            $newStartAt = (int)($newSlot['start_at'] ?? 0);

            // Узнать о переносе обязана вторая сторона — та, которая его не
            // делала. Уведомлять инициатора о собственном действии незачем.
            $recipientId = $account->id() === $studentId ? $expertId : $studentId;

            if ($recipientId > 0 && $oldStartAt > 0 && $newStartAt > 0) {
                $actorName = $account->readParam('name') ?: ('#' . $account->id());
                try {
                    BookingChatNotifier::rescheduled($account->id(), $recipientId, $oldStartAt, $newStartAt);
                } catch (Throwable) {
                }
                try {
                    EmailNotifications::bookingRescheduled(
                        $recipientId,
                        $oldStartAt,
                        $newStartAt,
                        (int)($newSlot['duration_min'] ?? 0),
                        $actorName,
                        (int)($newSlot['max_users'] ?? 1),
                    );
                } catch (Throwable) {
                }
                // Same "лента событий" duty booking/cancel already carry —
                // without this the only trace of a reschedule for the
                // recipient is chat + email, and the news feed (D-113's
                // lesson: events that skip the feed get "found" as bugs later).
                try {
                    // Either side can initiate a reschedule (unlike cancel,
                    // which is always expert vs. user) — carry the actor's
                    // role in the same user_id/expert_id shape booking_cancelled
                    // already uses, so the feed can branch the wording the
                    // same way.
                    $isActorStudent = $account->id() === $studentId;
                    NewsService::createPersonal(NewsService::TYPE_BOOKING_RESCHEDULED, $account->id(), $recipientId, [
                        'booking_id' => $bookingId,
                        'slot_id' => $targetSlotId,
                        'user_id' => $isActorStudent ? $account->id() : null,
                        'expert_id' => $isActorStudent ? null : $account->id(),
                        'name' => $actorName,
                        'time' => $newStartAt,
                    ], NewsService::slotKey($targetSlotId));
                } catch (Throwable) {
                }
            }

            return ControllerTools::JSON([
                'success' => true,
                'status' => $result['status'],
                'slot_id' => $targetSlotId,
                'message' => (string)ForegroundI18n::getInstance()->Reschedule_Success(),
            ]);
        }

        /**
         * Candidate target slots for the reschedule modal — same expert, same
         * cost, free, in the future. Read-only counterpart to post__reschedule's
         * own validation (BookingRescheduleService), kept here rather than in
         * the service since it's a listing query, not a mutation.
         */
        public static function post__rescheduleOptions(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $bookingId = (int)$params->getUriParam('id');
            $booking = Bookings::get()->selectById($bookingId);
            if (!$booking || (string)$booking['bookable_type'] !== 'time_slot') {
                return ControllerTools::JSON(['error' => static::rescheduleErrorText(BookingRescheduleService::ERR_NOT_FOUND)], status: 404);
            }

            $oldSlot = TimeSlots::get()->selectById((int)$booking['bookable_id']);
            if (!$oldSlot) {
                return ControllerTools::JSON(['error' => static::rescheduleErrorText(BookingRescheduleService::ERR_NOT_FOUND)], status: 404);
            }

            $studentId = (int)$booking['user_id'];
            $expertId = (int)($oldSlot['expert_id'] ?? 0);
            if ($account->id() !== $studentId && $account->id() !== $expertId) {
                return ControllerTools::JSON(['error' => static::rescheduleErrorText(BookingRescheduleService::ERR_ACCESS)], status: 403);
            }

            $oldSlotId = (int)$oldSlot['id'];
            $cost = (int)($oldSlot['cost'] ?? 0);
            $now = time();

            // Slots the student is already actively booked on would only fail
            // ERR_ALREADY_BOOKED on submit — filter them out here so the list
            // never offers a choice guaranteed to be refused.
            $activeSlotIds = array_map(
                static fn (array $b): int => (int)$b['bookable_id'],
                Bookings::get()->selectAll(function (SelectInterface $q) use ($studentId): void {
                    $q->where(
                        "user_id = ? AND bookable_type = 'time_slot' AND status IN ('pending','confirmed')",
                        [$studentId]
                    );
                })
            );

            $candidates = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($expertId, $cost, $oldSlotId, $now): void {
                $q->where(
                    'expert_id = ? AND status = ? AND start_at > ? AND cost = ? AND id <> ?',
                    [$expertId, 'free', $now, $cost, $oldSlotId]
                );
                $q->orderBy(['start_at ASC']);
                $q->limit(50);
            });

            $options = [];
            foreach ($candidates as $slot) {
                $slotId = (int)$slot['id'];
                if (in_array($slotId, $activeSlotIds, true)) {
                    continue;
                }
                $options[] = [
                    'id' => $slotId,
                    'start_at' => (int)$slot['start_at'],
                    'duration_min' => (int)$slot['duration_min'],
                ];
            }

            return ControllerTools::JSON(['success' => true, 'options' => $options]);
        }
    }
}
