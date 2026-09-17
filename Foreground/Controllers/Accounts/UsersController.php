<?php declare(strict_types=1);

/**
 * Тонкий контроллер для inline-предпросмотра профилей в foreground.
 *
 * Эндпоинт /users/~preview возвращает публичные данные о любом аккаунте
 * любому залогиненному пользователю. Email/login никогда не отдаётся.
 */

namespace PHPCraftdream\IRabi\Foreground\Controllers\Accounts {
    use PHPCraftdream\Garnet\Kernel\Core\Runtime\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\Accounts\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\ExpertCancellations;
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
            // so derive it from the account predicate instead of selecting it as a column.
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

            $type = UserEntityConfig::isApprovedActiveExpert($userId) ? 'expert' : 'user';

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
                // `$type` уже означает «одобренный и не отключённый
                // преподаватель». Раньше здесь стояла вторая проверка — по
                // копии `is_approved` в строке профиля, — и на боевом она
                // расходилась с настоящим флагом: у троих одобренных
                // преподавателей копия осталась нулевой, и превью молча
                // показывало пустоту вместо профиля.
                if (!$isDisabled) {
                    $payload['expertProfile'] = [
                        'display_name' => (string)($acc['name'] ?? ''),
                        'bio' => (string)($acc['about'] ?? ''),
                    ];
                }

                // Consolidation: was a second, differently-shaped copy of the
                // full profile's "Проведено"/"Предстоящих" query — the two
                // already disagreed once ("мини-карточка говорила 6, полная
                // страница — 4", нашёл user-2). Bookings::expertOutcomeCounts()
                // is now the one place both read from.
                //
                // Имя поля 'totalBookings' осталось прежним: его читает
                // компонент превью из фреймворка, переименование потянуло бы
                // правку за границей приложения. Подпись на экране —
                // «Предстоящих», по смыслу это upcoming.
                $expertBookingCounts = Bookings::expertOutcomeCounts($userId);

                // Use ExpertCancellations log (cancellations initiated by this expert) —
                // matches what the public profile shows (only kind='cancel').
                $cancellations = ExpertCancellations::countsFor($userId)['cancellations'];

                $payload['stats'] = [
                    'conducted' => $expertBookingCounts['conducted'],
                    'totalBookings' => $expertBookingCounts['upcoming'],
                    'cancellations' => $cancellations,
                ];
            } else {
                // D-151: was UserCancellations::get()->getCount() with no
                // kind filter — that table only sees cancellations the
                // STUDENT herself performed (BookingsController::post__cancel,
                // if ($isOwner)); an expert/moderator/cron cancellation left
                // no row there, so this preview, the profile page, and the
                // admin card could show three different numbers for the same
                // account. Bookings::userOutcomeCounts() is the one place
                // that now owns this (D-150) — this preview has no separate
                // "Снятий"/"Отмен" fields, so combine both kinds the same way
                // the old unfiltered COUNT(*) did.
                $counts = Bookings::userOutcomeCounts($userId);

                $payload['stats'] = [
                    'totalBookings' => $counts['total'],
                    'completedBookings' => $counts['completed'],
                    'cancellations' => $counts['cancellations'] + $counts['declines'],
                ];
            }

            return ControllerTools::JSON(['user' => $payload]);
        }
    }
}
