<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Messaging\Tables\FwImMessages;

    class ImMessages extends FwImMessages {
        protected string $tableName = 'im_messages';
    }
}
