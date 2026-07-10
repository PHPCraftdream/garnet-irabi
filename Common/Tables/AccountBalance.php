<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwAccountBalance;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwBalanceLedger;

    class AccountBalance extends FwAccountBalance {
        protected string $tableName = 'account_balance';

        protected static function ledgerTable(): FwBalanceLedger {
            return BalanceLedger::get();
        }
    }
}
