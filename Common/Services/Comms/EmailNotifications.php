<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\Comms {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Email\FwEmailQueueService;
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccountData;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IAppConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Render\HtmlMinify\HtmlMinify;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\Twig;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\TwigParams;
    use PHPCraftdream\Garnet\Kernel\Io\Services\IniConfig\IniConfig;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\Mail\EmailThrottle;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;
    use Throwable;

    class EmailNotifications {
        public const CAT_MESSAGES = 'messages';
        public const CAT_SUPPORT = 'support';
        public const CAT_BOOKINGS = 'bookings';

        /**
         * Max send attempts passed to FwEmailQueueService::enqueue() for
         * every transactional email. The framework's retry backoff is
         * linear (5s * min(attempt, 10)) and hardcoded inside the catch
         * block of processQueue() with no overridable seam — so the ONLY
         * retry-window lever reachable from app code (without editing
         * vendor) is this $maxAttempts argument. Raising it from the
         * framework default of 3 to 6 widens the effective retry window
         * from ~15s (5+10) to ~75s (5+10+15+20+25) before a row goes
         * terminal dead-letter.
         *
         * This is a PARTIAL mitigation of audit H-3, NOT a full fix: a
         * proper exponential backoff (minutes/hours) requires changing
         * the backoff formula in vendor/.../FwEmailQueueService.php —
         * tracked as a separate framework task.
         */
        public const MAX_SEND_ATTEMPTS = 6;

        public const TYPE_BOOKING_CREATED = 'bookingCreated';
        public const TYPE_BOOKING_CONFIRMED = 'bookingConfirmed';
        public const TYPE_BOOKING_REJECTED = 'bookingRejected';
        public const TYPE_BOOKING_CANCELLED = 'bookingCancelled';
        public const TYPE_NEW_MESSAGE = 'newMessage';
        public const TYPE_SUPPORT_TICKET_CREATED = 'supportTicketCreated';
        public const TYPE_SUPPORT_REPLY_TO_USER = 'supportReplyToUser';
        public const TYPE_SUPPORT_USER_REPLY = 'supportUserReply';
        public const TYPE_BOOKING_REMINDER_1D = 'bookingReminder1d';
        public const TYPE_BOOKING_REMINDER_2H = 'bookingReminder2h';
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
                ['id' => static::TYPE_BOOKING_REMINDER_1D, 'label' => $t->Email_Reminder_Title_1d()],
                ['id' => static::TYPE_BOOKING_REMINDER_2H, 'label' => $t->Email_Reminder_Title_2h()],
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

        /**
         * Имя для показа в письме. Публичная обёртка нужна тем, кто собирает
         * список получателей снаружи (напоминание преподавателю перечисляет
         * записавшихся) — чтобы имя бралось из одного места, а не из второго
         * запроса к аккаунтам с другой логикой отката на логин.
         */
        public static function accountDisplayName(int $accountId): string {
            return static::getAccountName($accountId);
        }

        private static function getAccountName(int $accountId): string {
            $row = DbAccount::get()->selectById($accountId);
            return $row ? ($row['name'] ?? $row['login']) : '';
        }

        /**
         * Часовой пояс аккаунта — КОЛОНКА `accounts.time_zone`.
         *
         * Раньше его искали строкой в `accounts_data` с `param = 'time_zone'`.
         * Такого ключа там нет ни у кого — в этой таблице живут только флаги
         * ролей. Значит поиск всегда возвращал пусто, пояс всегда был `null`, и
         * **каждое письмо со временем занятия печаталось в UTC**: для
         * московского профиля это три часа мимо.
         *
         * Ошибку не было видно ни по логам, ни по коду отправки: письмо
         * уходило, время в нём выглядело правдоподобно и было просто чужим.
         * Нашлось это по чату (D-061), где та же ошибка сидела во второй копии
         * того же запроса.
         */
        private static function getAccountTimezone(int $accountId): ?string {
            $row = DbAccount::get()->selectById($accountId);
            $value = $row['time_zone'] ?? null;

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

            // Пояс подписывается прямо у времени, и только в письмах.
            //
            // На странице пояс подсказан баннером и самим тем, что человек
            // сейчас на сайте. В почтовом ящике этого нет: «занятие в 11:00»
            // без пояса — не факт, а загадка, и цена ошибки здесь полное
            // занятие, а не неудобство. Подпись явная (`Europe/Moscow, UTC+3`),
            // потому что сокращения вроде «МСК» знает не каждый, а смещение
            // проверяемо кем угодно.
            $zone = DateUtils::zoneLabel($startAt, $tz);

            // «min» здесь было по-английски, в русском письме. Мелочь, но
            // ровно того же рода, что D-029, и теперь она стоит вплотную к
            // подписи пояса — то есть на самом видном месте письма.
            $minutes = (string)ForegroundI18n::getInstance()->Slot_Duration_Min();

            return $durationMin > 0
                ? sprintf('%s (%s, %d %s)', $when, $zone, $durationMin, $minutes)
                : sprintf('%s (%s)', $when, $zone);
        }

        /**
         * D-139: писем о группового занятия ничем не отличались от писем об
         * одиночном — преподаватель, читая письмо об отмене ОДНОГО места,
         * не мог понять, сорвалась вся группа или один из четырёх.
         *
         * @return array{label: string, value: string}[]
         */
        private static function groupLessonRow(int $maxUsers): array {
            if ($maxUsers <= 1) {
                return [];
            }
            $t = ForegroundI18n::getInstance();

            return [['label' => $t->Email_Row_GroupLesson(), 'value' => $t->Email_GroupLesson_Value((string)$maxUsers)]];
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
        private static function buildBookingCreated(int $recipientId, string $studentName, int $startAt, int $durationMin, int $maxUsers = 1): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_BookingCreated_Subject(FwAppSettings::brandName()),
                'body' => static::renderEmail(
                    $t->Email_BookingCreated_Title(),
                    [
                        ['label' => $t->Email_Row_User(),     'value' => $studentName],
                        ['label' => $t->Email_Row_DateTime(), 'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)],
                        ...static::groupLessonRow($maxUsers),
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
        /**
         * Общее тело напоминания для обеих ролей.
         *
         * $lead — насколько заранее письмо: '1d' или '2h'. От него зависят и
         * тема, и заголовок, потому что получатель видит два письма про одно
         * занятие и должен различать их в списке, не открывая.
         *
         * @return array{subject: string, body: string}
         */
        private static function buildReminder(
            int $recipientId,
            string $lead,
            string $expertName,
            int $startAt,
            int $durationMin,
            string $bodyText,
            string $ctaPath,
            string $students = '',
        ): array {
            $t = ForegroundI18n::getInstance();

            $rows = [
                ['raw' => Twig::get()->render('Email/Row.twig', [
                    'row' => htmlspecialchars($bodyText, ENT_QUOTES | ENT_SUBSTITUTE),
                    'align' => 'left',
                ])],
            ];

            if ($expertName !== '') {
                $rows[] = ['label' => $t->Email_Row_Expert(), 'value' => $expertName];
            }
            $rows[] = ['label' => $t->Email_Row_DateTime(), 'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)];

            if ($students !== '') {
                $rows[] = ['label' => $t->Email_Row_Students(), 'value' => $students];
            }
            $brand = FwAppSettings::brandName();

            return [
                'subject' => $lead === '1d' ? $t->Email_Reminder_Subject_1d($brand) : $t->Email_Reminder_Subject_2h($brand),
                'body' => static::renderEmail(
                    $lead === '1d' ? $t->Email_Reminder_Title_1d() : $t->Email_Reminder_Title_2h(),
                    $rows,
                    [
                        'text' => $ctaPath === '/bookings/' ? $t->Email_Cta_OpenBooking() : $t->Email_Cta_OpenSlot(),
                        'href' => static::absoluteUrl($ctaPath),
                    ],
                ),
            ];
        }

        private static function buildBookingConfirmed(int $recipientId, string $expertName, int $startAt, int $durationMin, int $maxUsers = 1): array {
            $t = ForegroundI18n::getInstance();
            $rows = [];
            if ($expertName !== '') {
                $rows[] = ['label' => $t->Email_Row_Expert(), 'value' => $expertName];
            }
            $rows[] = ['label' => $t->Email_Row_DateTime(), 'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)];
            $rows = [...$rows, ...static::groupLessonRow($maxUsers)];
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
        private static function buildBookingRejected(int $recipientId, string $expertName, int $startAt, int $durationMin, string $reason = '', int $maxUsers = 1): array {
            $t = ForegroundI18n::getInstance();
            $rows = [];
            if ($expertName !== '') {
                $rows[] = ['label' => $t->Email_Row_Expert(), 'value' => $expertName];
            }
            $rows[] = ['label' => $t->Email_Row_DateTime(), 'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)];
            $rows = [...$rows, ...static::groupLessonRow($maxUsers)];
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
        private static function buildBookingCancelled(int $recipientId, int $startAt, int $durationMin, string $cancelledBy, string $reason = '', int $maxUsers = 1): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_BookingCancelled_Subject(FwAppSettings::brandName()),
                'body' => static::renderEmail(
                    $t->Email_BookingCancelled_Title(),
                    [
                        ['label' => $t->Email_Row_DateTime(),  'value' => static::formatSlotInfo($recipientId, $startAt, $durationMin)],
                        ...static::groupLessonRow($maxUsers),
                        ['label' => $t->Email_Row_CancelledBy(), 'value' => $cancelledBy],
                        // Причина у нас теперь есть — и на карточке брони, и в
                        // чате она показывается. В письме её не было: человек
                        // узнавал, что занятие сорвалось и кем, но не почему —
                        // а письмо он читает вне сайта и переспросить не может.
                        ...($reason !== ''
                            ? [['label' => $t->Email_Row_Reason(), 'value' => $reason]]
                            : []),
                    ],
                    [
                        'text' => $t->Email_Cta_FindAnotherSlot(),
                        'href' => static::absoluteUrl('/slots/'),
                    ],
                ),
            ];
        }

        /**
         * Две даты подряд без подписей читаются наугад — это уже ловили в ленте
         * событий (D-114). Поэтому «Было» и «Стало» названы явно, а не отданы
         * порядку строк. Ниже отдельной строкой сказано про деньги: человек,
         * которому перенесли занятие, первым делом думает именно о них.
         *
         * @return array{subject: string, body: string}
         */
        private static function buildBookingRescheduled(int $recipientId, int $oldStartAt, int $newStartAt, int $durationMin, string $movedBy, int $maxUsers = 1): array {
            $t = ForegroundI18n::getInstance();
            return [
                'subject' => $t->Email_BookingRescheduled_Subject(FwAppSettings::brandName()),
                'body' => static::renderEmail(
                    $t->Email_BookingRescheduled_Title(),
                    [
                        ['label' => $t->Email_Row_RescheduledFrom(), 'value' => static::formatSlotInfo($recipientId, $oldStartAt, $durationMin)],
                        ['label' => $t->Email_Row_RescheduledTo(),   'value' => static::formatSlotInfo($recipientId, $newStartAt, $durationMin)],
                        ...static::groupLessonRow($maxUsers),
                        ['label' => $t->Email_Row_RescheduledBy(), 'value' => $movedBy],
                        ['label' => '', 'value' => $t->Email_Reschedule_NoMoney()],
                    ],
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

        public static function bookingCreated(int $expertId, int $studentId, int $startAt, int $durationMin, int $maxUsers = 1): void {
            $email = static::getAccountEmail($expertId);
            if (!$email) {
                return;
            }
            if (!static::gate($expertId, self::CAT_BOOKINGS)) {
                return;
            }
            $studentName = static::getAccountName($studentId);
            $rendered = static::buildBookingCreated($expertId, $studentName, $startAt, $durationMin, $maxUsers);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        public static function bookingConfirmed(int $studentId, int $startAt, int $durationMin, int $expertId = 0, int $maxUsers = 1): void {
            $email = static::getAccountEmail($studentId);
            if (!$email) {
                return;
            }
            if (!static::gate($studentId, self::CAT_BOOKINGS)) {
                return;
            }
            $expertName = $expertId > 0 ? static::getAccountName($expertId) : '';
            $rendered = static::buildBookingConfirmed($studentId, $expertName, $startAt, $durationMin, $maxUsers);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        public static function bookingRejected(int $studentId, int $startAt, int $durationMin, int $expertId = 0, string $reason = '', int $maxUsers = 1): void {
            $email = static::getAccountEmail($studentId);
            if (!$email) {
                return;
            }
            if (!static::gate($studentId, self::CAT_BOOKINGS)) {
                return;
            }
            $expertName = $expertId > 0 ? static::getAccountName($expertId) : '';
            $rendered = static::buildBookingRejected($studentId, $expertName, $startAt, $durationMin, $reason, $maxUsers);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        /**
         * Напоминание о занятии ученику.
         *
         * Сознательно мимо gate(): тот подавляет письма по частоте на аккаунт
         * и категорию, а напоминание привязано к моменту. Подавленное
         * «занятие через два часа» приходит уже после занятия — то есть
         * никогда, и человек не приходит на урок из-за настройки частоты
         * писем, которую он выставлял совсем для другого.
         *
         * Полное отключение уведомлений о бронях («off») уважается: это уже не
         * частота, а явный отказ получать письма этой категории.
         */
        public static function bookingReminder(int $studentId, int $startAt, int $durationMin, int $expertId, string $lead): void {
            $email = static::getAccountEmail($studentId);

            if (!$email || static::frequencyFor($studentId, self::CAT_BOOKINGS) === 'off') {
                return;
            }
            $rendered = static::buildReminder(
                $studentId,
                $lead,
                static::getAccountName($expertId),
                $startAt,
                $durationMin,
                ForegroundI18n::getInstance()->Email_Reminder_Body_Student(),
                '/bookings/',
            );
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        /**
         * Напоминание о занятии преподавателю — одно на слот, а не на бронь:
         * записавшихся может быть несколько, а занятие у него одно.
         */
        public static function slotReminder(int $expertId, int $startAt, int $durationMin, string $lead, string $students): void {
            $email = static::getAccountEmail($expertId);

            if (!$email || static::frequencyFor($expertId, self::CAT_BOOKINGS) === 'off') {
                return;
            }
            $rendered = static::buildReminder(
                $expertId,
                $lead,
                '',
                $startAt,
                $durationMin,
                ForegroundI18n::getInstance()->Email_Reminder_Body_Expert(),
                '/teaching/slots',
                $students,
            );
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        public static function bookingCancelled(int $recipientId, int $startAt, int $durationMin, string $cancelledBy, string $reason = '', int $maxUsers = 1): void {
            $email = static::getAccountEmail($recipientId);
            if (!$email) {
                return;
            }
            if (!static::gate($recipientId, self::CAT_BOOKINGS)) {
                return;
            }
            $rendered = static::buildBookingCancelled($recipientId, $startAt, $durationMin, $cancelledBy, $reason, $maxUsers);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        /**
         * D-193: письмо о переносе. Получатель — та сторона, которая перенос НЕ
         * делала; инициатору сообщать о собственном действии незачем.
         */
        public static function bookingRescheduled(int $recipientId, int $oldStartAt, int $newStartAt, int $durationMin, string $movedBy, int $maxUsers = 1): void {
            $email = static::getAccountEmail($recipientId);
            if (!$email) {
                return;
            }
            if (!static::gate($recipientId, self::CAT_BOOKINGS)) {
                return;
            }
            $rendered = static::buildBookingRescheduled($recipientId, $oldStartAt, $newStartAt, $durationMin, $movedBy, $maxUsers);
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
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
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
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
            FwEmailQueueService::enqueueToMany($emails, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
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
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
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
            FwEmailQueueService::enqueueToMany($emails, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        public static function expertApproved(int $expertId): void {
            $email = static::getAccountEmail($expertId);
            if (!$email) {
                return;
            }
            $rendered = static::buildExpertApproved();
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
        }

        public static function expertRejected(int $expertId): void {
            $email = static::getAccountEmail($expertId);
            if (!$email) {
                return;
            }
            $rendered = static::buildExpertRejected();
            FwEmailQueueService::enqueue($email, $rendered['subject'], $rendered['body'], self::MAX_SEND_ATTEMPTS);
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
                static::TYPE_BOOKING_REMINDER_1D => static::buildReminder($recipientId, '1d', $stubExpert, $startAt, $durationMin, $t->Email_Reminder_Body_Student(), '/bookings/'),
                static::TYPE_BOOKING_REMINDER_2H => static::buildReminder($recipientId, '2h', $stubExpert, $startAt, $durationMin, $t->Email_Reminder_Body_Student(), '/bookings/'),
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
                static::TYPE_BOOKING_REMINDER_1D,
                static::TYPE_BOOKING_REMINDER_2H,
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
