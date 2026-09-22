<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers\People {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccountData;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\PageData;
    use PHPCraftdream\IRabi\Common\Support\PaginationHelper;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;

    /**
     * Server-paginated Users admin list — search/sort/tab-filter over the
     * accounts table, with staff roles (moderator/owner/admin) resolved from
     * the EAV `accounts_data` table since they can't be a plain WHERE.
     */
    class UsersPageService {
        /**
         * Staff-flag account ids (bounded, cheap: staff is a handful of
         * accounts out of the whole table) — used both to filter the
         * moderators/owners/admins tabs and to count them.
         *
         * @return array{moderatorIds: list<int>, ownerIds: list<int>, adminIds: list<int>}
         */
        public static function resolveStaffIdSets(): array {
            $data = DbAccountData::getAllUsersData([Account::IS_MODERATOR, Account::IS_OWNER, Account::IS_ADMIN]);
            $moderatorIds = [];
            $ownerIds = [];
            $adminIds = [];
            foreach ($data as $accountId => $flags) {
                if ((int)($flags[Account::IS_MODERATOR] ?? 0) > 0) {
                    $moderatorIds[] = (int)$accountId;
                }
                if ((int)($flags[Account::IS_OWNER] ?? 0) > 0) {
                    $ownerIds[] = (int)$accountId;
                }
                if ((int)($flags[Account::IS_ADMIN] ?? 0) > 0) {
                    $adminIds[] = (int)$accountId;
                }
            }
            return ['moderatorIds' => $moderatorIds, 'ownerIds' => $ownerIds, 'adminIds' => $adminIds];
        }

        /**
         * Tab pill counts — COUNT(*) queries, never a full row fetch.
         *
         * @return array{all: int, experts: int, users: int, moderators: int, owners: int, admins: int}
         */
        public static function fetchTabCounts(): array {
            $staff = static::resolveStaffIdSets();
            $moderatorIds = array_values(array_diff($staff['moderatorIds'], $staff['ownerIds'], $staff['adminIds']));
            $ownerIds = array_values(array_diff($staff['ownerIds'], $staff['adminIds']));
            $adminIds = $staff['adminIds'];

            $countIn = static function (array $ids): int {
                if (empty($ids)) {
                    return 0;
                }
                return DbAccount::get()->getCount(static function (SelectInterface $q) use ($ids): void {
                    $q->where('id IN (?)', [$ids]);
                });
            };

            return [
                'all' => DbAccount::get()->getCount(),
                'experts' => DbAccount::get()->getCount(static function (SelectInterface $q): void {
                    $q->where("type = 'expert'");
                }),
                'users' => DbAccount::get()->getCount(static function (SelectInterface $q): void {
                    $q->where("type = 'user'");
                }),
                'moderators' => $countIn($moderatorIds),
                'owners' => $countIn($ownerIds),
                'admins' => $countIn($adminIds),
            ];
        }

        /**
         * @return array<string, mixed> PageResponse shape
         */
        public static function fetchUsersPage(
            int $page,
            int $perPage,
            string $query = '',
            ?string $sortField = null,
            string $sortDir = 'asc',
            string $tab = 'all',
        ): array {
            $config = UserEntityConfig::getEntityConfig();
            $searchFields = ['login', 'name'];
            $sortFields = ['id', 'login', 'name', 'last_online_time'];

            $idFilter = null;
            if (in_array($tab, ['moderators', 'owners', 'admins'], true)) {
                $staff = static::resolveStaffIdSets();
                $idFilter = match ($tab) {
                    'moderators' => array_values(array_diff($staff['moderatorIds'], $staff['ownerIds'], $staff['adminIds'])),
                    'owners' => array_values(array_diff($staff['ownerIds'], $staff['adminIds'])),
                    'admins' => $staff['adminIds'],
                };
                if (empty($idFilter)) {
                    return PaginationHelper::toPageResponse(new PageData($page, 0, $perPage));
                }
            }

            $pageData = PaginationHelper::fetchPage(
                DbAccount::get(),
                $page,
                $perPage,
                static function (SelectInterface $q) use ($tab, $idFilter, $config, $query, $sortField, $sortDir, $searchFields, $sortFields): void {
                    $q->resetCols();
                    $q->cols($config->selectFields());
                    if ($tab === 'experts') {
                        $q->where("type = 'expert'");
                    } elseif ($tab === 'users') {
                        $q->where("type = 'user'");
                    } elseif ($idFilter !== null) {
                        $q->where('id IN (?)', [$idFilter]);
                    }
                    PaginationHelper::applySearchAndSort($q, $query, $searchFields, $sortField, $sortDir, $sortFields);
                },
            );

            $accountIds = array_values(array_unique(array_column($pageData->pageItems, 'id')));
            $accountsData = DbAccountData::getAllUsersData($config->dataFields(), $accountIds);
            $pageData->pageItems = array_map(static function (array $account) use ($accountsData, $config): array {
                $data = $accountsData[$account['id']] ?? null;
                if (!empty($data)) {
                    foreach ($data as $name => $value) {
                        $account[$name] = $value;
                    }
                }
                $config->patchItem($account);
                return $account;
            }, $pageData->pageItems);

            return PaginationHelper::toPageResponse($pageData);
        }
    }
}
