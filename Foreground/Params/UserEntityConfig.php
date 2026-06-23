<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Params {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\I18n\FwI18n;
    use PHPCraftdream\Garnet\Kernel\Core\Tools\StrTools;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\AccountEntity;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;

    class UserEntityConfig extends AccountEntity {
        public function selectFields(): array {
            return [
                'id', 'login', 'login_type', 'name', 'type', 'time_zone', 'about',
                'photo', 'photo_cropped', 'crop_info',
                'reg_time', 'last_auth_time', 'last_online_time', 'token16',
            ];
        }

        public function manageGridFields(): array {
            return [
                'id',
                'login',
                'name',
                'last_online_time',
                'IS_ADMIN',
                'IS_MODERATOR',
                'IS_APPROVED',
                'IS_DISABLED',
            ];
        }

        public function manageFormFields(): array {
            return [
                'id',
                'login',
                'reg_time',
                'last_auth_time',
                'last_online_time',
                'name',
                'type',
                'time_zone',
                'about',
                'photo',
                'IS_ADMIN',
                'IS_MODERATOR',
                'IS_APPROVED',
                'IS_DISABLED',
            ];
        }

        public function dataFields(): array {
            return [
                Account::IS_ADMIN,
                Account::IS_OWNER,
                Account::IS_MODERATOR,
                Account::IS_APPROVED,
                Account::IS_DISABLED,
            ];
        }

        public function viewFields(): array {
            return [
                'id', 'name', 'about', 'type', 'photo', 'photo_crop', 'crop_info',
            ];
        }

        public function editFields(): array {
            // 'type' intentionally excluded — accounts default to 'user' via
            // UserDataMiddleware::initialAccountParams(); promotion to 'expert'
            // is an admin-only action, never a self-service field.
            return [
                'id', 'login', 'name', 'time_zone', 'about', 'photo', 'photo_crop', 'crop_info',
            ];
        }

        public function getFieldsInfo(array $fields = null): array {
            $result = parent::getFieldsInfo();
            $tForeground = ForegroundI18n::getInstance();

            // 'type' is never user-editable — defaulted to 'user' on registration,
            // promoted to 'expert' only by admin. Keep label/map for read-only displays.
            $result['type'] = [
                'name' => $tForeground->Reg_AccountType(),
                'type' => ['map' => [
                    ['value' => 'user', 'text' => $tForeground->Reg_AccountTypeUser()],
                    ['value' => 'expert', 'text' => $tForeground->Reg_AccountTypeExpert()],
                ]],
                'validation' => ['in_array[expert,user]'],
            ];

            if (isset($result['login'])) {
                $result['login']['readOnly'] = true;
            }

            $result['photo'] = [
                'name' => FwI18n::getInstance()->Reg_ProfileImage(),
                'type' => 'photo',
                'cropInfo' => 'crop_info',
                'cropName' => 'photo_cropped',
                'uploadPath' => IRabi::getInstance()->publicUploadWebPath . 'f/{token16}/',
            ];

            return $this->filterKeys($result, $fields);
        }

        public function patchItem(array &$item): array {
            $item['crop_info'] = StrTools::jsonRead($item['crop_info'] ?? '');

            return $item;
        }

        /**
         * Build the public web URL of an account's uploaded avatar from its
         * stored params. Prefers the square-cropped version; falls back to the
         * original. Returns null when no photo / token is present.
         *
         * @param array<string, mixed> $params account params (photo, photo_cropped, token16)
         */
        public static function avatarUrl(array $params): ?string {
            $file = !empty($params['photo_cropped'])
                ? $params['photo_cropped']
                : ($params['photo'] ?? null);

            $token16 = $params['token16'] ?? null;

            if (empty($file) || empty($token16)) {
                return null;
            }

            return IRabi::getInstance()->publicUploadWebPath . 'f/' . $token16 . '/' . $file;
        }

        public static function getApprovedExpertIds(): array {
            $accounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $select): void {
                    $select->resetCols();
                    $select->cols(['id']);
                    $select->where("type = 'expert'");
                },
                accountDataFields: [Account::IS_APPROVED, Account::IS_DISABLED],
            );

            return array_column(
                array_filter($accounts, static function (array $a): bool {
                    return intval($a[Account::IS_APPROVED] ?? 0) > 0
                        && intval($a[Account::IS_DISABLED] ?? 0) < 1;
                }),
                'id',
            );
        }

        public static function isExpert(): bool {
            return Account::fromSession()->readParam('type') === 'expert';
        }

        /**
         * Business role check: account_type === 'user'. Staff flags
         * (IS_ADMIN / IS_OWNER / IS_MODERATOR) are an orthogonal axis
         * and intentionally NOT considered here — a staff member whose
         * business role is 'user' is still a user for business UI and
         * actions (booking slots, etc.).
         */
        public static function isUser(): bool {
            $account = Account::fromSession();
            if (!$account) {
                return false;
            }
            return $account->readParam('type') === 'user';
        }

        public static function isApproved(): bool {
            return Account::fromSession()->isApproved();
        }

        /**
         * Staff helpers — encode the hierarchy admin ⊇ owner ⊇ moderator.
         * Each higher rank passes the lower-rank check (admin counts as
         * moderator for moderator-gated staff routes, etc.). These gate
         * staff UI/routes ONLY; they must not be used to hide business UI
         * from staff members — see isUser()/isExpert() for that.
         */
        public static function isModerator(): bool {
            $account = Account::fromSession();

            return $account->isAdmin() || $account->isOwner() || $account->isModerator();
        }

        public static function isOwner(): bool {
            $account = Account::fromSession();

            return $account->isAdmin() || $account->isOwner();
        }

        public static function isAdmin(): bool {
            $account = Account::fromSession();

            return $account->isAdmin();
        }
    }
}
