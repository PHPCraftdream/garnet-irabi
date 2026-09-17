<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\Booking {
    /**
     * Публичное имя места встречи для онлайн-занятия.
     *
     * У слота одно поле `location`, и оно значит разное: у очного занятия это
     * адрес, у онлайнового — ссылка на встречу. Адрес показывать можно и нужно,
     * ссылку — нельзя: она пускает в комнату кого угодно, кто её увидел.
     *
     * Из-за этого до сих пор человек, выбирающий занятие, про онлайн не узнавал
     * ничего, кроме самого слова «Онлайн» (D-052: ученица спросила преподавателя
     * в личке, будет ли видеосвязь прямо на сайте, — уже после оплаты).
     *
     * Граница проходит между способом связи и доступом к ней. «Zoom» —
     * это способ: он ничего не открывает и отвечает ровно на тот вопрос,
     * который человек задаёт перед оплатой. Сама ссылка остаётся закрытой до
     * подтверждения брони.
     */
    class MeetingPlatform {
        /**
         * Хосты, у которых есть общеизвестное имя. Всё остальное показывается
         * собственным хостом — это честнее выдуманного «Другая платформа» и
         * человеку так же понятно: `webinar.example.com` говорит достаточно.
         *
         * @var array<string, string>
         */
        private const KNOWN = [
            'zoom.us' => 'Zoom',
            'meet.google.com' => 'Google Meet',
            'teams.microsoft.com' => 'Microsoft Teams',
            'teams.live.com' => 'Microsoft Teams',
            'telemost.yandex.ru' => 'Яндекс Телемост',
            'telemost.360.yandex.ru' => 'Яндекс Телемост',
            't.me' => 'Telegram',
            'telegram.me' => 'Telegram',
            'discord.gg' => 'Discord',
            'discord.com' => 'Discord',
            'meet.jit.si' => 'Jitsi Meet',
            'whereby.com' => 'Whereby',
            'join.skype.com' => 'Skype',
            'skype.com' => 'Skype',
            'vk.com' => 'VK Звонки',
            'vkvideo.ru' => 'VK Звонки',
        ];

        /** Длиннее этого на карточку не влезает и смысла не добавляет. */
        private const MAX_LEN = 40;

        /**
         * @param string|null $location значение поля `location` онлайн-слота
         * @return string имя платформы или пустая строка, если сказать нечего
         */
        public static function publicName(?string $location): string {
            $raw = trim((string)$location);

            if ($raw === '') {
                return '';
            }

            $host = self::host($raw);

            // Не ссылка — значит преподаватель написал название словами
            // («Zoom», «созвонимся в телеграме»). Это и есть ответ на вопрос,
            // показываем как написано.
            if ($host === null) {
                return self::clip($raw);
            }

            if (isset(self::KNOWN[$host])) {
                return self::KNOWN[$host];
            }

            // Поддомен известной площадки: `company.zoom.us` — это Zoom.
            foreach (self::KNOWN as $knownHost => $name) {
                if (str_ends_with($host, '.' . $knownHost)) {
                    return $name;
                }
            }

            return self::clip($host);
        }

        /**
         * Хост ссылки без `www.`, либо null, если это не ссылка.
         */
        private static function host(string $raw): ?string {
            $candidate = preg_match('~^[a-z][a-z0-9+.-]*://~i', $raw) === 1 ? $raw : 'https://' . $raw;
            $host = parse_url($candidate, PHP_URL_HOST);

            if (!is_string($host) || $host === '') {
                return null;
            }

            $host = strtolower($host);

            // `parse_url` разбирает и «Zoom» как хост, поэтому требуем точку:
            // без неё это не адрес, а слово.
            if (!str_contains($host, '.')) {
                return null;
            }

            return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
        }

        private static function clip(string $value): string {
            return mb_strlen($value) > self::MAX_LEN
                ? mb_substr($value, 0, self::MAX_LEN - 1) . '…'
                : $value;
        }
    }
}
