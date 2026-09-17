<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers\Bookings {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use Throwable;

    /**
     * Отмена брони и расчёт возврата.
     *
     * Самая денежная часть файла. computeRefundAmounts и текст примечания к
     * проводке — предмет дефектов D-140 и D-181: строка возврата у эксперта
     * обязана называть все три числа (сколько ушло, из чего, сколько
     * осталось), иначе журнал допускает ложное прочтение. Формулы и
     * формулировки трогать нельзя.
     *
     * Возврат идемпотентен, и на пути добора (backfill) побочные эффекты
     * сознательно НЕ повторяются: письма, лента и история отмен уже
     * отправлены первой попыткой.
     */
    trait BookingCancelTrait {
        public static function post__cancel(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $bookingId = (int)$params->getUriParam('id');
            $booking = Bookings::get()->selectById($bookingId);

            if (!$booking) {
                return ControllerTools::JSON(['error' => 'Booking not found'], status: 404);
            }

            $isOwner = (int)$booking['user_id'] === $account->id();
            $isModerator = $account->readData('IS_MODERATOR') === '1'
                || $account->readData('IS_OWNER') === '1'
                || $account->readData('IS_ADMIN') === '1';
            if (!$isOwner && !$isModerator) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            // ── Recover cancellation context ──────────────────────────────────
            // Backfill scenario (audit H-2): a booking already 'cancelled' may
            // be missing its refund if the original cancel crashed between the
            // CAS status transition and the ledger insert. The ledger's
            // UNIQUE(account_id, entry_type, ref_type, ref_id) makes
            // tryAddRefund() idempotent, so re-running the refund path is safe
            // whether or not the refund already landed — the second call is a
            // no-op (duplicate-key) and recalculate() recomputes the same sum.
            $currentStatus = (string)$booking['status'];
            $alreadyCancelled = $currentStatus === 'cancelled';

            // Read once for both paths; enforced only in the normal path below.
            $reason = trim((string)$globals->readPostValue('reason', ''));

            if ($alreadyCancelled) {
                // confirmed_at is set only at confirmation (confirmBooking) and
                // survives cancellation, so it reliably reconstructs the status
                // the booking had BEFORE it was cancelled.
                $previousStatus = $booking['confirmed_at'] !== null ? 'confirmed' : 'pending';
            } else {
                $previousStatus = $currentStatus;
                if (!in_array($previousStatus, ['pending', 'confirmed'], true)) {
                    return ControllerTools::JSON(['error' => 'Booking cannot be cancelled'], status: 400);
                }

                // Disallow cancellation of a CONFIRMED booking once the session has started/passed
                // (the session took place — no retroactive refund). Pending bookings are still
                // cancellable past the slot time: the expert never confirmed, so the user must be
                // able to reclaim their funds.
                if ($previousStatus === 'confirmed' && $booking['bookable_type'] === 'time_slot') {
                    $slotForTimeCheck = TimeSlots::get()->selectById((int)$booking['bookable_id']);
                    if ($slotForTimeCheck && (int)$slotForTimeCheck['start_at'] <= time()) {
                        // Единственная английская строка на этом пути в русском
                        // интерфейсе — и единственная, у которой не было ключа
                        // перевода. Сюда человек теперь почти не попадает
                        // (D-195 убрал само действие), но отказ он читает
                        // глазами, а не разбирает по коду ответа.
                        return ControllerTools::JSON(
                            ['error' => ForegroundI18n::getInstance()->Booking_CannotCancelStarted()],
                            status: 400,
                        );
                    }
                }

                // User-initiated cancellation requires a reason
                if ($isOwner && !$reason) {
                    return ControllerTools::JSON(['error' => 'Reason is required'], status: 400);
                }
            }

            // ── CAS cancel (normal path only) ────────────────────────────────
            $bookingsTbl = Bookings::get()->getTableName();
            $performedCancelNow = false;
            $now = time();

            if (!$alreadyCancelled) {
                // Роль берётся из того, кем вызвана отмена, а не из того, чья
                // это бронь: сюда приходят и сам ученик, и администрация,
                // и по строке в базе их потом уже не различить.
                $cancelledRole = $isOwner ? Bookings::CANCELLED_BY_USER : Bookings::CANCELLED_BY_MODERATOR;

                $affected = CasUpdate::exec(
                    "UPDATE {$bookingsTbl} SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_role = ?, cancel_reason = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
                    [$now, $account->id(), $cancelledRole, mb_substr($reason, 0, 500), $bookingId]
                );
                if ($affected === 1) {
                    $performedCancelNow = true;
                } else {
                    // Raced: a concurrent request cancelled it between our read
                    // and the CAS. Fall through to the idempotent refund path.
                    // Re-read for the fresh cancelled_at used as the penalty-
                    // timing reference below.
                    $alreadyCancelled = true;
                    $fresh = Bookings::get()->selectById($bookingId);
                    if ($fresh) {
                        $booking = $fresh;
                    }
                    $previousStatus = $booking['confirmed_at'] !== null ? 'confirmed' : 'pending';
                }
            }

            if ($alreadyCancelled) {
                // Use the recorded cancellation moment as the penalty-timing
                // reference — more accurate than this retry's wall-clock time,
                // which may arrive long after the actual cancellation.
                $now = (int)($booking['cancelled_at'] ?? time());
            }

            // ── Refund (shared by normal + backfill paths; idempotent) ───────
            $slotId = 0;
            $expertId = 0;
            $bookingUserId = (int)$booking['user_id'];
            if ($booking['bookable_type'] === 'time_slot') {
                // Release the seat this booking held — counterpart to reserveSeat()
                // in post__book(). Only when THIS request transitioned the booking;
                // the original (crashed) attempt already released it.
                if ($performedCancelNow) {
                    TimeSlots::releaseSeat((int)$booking['bookable_id']);
                }

                $slot2 = TimeSlots::get()->selectById((int)$booking['bookable_id']);
                $slotId = (int)$booking['bookable_id'];
                $cost = (int)($slot2['cost'] ?? 0);
                $expertId = (int)($slot2['expert_id'] ?? 0);
                $startAt = (int)($slot2['start_at'] ?? 0);
                $penaltyPct = (int)($slot2['cancellation_penalty_percent'] ?? 0);

                if ($cost > 0) {
                    [$userRefund, $expertDebit, $noteSuffix] = static::computeRefundAmounts(
                        cost: $cost,
                        previousStatus: $previousStatus,
                        startAt: $startAt,
                        penaltyPct: $penaltyPct,
                        byUser: $isOwner,
                        nowTs: $now,
                    );

                    if ($userRefund > 0) {
                        $t = ForegroundI18n::getInstance();
                        $note = $t->Ledger_Type_Refund() . ' #' . $bookingId . ($noteSuffix !== '' ? ' (' . $noteSuffix . ')' : '');
                        BalanceLedger::tryAddRefund($bookingUserId, true, $userRefund, $bookingId, $note);
                        if ($expertId && $expertDebit > 0) {
                            // D-140: this row is a DEBIT on the expert's own
                            // balance — reusing the student's "Возврат"
                            // wording here read as "I paid the student",
                            // with no hint that the withheld penalty (cost -
                            // expertDebit) is compensation they kept, not a
                            // loss on top of it.
                            $penaltyKept = $cost - $expertDebit;
                            // D-181: пояснение идёт после тире, а не в
                            // скобках — внутри самого пояснения уже есть
                            // скобка с процентом, и вложенные скобки в
                            // денежной строке читаются хуже всего.
                            $expertNote = $penaltyKept > 0
                                ? $t->Ledger_Type_Refund() . ' #' . $bookingId . ' — '
                                    . $t->Ledger_Note_ExpertKeepsPenalty(
                                        (string)$expertDebit,
                                        (string)$cost,
                                        (string)$penaltyKept,
                                        (string)$penaltyPct,
                                    )
                                : $note;
                            BalanceLedger::tryAddRefund($expertId, false, $expertDebit, $bookingId, $expertNote);
                        }
                    }
                }
            }

            // ── Side effects (normal path only — this request did the cancel) ─
            // On the backfill path the original attempt already emitted these;
            // re-running them would duplicate audit rows, slot-status reverts,
            // emails and news entries. The refund above is the only thing that
            // needs to be (idempotently) retried.
            if ($performedCancelNow) {
                if ($isOwner) {
                    UserCancellations::get()->insert([
                        'user_id' => $bookingUserId,
                        'booking_id' => $bookingId,
                        'slot_id' => $slotId,
                        'expert_id' => $expertId,
                        'reason' => $reason,
                        'created_at' => time(),
                        'kind' => Bookings::cancellationKind($previousStatus),
                    ]);
                }

                if ($booking['bookable_type'] === 'time_slot') {
                    $slot = TimeSlots::get()->selectById($slotId);

                    if ($slot && $slot['status'] === 'booked') {
                        $maxUsers = max(1, (int)($slot['max_users'] ?? 1));
                        $remaining = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                            $query->where('bookable_type = :btype', ['btype' => 'time_slot'])
                                ->where('bookable_id = :bid', ['bid' => $slotId])
                                ->where("status IN ('pending', 'confirmed')");
                        });
                        if (count($remaining) < $maxUsers) {
                            // CAS slot status revert: only if currently booked (idempotent).
                            $slotsTbl = TimeSlots::get()->getTableName();
                            CasUpdate::exec(
                                "UPDATE {$slotsTbl} SET status = 'free' WHERE id = ? AND status = 'booked'",
                                [$slotId]
                            );
                        }
                    }

                    if ($slot) {
                        try {
                            $cancelledByName = $account->readParam('name') ?: ('#' . $account->id());
                            EmailNotifications::bookingCancelled((int)$slot['expert_id'], (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0), $cancelledByName, $reason, (int)($slot['max_users'] ?? 1));
                        } catch (Throwable) {
                        }

                        $slotExpertId = (int)($slot['expert_id'] ?? 0);
                        // Notify expert that their slot's booking was cancelled by the user.
                        if ($slotExpertId > 0) {
                            try {
                                NewsService::createPersonal(NewsService::TYPE_BOOKING_CANCELLED, $account->id(), $slotExpertId, [
                                    'booking_id' => $bookingId,
                                    'slot_id' => $slotId,
                                    'user_id' => $account->id(),
                                    'name' => $cancelledByName ?? ('#' . $account->id()),
                                    'time' => (int)($slot['start_at'] ?? 0),
                                ], NewsService::slotKey($slotId));
                            } catch (Throwable) {
                            }
                        }
                        // Отменил не владелец брони — значит, с его занятием
                        // распорядился кто-то другой, и узнать об этом он должен
                        // не из молчания. Сюда приходит администрация тем же
                        // эндпоинтом; преподавателю событие уходит выше, а
                        // ученику до этого не уходило никому.
                        if (!$isOwner && $bookingUserId > 0) {
                            try {
                                NewsService::createPersonal(NewsService::TYPE_BOOKING_CANCELLED, $account->id(), $bookingUserId, [
                                    'booking_id' => $bookingId,
                                    'slot_id' => $slotId,
                                    'user_id' => $account->id(),
                                    'name' => $cancelledByName ?? ('#' . $account->id()),
                                    'time' => (int)($slot['start_at'] ?? 0),
                                ], NewsService::slotKey($slotId));
                            } catch (Throwable) {
                            }
                        }

                        // Purge the stale `slot_booked` announcement for this slot — it no longer holds.
                        NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_SLOT_BOOKED);
                    }
                }
            }

            // Recalculate balances after refund (both paths — idempotent).
            AccountBalance::recalculate($bookingUserId);
            if ($expertId > 0) {
                AccountBalance::recalculate($expertId);
            }

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Compute refund split for a booking cancellation.
         *
         * Partial-refund branch (penalty applies) ONLY when ALL hold:
         *   - cancellation initiated by the booking's owner ($byUser)
         *   - previous booking status was 'confirmed'
         *   - slot's start_at is in the future ($startAt > $nowTs)
         *
         * In that branch the user is refunded `cost - penalty` and the expert
         * is debited the same amount (the penalty stays with the expert as
         * part of the original `booking_payment` credit). When penalty == 100%
         * (refund == 0), no ledger movement is produced.
         *
         * In all other cases (pending bookings, past slots, expert-initiated),
         * a full refund is returned (cost on both sides).
         *
         * @return array{0:int,1:int,2:string} [userRefund, expertDebit, noteSuffix]
         */
        private static function computeRefundAmounts(
            int $cost,
            string $previousStatus,
            int $startAt,
            int $penaltyPct,
            bool $byUser,
            int $nowTs
        ): array {
            $partialApplies = $byUser
                && $previousStatus === 'confirmed'
                && $startAt > $nowTs;

            if (!$partialApplies) {
                return [$cost, $cost, ''];
            }

            $penaltyPct = max(0, min(100, $penaltyPct));
            $penalty = intdiv($cost * $penaltyPct, 100);
            $refund = $cost - $penalty;

            // Примечание к возврату человек читает в истории операций, и это
            // единственное место, где он видит, за что удержаны деньги.
            // Английское «penalty 30%» посреди русского интерфейса выглядело
            // отладочной строкой, а не объяснением (нашёл user-2).
            // Аргументы подстановки идут россыпью, а не массивом: `__call`
            // отдаёт их в `sprintf` через распаковку, и обёрнутый массив
            // роняет запрос с «Array to string conversion». На клиенте
            // соглашение обратное — `t.Key([arg])`, — и на этом легко
            // ошибиться.
            // Сумма удержания в рублях, а не только процент: процент без
            // исходной цены не говорит ничего — читатель вынужден был
            // найти парную строку списания и вычесть в уме (нашёл user-2).
            $note = ForegroundI18n::getInstance()->Ledger_Note_Penalty((string)$penalty, (string)$penaltyPct);

            return [$refund, $refund, $note];
        }
    }
}
