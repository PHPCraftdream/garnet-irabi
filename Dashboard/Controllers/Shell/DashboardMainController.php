<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers\Shell {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\Accounts\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Ops\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportTickets;
    use PHPCraftdream\IRabi\Dashboard\Controllers\Comms\DashboardSupportController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\Money\DashboardBookingsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\Money\DashboardFinanceController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\Ops\DashboardLogsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\People\DashboardUsersController;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardMainController extends DashboardController {
        public const URL = '/admin/dashboard/';

        private static function fetchOpenTickets(): array {
            $tickets = SupportTickets::get()->selectAll(function (SelectInterface $q): void {
                $q->where("status NOT IN ('resolved', 'rejected')");
                $q->orderBy(['updated_at DESC']);
                $q->limit(5);
            });

            $openCount = SupportTickets::openCount();

            // Resolve user names
            $accountIds = array_unique(array_filter(array_column($tickets, 'account_id')));
            $accounts = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($accountIds): void {
                        $select->resetCols();
                        $select->cols(['id', 'login', 'name']);
                        $select->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $accounts[(int)$a['id']] = $a;
                }
            }

            foreach ($tickets as &$ticket) {
                $aid = (int)$ticket['account_id'];
                $ticket['user_id'] = $aid;
                $ticket['user_login'] = $accounts[$aid]['login'] ?? '';
                $ticket['user_name'] = $accounts[$aid]['name'] ?? '';
            }
            unset($ticket);

            return ['count' => $openCount, 'tickets' => array_values($tickets)];
        }

        private static function fetchPendingApprovals(): array {
            // Преподаватель определяется так же, как в таблице пользователей:
            // по типу аккаунта. Когда-то здесь считали иначе — по наличию
            // строки в отдельной таблице профилей, — и не видели тех, кто
            // зарегистрировался, но ещё не завёл слот: кнопка «Одобрить» у них
            // в таблице была, а счётчик показывал ноль.
            //
            // D-153: эта версия не исключала отключённых — счётчик на
            // дашборде владельца и виджет модератора (MainController)
            // расходились на отключённых неодобренных экспертов. Теперь оба
            // читают UserEntityConfig::pendingExpertApprovals().
            $pending = UserEntityConfig::pendingExpertApprovals();

            return ['count' => count($pending), 'names' => array_slice($pending, 0, 10)];
        }

        private static function fetchPlatformStats(): array {
            // Total users
            $allUsers = Account::getAccounts(
                selectCallback: static function (SelectInterface $select): void {
                    $select->resetCols();
                    $select->cols(['COUNT(*) as total']);
                },
            );
            $totalUsers = (int)($allUsers[0]['total'] ?? 0);

            // Сколько преподавателей на площадке.
            //
            // Считалось по строкам `expert_profiles` — а строка там заводилась
            // при первом слоте и оставалась навсегда, в том числе у
            // разжалованных. Считаем аккаунты с типом «преподаватель».
            $expertRows = Account::getAccounts(
                selectCallback: static function (SelectInterface $select): void {
                    $select->resetCols();
                    $select->cols(['id']);
                    $select->where("type = 'expert'");
                },
            );
            $totalExperts = count($expertRows);

            // Bookings this month — month boundary in the viewing admin's tz
            $adminAccount = Account::fromSession();
            $adminTz = $adminAccount?->readParam('time_zone') ?: 'UTC';
            $monthStart = DateUtils::startOfCurrentMonthForUser($adminTz);
            $bookingsThisMonth = Bookings::get()->getCount(function (SelectInterface $q) use ($monthStart): void {
                $q->where('created_at >= ?', [$monthStart]);
            });

            // D-156: same gap as the expert's own "Доход за месяц" — summed
            // only booking_payment credits, so a booking paid and refunded
            // within the same month still counted its full payment here.
            // Unlike the per-expert query (MainController), this one has no
            // account_id filter — a plain is_credit net-sum would also pick
            // up the STUDENT's refund credit (same entry_type, opposite
            // account) and cancel the correction back out. Only the debit
            // side of booking_refund (money leaving the expert) belongs in
            // platform revenue.
            $monthRevenue = BalanceLedger::get()->selectAll(function (SelectInterface $q) use ($monthStart): void {
                $q->resetCols();
                $q->cols([
                    'COALESCE(SUM(CASE' .
                    " WHEN entry_type = 'booking_payment' AND is_credit = 1 THEN amount" .
                    " WHEN entry_type = 'booking_refund' AND is_credit = 0 THEN -amount" .
                    ' ELSE 0 END), 0) as total',
                ]);
                $q->where("entry_type IN ('booking_payment', 'booking_refund')");
                $q->where('created_at >= ?', [$monthStart]);
            });
            $revenueThisMonth = (int)($monthRevenue[0]['total'] ?? 0);

            return [
                'totalUsers' => $totalUsers,
                'totalExperts' => $totalExperts,
                'bookingsThisMonth' => $bookingsThisMonth,
                'revenueThisMonth' => $revenueThisMonth,
            ];
        }

        private static function fetchRecentActivity(): array {
            $logs = AdminActionLog::get()->selectAll(function (SelectInterface $q): void {
                $q->orderBy(['id DESC']);
                $q->limit(10);
            });

            // Resolve actor/target names
            $ids = [];
            foreach ($logs as $log) {
                if (!empty($log['actor_id'])) {
                    $ids[(int)$log['actor_id']] = true;
                }
                if (!empty($log['target_id'])) {
                    $ids[(int)$log['target_id']] = true;
                }
            }
            $names = [];
            if (!empty($ids)) {
                foreach (DbAccount::get()->selectByIds(array_keys($ids), function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'name']);
                }) as $a) {
                    $names[(int)$a['id']] = $a['name'] ?? '';
                }
            }
            foreach ($logs as &$log) {
                $log['actor_name'] = $names[(int)($log['actor_id'] ?? 0)] ?? '';
                $log['target_name'] = $names[(int)($log['target_id'] ?? 0)] ?? '';
            }

            return array_values($logs);
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $url = $globals->getUri();

            $content = RenderIsland::render('admin-dashboard', [
                'openTickets' => static::fetchOpenTickets(),
                'pendingApprovals' => static::fetchPendingApprovals(),
                'platformStats' => static::fetchPlatformStats(),
                'recentActivity' => static::fetchRecentActivity(),
                'supportUrl' => IRabi::url(DashboardSupportController::URL),
                'usersUrl' => IRabi::url(DashboardUsersController::URL),
                'logsUrl' => IRabi::url(DashboardLogsController::URL),
                'bookingsUrl' => IRabi::url(DashboardBookingsController::URL),
                'financeUrl' => IRabi::url(DashboardFinanceController::URL),
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }
    }
}
