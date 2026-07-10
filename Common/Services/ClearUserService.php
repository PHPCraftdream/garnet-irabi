<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;

    /**
     * Hard-deletes every trace of an account — bookings, slots, messages,
     * tickets, balances, logs, news, sessions, params, uploads, the account
     * row itself. Used only by `php garnet clear-user`, which is gated behind
     * test mode (see {@see \PHPCraftdream\IRabi\Common\System\TestMode}).
     *
     * Two passes:
     *   1. Cascade pass — collect parent ids (slots, conversations, tickets,
     *      payments, sessions) BEFORE they're deleted, then remove their child
     *      rows so nothing is orphaned.
     *   2. Generic pass — schema-driven sweep: every app table that has a column
     *      directly referencing an account id (account_id, user_id, expert_id,
     *      sender_id, …) gets `DELETE WHERE <col> = <accountId>`. This auto-
     *      adapts to new tables/columns without code changes.
     * Plus email-keyed mail logs and the session rows, and finally the account.
     */
    class ClearUserService {
        /** Columns that hold an account id across the app schema. */
        private const OWNER_COLUMNS = [
            'account_id', 'user_id', 'expert_id', 'sender_id', 'author_id',
            'actor_id', 'target_id', 'participant_a', 'participant_b',
            'assignee_id', 'audience_id', 'from_id', 'to_id', 'created_by',
        ];

        /**
         * @return array{found: bool, accountId: int, email: string, deleted: array<string,int>, total: int}
         */
        public static function clearByEmail(string $email): array {
            $email = trim($email);
            $prefix = self::prefix();
            $accountsTbl = DbAccount::get()->getTableName();
            $deleted = [];
            $run = function (string $label, string $sql, array $params) use (&$deleted): void {
                $affected = (int)CasUpdate::exec($sql, $params);
                if ($affected > 0) {
                    $deleted[$label] = ($deleted[$label] ?? 0) + $affected;
                }
            };

            $accountId = self::accountIdByLogin($accountsTbl, $email);

            // ── Pass 1: cascade — collect parent ids, delete their children ──
            if ($accountId > 0) {
                $slotIds = self::ids("SELECT id FROM `{$prefix}_time_slots` WHERE expert_id = ?", [$accountId]);
                if ($slotIds) {
                    $in = self::inList($slotIds);
                    $run('bookings', "DELETE FROM `{$prefix}_bookings` WHERE bookable_type = 'time_slot' AND bookable_id IN ({$in})", $slotIds);
                    $run('expert_cancellations', "DELETE FROM `{$prefix}_expert_cancellations` WHERE slot_id IN ({$in})", $slotIds);
                    $run('user_cancellations', "DELETE FROM `{$prefix}_user_cancellations` WHERE slot_id IN ({$in})", $slotIds);
                }

                $convIds = self::ids("SELECT id FROM `{$prefix}_im_conversations` WHERE participant_a = ? OR participant_b = ?", [$accountId, $accountId]);
                if ($convIds) {
                    $cin = self::inList($convIds);
                    $msgIds = self::ids("SELECT id FROM `{$prefix}_im_messages` WHERE conversation_id IN ({$cin})", $convIds);
                    if ($msgIds) {
                        $run('im_attachments', "DELETE FROM `{$prefix}_im_attachments` WHERE message_id IN (" . self::inList($msgIds) . ')', $msgIds);
                    }
                    $run('im_messages', "DELETE FROM `{$prefix}_im_messages` WHERE conversation_id IN ({$cin})", $convIds);
                    $run('im_read_status', "DELETE FROM `{$prefix}_im_read_status` WHERE conversation_id IN ({$cin})", $convIds);
                }

                $ticketIds = self::ids("SELECT id FROM `{$prefix}_support_tickets` WHERE account_id = ?", [$accountId]);
                if ($ticketIds) {
                    $tin = self::inList($ticketIds);
                    $supMsgIds = self::ids("SELECT id FROM `{$prefix}_support_messages` WHERE ticket_id IN ({$tin})", $ticketIds);
                    if ($supMsgIds) {
                        $run('support_attachments', "DELETE FROM `{$prefix}_support_attachments` WHERE message_id IN (" . self::inList($supMsgIds) . ')', $supMsgIds);
                    }
                    $run('support_messages', "DELETE FROM `{$prefix}_support_messages` WHERE ticket_id IN ({$tin})", $ticketIds);
                    $run('support_assignment_log', "DELETE FROM `{$prefix}_support_assignment_log` WHERE ticket_id IN ({$tin})", $ticketIds);
                }

                $paymentIds = self::ids("SELECT id FROM `{$prefix}_payments` WHERE account_id = ?", [$accountId]);
                if ($paymentIds) {
                    $run('payments_log', "DELETE FROM `{$prefix}_payments_log` WHERE payment_id IN (" . self::inList($paymentIds) . ')', $paymentIds);
                }
            }

            // ── Sessions (keyed by the login stored in session_data) ──
            $sessionIds = self::ids("SELECT sessionId FROM `{$prefix}_session_data` WHERE param = 'auth_login' AND value = ?", [$email]);
            if ($sessionIds) {
                $sin = self::inList($sessionIds);
                $run('session_data', "DELETE FROM `{$prefix}_session_data` WHERE sessionId IN ({$sin})", $sessionIds);
                $run('session', "DELETE FROM `{$prefix}_session` WHERE id IN ({$sin})", $sessionIds);
            }

            // ── Pass 2: generic schema-driven sweep by account id ──
            if ($accountId > 0) {
                foreach (self::ownerColumns($prefix) as [$table, $column]) {
                    $run($table, "DELETE FROM `{$table}` WHERE `{$column}` = ?", [$accountId]);
                }
            }

            // ── Email-keyed mail logs ──
            foreach (["{$prefix}_email_queue", "{$prefix}_mail_log", "{$prefix}_mail_log_recipients"] as $mailTable) {
                if (self::columnExists($mailTable, 'recipient_email')) {
                    $run($mailTable, "DELETE FROM `{$mailTable}` WHERE recipient_email = ?", [$email]);
                }
            }

            // ── Finally the account row itself ──
            if ($accountId > 0) {
                $run('accounts', "DELETE FROM `{$accountsTbl}` WHERE id = ?", [$accountId]);
            }

            $total = array_sum($deleted);
            return [
                'found' => $accountId > 0,
                'accountId' => $accountId,
                'email' => $email,
                'deleted' => $deleted,
                'total' => $total,
            ];
        }

        private static function prefix(): string {
            $bookingsTbl = Bookings::get()->getTableName();
            return preg_replace('/_bookings$/', '', $bookingsTbl) ?? $bookingsTbl;
        }

        private static function accountIdByLogin(string $accountsTbl, string $email): int {
            if ($email === '') {
                return 0;
            }
            $rows = DbPool::get()->query("SELECT id FROM `{$accountsTbl}` WHERE login = ? LIMIT 1", [$email]);
            return is_array($rows) && isset($rows[0]['id']) ? (int)$rows[0]['id'] : 0;
        }

        /**
         * App tables that expose one of the OWNER_COLUMNS, as [table, column] pairs.
         * @return array<int, array{0:string,1:string}>
         */
        private static function ownerColumns(string $prefix): array {
            $cols = self::OWNER_COLUMNS;
            $in = implode(',', array_fill(0, count($cols), '?'));
            $like = str_replace('_', '\\_', $prefix) . '\\_%';
            $rows = DbPool::get()->query(
                "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ? AND COLUMN_NAME IN ({$in})",
                array_merge([$like], $cols)
            );
            $out = [];
            foreach ((is_array($rows) ? $rows : []) as $r) {
                $out[] = [(string)$r['TABLE_NAME'], (string)$r['COLUMN_NAME']];
            }
            return $out;
        }

        private static function columnExists(string $table, string $column): bool {
            $rows = DbPool::get()->query(
                'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
                [$table, $column]
            );
            return is_array($rows) && !empty($rows);
        }

        /** @return array<int,int> */
        private static function ids(string $sql, array $params): array {
            $rows = DbPool::get()->query($sql, $params);
            $ids = [];
            foreach ((is_array($rows) ? $rows : []) as $r) {
                $ids[] = (int)reset($r);
            }
            return $ids;
        }

        private static function inList(array $ids): string {
            return implode(',', array_fill(0, count($ids), '?'));
        }
    }
}
