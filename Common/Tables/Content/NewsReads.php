<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Content {
    use PHPCraftdream\Garnet\Bundle\Modules\Content\News\Tables\FwNewsReads;

    class NewsReads extends FwNewsReads {
        protected string $tableName = 'news_reads';
    }
}
