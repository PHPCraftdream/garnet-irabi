<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\News\Tables\FwNewsReads;

    class NewsReads extends FwNewsReads {
        protected string $tableName = 'news_reads';
    }
}
