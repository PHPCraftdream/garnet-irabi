<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers\Bookings {
    use Aura\SqlQuery\Common\SelectInterface;
    use Closure;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Exceptions\Db\DbException;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\Exceptions\AccountLockAcquireException;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use Throwable;

    /**
     * Создание брони: резерв места, списание, уведомления.
     */
    trait BookingCreateTrait {
        public static function post__book(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $t = ForegroundI18n::getInstance();
            $slotId = (int)$params->getUriParam('id');
            $slotArr = TimeSlots::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('`id` = :slot_id', ['slot_id' => $slotId])
                    ->where('status = :status_free', ['status_free' => 'free'])
                    ->limit(1);
            });
            $slot = $slotArr[0] ?? null;

            if (!$slot) {
                return ControllerTools::JSON(['error' => 'Slot not found or not available'], status: 404);
            }

            if ((int)$slot['start_at'] <= time()) {
                return ControllerTools::JSON(['error' => 'Cannot book a past slot'], status: 400);
            }

            $maxUsers = max(1, (int)($slot['max_users'] ?? 1));

            // Fast-fail UX check only — NOT the concurrency boundary. The real
            // capacity guard is the atomic reserveSeat() CAS below (security
            // audit H-01: two concurrent bookers could both pass this COUNT(*)
            // check and both insert before either commits).
            $activeBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('bookable_type = :btype', ['btype' => 'time_slot'])
                    ->where('bookable_id = :bid', ['bid' => $slotId])
                    ->where("status IN ('pending', 'confirmed')");
            });

            if (count($activeBookings) >= $maxUsers) {
                return ControllerTools::JSON(['error' => 'Slot is full'], status: 400);
            }

            $cost = (int)($slot['cost'] ?? 0);
            $expertId = (int)($slot['expert_id'] ?? 0);
            $now = time();

            if ($expertId === $account->id()) {
                return ControllerTools::JSON(['error' => 'Cannot book your own slot'], status: 400);
            }

            // Approval gate inside the transaction: a slot from an unapproved/
            // disabled expert is hidden from the public listing but must also be
            // unbookable via a direct slot id — see security audit.
            if (!UserEntityConfig::isApprovedActiveExpert($expertId)) {
                return ControllerTools::JSON(['error' => 'Slot not found or not available'], status: 404);
            }

            // 0) Atomic capacity reservation (security audit H-01) — the real
            //    concurrency boundary. Must happen before the booking INSERT.
            if (!TimeSlots::reserveSeat($slotId)) {
                return ControllerTools::JSON(['error' => 'Slot is full'], status: 400);
            }

            // 1) INSERT booking — UNIQUE(active_dup_key) handles duplicates atomically.
            try {
                $bookingId = (int)Bookings::get()->insert([
                    'user_id' => $account->id(),
                    'bookable_type' => 'time_slot',
                    'bookable_id' => $slotId,
                    'status' => 'pending',
                    'created_at' => $now,
                ]);
            } catch (DbException $e) {
                TimeSlots::releaseSeat($slotId);
                if (CasUpdate::isDuplicateKeyError($e)) {
                    return ControllerTools::JSON(['error' => 'Already booked'], status: 400);
                }
                throw $e;
            }

            // Money critical section (handover audit 03, finding H-1): the
            // transient CAS-debit and the ledger inserts must be serialised
            // per account against any concurrent recalculate() of the same
            // (debited) account — otherwise a concurrent top-up/refund
            // recomputes the cache from a ledger missing this debit and
            // resurrects the spent money, defeating the overdraft guard. The
            // lock spans CAS-debit → final recalculate of the debited account.
            // The expert (credited only) is recalculated after the lock: its
            // own per-account lock (via the recalculate override) applies.
            try {
                $moneyResult = AccountBalance::withAccountLock(
                    $account->id(),
                    static function () use ($cost, $now, $account, $slotId, $bookingId, $expertId, $activeBookings, $maxUsers, $t) {
                        // 2) CAS deduct + ledger entries (idempotent via UNIQUE(account_id, ref_type, ref_id, entry_type)).
                        if ($cost > 0) {
                            $balanceTbl = AccountBalance::get()->getTableName();
                            try {
                                $affected = CasUpdate::exec(
                                    "UPDATE {$balanceTbl} SET balance = balance - ?, updated_at = ? WHERE account_id = ? AND balance >= ?",
                                    [$cost, $now, $account->id(), $cost]
                                );
                            } catch (DbException $e) {
                                // Exception-aware compensation: roll back the booking insert before re-throwing.
                                Bookings::get()->deleteByField('id', $bookingId);
                                TimeSlots::releaseSeat($slotId);
                                throw $e;
                            }
                            if ($affected === 0) {
                                // Compensate: roll back the booking insert and the seat reservation.
                                Bookings::get()->deleteByField('id', $bookingId);
                                TimeSlots::releaseSeat($slotId);
                                return ControllerTools::JSON(['error' => 'Insufficient balance'], status: 400);
                            }

                            try {
                                BalanceLedger::get()->insert([
                                    'account_id' => $account->id(),
                                    'is_credit' => 0,
                                    'amount' => $cost,
                                    'entry_type' => 'booking_invoice',
                                    'ref_type' => 'booking',
                                    'ref_id' => $bookingId,
                                    'note' => $t->Ledger_Type_Invoice() . ' #' . $bookingId,
                                    'created_at' => $now,
                                ]);
                            } catch (DbException $e) {
                                if (!CasUpdate::isDuplicateKeyError($e)) {
                                    throw $e;
                                }
                            }

                            if ($expertId > 0) {
                                try {
                                    BalanceLedger::get()->insert([
                                        'account_id' => $expertId,
                                        'is_credit' => 1,
                                        'amount' => $cost,
                                        'entry_type' => 'booking_payment',
                                        'ref_type' => 'booking',
                                        'ref_id' => $bookingId,
                                        'note' => $t->Ledger_Type_Payment() . ' #' . $bookingId,
                                        'created_at' => $now,
                                    ]);
                                } catch (DbException $e) {
                                    if (!CasUpdate::isDuplicateKeyError($e)) {
                                        throw $e;
                                    }
                                }
                            }
                        }

                        // 3) CAS slot status update, gated on the real (post-reservation)
                        //    booked_count rather than the stale pre-reservation $activeBookings
                        //    count. Always safe to attempt — idempotent and best-effort; no
                        //    compensation needed if this fails, booking/ledger already committed.
                        $slotsTbl = TimeSlots::get()->getTableName();
                        CasUpdate::exec(
                            "UPDATE {$slotsTbl} SET status = 'booked' WHERE id = ? AND status = 'free' AND booked_count >= max_users",
                            [$slotId]
                        );
                        if (count($activeBookings) + 1 >= $maxUsers) {
                            // Slot is now full — purge the public new_slot announcement for everyone.
                            NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
                        }

                        AccountBalance::recalculate($account->id());

                        return null;
                    },
                );
            } catch (AccountLockAcquireException) {
                // Could not serialise the buyer's money ops within the timeout.
                // The booking was inserted and the seat reserved above, but no
                // money moved (the closure acquires the lock before the CAS-debit),
                // so roll both back before refusing.
                TimeSlots::releaseSeat($slotId);
                Bookings::get()->deleteByField('id', $bookingId);
                return ControllerTools::JSON(['error' => 'Account is busy, please retry'], status: 503);
            }

            if ($moneyResult !== null) {
                return $moneyResult;
            }

            if ($expertId > 0) {
                AccountBalance::recalculate($expertId);
            }
            if ($expertId > 0) {
                try {
                    $userName = $account->readParam('name') ?: ('#' . $account->id());
                    NewsService::createPersonal(NewsService::TYPE_SLOT_BOOKED, $account->id(), $expertId, [
                        'booking_id' => (int)$bookingId,
                        'slot_id' => $slotId,
                        'user_id' => $account->id(),
                        'name' => $userName,
                        'time' => (int)$slot['start_at'],
                    ], NewsService::slotKey($slotId));
                    EmailNotifications::bookingCreated($expertId, $account->id(), (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0), (int)($slot['max_users'] ?? 1));
                } catch (Throwable) {
                }
            }

            return ControllerTools::JSON(['success' => true, 'redirect' => '/bookings']);
        }
    }
}
