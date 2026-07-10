<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\News\Tables\FwNewsArchived;

    class NewsArchived extends FwNewsArchived {
        protected string $tableName = 'news_archived';
    }
}
