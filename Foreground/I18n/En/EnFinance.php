<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\En {
    /**
     * Подписи: Finance.
     *
     * Часть разложенного файла данных (был один на 1251 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class EnFinance {
        public static array $data = [
            'RequestLog_Date' => 'Date',
            'RequestLog_NoData' => 'No records',
            'RequestLog_Method' => 'Method',
            'RequestLog_Uri' => 'URI',
            'RequestLog_Status' => 'Status',
            'RequestLog_Duration' => 'Duration, ms',
            'RequestLog_Account' => 'Account',
            'RequestLog_Ip' => 'IP',
            'RequestLog_Time' => 'Time',
            'RequestLog_Ua' => 'User-Agent',
            'Ledger_External' => 'External',
            'Ledger_System' => 'System',

            'Ledger_Type_TopUp' => 'Top up',
            'Ledger_Type_Invoice' => 'Invoice',
            'Ledger_Type_Payment' => 'Payment',
            'Ledger_Type_Refund' => 'Refund',
            'Ledger_Note_AutoCancel' => 'Auto-cancelled: the session started without confirmation',
            'Ledger_Note_Penalty' => '%s withheld — %s%% penalty',
            'Ledger_Note_ExpertKeepsPenalty' => 'these %s ₽ went back to the student out of the %s ₽ paid; the %s ₽ (%s%%) penalty stays with you as compensation for the cancelled lesson',
            'Ledger_Type_Manual' => 'Manual',

            'Balance_Title' => 'My Balance',
            'Balance_TopUp' => 'Top Up',
            'Balance_Amount' => 'Balance',
            'Balance_History' => 'Transaction History',
            'Balance_NoHistory' => 'No transactions yet',
            'Balance_TopUpAmount' => 'Amount',
            'Balance_TopUpPlaceholder' => 'Enter amount',
            'Balance_TopUpNotice' => 'Card payment is not connected yet: the amount is credited to your balance immediately, with nothing charged to a card.',
            'Balance_TopUpSuccess' => 'Balance topped up',
            'Balance_LedgerNote_TopUp' => 'Balance top-up',
            'Balance_LedgerReason_Lesson' => 'Lesson with %s',
            'Balance_Current' => 'Balance',

            // Ledger ref data
            'Ledger_RefBooking' => 'Booking',

            // Invite tokens
            'Invite_FirstStep_Title' => 'First login',
            'Invite_Error_Title' => 'Registration unavailable',
            'Invite_Error_Unknown' => 'Registration link not found or invalid.',
            'Invite_Error_Expired' => 'This registration link has expired.',
            'Invite_Error_Exhausted' => 'Registration limit for this link has been reached.',
            'Invite_Error_Disabled' => 'This registration link has been deactivated.',
            'Invite_Error_ContactSupport' => 'Contact us for a new link:',
            'Invite_Contact_Phone' => 'Phone',
        ];
    }
}
