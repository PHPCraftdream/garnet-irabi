<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n {
    use PHPCraftdream\Garnet\Kernel\Interfaces\II18n;
    use PHPCraftdream\Garnet\Kernel\Io\I18n\GarnetI18n;

    class ForegroundI18n extends GarnetI18n {
        protected static ?II18n $instance = null;

        protected string $lang = ForegroundI18nDataRu::LANG;

        public function initData(): II18n {
            return $this
                ->addLangData(ForegroundI18nDataRu::LANG, ForegroundI18nDataRu::$data)
                ->addLangData(ForegroundI18nDataEn::LANG, ForegroundI18nDataEn::$data);
        }

        /**
         * @return II18n
         */
        public static function getInstance(): II18n {
            if (empty(static::$instance)) {
                static::$instance = new ForegroundI18n();
            }

            return static::$instance;
        }
    }
}
