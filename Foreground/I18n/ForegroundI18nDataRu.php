<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n {
    use PHPCraftdream\IRabi\Foreground\I18n\Ru\RuAdmin;
    use PHPCraftdream\IRabi\Foreground\I18n\Ru\RuBooking;
    use PHPCraftdream\IRabi\Foreground\I18n\Ru\RuEmail;
    use PHPCraftdream\IRabi\Foreground\I18n\Ru\RuFinance;
    use PHPCraftdream\IRabi\Foreground\I18n\Ru\RuSlot;
    use PHPCraftdream\IRabi\Foreground\I18n\Ru\RuSupport;
    use PHPCraftdream\IRabi\Foreground\I18n\Ru\RuUi;

    /**
     * Вход в подписи языка: код языка и склейка тематических файлов.
     *
     * Сами подписи лежат в каталоге Ru/ по темам — был один файл на
     * тысячу с лишним строк, в котором «найти, где это написано»
     * означало поиск по всему файлу.
     *
     * Данные отдаются методом, а не статическим свойством: инициализатор
     * статического свойства в PHP не умеет вызывать функции, а склейка
     * нужна именно вызовом — она же проверяет, что ключи не повторяются.
     */
    class ForegroundI18nDataRu {
        public const LANG = 'RU';

        /** @return array<string, string> */
        public static function data(): array {
            return I18nDataMerge::merge(
                RuAdmin::$data,
                RuBooking::$data,
                RuEmail::$data,
                RuFinance::$data,
                RuSlot::$data,
                RuSupport::$data,
                RuUi::$data,
            );
        }
    }
}
