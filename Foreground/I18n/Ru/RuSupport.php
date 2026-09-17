<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\Ru {
    /**
     * Подписи: Support.
     *
     * Часть разложенного файла данных (был один на 1358 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class RuSupport {
        public static array $data = [
            'Comment_ModerationNotice' => 'Отзыв публикуется без вашего имени, и до публикации его читает модератор. Имени не видит никто: ни другие читатели, ни преподаватель, о котором вы пишете, ни сам модератор — он решает по тексту. Единственное исключение: если модератор сочтёт отзыв опасным, имя увидит владелец платформы, чтобы разобраться. Отзыв появится на странице после одобрения.',
            'Comment_SentForReview' => 'Отзыв отправлен на проверку. Он появится на странице после одобрения модератором — до тех пор его видите только вы.',
            'Comment_StatusPending' => 'На проверке',
            // D-191: у автора без этой подписи одобренный отзыв выглядел
            // ровно как ожидающий — Марк Тальми решил, что его отзывы
            // неделю не проверяют, хотя все три давно опубликованы.
            'Comment_StatusApproved' => 'Опубликован',
            'Comment_StatusRejected' => 'Отклонён модератором',
            'Comment_StatusMine' => 'Ваш отзыв',
            'Comment_Moderation' => 'Проверка',
            'Comment_Approve' => 'Одобрить',
            'Comment_Reject' => 'Отклонить',
            'Comment_ApproveConfirm' => 'Одобрить отзыв? После этого он появится на странице преподавателя — анонимно, без имени автора.',
            'Comment_RejectConfirm' => 'Отклонить отзыв? Читатели его не увидят. Автору будет видно, что отзыв отклонён.',
            'Comment_Flag' => 'Пометить как опасный',
            'Comment_StatusFlagged' => 'Помечен как опасный',
            // D-119: без этой строки модератор видит непроверенные и
            // отклонённые отзывы на публичной странице так же, как видел бы
            // любой посетитель, и решает, что чужое скрытое ему протекает.
            'Comment_ModeratorViewNotice' => 'Вы модератор: здесь видны все отзывы, включая непроверенные и отклонённые — обычные посетители видят только одобренные.',
            'Comment_FlagConfirm' => 'Пометить отзыв как опасный? Он не будет опубликован, а владелец платформы увидит имя автора, чтобы разобраться. Это единственный случай, когда анонимность снимается, — не помечайте отзыв просто потому, что он резкий.',
            'Comment_AuthorHidden' => 'Аноним',
            'Comment_AuthorHiddenHint' => 'Имя автора скрыто: отзывы модерируются вслепую. Оно раскрывается владельцу, только если отзыв помечен как опасный.',
            'Support_Title' => 'Центр поддержки',
            'Support_NewTicket' => 'Новое обращение',
            'Support_Subject' => 'Тема',
            'Support_Message' => 'Сообщение',
            'Support_Send' => 'Отправить',
            'Support_Reply' => 'Ответить',
            'Support_NoTickets' => 'Обращений пока нет',
            'Support_ClientContextTitle' => 'Занятия и деньги клиента',
            'Support_ClientContextEmpty' => 'У клиента пока нет ни занятий, ни операций по балансу',
            'Support_NoMessages' => 'Сообщений пока нет',
            'Support_SelectTicket' => 'Выберите обращение из списка слева',
            'Support_InternalComment' => 'Внутренний комментарий',
            'Support_Assignee' => 'Ответственный',
            'Support_Unassigned' => 'Не назначен',
            'Support_TicketUpdatedWhileTyping' => 'Пока вы печатали, в тикете появился новый ответ — проверьте переписку выше, прежде чем отправлять свой.',
            'Support_StaleReplySent' => 'Коллега ответил в этом тикете почти в тот же момент — проверьте переписку выше, ваши ответы могли пересечься.',
            'Support_HasAttachments' => 'Вложений: %s',
            'Support_Assign' => 'Назначить',
            'Support_ChangeStatus' => 'Изменить статус',
            'Support_AssignmentHistory' => 'История назначений',
            'Support_Created' => 'Создано',
            'Support_Updated' => 'Обновлено',
            'Support_Waiting' => 'Ждёт',
            // D-201. Столбец пуст у подавляющего большинства строк — и именно
            // поэтому заметен там, где не пуст.
            //
            // Название говорит ровно то, что вычислено: внутренняя переписка
            // новее последнего ответа клиенту. Соблазн написать «ответ не
            // передан» велик, но это было бы неправдой в половине случаев:
            // на боевом тикете #19 внутреннее сообщение оказалось ВОПРОСОМ
            // модератора владельцу, а не готовым ответом. Отличить вопрос от
            // ответа по тексту нельзя, а столбец, который врёт через раз,
            // перестают читать. Действие в обоих случаях одно: открыть и
            // замкнуть круг.
            'Support_InternalNewer' => 'Внутри',
            'Support_InternalNewerValue' => 'новее ответа',
            'Support_User' => 'Пользователь',
            'Support_TicketCreated' => 'Обращение создано',
            'Support_TicketCreatedWithId' => 'Обращение #%s принято.',
            'Support_TicketEtaHint' => 'Обычно отвечаем в течение %s мин.',
            'Support_BackToList' => 'Назад к списку',
            'Support_ViewAll' => 'Все обращения',
            'Support_Widget_Title' => 'Поддержка',
            'Support_Status_Open' => 'Открыт',
            'Support_Status_Investigation' => 'Исследование',
            'Support_Status_InProgress' => 'В работе',
            'Support_Status_WaitingUser' => 'Ожидание ответа',
            'Support_Status_WaitingSupport' => 'Ожидание поддержки',
            'Support_Status_Escalated' => 'Эскалирован',
            'Support_Status_OnHold' => 'Приостановлен',
            'Support_Status_Deferred' => 'Отложен',
            'Support_Status_LowPriority' => 'Низкий приоритет',
            'Support_Status_Resolved' => 'Решён',
            'Support_Status_Rejected' => 'Отклонён',
            'Support_Screenshot' => 'Скриншот',
            'Support_Attachments' => 'Вложения',
            'Support_Context' => 'Контекст обращения',
            'Support_Context_URL' => 'Страница',
            'Support_Context_Browser' => 'Браузер',
            'Support_Context_Viewport' => 'Размер экрана',
            'Support_Context_JsErrors' => 'JS ошибки',
            'Support_Context_NetErrors' => 'Сетевые ошибки',
            'Support_Context_Breadcrumb' => 'Навигация',
            'Support_StatusChanged' => 'Статус изменён',
            // D-205: то же событие словами клиента, а не очереди поддержки.
            'Support_ClientStatus_InProgress' => 'Мы взяли обращение в работу',
            'Support_ClientStatus_Investigation' => 'Разбираемся в вашем обращении',
            'Support_ClientStatus_WaitingUser' => 'Мы ответили и ждём вашего ответа',
            'Support_ClientStatus_Resolved' => 'Обращение решено. Если вопрос остался — напишите здесь же',
            'Support_ClientStatus_Rejected' => 'Обращение закрыто без решения',

            // Отзывы. Слово одно на всё: вход назывался
            // «комментарием», а всё остальное на том же экране — «отзывом», и
            // преподаватель не узнал собственный блок на своей карточке.
            'Comment_Title' => 'Отзывы',
            'Comment_Write' => 'Написать отзыв',
            'Comment_Send' => 'Отправить',
            'Comment_Delete' => 'Удалить',
            'Comment_DeleteConfirm' => 'Удалить отзыв?',
            'Comment_NoComments' => 'Отзывов пока нет',
            'Comment_Author' => 'Автор',
            'Comment_Expert' => 'Эксперт',
            'Comment_Body' => 'Текст',
            'Comment_Status' => 'Статус',
            'Comment_StatusVisible' => 'Видим',
            'Comment_StatusHidden' => 'Скрыт',
            'Comment_Actions' => 'Действия',
            'Comment_Hide' => 'Скрыть',
            'Comment_Unhide' => 'Показать',
            'Comment_HideConfirm' => 'Скрыть комментарий?',
            'Comment_UnhideConfirm' => 'Показать комментарий?',
            'Comment_Filter_HiddenOnly' => 'Только скрытые',
            'Comment_Filter_Search' => 'Поиск по тексту',

            // IM (Personal Messages)
            'IM_Title' => 'Сообщения',
            'Support_Widget_ImBannerLabel' => 'Непрочитанные личные сообщения',
            'IM_NewMessage' => 'Новый диалог',
            'IM_WriteMessage' => 'Написать сообщение',
            'IM_Send' => 'Отправить',
            'IM_NoConversations' => 'Сообщений пока нет',
            'IM_NoMessages' => 'Выберите собеседника',
            'IM_Recipient' => 'Получатель',
            'IM_MessagePlaceholder' => 'Напишите сообщение...',
            'IM_Search' => 'Поиск',
            'IM_NoRecipients' => 'Получатели не найдены',
            // Префикс перед превью своего же последнего сообщения в списке
            // диалогов — иначе список не отличает "жду ответа" от "уже ответил(а)".
            'IM_YouPrefix' => 'Вы: ',

            // System messages
            'Support_AssignedTo' => 'Назначено',
            'Support_Unassigned_Action' => 'Снято назначение',

            // News feed
            'News_Title' => 'Новости',
            'News_Empty' => 'Нет новостей',
            'News_ShowArchived' => 'Показать архив',
            'News_HideArchived' => 'Скрыть архив',
            'News_MarkAllRead' => 'Прочитать все',
            'News_Archive' => 'В архив',
            'News_Unarchive' => 'Из архива',
            'News_ArchiveError' => 'Не удалось архивировать новость',
            'News_UnarchiveError' => 'Не удалось вернуть из архива',
            'News_SlotUnavailable' => 'Этот слот больше недоступен',
            'News_Unread' => 'новых',
            'News_Archived' => 'Архив',
            // D-143: глагол в прошедшем времени требует рода, а имя в ленте
            // рода не знает — «подтвердил(а)»/«отменил(а)» на видном месте
            // выглядели как незаполненный плейсхолдер. Без глагола: имя,
            // двоеточие, ссылка на предмет, безличное причастие.
            'News_NewSlot_Action' => ': ',
            'News_NewSlot_Link' => 'новый слот',
            'News_NewSlot_Suffix' => ' открыт',
            'News_SlotBooked_Action' => ' — новая бронь на ваш ',
            'News_SlotBooked_Link' => 'слот',
            'News_BookingConfirmed_Action' => ': ',
            'News_BookingConfirmed_Link' => 'занятие',
            'News_BookingConfirmed_Suffix' => ' подтверждено',
            'News_CommentApproved_Prefix' => 'Ваш отзыв о ',
            'News_CommentApproved_Suffix' => ' прошёл проверку — ',
            'News_CommentApproved_Link' => 'смотреть на странице',
            'News_BookingRejected_Action' => ': ',
            'News_BookingRejected_Link' => 'занятие',
            'News_BookingRejected_Suffix' => ' отклонено',
            // Отмена приходит с двух сторон и читается по-разному: ученику —
            // что занятие не состоится, преподавателю — что запись на его
            // слот снялась. Без этих строк в ленте лежало сырое
            // `booking_cancelled` (нашла expert-2).
            'News_BookingCancelled_Action' => ': ',
            'News_BookingCancelled_Link' => 'занятие',
            'News_BookingCancelled_Suffix' => ' отменено',
            'News_BookingCancelledByUser_Action' => ': бронь на ',
            'News_BookingCancelledByUser_Link' => 'слот',
            'News_BookingCancelledByUser_Suffix' => ' отменена',
            // D-193: перенос, как и отмена, асимметричен — переносит либо
            // ученик, либо преподаватель, и текст называет именно того, кто
            // это сделал (та же развилка по user_id/expert_id в payload).
            'News_BookingRescheduled_Action' => ': ',
            'News_BookingRescheduled_Link' => 'занятие',
            'News_BookingRescheduled_Suffix' => ' перенесено на другое время',
            'News_BookingRescheduledByUser_Action' => ': бронь на ',
            'News_BookingRescheduledByUser_Link' => 'слот',
            'News_BookingRescheduledByUser_Suffix' => ' перенесена на другое время',
            'News_SupportReply_Prefix' => 'Ответ от поддержки по тикету ',
            'News_NewMessage_Prefix' => 'Новое ',
            'News_NewMessage_Link' => 'сообщение',
            'News_NewMessage_From' => ' от ',
            'News_GroupSuffix' => '+ ещё %d',
            'News_ArchivedHint' => 'Убрано в архив. Вернуть можно через «Показать архив»',
            'News_LessonAt' => 'Занятие: %s',
            'News_HappenedAt' => 'Событие: %s',
        ];
    }
}
