<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Messaging {
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Messaging\Tables\FwImConversations;

    class ImConversations extends FwImConversations {
        protected string $tableName = 'im_conversations';
    }
}
