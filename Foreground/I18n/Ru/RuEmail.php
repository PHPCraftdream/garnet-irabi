<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\Ru {
    /**
     * Подписи: Email.
     *
     * Часть разложенного файла данных (был один на 1358 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class RuEmail {
        public static array $data = [
            // Email notifications
            'Email_BookingCreated_Subject' => 'Новая бронь на %s',
            'Email_BookingCreated_Title' => 'У вас новая бронь',
            // Тоже без глагола: «записался» так же имеет род, как и «забронировал».
            'Email_BookingCreated_Body' => 'Новая бронь на ваше занятие. Ученик: %s.',
            'Email_BookingConfirmed_Subject' => 'Бронь подтверждена на %s',
            'Email_BookingConfirmed_Title' => 'Ваша бронь подтверждена',
            'Email_BookingConfirmed_Body' => 'Ваша бронь подтверждена экспертом.',
            'Email_BookingRejected_Subject' => 'Бронь отклонена на %s',
            'Email_BookingRejected_Title' => 'Бронь отклонена',
            'Email_BookingRejected_Body' => 'К сожалению, ваша бронь отклонена экспертом.',
            // D-265: у этого письма отдельный текст, а не переиспользование
            // Email_BookingRejected_* с причиной — «отклонена» читается как
            // активный отказ эксперта, а тут эксперт просто не успел
            // ответить до начала занятия. Разные основания для дальнейших
            // действий ученика, значит разная формулировка.
            'Email_BookingMissedResponse_Subject' => 'Истёк срок ответа на бронь — %s',
            'Email_BookingMissedResponse_Title' => 'Истёк срок ответа на бронь',
            'Email_BookingMissedResponse_Body' => 'Эксперт не успел подтвердить бронь до начала занятия. Бронь автоматически отменена, деньги возвращены.',
            'Email_BookingCancelled_Subject' => 'Бронь отменена на %s',
            'Email_BookingCancelled_Title' => 'Бронь отменена',
            'Email_BookingCancelled_Body' => 'Бронь отменена (%s).',
            // D-193. В письме о переносе две даты подряд, и без подписей их
            // путают местами — это уже разбирали на ленте событий (D-114).
            'Email_BookingRescheduled_Subject' => 'Занятие перенесено — %s',
            'Email_BookingRescheduled_Title' => 'Занятие перенесено',
            'Email_Row_RescheduledFrom' => 'Было',
            'Email_Row_RescheduledTo' => 'Стало',
            'Email_Row_RescheduledBy' => 'Кто перенёс',
            'Email_Reschedule_NoMoney' => 'Деньги остались на этом же занятии: ни доплаты, ни возврата, неустойка не удерживалась.',
            // Напоминания о занятии. Тема называет, за сколько до начала
            // письмо пришло: у человека в ящике их два, и по теме должно быть
            // видно, суточное это или «уже скоро».
            'Email_Reminder_Subject_1d' => 'Завтра занятие — %s',
            'Email_Reminder_Subject_2h' => 'Занятие через два часа — %s',
            'Email_Reminder_Title_1d' => 'Напоминаем: занятие завтра',
            'Email_Reminder_Title_2h' => 'Напоминаем: занятие через два часа',
            'Email_Reminder_Body_Student' => 'Не забудьте о занятии. Если планы изменились, отмените бронь заранее — так преподаватель успеет предложить время другому.',
            'Email_Reminder_Body_Expert' => 'Напоминаем о вашем занятии. Записавшиеся ждут вас в назначенное время.',
            'Email_Row_Students' => 'Записались',
            'Email_Cta_OpenSlot' => 'Открыть занятие',

            'Email_NewMessage_Subject' => 'Новое сообщение от %s',
            'Email_NewMessage_Title' => 'Новое сообщение от %s',
            'Email_NewMessage_Title_Plain' => 'Новое сообщение',
            'Email_NewMessage_Body' => 'Вам пришло новое личное сообщение.',
            'Email_SupportNewTicket_Subject' => 'Новое обращение #%d',
            'Email_SupportNewTicket_Title' => 'Новый тикет поддержки',
            'Email_SupportNewTicket_Body' => 'Пользователь %s создал обращение: %s',
            'Email_SupportReply_Subject' => 'Ответ на обращение #%d',
            'Email_SupportReply_Title' => 'Ответ службы поддержки',
            'Email_SupportReply_Body' => 'Получен ответ по обращению: %s',
            'Email_SupportUserReply_Subject' => 'Ответ в обращении #%d',
            'Email_SupportUserReply_Title' => 'Ответ пользователя в тикете',
            'Email_SupportUserReply_Body' => 'Пользователь %s ответил в обращении: %s',
            'Email_ExpertApproved_Subject' => 'Ваш профиль эксперта одобрен',
            'Email_ExpertApproved_Title' => 'Поздравляем — ваш профиль одобрен',
            'Email_ExpertApproved_Body' => 'Теперь ваши слоты будут видны пользователям и доступны для бронирования.',
            'Email_ExpertRejected_Subject' => 'Ваш профиль эксперта отозван',
            'Email_ExpertRejected_Title' => 'Доступ к публикации слотов приостановлен',
            'Email_ExpertRejected_Body' => 'Ваши слоты больше не отображаются пользователям. Свяжитесь с поддержкой для уточнения причин.',
            'Email_Cta_OpenExpertPanel' => 'Перейти в кабинет эксперта',
            'Email_Cta_ContactSupport' => 'Связаться с поддержкой',

            // Email row labels
            'Email_Row_User' => 'Пользователь',
            'Email_Row_Expert' => 'Эксперт',
            'Email_Row_DateTime' => 'Дата и время',
            'Email_Row_Duration' => 'Длительность',
            'Email_Row_Reason' => 'Причина',
            // D-139: письма не говорили, что занятие групповое — для
            // преподавателя «часть отменилась» и «всё отменилось» выглядели
            // одинаково, если он читал письмо об одной из нескольких записей.
            'Email_Row_GroupLesson' => 'Формат занятия',
            'Email_GroupLesson_Value' => 'Групповое, мест: %s',
            'Email_Row_CancelledBy' => 'Кто отменил',
            'Email_Row_From' => 'От',
            'Email_Row_Message' => 'Сообщение',
            'Email_Row_Subject' => 'Тема',
            'Email_Row_TicketId' => 'ID тикета',
            'Email_Row_Timezone' => 'Время указано в часовом поясе',

            // Email CTA buttons
            'Email_Cta_OpenBooking' => 'Открыть бронь',
            'Email_Cta_FindAnotherSlot' => 'Найти другой слот',
            'Email_Cta_OpenChat' => 'Открыть чат',
            'Email_Cta_OpenTicket' => 'Открыть тикет',

            // Email footer / friendly closing
            'Email_Footer_Note' => 'Это автоматическое уведомление, отвечать на него не нужно.',
            'Email_Footer_Contact' => 'По всем вопросам пишите:',

            // Stub data for the test-send dropdown
            'Email_Stub_ExpertName' => 'Тестовый эксперт',
            'Email_Stub_UserName' => 'Тестовый пользователь',
            'Email_Stub_Reason' => 'Тестовая причина (демонстрация шаблона)',
            'Email_Stub_MessagePreview' => 'Это тестовое сообщение для проверки шаблона.',
            'Email_Stub_TicketSubject' => 'Тестовый тикет',
            'Email_Stub_CancelledBy' => 'Тестовый эксперт',
        ];
    }
}
