<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\News\Controllers\FwNewsController;
    use PHPCraftdream\IRabi\Common\Services\NewsService;

    class NewsController extends FwNewsController {
        public const URL = '/news';

        protected static function newsService(): string {
            return NewsService::class;
        }
    }
}
