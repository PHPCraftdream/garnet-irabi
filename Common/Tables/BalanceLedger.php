<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwAccountBalance;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwBalanceLedger;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Exceptions\DbException;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class BalanceLedger extends FwBalanceLedger {
        protected string $tableName = 'balance_ledger';

        protected static function balanceTable(): FwAccountBalance {
            return AccountBalance::get();
        }

        /**
         * Расширяем фреймворковую схему: добавляем actor_id —
         * id админа, инициировавшего ручную корректировку баланса.
         * Для остальных entry_type-ов (top_up, booking_*) actor_id остаётся NULL.
         */
        public static function init(): ITableBuilderDriver {
            return parent::init()
                ->addColumn(column: 'actor_id', type: 'INT', length: '11', null: true);
        }

        /**
         * Add a refund ledger entry. Ignores duplicates (idempotent).
         *
         * @param int    $accountId Account ID to credit/debit
         * @param bool   $isCredit  true=credit to account, false=debit from account
         * @param int    $amount    Amount in cents
         * @param int    $bookingId Related booking ID for ref_type='booking'
         * @param string $note      Ledger note text
         * @throws DbException If a non-duplicate-key DB error occurs
         */
        public static function tryAddRefund(int $accountId, bool $isCredit, int $amount, int $bookingId, string $note): void {
            try {
                static::addEntry(
                    accountId: $accountId,
                    isCredit: $isCredit,
                    amount: $amount,
                    entryType: 'booking_refund',
                    refType: 'booking',
                    refId: $bookingId,
                    note: $note,
                );
            } catch (DbException $e) {
                if (!CasUpdate::isDuplicateKeyError($e)) {
                    throw $e;
                }
            }
        }
    }
}
