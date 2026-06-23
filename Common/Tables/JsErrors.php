<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\JsErrors\Tables\FwJsErrors;

    /**
     * IRabi-prefixed JS-error table. Schema + indexes live in the
     * abstract parent; this subclass only pins the table name.
     */
    class JsErrors extends FwJsErrors {
        protected string $tableName = 'js_errors';
    }
}
