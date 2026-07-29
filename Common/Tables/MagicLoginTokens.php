<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Auth\Tables\FwMagicLoginTokens;

    /**
     * IRabi-prefixed table. Schema + queries live in the abstract
     * parent; this subclass only pins the table name.
     */
    class MagicLoginTokens extends FwMagicLoginTokens {
        protected string $tableName = 'magic_login_tokens';
    }
}
