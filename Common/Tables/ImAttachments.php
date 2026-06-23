<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Messaging\Tables\FwImAttachments;

    class ImAttachments extends FwImAttachments {
        protected string $tableName = 'im_attachments';
    }
}
