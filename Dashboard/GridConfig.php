<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard {
    class GridConfig {
        /**
         * @param array<array{key: string, label: string}> $columns
         * @param string[] $searchFields
         * @param string[] $sortFields
         * @param array<array{buttonLabel: string, fetchUrl: string, urlParam: string, rowField: string}> $subGrids
         */
        public static function make(
            array $columns,
            array $searchFields,
            array $sortFields,
            int $pageSize,
            array $subGrids = [],
            array $detailViews = [],
        ): array {
            return [
                'columns' => $columns,
                'searchFields' => $searchFields,
                'sortFields' => $sortFields,
                'pageSize' => $pageSize,
                'subGrids' => $subGrids,
                'detailViews' => $detailViews,
            ];
        }

        public static function col(string $key, string $label, bool $shrink = false): array {
            $col = ['key' => $key, 'label' => $label];
            if ($shrink) {
                $col['shrink'] = true;
            }
            return $col;
        }

        public static function detailView(
            string $buttonLabel,
            string $fetchUrl,
            string $urlParam,
            string $rowField = 'id',
        ): array {
            return [
                'buttonLabel' => $buttonLabel,
                'fetchUrl' => $fetchUrl,
                'urlParam' => $urlParam,
                'rowField' => $rowField,
            ];
        }

        public static function subGrid(
            string $buttonLabel,
            string $fetchUrl,
            string $urlParam,
            string $rowField = 'id',
        ): array {
            return [
                'buttonLabel' => $buttonLabel,
                'fetchUrl' => $fetchUrl,
                'urlParam' => $urlParam,
                'rowField' => $rowField,
            ];
        }
    }
}
