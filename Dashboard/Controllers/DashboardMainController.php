<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardMainController extends DashboardController {
        public const URL = '/admin/dashboard/';

        private static function fetchOpenTickets(): array {
            $tickets = SupportTickets::get()->selectAll(function (SelectInterface $q): void {
                $q->where("status NOT IN ('resolved', 'rejected')");
                $q->orderBy(['updated_at DESC']);
                $q->limit(5);
            });

            $allTickets = SupportTickets::get()->selectAll(function (SelectInterface $q): void {
                $q->resetCols();
                $q->cols(['COUNT(*) as total']);
                $q->where("status NOT IN ('resolved', 'rejected')");
            });
            $openCount = (int)($allTickets[0]['total'] ?? 0);

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
            // Identify experts the same way the admin users grid does — by the
            // account type column — NOT by expert_profiles membership. An expert
            // who registered but hasn't created a slot yet has no expert_profiles
            // row, yet still shows an "Approve" button in the grid; counting by
            // profile membership would miss them and report 0.
            $accounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $select): void {
                    $select->resetCols();
                    $select->cols(['id', 'login', 'name']);
                    $select->where("type = 'expert'");
                },
                accountDataFields: [Account::IS_APPROVED],
            );

            $pending = [];
            foreach ($accounts as $a) {
                if (intval($a[Account::IS_APPROVED] ?? 0) > 0) {
                    continue;
                }
                $pending[] = ['id' => (int)$a['id'], 'login' => $a['login'], 'name' => $a['name']];
            }

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

            // Total experts
            $totalExperts = ExpertProfiles::get()->getCount();

            // Bookings this month — month boundary in the viewing admin's tz
            $adminAccount = Account::fromSession();
            $adminTz = $adminAccount?->readParam('time_zone') ?: 'UTC';
            $monthStart = DateUtils::startOfCurrentMonthForUser($adminTz);
            $bookingsThisMonth = Bookings::get()->getCount(function (SelectInterface $q) use ($monthStart): void {
                $q->where('created_at >= ?', [$monthStart]);
            });

            // Revenue this month (sum of debit entries = booking_payment)
            $monthRevenue = BalanceLedger::get()->selectAll(function (SelectInterface $q) use ($monthStart): void {
                $q->resetCols();
                $q->cols(['COALESCE(SUM(amount), 0) as total']);
                $q->where("entry_type = 'booking_payment'");
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
