<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\Accounts {
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Foreground\Controllers\Comms\CommentsController;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Единственный источник пропсов острова `user-profile` — раньше их
     * независимо собирали UserProfileController (/user/id~X) и
     * MainController (/system/~profile), и они успели разойтись: у одного
     * не было myReviewsUrl (блок «Мои отзывы» не рендерился на странице,
     * куда реально ведёт меню), у другого — avatar/avatar_full/is_disabled
     * (карточка всегда рисовала инициалы) (D-152).
     */
    class UserProfilePresenter {
        /** @return array{user: array, isModerator: bool, isOwnProfile: bool, myReviewsUrl: string}|null */
        public static function buildProps(int $userId): ?array {
            $row = DbAccount::get()->selectOneByField('id', $userId);
            if (!$row) {
                return null;
            }

            $currentAccount = Account::fromSession();
            $isModerator = $currentAccount ? UserEntityConfig::isModerator() : false;
            $isOwnProfile = $currentAccount !== null && $currentAccount->id() === $userId;

            $isDisabled = AccountDisplay::isDisabled($userId);
            $displayName = $isDisabled
                ? AccountDisplay::disabledName($userId)
                : (string)($row['name'] ?? '');

            $avatar = $isDisabled ? null : UserEntityConfig::avatarUrl([
                'photo' => $row['photo'] ?? null,
                'photo_cropped' => $row['photo_cropped'] ?? null,
                'token16' => $row['token16'] ?? null,
            ]);
            $avatarFull = $isDisabled ? null : UserEntityConfig::avatarUrl([
                'photo' => $row['photo'] ?? null,
                'token16' => $row['token16'] ?? null,
            ]);

            $counts = Bookings::userOutcomeCounts($userId);

            return [
                'user' => [
                    'id' => (int)($row['id'] ?? $userId),
                    'name' => $displayName,
                    // D-259: saved by profile_edit into `accounts.about`, but
                    // never read back here — the field worked and was simply
                    // never shown to the student themselves. Mirrors the
                    // 'bio' key ExpertController already sends for the expert
                    // side of the same column (see its D-152-era comment).
                    'bio' => $isDisabled ? '' : (string)($row['about'] ?? ''),
                    'avatar' => $avatar,
                    'avatar_full' => $avatarFull,
                    'is_disabled' => $isDisabled,
                    'completedBookings' => $counts['completed'],
                    'totalBookings' => $counts['total'],
                    'userCancellations' => $counts['cancellations'],
                    'userDeclines' => $counts['declines'],
                    'activeBookings' => $counts['active'],
                ],
                'isModerator' => $isModerator,
                'isOwnProfile' => $isOwnProfile,
                'myReviewsUrl' => IRabi::url(CommentsController::URL . '~myList'),
            ];
        }
    }
}
