<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard {
    class GridConfig {
        /**
         * @param array<array{key: string, label: string}> $columns
         * @param string[] $searchFields
         * @param string[] $sortFields
         */
        public static function make(
            array $columns,
            array $searchFields,
            array $sortFields,
            int $pageSize,
        ): array {
            return [
                'columns' => $columns,
                'searchFields' => $searchFields,
                'sortFields' => $sortFields,
                'pageSize' => $pageSize,
            ];
        }

        public static function col(string $key, string $label, bool $shrink = false): array {
            $col = ['key' => $key, 'label' => $label];
            if ($shrink) {
                $col['shrink'] = true;
            }
            return $col;
        }
    }
}
