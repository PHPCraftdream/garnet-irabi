<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Comments\Tables\FwComments;

    /**
     * IRabi-prefixed comments table. Schema, query helpers
     * (getForEntity / countForEntity) live in the abstract parent;
     * this subclass pins the table name and the IRabi-specific list
     * of entity types it accepts. The controller layer
     * (Foreground/Controllers/CommentsController) enforces
     * VALID_ENTITY_TYPES — the DB column itself is VARCHAR and
     * doesn't constrain it.
     */
    class Comments extends FwComments {
        protected string $tableName = 'comments';

        public const ENTITY_EXPERT = 'expert';
        public const VALID_ENTITY_TYPES = [self::ENTITY_EXPERT];
    }
}
