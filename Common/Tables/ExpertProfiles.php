<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    /**
     * УДАЛЁННАЯ таблица. Класс жив только ради истории миграций.
     *
     * Профиль преподавателя оказался копией аккаунта: `display_name` — снимок
     * `accounts.name`, `bio` — двойник `accounts.about`, `photo` — двойник
     * `accounts.photo`, `is_approved` — двойник флага `IS_APPROVED`,
     * `specialization` не заполнял никто. Копии разошлись с оригиналом, и
     * экраны начали спорить друг с другом. `M_0023` удалила таблицу; читатели
     * переведены на аккаунт — см. `ExpertDirectory` и
     * `UserEntityConfig::isApprovedExpertAccount()`.
     *
     * Удалить сам класс нельзя: на него ссылается `M_0002`, и без него история
     * миграций не проиграется на чистой базе. Новый код обращаться сюда не
     * должен — таблицы на диске нет.
     */
    class ExpertProfiles extends DbTable {
        protected string $tableName = 'expert_profiles';
        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'account_id', type: 'INT', length: '11')
                ->addColumn(column: 'display_name', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'bio', type: 'TEXT')
                ->addColumn(column: 'specialization', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'photo', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'is_approved', type: 'TINYINT', length: '1')
                ->addIndex(indexName: 'account_id', indexes: ['account_id'])
                ->addIndex(indexName: 'is_approved', indexes: ['is_approved'])
            ;
        }
    }
}
