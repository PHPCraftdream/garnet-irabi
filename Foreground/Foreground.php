<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground {
    use PHPCraftdream\Garnet\Kernel\Core\AppInit\BaseAppInit;
    use PHPCraftdream\Garnet\Kernel\Core\AppInit\BaseBundleInit;
    use PHPCraftdream\Garnet\Kernel\Exceptions\I18nException;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

    class Foreground extends BaseBundleInit {
        public static function getBundleDir(): string {
            return __DIR__;
        }

        protected function getFrontendDir(BaseAppInit $app, string $bundleName): string {
            return $app->getAppDir() . DS . 'Front' . DS;
        }

        /**
         * @return void
         * @throws I18nException
         */
        public function initLang(): void {
            ForegroundI18n::init();
        }

        /**
         * @return array
         */
        public function getLangData(): array {
            return ForegroundI18n::getInstance()->getLangData();
        }
    }
}
