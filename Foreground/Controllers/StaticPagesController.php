<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\Controllers\FwStaticPagesPublicController;
    use PHPCraftdream\Garnet\Bundle\Modules\StaticPages\FwStaticPagesService;
    use PHPCraftdream\IRabi\Common\Services\StaticPagesService;

    class StaticPagesController extends FwStaticPagesPublicController {
        public const URL = '/page';

        protected static function service(): FwStaticPagesService {
            return new StaticPagesService();
        }
    }
}
