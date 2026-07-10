<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Email\FwEmailQueueService;
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccountData;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IAppConfig;
    use PHPCraftdream\Garnet\Kernel\Io\HtmlMinify\HtmlMinify;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\Twig;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\EmailThrottle;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;
    use Throwable;

    class EmailNotifications {
        public const CAT_MESSAGES = 'messages';
        public const CAT_SUPPORT = 'support';
        public const CAT_BOOKINGS = 'bookings';

        public const TYPE_BOOKING_CREATED = 'bookingCreated';
        public const TYPE_BOOKING_CONFIRMED = 'bookingConfirmed';
        public const TYPE_BOOKING_REJECTED = 'bookingRejected';
        public const TYPE_BOOKING_CANCELLED = 'bookingCancelled';
        public const TYPE_NEW_MESSAGE = 'newMessage';
        public const TYPE_SUPPORT_TICKET_CREATED = 'supportTicketCreated';
        public const TYPE_SUPPORT_REPLY_TO_USER = 'supportReplyToUser';
        public const TYPE_SUPPORT_USER_REPLY = 'supportUserReply';
        public const TYPE_EXPERT_APPROVED = 'expertApproved';
        public const TYPE_EXPERT_REJECTED = 'expertRejected';

        /**
         * List of supported template types with their i18n title-key (used in
         * the test-send dropdown). Lives next to the template definitions so
         * adding a new type touches one place.
         *
         * @return array<int, array{id: string, label: string}>
         */
        public static function listTypesForUi(): array {
            $t = ForegroundI18n::getInstance();
            return [
                ['id' => static::TYPE_BOOKING_CREATED, 'label' => $t->Email_BookingCreated_Title()],
                ['id' => static::TYPE_BOOKING_CONFIRMED, 'label' => $t->Email_BookingConfirmed_Title()],
                ['id' => static::TYPE_BOOKING_REJECTED, 'label' => $t->Email_BookingRejected_Title()],
                ['id' => static::TYPE_BOOKING_CANCELLED, 'label' => $t->Email_BookingCancelled_Title()],
                ['id' => static::TYPE_NEW_MESSAGE, 'label' => $t->Email_NewMessage_Title_Plain()],
                ['id' => static::TYPE_SUPPORT_TICKET_CREATED, 'label' => $t->Email_SupportNewTicket_Title()],
                ['id' => static::TYPE_SUPPORT_REPLY_TO_USER, 'label' => $t->Email_SupportReply_Title()],
                ['id' => static::TYPE_SUPPORT_USER_REPLY, 'label' => $t->Email_SupportUserReply_Title()],
                ['id' => static::TYPE_EXPERT_APPROVED, 'label' => $t->Email_ExpertApproved_Title()],
                ['id' => static::TYPE_EXPERT_REJECTED, 'label' => $t->Email_ExpertRejected_Title()],
            ];
        }

        /**
         * Render a polished email body.
         *
         * @param string                                                                 $title
         * @param array<int, array{label: string, value: string}|array{raw: string}>     $rows
         * @param array{text: string, href: string}|null                                 $cta
         */
        private static function renderEmail(string $title, array $rows, ?array $cta = null): string {
            $twig = Twig::get();
            $params = TwigParams::init()->get(TwigParams::DEF_EMAIL_PARAMS);

            $infoRows = [];
            foreach ($rows as $row) {
                if (isset($row['raw'])) {
                    $infoRows[] = ['raw' => $row['raw']];
                    continue;
                }
                $label = (string)($row['label'] ?? '');
                $value = (string)($row['value'] ?? '');
                if ($label === '' && $value === '') {
                    continue;
                }
                $infoRows[] = ['raw' => static::renderLabelValueRow($label, $value)];
            }

            if ($cta !== null && $cta['text'] !== '' && $cta['href'] !== '') {
                $button = $twig->render('Email/ButtonMain.twig', [
                    'text' => $cta['text'],
                    'href' => $cta['href'],
                ]);
                $infoRows[] = [
                    'raw' => $twig->render('Email/Row.twig', [
                        'row' => $button,
                        'align' => 'center',
                    ]),
                ];
            }

            $params['info_blocks'] = [
                ['title' => $title, 'rows' => $infoRows],
            ];
            $params['bottom'] = static::brandFooter();

            $html = $twig->render('Email/Email.twig', $params);
            return HtmlMinify::get()->minify($html);
        }

        private static function renderLabelValueRow(string $label, string $value): string {
            return Twig::get()->render('Email/LabelValueRow.twig', [
                'label' => $label,
                'value' => $value,
            ]);
        }

        private static function brandFooter(): string {
            $t = ForegroundI18n::getInstance();
            $contacts = FwAppSettings::supportContacts();
            return Twig::get()->render('Email/BrandFooter.twig', [
                'year' => (int)date('Y'),
                'title' => FwAppSettings::brandName(),
                'note' => $t->Email_Footer_Note(),
                'contactEmail' => $contacts['email'],
                'contactLabel' => $t->Email_Footer_Contact(),
            ]);
        }

        private static function absoluteUrl(string $path): string {
            try {
                $config = IniConfig::app();
            } catch (Throwable) {
                return $path;
            }
            if (!$config instanceof IAppConfig) {
                return $path;
            }
            return rtrim($config->baseUrl(), '/') . IRabi::url($path);
        }

        private static function getAccountEmail(int $accountId): ?string {
            $row = DbAccount::get()->selectById($accountId);
            return $row ? $row['login'] : null;
        }

        private static function getAccountName(int $accountId): string {
            $row = DbAccount::get()->selectById($accountId);
            return $row ? ($row['name'] ?? $row['login']) : '';
        }

        private static function getAccountTimezone(int $accountId): ?string {
            // The account timezone lives in `db_accounts_data` (EAV) under the
            // `time_zone` param. Read it directly via the gateway so we don't
            // depend on the active session.
            $rows = DbAccountData::get()->selectAll(
                static function (SelectInterface $q) use ($accountId): void {
                    $q->where('account_id = :aid AND param = :p', ['aid' => $accountId, 'p' => 'time_zone']);
                }
            );
            $value = $rows[0]['value'] ?? null;
            return is_string($value) && $value !== '' ? $value : null;
        }

        /**
         * Build a per-recipient slot description string in the recipient's
         * timezone. All callers should pass the unix timestamp + duration so
         * that this helper owns the rendering — never feed raw seconds into
         * an email body.
         */
        private static function formatSlotInfo(int $recipientId, int $startAt, int $durationMin): string {
            $tz = static::getAccountTimezone($recipientId);
            $when = DateUtils::formatForUser($startAt, $tz, 'Y-m-d H:i');
            return $durationMin > 0 ? sprintf('%s (%d min)', $when, $durationMin) : $when;
        }

        private static function frequencyFor(int $accountId, string $category): string {
            $allowed = ['off', 'each', 'hourly', 'daily'];
            $rows = DbAccountData::get()->selectAll(
                static function (SelectInterface $q) use ($accountId): void {
                    $q->where('account_id = :aid AND param = :p', ['aid' => $accountId, 'p' => 'email_notif_prefs']);
                }
            );
            $json = $rows[0]['value'] ?? null;
            $prefs = is_string($json) ? json_decode($json, true) : null;
            if (!is_array($prefs)) {
                return 'each';
            }
            $val = $prefs[$category] ?? null;
            return in_array($val, $allowed, true) ? $val : 'each';
        }

        private static function gate(int $recipientId, string $category): bool {
            $freq = static::frequencyFor($recipientId, $category);
            if ($freq === 'off') {
                return false;
            }
            if ($freq === 'each') {
                return true;
            }

            $window = $freq === 'hourly' ? 3600 : 86400;
            $table = EmailThrottle::get()->getTableName();

            $rows = EmailThrottle::get()->selectAll(
                static function (SelectInterface $q) use ($recipientId, $category): void {
                    $q->where('account_id = :aid AND category = :cat', ['aid' => $recipientId, 'cat' => $category]);
                }
            );

            if (!empty($rows) && (time() - (int)$rows[0]['last_sent_at']) < $window) {
                return false;
            }

            EmailThrottle::get()->getQueryEx()->ex(
                "INSERT INTO `{$table}` (account_id, category, last_sent_at)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE last_sent_at = VALUES(last_sent_at)",
                [$recipientId, $category, time()]
            );
            return true;
        }

        private static function getModeratorRecipients(): array {
            $accountsDataTable = DbAccountData::get()->getTableName();
            $mods = DbAccount::get()->selectAll(function (SelectInterface $query) use ($accountsDataTable): void {
                $query->cols(['id', 'login']);
                $query->where("id IN (SELECT account_id FROM `{$accountsDataTable}` WHERE param IN ('IS_ADMIN', 'IS_OWNER', 'IS_MODERATOR') AND value = '1')");
            });
            return array_values(array_filter($mods, static fn ($r) => isset($r['id'], $r['login']) && $r['login'] !== ''));
        }

        // ------------------------------------------------------------------
        //  Template builders — return ['subject' => ..., 'body' => ...]
        // ------------------------------------------------------------------

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildBookingCreated(int $recipientId, string $studentName, int $startAt, int $durationMin): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_BookingCreated_Subject(FwAppSettings::brandName()),
                'body' => static::renderEmail(
                    $t->Email_BookingCreated_Title(),
                    [
                        ['label' => $t->Email_Row_User(),     'value' => $studentName],
                        ['label' => $t->Email_Row_DateTime(), 'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)],
                        ['label' => $t->Email_Row_Duration(), 'value' => sprintf('%d min', $durationMin)],
                    ],
                    [
                        'text' => $t->Email_Cta_OpenBooking(),
                        'href' => static::absoluteUrl('/expert/~bookings'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildBookingConfirmed(int $recipientId, string $expertName, int $startAt, int $durationMin): array {
            $t = ForegroundI18n::getInstance();
            $rows = [];
            if ($expertName !== '') {
                $rows[] = ['label' => $t->Email_Row_Expert(), 'value' => $expertName];
            }
            $rows[] = ['label' => $t->Email_Row_DateTime(), 'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)];
            $rows[] = ['label' => $t->Email_Row_Duration(), 'value' => sprintf('%d min', $durationMin)];
            return [
                'subject' => $t->Email_BookingConfirmed_Subject(FwAppSettings::brandName()),
                'body' => static::renderEmail(
                    $t->Email_BookingConfirmed_Title(),
                    $rows,
                    [
                        'text' => $t->Email_Cta_OpenBooking(),
                        'href' => static::absoluteUrl('/bookings/'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildBookingRejected(int $recipientId, string $expertName, int $startAt, int $durationMin, string $reason = ''): array {
            $t = ForegroundI18n::getInstance();
            $rows = [];
            if ($expertName !== '') {
                $rows[] = ['label' => $t->Email_Row_Expert(), 'value' => $expertName];
            }
            $rows[] = ['label' => $t->Email_Row_DateTime(), 'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)];
            $rows[] = ['label' => $t->Email_Row_Duration(), 'value' => sprintf('%d min', $durationMin)];
            if ($reason !== '') {
                $rows[] = ['label' => $t->Email_Row_Reason(), 'value' => $reason];
            }
            return [
                'subject' => $t->Email_BookingRejected_Subject(FwAppSettings::brandName()),
                'body' => static::renderEmail(
                    $t->Email_BookingRejected_Title(),
                    $rows,
                    [
                        'text' => $t->Email_Cta_FindAnotherSlot(),
                        'href' => static::absoluteUrl('/slots/'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildBookingCancelled(int $recipientId, int $startAt, int $durationMin, string $cancelledBy): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_BookingCancelled_Subject(FwAppSettings::brandName()),
                'body' => static::renderEmail(
                    $t->Email_BookingCancelled_Title(),
                    [
                        ['label' => $t->Email_Row_DateTime(),  'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)],
                        ['label' => $t->Email_Row_Duration(),  'value' => sprintf('%d min', $durationMin)],
                        ['label' => $t->Email_Row_CancelledBy(), 'value' => $cancelledBy],
                    ],
                    [
                        'text' => $t->Email_Cta_FindAnotherSlot(),
                        'href' => static::absoluteUrl('/slots/'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildNewMessage(string $senderName, string $messagePreview): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_NewMessage_Subject($senderName),
                'body' => static::renderEmail(
                    $t->Email_NewMessage_Title($senderName),
                    [
                        ['label' => $t->Email_Row_From(),    'value' => $senderName],
                        ['label' => $t->Email_Row_Message(), 'value' => $messagePreview],
                    ],
                    [
                        'text' => $t->Email_Cta_OpenChat(),
                        'href' => static::absoluteUrl('/im/'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildSupportTicketCreated(int $ticketId, string $ticketSubject, string $userName): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_SupportNewTicket_Subject($ticketId),
                'body' => static::renderEmail(
                    $t->Email_SupportNewTicket_Title(),
                    [
                        ['label' => $t->Email_Row_From(),       'value' => $userName],
                        ['label' => $t->Email_Row_Subject(),    'value' => $ticketSubject],
                        ['label' => $t->Email_Row_TicketId(),   'value' => '#' . $ticketId],
                    ],
                    [
                        'text' => $t->Email_Cta_OpenTicket(),
                        'href' => static::absoluteUrl('/admin/support/'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildSupportReplyToUser(int $ticketId, string $ticketSubject): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_SupportReply_Subject($ticketId),
                'body' => static::renderEmail(
                    $t->Email_SupportReply_Title(),
                    [
                        ['label' => $t->Email_Row_Subject(),  'value' => $ticketSubject],
                        ['label' => $t->Email_Row_TicketId(), 'value' => '#' . $ticketId],
                    ],
                    [
                        'text' => $t->Email_Cta_OpenTicket(),
                        'href' => static::absoluteUrl('/support/'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildSupportUserReply(int $ticketId, string $ticketSubject, string $userName): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_SupportUserReply_Subject($ticketId),
                'body' => static::renderEmail(
                    $t->Email_SupportUserReply_Title(),
                    [
                        ['label' => $t->Email_Row_From(),     'value' => $userName],
                        ['label' => $t->Email_Row_Subject(),  'value' => $ticketSubject],
                        ['label' => $t->Email_Row_TicketId(), 'value' => '#' . $ticketId],
                    ],
                    [
                        'text' => $t->Email_Cta_OpenTicket(),
                        'href' => static::absoluteUrl('/admin/support/'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildExpertApproved(): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_ExpertApproved_Subject(),
                'body' => static::renderEmail(
                    $t->Email_ExpertApproved_Title(),
                    [
                        ['raw' => Twig::get()->render('Email/Row.twig', [
                            'row' => htmlspecialchars($t->Email_ExpertApproved_Body(), ENT_QUOTES | ENT_SUBSTITUTE),
                            'align' => 'left',
                        ])],
                    ],
                    [
                        'text' => $t->Email_Cta_OpenExpertPanel(),
                        'href' => static::absoluteUrl('/expert/~slots'),
                    ],
                ),
            ];
        }

        /**
         * @return array{subject: string, body: string}
         */
        private static function buildExpertRejected(): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_ExpertRejected_Subject(),
                'body' => static::renderEmail(
                    $t->Email_ExpertRejected_Title(),
                    [
                        ['raw' => Twig::get()->render('Email/Row.twig', [
                            'row' => htmlspecialchars($t->Email_ExpertRejected_Body(), ENT_QUOTES | ENT_SUBSTITUTE),
                            'align' => 'left',
                        ])],
                    ],
                    [
                        'text' => $t->Email_Cta_ContactSupport(),
                        'href' => static::absoluteUrl('/support/'),
                    ],
                ),
            ];
        }

        // ------------------------------------------------------------------
        //  Public senders (called from boot flow / business code)
        // ------------------------------------------------------------------

        public static function bookingCreated(int $expertId, int $studentId, int $startAt, int $durationMin): void {
            $email = static::getAccountEmail($expertId);
            if (!$email) {
                return;
            }
            if (!static::gate($expertId, self::CAT_BOOKINGS)) {
                return;
            }
            $studentName = static::getAccountName($studentId);
            $rendered = static::buildBookingCreated($expertId, $studentName, $startAt, $durationMin);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        public static function bookingConfirmed(int $studentId, int $startAt, int $durationMin, int $expertId = 0): void {
            $email = static::getAccountEmail($studentId);
            if (!$email) {
                return;
            }
            if (!static::gate($studentId, self::CAT_BOOKINGS)) {
                return;
            }
            $expertName = $expertId > 0 ? static::getAccountName($expertId) : '';
            $rendered = static::buildBookingConfirmed($studentId, $expertName, $startAt, $durationMin);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        public static function bookingRejected(int $studentId, int $startAt, int $durationMin, int $expertId = 0, string $reason = ''): void {
            $email = static::getAccountEmail($studentId);
            if (!$email) {
                return;
            }
            if (!static::gate($studentId, self::CAT_BOOKINGS)) {
                return;
            }
            $expertName = $expertId > 0 ? static::getAccountName($expertId) : '';
            $rendered = static::buildBookingRejected($studentId, $expertName, $startAt, $durationMin, $reason);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        public static function bookingCancelled(int $recipientId, int $startAt, int $durationMin, string $cancelledBy): void {
            $email = static::getAccountEmail($recipientId);
            if (!$email) {
                return;
            }
            if (!static::gate($recipientId, self::CAT_BOOKINGS)) {
                return;
            }
            $rendered = static::buildBookingCancelled($recipientId, $startAt, $durationMin, $cancelledBy);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        public static function newMessage(int $recipientId, int $senderId, string $messagePreview): void {
            $email = static::getAccountEmail($recipientId);
            if (!$email) {
                return;
            }
            if (!static::gate($recipientId, self::CAT_MESSAGES)) {
                return;
            }
            $senderName = static::getAccountName($senderId);
            $rendered = static::buildNewMessage($senderName, $messagePreview);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        public static function supportTicketCreated(int $ticketId, string $subject, string $userName): void {
            $recipients = static::getModeratorRecipients();
            $emails = [];
            foreach ($recipients as $r) {
                if (static::gate((int)$r['id'], self::CAT_SUPPORT)) {
                    $emails[] = $r['login'];
                }
            }
            if (empty($emails)) {
                return;
            }
            $rendered = static::buildSupportTicketCreated($ticketId, $subject, $userName);
            FwEmailQueueService::enqueueToMany($emails, $rendered['subject'], $rendered['body']);
        }

        public static function supportReplyToUser(int $userId, int $ticketId, string $ticketSubject): void {
            $email = static::getAccountEmail($userId);
            if (!$email) {
                return;
            }
            if (!static::gate($userId, self::CAT_SUPPORT)) {
                return;
            }
            $rendered = static::buildSupportReplyToUser($ticketId, $ticketSubject);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        public static function supportUserReply(int $ticketId, string $ticketSubject, string $userName): void {
            $recipients = static::getModeratorRecipients();
            $emails = [];
            foreach ($recipients as $r) {
                if (static::gate((int)$r['id'], self::CAT_SUPPORT)) {
                    $emails[] = $r['login'];
                }
            }
            if (empty($emails)) {
                return;
            }
            $rendered = static::buildSupportUserReply($ticketId, $ticketSubject, $userName);
            FwEmailQueueService::enqueueToMany($emails, $rendered['subject'], $rendered['body']);
        }

        public static function expertApproved(int $expertId): void {
            $email = static::getAccountEmail($expertId);
            if (!$email) {
                return;
            }
            $rendered = static::buildExpertApproved();
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        public static function expertRejected(int $expertId): void {
            $email = static::getAccountEmail($expertId);
            if (!$email) {
                return;
            }
            $rendered = static::buildExpertRejected();
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body']);
        }

        // ------------------------------------------------------------------
        //  Test render — used by the system-settings test-send dropdown.
        // ------------------------------------------------------------------

        /**
         * Build the subject + HTML body of the requested template using stub
         * payload. The recipient's timezone is taken from `$recipientId` if a
         * matching account exists, otherwise UTC fallback inside formatForUser.
         *
         * @return array{subject: string, body: string}
         */
        public static function renderForTest(string $mailType, int $recipientId): array {
            $t = ForegroundI18n::getInstance();
            $stubExpert = $t->Email_Stub_ExpertName();
            $stubUser = $t->Email_Stub_UserName();
            $stubReason = $t->Email_Stub_Reason();
            $stubMessage = $t->Email_Stub_MessagePreview();
            $stubSubject = $t->Email_Stub_TicketSubject();
            $stubActor = $t->Email_Stub_CancelledBy();
            $startAt = time() + 86400;
            $durationMin = 60;
            $ticketId = 999;

            return match ($mailType) {
                static::TYPE_BOOKING_CREATED => static::buildBookingCreated($recipientId, $stubUser, $startAt, $durationMin),
                static::TYPE_BOOKING_CONFIRMED => static::buildBookingConfirmed($recipientId, $stubExpert, $startAt, $durationMin),
                static::TYPE_BOOKING_REJECTED => static::buildBookingRejected($recipientId, $stubExpert, $startAt, $durationMin, $stubReason),
                static::TYPE_BOOKING_CANCELLED => static::buildBookingCancelled($recipientId, $startAt, $durationMin, $stubActor),
                static::TYPE_NEW_MESSAGE => static::buildNewMessage($stubUser, $stubMessage),
                static::TYPE_SUPPORT_TICKET_CREATED => static::buildSupportTicketCreated($ticketId, $stubSubject, $stubUser),
                static::TYPE_SUPPORT_REPLY_TO_USER => static::buildSupportReplyToUser($ticketId, $stubSubject),
                static::TYPE_SUPPORT_USER_REPLY => static::buildSupportUserReply($ticketId, $stubSubject, $stubUser),
                static::TYPE_EXPERT_APPROVED => static::buildExpertApproved(),
                static::TYPE_EXPERT_REJECTED => static::buildExpertRejected(),
                default => ['subject' => '', 'body' => ''],
            };
        }

        public static function isKnownTestType(string $mailType): bool {
            return in_array($mailType, [
                static::TYPE_BOOKING_CREATED,
                static::TYPE_BOOKING_CONFIRMED,
                static::TYPE_BOOKING_REJECTED,
                static::TYPE_BOOKING_CANCELLED,
                static::TYPE_NEW_MESSAGE,
                static::TYPE_SUPPORT_TICKET_CREATED,
                static::TYPE_SUPPORT_REPLY_TO_USER,
                static::TYPE_SUPPORT_USER_REPLY,
                static::TYPE_EXPERT_APPROVED,
                static::TYPE_EXPERT_REJECTED,
            ], true);
        }
    }
}
