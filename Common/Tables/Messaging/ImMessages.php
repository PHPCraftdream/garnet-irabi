<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Messaging {
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Messaging\Tables\FwImMessages;

    class ImMessages extends FwImMessages {
        protected string $tableName = 'im_messages';
    }
}
