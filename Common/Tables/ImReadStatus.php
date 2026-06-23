<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Messaging\Tables\FwImReadStatus;

    class ImReadStatus extends FwImReadStatus {
        protected string $tableName = 'im_read_status';

        protected static function conversationsTableClass(): string {
            return ImConversations::class;
        }

        protected static function messagesTableClass(): string {
            return ImMessages::class;
        }
    }
}
