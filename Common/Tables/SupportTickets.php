<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Support\Tables\FwSupportTickets;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class SupportTickets extends FwSupportTickets {
        protected string $tableName = 'support_tickets';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'account_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'subject', type: 'VARCHAR', length: '255', null: false)
                ->addColumn(
                    column: 'status',
                    type: 'ENUM',
                    length: "'open','investigation','in_progress','waiting_user','waiting_support','escalated','on_hold','deferred','low_priority','resolved','rejected'",
                    null: false,
                    default: "'open'",
                )
                ->addColumn(column: 'assignee_id', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'unread_user', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'unread_staff', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'context', type: 'TEXT', length: '', null: true)
                ->addColumn(column: 'created_at', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'updated_at', type: 'INT', length: '11', null: false, default: '0')
                ->addIndex(indexName: 'account_id', indexes: ['account_id'])
                ->addIndex(indexName: 'assignee_id', indexes: ['assignee_id'])
                ->addIndex(indexName: 'status', indexes: ['status'])
                ->addIndex(indexName: 'updated_at', indexes: ['updated_at'])
                ->addIndex(indexName: 'status_assignee', indexes: ['status', 'assignee_id'])
            ;
        }
    }
}
