<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Accounts {
    use PHPCraftdream\Garnet\Bundle\Modules\Accounts\Invite\Tables\FwInviteTokens;

    /**
     * IRabi-prefixed table. Schema + queries live in the abstract
     * parent; this subclass only pins the table name.
     */
    class InviteTokens extends FwInviteTokens {
        protected string $tableName = 'invite_tokens';
    }
}
