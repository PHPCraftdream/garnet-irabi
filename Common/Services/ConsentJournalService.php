<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use InvalidArgumentException;
use PHPCraftdream\IRabi\Common\Tables\Consents;

    /**
     * Writes a row to the consent audit trail (table `consents`).
     *
     * One call = one immutable record of a consent event. Repeat grants are
     * EXPECTED to produce separate rows (the legal finding F-04 explicitly
     * wants the history of repeated consents, not just the first one), so
     * there is no deduplication or upsert here — a plain INSERT every time.
     *
     * Safe to call from the auth path: IrabiAuthMiddleware wraps every call
     * in try/catch(Throwable) so a transient DB failure logs but never
     * blocks the login itself.
     */
    class ConsentJournalService {
        /** Consent to processing of personal data (mandatory for auth). */
        public const TYPE_PERSONAL_DATA = 'personal_data';

        /** Consent to marketing communications (optional, withdrawable). */
        public const TYPE_MARKETING = 'marketing';

        /** Consent was granted. */
        public const ACTION_GIVEN = 'given';

        /** Consent was withdrawn (used by the upcoming withdrawal flow, task #72). */
        public const ACTION_WITHDRAWN = 'withdrawn';

        /**
         * All consent_type values accepted by record().
         *
         * @var string[]
         */
        public const ALLOWED_TYPES = [
            self::TYPE_PERSONAL_DATA,
            self::TYPE_MARKETING,
        ];

        /**
         * All action values accepted by record().
         *
         * @var string[]
         */
        public const ALLOWED_ACTIONS = [
            self::ACTION_GIVEN,
            self::ACTION_WITHDRAWN,
        ];

        /**
         * Version of the Privacy Policy / PD-consent text the user agreed
         * to. This is the single source of truth — there is no document
         * versioning system in the project, so the version is pinned here.
         *
         * BUMP THIS MANUALLY whenever the consent text the user sees is
         * changed in a legally significant way (e.g. new processing purpose,
         * changed data categories). The audit row then proves WHICH revision
         * a given consent was given against — essential for a РКН check or
         * a dispute about an older wording.
         */
        public const DOCUMENT_VERSION = '1.0';

        /**
         * Append one consent event to the audit trail.
         *
         * @param int    $accountId   Account the consent belongs to.
         * @param string $consentType One of the ALLOWED_TYPES constants.
         * @param string $action      One of the ALLOWED_ACTIONS constants.
         * @param string $ip          Client IP (IPv4 or IPv6), '' if unknown.
         * @param string $userAgent   Client User-Agent, '' if unknown.
         * @return void
         * @throws InvalidArgumentException When $consentType or $action is not
         *     one of the allowed constants — a programming error in the caller,
         *     not a user-facing condition.
         */
        public static function record(
            int $accountId,
            string $consentType,
            string $action,
            string $ip,
            string $userAgent,
        ): void {
            if (!in_array($consentType, self::ALLOWED_TYPES, true)) {
                throw new InvalidArgumentException(
                    'Unknown consent_type: ' . $consentType,
                );
            }

            if (!in_array($action, self::ALLOWED_ACTIONS, true)) {
                throw new InvalidArgumentException(
                    'Unknown consent action: ' . $action,
                );
            }

            Consents::get()->insert([
                'account_id' => $accountId,
                'consent_type' => $consentType,
                'action' => $action,
                'document_version' => self::DOCUMENT_VERSION,
                'ip' => $ip,
                'user_agent' => $userAgent,
                'created_at' => time(),
            ]);
        }
    }
}
