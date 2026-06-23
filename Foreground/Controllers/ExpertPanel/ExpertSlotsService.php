<?php declare(strict_types=1);

/**
 * Сервис управления слотами эксперта: создание, редактирование, пакетное создание, удаление.
 */

namespace PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Calendar\SlotDateFilter;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\System\AppSettings;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;

    class ExpertSlotsService {
        /**
         * Страница управления слотами эксперта.
         *
         * @param callable(string): string $renderContent
         */
        public static function slotsPage(IGlobalReqParams $globals, Account $account, callable $renderContent): mixed {
            $accountId = $account->id();
            $slots = TimeSlots::get()->selectByField('expert_id', $accountId, function (SelectInterface $query): void {
                $query->orderBy(['start_at ASC']);
            });

            // Enrich booked slots with user info
            $bookedSlotIds = [];
            foreach ($slots as $s) {
                if ($s['status'] === 'booked') {
                    $bookedSlotIds[] = (int)$s['id'];
                }
            }

            $userMap = []; // slotId => ['user_id' => ..., 'user_name' => ...]
            if (!empty($bookedSlotIds)) {
                $bookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($bookedSlotIds): void {
                    $q->where('bookable_type = ?', ['time_slot']);
                    $q->where('bookable_id IN (?)', [array_map('intval', $bookedSlotIds)]);
                    $q->where("status IN ('pending','confirmed')");
                });

                $userIds = array_unique(array_filter(array_map(fn ($b) => (int)$b['user_id'], $bookings)));
                $users = [];
                if (!empty($userIds)) {
                    $accs = Account::getAccounts(
                        selectCallback: static function (SelectInterface $select) use ($userIds): void {
                            $select->resetCols();
                            $select->cols(['id', 'name', 'login']);
                            $select->where('id IN (?)', [array_map('intval', $userIds)]);
                        },
                    );
                    foreach ($accs as $a) {
                        $users[(int)$a['id']] = $a;
                    }
                }

                $disabledUserIds = AccountDisplay::disabledIds(array_values($userIds));
                foreach ($bookings as $b) {
                    $slotId = (int)$b['bookable_id'];
                    $sid = (int)$b['user_id'];
                    if (isset($disabledUserIds[$sid])) {
                        $userName = AccountDisplay::disabledName($sid);
                    } else {
                        $acc = $users[$sid] ?? null;
                        $userName = $acc ? ($acc['name'] ?: $acc['login']) : '';
                    }
                    $userMap[$slotId] = [
                        'user_id' => $sid,
                        'user_name' => $userName,
                        'booking_id' => (int)$b['id'],
                        'booking_status' => $b['status'],
                    ];
                }
            }

            // Merge user info into slots
            foreach ($slots as &$slot) {
                $sid = (int)$slot['id'];
                if (isset($userMap[$sid])) {
                    $slot['user_id'] = $userMap[$sid]['user_id'];
                    $slot['user_name'] = $userMap[$sid]['user_name'];
                    $slot['booking_id'] = $userMap[$sid]['booking_id'];
                    $slot['booking_status'] = $userMap[$sid]['booking_status'];
                }
            }
            unset($slot);

            $content = RenderIsland::render('expert-slots', [
                'slots' => array_values($slots),
                'slotFieldsInfo' => ExpertHelpers::slotFieldsInfo(),
                'currentAccountId' => $accountId,
                'isApproved' => $account->isApproved(),
                'messagesUrl' => IRabi::url('/im/~messages'),
                'sendUrl' => IRabi::url('/im/~send'),
                'quickChatUrl' => IRabi::url('/im/~quickChat'),
                'userPreviewUrl' => IRabi::url('/expert/~userPreview'),
                'defaultPenaltyPercent' => AppSettings::cancellationPenaltyPercent(),
            ]);

            return $renderContent($content);
        }

        /**
         * Быстрый предпросмотр профиля пользователя, забронировавшего слот.
         */
        public static function userPreview(IGlobalReqParams $globals, Account $account): mixed {
            $expertId = $account->id();
            $userId = (int)$globals->readPostValue('user_id', '0');

            if (!$userId) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            // Returned data is non-sensitive (id + name + per-expert stats);
            // login is never exposed. Same info is visible on the public profile.
            // Stats are scoped to this expert's slots; 0 if expert has none.
            $expertSlotIds = array_column(
                TimeSlots::get()->selectByField('expert_id', $expertId),
                'id'
            );

            // Get user account info
            $userAccs = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($userId): void {
                    $select->resetCols();
                    $select->cols(['id', 'name', 'login']);
                    $select->where('id = ?', [$userId]);
                },
            );
            $userAcc = $userAccs[0] ?? null;
            if (!$userAcc) {
                return ControllerTools::JSON(['error' => 'User not found'], status: 404);
            }

            // Stats: completed sessions (completed bookings on expert's slots)
            $completedBookings = 0;
            $totalBookings = 0;
            if (!empty($expertSlotIds)) {
                $completedRows = Bookings::get()->selectAll(function (SelectInterface $q) use ($expertSlotIds, $userId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt']);
                    $q->where('bookable_type = ?', ['time_slot']);
                    $q->where('bookable_id IN (?)', [array_map('intval', $expertSlotIds)]);
                    $q->where('user_id = ?', [$userId]);
                    $q->where('status = ?', ['completed']);
                });
                $completedBookings = (int)($completedRows[0]['cnt'] ?? 0);

                $totalRows = Bookings::get()->selectAll(function (SelectInterface $q) use ($expertSlotIds, $userId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt']);
                    $q->where('bookable_type = ?', ['time_slot']);
                    $q->where('bookable_id IN (?)', [array_map('intval', $expertSlotIds)]);
                    $q->where('user_id = ?', [$userId]);
                });
                $totalBookings = (int)($totalRows[0]['cnt'] ?? 0);
            }

            // Cancellations by user on expert's slots
            $cancelledRows = Bookings::get()->selectAll(function (SelectInterface $q) use ($expertSlotIds, $userId): void {
                $q->resetCols()->cols(['COUNT(*) as cnt']);
                $q->where('bookable_type = ?', ['time_slot']);
                $q->where('bookable_id IN (?)', [array_map('intval', $expertSlotIds)]);
                $q->where('user_id = ?', [$userId]);
                $q->where('status = ?', ['cancelled']);
            });
            $userCancellations = (int)($cancelledRows[0]['cnt'] ?? 0);

            return ControllerTools::JSON([
                'user' => [
                    'id' => (int)$userAcc['id'],
                    'name' => $userAcc['name'] ?: $userAcc['login'],
                    'completedBookings' => $completedBookings,
                    'totalBookings' => $totalBookings,
                    'userCancellations' => $userCancellations,
                ],
            ]);
        }

        /**
         * Создание одиночного слота.
         */
        public static function createSlot(IGlobalReqParams $globals, Account $account): mixed {
            $date = $globals->readPostValue('date');
            $time = $globals->readPostValue('time');
            $duration = (int)$globals->readPostValue('duration', 60);
            $cost = (int)$globals->readPostValue('cost', 0);
            $isOnline = (int)$globals->readPostValue('is_online', 1);
            $location = $globals->readPostValue('location', '');
            $maxUsers = max(1, (int)$globals->readPostValue('max_users', 1));

            $penaltyRaw = $globals->readPostValue('cancellation_penalty_percent');
            if ($penaltyRaw === null || $penaltyRaw === '') {
                $penaltyPercent = AppSettings::cancellationPenaltyPercent();
            } else {
                $penaltyPercent = max(0, min(100, (int)$penaltyRaw));
            }

            if (!$date || !$time) {
                return ControllerTools::JSON(['error' => 'Date and time required'], status: 400);
            }

            if ($cost < 0) {
                return ControllerTools::JSON(['error' => 'Invalid cost'], status: 400);
            }

            $expertTz = $account->readParam('time_zone') ?: 'UTC';
            $startAt = DateUtils::parseUserDateTime($date, $time, $expertTz);
            if ($startAt <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid date or time'], status: 400);
            }
            $endAt = $startAt + $duration * 60;

            // Overlap check
            $t = ForegroundI18n::getInstance();
            $overlap = ExpertHelpers::findOverlap($account->id(), $startAt, $endAt);
            if ($overlap !== null) {
                return ControllerTools::JSON([
                    'error' => $t->Slot_OverlapError(),
                    'overlap' => true,
                ], status: 400);
            }

            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $account->id());

            if (!$expertProfile) {
                ExpertProfiles::get()->insert([
                    'account_id' => $account->id(),
                    'display_name' => $account->readParam('name') ?: '',
                    'bio' => '',
                    'specialization' => '',
                    'is_approved' => 0,
                ]);
            }

            $slotId = TimeSlots::get()->insert([
                'expert_id' => $account->id(),
                'start_at' => $startAt,
                'end_at' => $endAt,
                'duration_min' => $duration,
                'cost' => $cost,
                'is_online' => $isOnline,
                'location' => $location,
                'max_users' => $maxUsers,
                'status' => 'free',
                'uid' => TimeSlots::generateUid(),
                'created_at' => time(),
                'cancellation_penalty_percent' => $penaltyPercent,
            ]);

            // News: broadcast new slot (only for approved experts)
            $expertName = ($expertProfile['display_name'] ?? '') ?: ($account->readParam('name') ?: ('#' . $account->id()));
            if ($account->isApproved()) {
                NewsService::createBroadcast(NewsService::TYPE_NEW_SLOT, $account->id(), [
                    'slot_id' => (int)$slotId,
                    'expert_id' => $account->id(),
                    'name' => $expertName,
                    'time' => $startAt,
                    'cost' => $cost,
                ], NewsService::slotKey((int)$slotId));
            }

            return ControllerTools::JSON([
                'success' => true,
                'slot_id' => $slotId,
                'slot' => [
                    'id' => (int)$slotId,
                    'start_at' => $startAt,
                    'end_at' => $endAt,
                    'duration_min' => $duration,
                    'cost' => $cost,
                    'status' => 'free',
                    'max_users' => $maxUsers,
                    'cancellation_penalty_percent' => $penaltyPercent,
                ],
            ]);
        }

        /**
         * Предпросмотр пакетного создания слотов: анализ диапазона дат.
         */
        public static function batchPreview(IGlobalReqParams $globals, Account $account): mixed {
            $startDate = $globals->readPostValue('start_date');
            $endDate = $globals->readPostValue('end_date');
            $count = (int)$globals->readPostValue('count', 4);
            $duration = (int)$globals->readPostValue('duration', 60);

            if (!$startDate || !$endDate) {
                return ControllerTools::JSON(['error' => 'Start date and end date required'], status: 400);
            }

            $expertTz = $account->readParam('time_zone') ?: 'UTC';
            $rangeStart = DateUtils::startOfDayForUser($startDate, $expertTz);
            $rangeEnd = DateUtils::endOfDayForUser($endDate, $expertTz);
            if ($rangeStart <= 0 || $rangeEnd <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid date or time'], status: 400);
            }

            $analysis = SlotDateFilter::analyzeDateRange($startDate, $endDate);
            $proposed = SlotDateFilter::distributeSlots($analysis['available'], $count);

            $existing = TimeSlots::get()->selectByField('expert_id', $account->id(), function (SelectInterface $q) use ($rangeStart, $rangeEnd): void {
                $q->where('start_at >= ? AND start_at <= ?', [$rangeStart, $rangeEnd]);
                $q->where("status != 'cancelled'");
            });

            $existingSlots = ExpertHelpers::formatExistingItems($existing, $expertTz);

            return ControllerTools::JSON([
                'availableDates' => $analysis['available'],
                'restrictedDates' => $analysis['restricted'],
                'proposedDates' => $proposed,
                'existingSlots' => $existingSlots,
                'totalAvailable' => count($analysis['available']),
                'totalRestricted' => count($analysis['restricted']),
            ]);
        }

        /**
         * Пакетное создание слотов с проверкой пересечений.
         */
        public static function batchSlots(IGlobalReqParams $globals, Account $account): mixed {
            $slotsJson = $globals->readPostValue('slots');
            $cost = (int)$globals->readPostValue('cost', 500);
            $maxUsers = max(1, (int)$globals->readPostValue('max_users', 1));

            $penaltyRaw = $globals->readPostValue('cancellation_penalty_percent');
            if ($penaltyRaw === null || $penaltyRaw === '') {
                $penaltyPercent = AppSettings::cancellationPenaltyPercent();
            } else {
                $penaltyPercent = max(0, min(100, (int)$penaltyRaw));
            }

            if ($cost < 0) {
                return ControllerTools::JSON(['error' => 'Invalid cost'], status: 400);
            }

            $slots = json_decode($slotsJson, true);
            if (!is_array($slots) || empty($slots)) {
                return ControllerTools::JSON(['error' => 'No slots provided'], status: 400);
            }

            $allDates = array_column($slots, 'date');
            sort($allDates);
            $analysis = SlotDateFilter::analyzeDateRange($allDates[0], $allDates[count($allDates) - 1]);
            $availableDateStrings = array_column($analysis['available'], 'date');

            $expertId = $account->id();
            $expertTz = $account->readParam('time_zone') ?: 'UTC';
            $minDate = $allDates[0];
            $maxDate = $allDates[count($allDates) - 1];
            $rangeStart = DateUtils::startOfDayForUser($minDate, $expertTz);
            $rangeEnd = DateUtils::endOfDayForUser($maxDate, $expertTz);
            if ($rangeStart <= 0 || $rangeEnd <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid date or time'], status: 400);
            }

            $existing = TimeSlots::get()->selectByField('expert_id', $expertId, function (SelectInterface $q) use ($rangeStart, $rangeEnd): void {
                $q->where('start_at >= ? AND start_at <= ?', [$rangeStart, $rangeEnd]);
                $q->where("status != 'cancelled'");
            });

            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $account->id());
            if (!$expertProfile) {
                ExpertProfiles::get()->insert([
                    'account_id' => $account->id(),
                    'display_name' => $account->readParam('name') ?: '',
                    'bio' => '',
                    'specialization' => '',
                    'is_approved' => 0,
                ]);
            }

            $t = ForegroundI18n::getInstance();
            $rows = [];
            $overlaps = [];

            foreach ($slots as $slot) {
                $date = $slot['date'] ?? '';
                $time = $slot['time'] ?? '10:00';
                $duration = (int)($slot['duration'] ?? 60);

                if (!in_array($date, $availableDateStrings, true)) {
                    continue;
                }

                $proposedStart = DateUtils::parseUserDateTime($date, $time, $expertTz);
                if ($proposedStart <= 0) {
                    continue;
                }
                $proposedEnd = $proposedStart + $duration * 60;

                $hasOverlap = false;

                // Check against existing slots
                foreach ($existing as $ex) {
                    $exStart = (int)$ex['start_at'];
                    $exEnd = (int)$ex['end_at'];
                    if ($proposedStart < $exEnd && $proposedEnd > $exStart) {
                        $hasOverlap = true;
                        $overlaps[] = ['date' => $date, 'time' => $time, 'reason' => $t->Slot_OverlapError()];
                        break;
                    }
                }

                if ($hasOverlap) {
                    continue;
                }

                $rows[] = [
                    'expert_id' => $account->id(),
                    'start_at' => $proposedStart,
                    'end_at' => $proposedEnd,
                    'duration_min' => $duration,
                    'cost' => $cost,
                    'is_online' => 1,
                    'location' => '',
                    'max_users' => $maxUsers,
                    'status' => 'free',
                    'uid' => TimeSlots::generateUid(),
                    'created_at' => time(),
                    'cancellation_penalty_percent' => $penaltyPercent,
                ];
            }

            $createdSlots = [];
            foreach ($rows as $row) {
                $newId = TimeSlots::get()->insert($row);
                $createdSlots[] = [
                    'id' => (int)$newId,
                    'start_at' => (int)$row['start_at'],
                    'end_at' => (int)$row['end_at'],
                    'duration_min' => (int)$row['duration_min'],
                    'cost' => (int)$row['cost'],
                    'status' => 'free',
                    'max_users' => (int)$row['max_users'],
                    'cancellation_penalty_percent' => (int)$row['cancellation_penalty_percent'],
                ];
            }

            return ControllerTools::JSON(['success' => true, 'created' => count($rows), 'overlaps' => $overlaps, 'slots' => $createdSlots]);
        }

        /**
         * Редактирование свободного слота (дата/время, стоимость и т.д.).
         */
        public static function editSlot(IGlobalReqParams $globals, Account $account): mixed {
            $slotId = (int)$globals->readPostValue('slot_id', '0');

            $slot = TimeSlots::get()->selectOneByField('id', $slotId);
            if (!$slot || (int)$slot['expert_id'] !== $account->id()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            if ($slot['status'] !== 'free') {
                return ControllerTools::JSON(['error' => 'Only free slots can be edited'], status: 400);
            }

            if ((int)$slot['start_at'] < time()) {
                return ControllerTools::JSON(['error' => 'Cannot edit past slots'], status: 400);
            }

            $date = $globals->readPostValue('date', '');
            $time = $globals->readPostValue('time', '');
            $durationMin = (int)$globals->readPostValue('duration_min', '0');
            $cost = (int)$globals->readPostValue('cost', '0');
            if ($cost < 0) {
                return ControllerTools::JSON(['error' => 'Invalid cost'], status: 400);
            }
            $maxUsers = (int)$globals->readPostValue('max_users', '1');
            $isOnline = (int)$globals->readPostValue('is_online', '0');
            $location = $globals->readPostValue('location', '');

            $updateData = [];

            if (!empty($date) && !empty($time)) {
                $expertTz = $account->readParam('time_zone') ?: 'UTC';
                $startAt = DateUtils::parseUserDateTime($date, $time, $expertTz);
                if ($startAt <= 0) {
                    return ControllerTools::JSON(['error' => 'Invalid date/time'], status: 400);
                }
                if ($startAt < time()) {
                    return ControllerTools::JSON(['error' => 'Cannot reschedule to a past time'], status: 400);
                }
                $updateData['start_at'] = $startAt;

                if ($durationMin > 0) {
                    $updateData['end_at'] = $startAt + $durationMin * 60;
                    $updateData['duration_min'] = $durationMin;
                } else {
                    $updateData['end_at'] = $startAt + (int)$slot['duration_min'] * 60;
                }

                // Rotate uid when time changes — invalidates any pending bookings
                $updateData['uid'] = TimeSlots::generateUid();
            } elseif ($durationMin > 0) {
                $updateData['duration_min'] = $durationMin;
                $updateData['end_at'] = (int)$slot['start_at'] + $durationMin * 60;
            }

            // Overlap check when time range changes
            $newStart = (int)($updateData['start_at'] ?? $slot['start_at']);
            $newEnd = (int)($updateData['end_at'] ?? $slot['end_at']);
            if (isset($updateData['start_at']) || isset($updateData['end_at'])) {
                $t = ForegroundI18n::getInstance();
                $overlap = ExpertHelpers::findOverlap($account->id(), $newStart, $newEnd, $slotId);
                if ($overlap !== null) {
                    return ControllerTools::JSON([
                        'error' => $t->Slot_OverlapError(),
                        'overlap' => true,
                    ], status: 400);
                }
            }

            if ($globals->readPostValue('cost') !== null) {
                $updateData['cost'] = $cost;
            }
            if ($globals->readPostValue('max_users') !== null) {
                $updateData['max_users'] = $maxUsers;
            }
            if ($globals->readPostValue('is_online') !== null) {
                $updateData['is_online'] = $isOnline;
            }
            if ($globals->readPostValue('location') !== null) {
                $updateData['location'] = $location;
            }
            if ($globals->readPostValue('cancellation_penalty_percent') !== null) {
                $penaltyPercent = max(0, min(100, (int)$globals->readPostValue('cancellation_penalty_percent', '0')));
                $updateData['cancellation_penalty_percent'] = $penaltyPercent;
            }

            if (!empty($updateData)) {
                $setParts = [];
                $params = [];
                foreach ($updateData as $col => $val) {
                    $setParts[] = "$col = ?";
                    $params[] = $val;
                }
                $params[] = $slotId;
                $sql = 'UPDATE ' . TimeSlots::get()->getTableName() . ' SET ' . implode(', ', $setParts) . " WHERE id = ? AND status = 'free'";
                $affected = CasUpdate::exec($sql, $params);
                if ($affected === 0) {
                    return ControllerTools::JSON(['error' => 'Slot has been booked, refresh and retry'], status: 409);
                }
            }

            $updated = TimeSlots::get()->selectOneByField('id', $slotId);
            return ControllerTools::JSON(['success' => true, 'slot' => $updated]);
        }

        /**
         * Удаление свободного слота без активных бронирований.
         */
        public static function deleteSlot(IGlobalReqParams $globals, Account $account): mixed {
            $slotId = (int)$globals->readPostValue('slot_id', '0');

            $slot = TimeSlots::get()->selectOneByField('id', $slotId);
            if (!$slot || (int)$slot['expert_id'] !== $account->id()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            if ($slot['status'] !== 'free') {
                return ControllerTools::JSON(['error' => 'Only free slots can be deleted'], status: 400);
            }

            if ((int)$slot['start_at'] < time()) {
                return ControllerTools::JSON(['error' => 'Cannot delete past slots'], status: 400);
            }

            $activeBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('bookable_id = :bid', ['bid' => $slotId]);
                $query->where('bookable_type = :btype', ['btype' => 'time_slot']);
                $query->where("status IN ('pending', 'confirmed')");
            });

            if (!empty($activeBookings)) {
                return ControllerTools::JSON(['error' => 'Cannot delete slot with active bookings'], status: 400);
            }

            TimeSlots::get()->deleteById($slotId);

            // Slot is gone — purge every event associated with this slot for everyone.
            NewsService::deleteByTargetKey(NewsService::slotKey($slotId));

            return ControllerTools::JSON(['success' => true]);
        }
    }
}
