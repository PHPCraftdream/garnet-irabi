<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccountData;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

    /**
     * Shared helpers for how a (possibly blocked) account is presented in
     * user-facing views. A blocked account (IS_DISABLED) must show a placeholder
     * name "Пользователь #{id} отключён" and a placeholder avatar icon instead of
     * its real identity. Centralised here so every surface substitutes uniformly.
     */
    class AccountDisplay {
        /**
         * Which of the given account ids are blocked (IS_DISABLED flag set).
         *
         * @param int[] $accountIds
         * @return array<int, true> id => true for blocked accounts
         */
        public static function disabledIds(array $accountIds): array {
            $ids = array_values(array_unique(array_filter(array_map('intval', $accountIds))));
            if (empty($ids)) {
                return [];
            }

            $rows = DbAccountData::get()->selectAll(static function (SelectInterface $q) use ($ids): void {
                $q->where('param = ? AND account_id IN (?)', [Account::IS_DISABLED, $ids]);
            });

            $out = [];
            foreach ($rows as $r) {
                if (intval($r['value'] ?? 0) > 0) {
                    $out[(int)$r['account_id']] = true;
                }
            }
            return $out;
        }

        public static function isDisabled(int $accountId): bool {
            $map = static::disabledIds([$accountId]);
            return !empty($map[$accountId]);
        }

        /**
         * Localised placeholder name for a blocked account.
         */
        public static function disabledName(int $accountId): string {
            return sprintf((string)ForegroundI18n::getInstance()->User_Disabled(), (string)$accountId);
        }
    }
}
