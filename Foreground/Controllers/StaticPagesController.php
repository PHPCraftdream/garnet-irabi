<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\Content\StaticPages\Controllers\FwStaticPagesPublicController;
    use PHPCraftdream\Garnet\Bundle\Modules\Content\StaticPages\FwStaticPagesService;
    use PHPCraftdream\IRabi\Common\Services\Content\StaticPagesService;

    class StaticPagesController extends FwStaticPagesPublicController {
        public const URL = '/page';

        protected static function service(): FwStaticPagesService {
            return new StaticPagesService();
        }
    }
}
