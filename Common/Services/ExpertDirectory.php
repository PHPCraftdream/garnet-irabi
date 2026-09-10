<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;

    /**
     * Витринные данные преподавателя: имя и «о себе».
     *
     * Раньше их держала отдельная таблица `expert_profiles`, и это была не
     * таблица, а копия аккаунта: `display_name` — снимок `accounts.name`,
     * снятый один раз при одобрении; `bio` — двойник `accounts.about`, который
     * не писал никто; `photo` — двойник `accounts.photo`, всегда пустой;
     * `is_approved` — двойник флага `IS_APPROVED`.
     *
     * Копии разошлись, как и положено копиям. На боевом `is_approved` стоял в
     * нуле у троих одобренных преподавателей, и превью молча прятало их
     * профиль; «О себе», написанное в форме, ложилось в аккаунт и никогда не
     * доезжало до карточки, потому что карточка читала двойника. В
     * `SlotsController` до этого уже чинили тот же перекос — там устаревшая
     * копия прятала имена преподавателей из каталога.
     *
     * Источник теперь один — аккаунт. Здесь только чтение.
     */
    class ExpertDirectory {
        /**
         * @param int[] $accountIds
         * @return array<int, array{account_id: int, display_name: string, about: string}>
         */
        public static function byIds(array $accountIds): array {
            $ids = array_values(array_unique(array_filter(array_map('intval', $accountIds))));

            if ($ids === []) {
                return [];
            }

            $rows = DbAccount::get()->selectAll(static function (SelectInterface $q) use ($ids): void {
                $q->resetCols();
                $q->cols(['id', 'name', 'about']);
                $q->where('id IN (?)', [$ids]);
            });

            $out = [];

            foreach ($rows as $row) {
                $id = (int)$row['id'];
                $out[$id] = [
                    'account_id' => $id,
                    'display_name' => (string)($row['name'] ?? ''),
                    'about' => (string)($row['about'] ?? ''),
                ];
            }

            return $out;
        }

        /**
         * @return array{account_id: int, display_name: string, about: string}|null
         */
        public static function one(int $accountId): ?array {
            return static::byIds([$accountId])[$accountId] ?? null;
        }
    }
}
