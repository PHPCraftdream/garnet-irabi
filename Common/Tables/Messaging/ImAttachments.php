<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Messaging {
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Messaging\Tables\FwImAttachments;

    class ImAttachments extends FwImAttachments {
        protected string $tableName = 'im_attachments';
    }
}
