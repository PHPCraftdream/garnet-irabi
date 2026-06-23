<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\Support\Controllers\FwSupportController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Tables\SupportAttachments;
    use PHPCraftdream\IRabi\Common\Tables\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\IRabi;

    class SupportController extends FwSupportController {
        public const URL = '/support/';

        protected static function getUploadDir(): string {
            return IRabi::getInstance()->uploadDir;
        }

        protected static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }

        protected static function ticketsTable(): DbTable {
            return SupportTickets::get();
        }

        protected static function messagesTable(): DbTable {
            return SupportMessages::get();
        }

        protected static function attachmentsTable(): DbTable {
            return SupportAttachments::get();
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return parent::get__main($globals, $params);
        }

        public static function post__createTicket(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $result = parent::post__createTicket($globals, $params);

            if ($result->getStatusCode() === 200) {
                $account = Account::fromSession();
                $subject = trim((string)$globals->readPostValue('subject', ''));
                $ticket = static::ticketsTable()->selectOneByField('account_id', $account->id(), function ($q): void {
                    $q->orderBy(['id DESC']);
                    $q->limit(1);
                });
                if ($ticket) {
                    $userName = $account->readData('name') ?: ('#' . $account->id());
                    EmailNotifications::supportTicketCreated((int)$ticket['id'], $subject, $userName);
                }
            }

            return $result;
        }

        public static function post__reply(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $result = parent::post__reply($globals, $params);

            if ($result->getStatusCode() === 200) {
                $account = Account::fromSession();
                $ticketId = (int)$globals->readPostValue('ticket_id', '0');
                if ($ticketId > 0) {
                    $ticket = static::ticketsTable()->selectOneByField('id', $ticketId);
                    if ($ticket) {
                        $userName = $account->readData('name') ?: ('#' . $account->id());
                        EmailNotifications::supportUserReply($ticketId, $ticket['subject'] ?? '', $userName);
                    }
                }
            }

            return $result;
        }
    }
}
