<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Invite\Tables\FwInviteRegistrations;

    class InviteRegistrations extends FwInviteRegistrations {
        protected string $tableName = 'invite_registrations';
    }
}
