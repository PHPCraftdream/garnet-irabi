<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n {
    use RuntimeException;

    /**
     * Склейка тематических файлов подписей в одну карту языка.
     *
     * Нужна потому, что `GarnetI18n::addLangData()` данные языка ЗАМЕНЯЕТ, а
     * не дополняет: второй вызов для того же языка молча потерял бы первый.
     * Поэтому склеиваем здесь и отдаём готовую карту одним куском.
     *
     * Повторяющийся ключ — настоящая ошибка: два перевода для одного места,
     * и какой из них увидит человек, зависит от порядка файлов. В консоли
     * (сборка, генерация, тесты) это падение — там ошибку и надо увидеть. В
     * веб-запросе падать нельзя: предпочитаем последнее значение и работаем
     * дальше, как это делал и цельный файл до разбиения.
     */
    class I18nDataMerge {
        /**
         * @param array<string, string> ...$parts
         * @return array<string, string>
         */
        public static function merge(array ...$parts): array {
            $merged = [];
            $duplicates = [];

            foreach ($parts as $part) {
                foreach ($part as $key => $value) {
                    if (array_key_exists($key, $merged)) {
                        $duplicates[] = $key;
                    }
                    $merged[$key] = $value;
                }
            }

            if ($duplicates !== [] && PHP_SAPI === 'cli') {
                throw new RuntimeException(
                    'Повторяющиеся ключи подписей: ' . implode(', ', array_unique($duplicates))
                    . '. Один ключ — одно место в тематическом файле.'
                );
            }

            return $merged;
        }
    }
}
