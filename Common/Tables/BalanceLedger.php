<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwAccountBalance;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwBalanceLedger;
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
    }
}
