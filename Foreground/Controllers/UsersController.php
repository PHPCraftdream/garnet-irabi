<?php declare(strict_types=1);

/**
 * Тонкий контроллер для inline-предпросмотра профилей в foreground.
 *
 * Эндпоинт /users/~preview возвращает публичные данные о любом аккаунте
 * любому залогиненному пользователю. Email/login никогда не отдаётся.
 */

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;

    class UsersController extends FrameworkController {
        public const URL = '/users';

        public static function post__preview(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $viewer = Account::fromSession();
            if (!$viewer) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $userId = (int)$globals->readPostValue('user_id', '0');
            if ($userId <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            // Load id+name only — never expose login/email. `type` lives in db_accounts_data,
            // so derive it from ExpertProfiles existence instead of selecting it as a column.
            // If account row is missing (e.g. stale news referencing a deleted/reseeded id) —
            // fall back to a stub so preview opens gracefully with "#id" as the name.
            $acc = DbAccount::get()->selectOneByField('id', $userId);

            // Disabled accounts must be anonymised uniformly across every surface —
            // show the "Пользователь #{id} отключён" placeholder, a placeholder
            // avatar and no expert profile, matching how slots/news/im already
            // render blocked users.
            $isDisabled = AccountDisplay::isDisabled($userId);
            if ($isDisabled) {
                $name = AccountDisplay::disabledName($userId);
            } else {
                $name = $acc ? trim((string)($acc['name'] ?? '')) : '';
                if ($name === '') {
                    $name = '#' . $userId;
                }
            }

            $expertProfileRow = ExpertProfiles::get()->selectOneByField('account_id', $userId);
            $type = $expertProfileRow ? 'expert' : 'user';

            $payload = [
                'id' => $userId,
                'name' => $name,
                'type' => $type,
                'avatar' => $isDisabled ? UserEntityConfig::avatarUrl([]) : UserEntityConfig::avatarUrl([
                    'photo' => $acc['photo'] ?? null,
                    'photo_cropped' => $acc['photo_cropped'] ?? null,
                    'token16' => $acc['token16'] ?? null,
                ]),
                'expertProfile' => null,
                'stats' => [],
            ];

            if ($type === 'expert') {
                $profile = $expertProfileRow;
                $isApproved = (int)($profile['is_approved'] ?? 0) === 1;
                if ($isApproved && !$isDisabled) {
                    $payload['expertProfile'] = [
                        'display_name' => (string)($profile['display_name'] ?? ''),
                        'specialization' => (string)($profile['specialization'] ?? ''),
                        'bio' => (string)($profile['bio'] ?? ''),
                    ];
                }

                // Expert stats: scoped to this expert's slots.
                $slotIds = array_column(
                    TimeSlots::get()->selectByField('expert_id', $userId),
                    'id'
                );

                $conducted = 0;
                $total = 0;
                $cancellations = 0;

                if (!empty($slotIds)) {
                    $slotIds = array_map('intval', $slotIds);

                    $row = Bookings::get()->selectAll(function (SelectInterface $q) use ($slotIds): void {
                        $q->resetCols()->cols(['COUNT(*) as cnt']);
                        $q->where('bookable_type = ?', ['time_slot']);
                        $q->where('bookable_id IN (?)', [$slotIds]);
                        $q->where('status = ?', ['completed']);
                    });
                    $conducted = (int)($row[0]['cnt'] ?? 0);

                    $row = Bookings::get()->selectAll(function (SelectInterface $q) use ($slotIds): void {
                        $q->resetCols()->cols(['COUNT(*) as cnt']);
                        $q->where('bookable_type = ?', ['time_slot']);
                        $q->where('bookable_id IN (?)', [$slotIds]);
                    });
                    $total = (int)($row[0]['cnt'] ?? 0);
                }

                // Use ExpertCancellations log (cancellations initiated by this expert) —
                // matches what the public profile shows.
                $row = ExpertCancellations::get()->selectAll(function (SelectInterface $q) use ($userId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt']);
                    $q->where('expert_id = ?', [$userId]);
                });
                $cancellations = (int)($row[0]['cnt'] ?? 0);

                $payload['stats'] = [
                    'conducted' => $conducted,
                    'totalBookings' => $total,
                    'cancellations' => $cancellations,
                ];
            } else {
                // User stats: aggregate counts only — no per-expert leak.
                $row = Bookings::get()->selectAll(function (SelectInterface $q) use ($userId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt']);
                    $q->where('user_id = ?', [$userId]);
                });
                $total = (int)($row[0]['cnt'] ?? 0);

                $row = Bookings::get()->selectAll(function (SelectInterface $q) use ($userId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt']);
                    $q->where('user_id = ?', [$userId]);
                    $q->where('status = ?', ['completed']);
                });
                $completed = (int)($row[0]['cnt'] ?? 0);

                $row = UserCancellations::get()->selectAll(function (SelectInterface $q) use ($userId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt']);
                    $q->where('user_id = ?', [$userId]);
                });
                $cancellations = (int)($row[0]['cnt'] ?? 0);

                $payload['stats'] = [
                    'totalBookings' => $total,
                    'completedBookings' => $completed,
                    'cancellations' => $cancellations,
                ];
            }

            return ControllerTools::JSON(['user' => $payload]);
        }
    }
}
