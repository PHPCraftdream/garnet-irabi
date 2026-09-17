<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Accounts {
    use PHPCraftdream\Garnet\Bundle\Modules\Accounts\Invite\Tables\FwInviteRegistrations;

    class InviteRegistrations extends FwInviteRegistrations {
        protected string $tableName = 'invite_registrations';
    }
}
