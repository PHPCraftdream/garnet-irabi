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

        /**
         * Состояние модерации отзыва (колонка `moderation_status`, M_0020).
         *
         * Отдельно от `is_hidden`, потому что вопросы разные: здесь — «дошёл
         * ли отзыв до читателей», там — «убрали ли уже опубликованный с
         * глаз». Одним флагом модератор не отличил бы непроверенный отзыв от
         * отклонённого и разбирал бы отказанные снова и снова.
         */
        public const STATUS_PENDING = 'pending';

        public const STATUS_APPROVED = 'approved';

        public const STATUS_REJECTED = 'rejected';

        /**
         * Помечен модератором как опасный — угроза, травля, повод разбираться
         * с человеком, а не с текстом.
         *
         * Отдельно от `rejected` намеренно: отклонённых большинство и они
         * никого не интересуют, а помеченные — те немногие, ради которых
         * вообще имеет смысл вскрывать анонимность. Сложи их в одно значение,
         * и опасные утонут в обычных отказах.
         */
        public const STATUS_FLAGGED = 'flagged';

        public const MODERATION_STATUSES = [
            self::STATUS_PENDING,
            self::STATUS_APPROVED,
            self::STATUS_REJECTED,
            self::STATUS_FLAGGED,
        ];
    }
}
