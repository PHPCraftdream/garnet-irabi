<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Messaging\Tables\FwImConversations;

    class ImConversations extends FwImConversations {
        protected string $tableName = 'im_conversations';
    }
}
