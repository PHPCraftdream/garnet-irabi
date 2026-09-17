<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n {
    use PHPCraftdream\IRabi\Foreground\I18n\En\EnAdmin;
    use PHPCraftdream\IRabi\Foreground\I18n\En\EnBooking;
    use PHPCraftdream\IRabi\Foreground\I18n\En\EnEmail;
    use PHPCraftdream\IRabi\Foreground\I18n\En\EnFinance;
    use PHPCraftdream\IRabi\Foreground\I18n\En\EnSlot;
    use PHPCraftdream\IRabi\Foreground\I18n\En\EnSupport;
    use PHPCraftdream\IRabi\Foreground\I18n\En\EnUi;

    /**
     * Вход в подписи языка: код языка и склейка тематических файлов.
     *
     * Сами подписи лежат в каталоге En/ по темам — был один файл на
     * тысячу с лишним строк, в котором «найти, где это написано»
     * означало поиск по всему файлу.
     *
     * Данные отдаются методом, а не статическим свойством: инициализатор
     * статического свойства в PHP не умеет вызывать функции, а склейка
     * нужна именно вызовом — она же проверяет, что ключи не повторяются.
     */
    class ForegroundI18nDataEn {
        public const LANG = 'EN';

        /** @return array<string, string> */
        public static function data(): array {
            return I18nDataMerge::merge(
                EnAdmin::$data,
                EnBooking::$data,
                EnEmail::$data,
                EnFinance::$data,
                EnSlot::$data,
                EnSupport::$data,
                EnUi::$data,
            );
        }
    }
}
