<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\Ru {
    /**
     * Подписи: Booking.
     *
     * Часть разложенного файла данных (был один на 1358 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class RuBooking {
        public static array $data = [
            'Bookings_Title' => 'Мои брони',
            'Booking_PlatformUnset' => 'Площадка не указана',
            'Booking_CancelledByYou' => 'Вы отменили эту бронь',
            // Неподтверждённую заявку не отменяют, а снимают (ученик) или
            // отклоняют (преподаватель). Вход и выход должны говорить одним
            // словом — D-135.
            'Booking_WithdrawnByYou' => 'Вы сняли эту заявку',
            'Booking_WithdrawnByStudent' => 'Ученик снял заявку',
            'Booking_CancelledLessonByExpert' => 'Преподаватель отменил это занятие',
            'Booking_CancelledLessonByYouAsExpert' => 'Вы отменили это занятие',
            'Booking_CancelledByStudent' => 'Ученик отменил эту бронь',
            'Booking_CancelledByExpert' => 'Преподаватель отклонил эту бронь',
            'Booking_CancelledByYouAsExpert' => 'Вы отклонили эту бронь',
            'Booking_CancelledByModerator' => 'Бронь отменена администрацией',
            'Booking_CancelledBySystem' => 'Снято автоматически: занятие началось, а преподаватель так и не подтвердил бронь',
            'Booking_CancelReason' => 'Причина',

            'Batch_Title' => 'Пакетное создание слотов',
            'Batch_StartDate' => 'Дата начала',
            'Batch_EndDate' => 'Дата окончания',
            'Batch_Count' => 'Количество слотов',
            'Batch_PerWeek' => 'Уроков в неделю',
            'Batch_Preview' => 'Предпросмотр',
            'Batch_CreateAll' => 'Создать все',
            'Batch_Available' => 'Доступен',
            'Batch_Restricted' => 'Недоступен',
            'Batch_Proposed' => 'Предложен',
            'Batch_ProposedDates' => 'Предложенные даты',
            'Batch_ConfirmCreate' => 'Создать слотов: ',
            'Batch_Created' => 'Создано слотов: ',
            'Batch_AvailableDays' => 'Доступно дней',
            'Batch_RestrictedDays' => 'Недоступно',
            'Batch_Cancel' => 'Отмена',
            'Batch_CreateBtn' => 'Пакетное создание',

            'Batch_Overlap' => 'Пересечение с имеющимся слотом',
            'Batch_ProposedOverlap' => 'Пересечение с другим предложенным слотом',
            'Batch_DateOutOfRange' => 'Дата за пределами выбранного диапазона',
            'Batch_PastDate' => 'Нельзя установить дату/время в прошлом',
            'Batch_HebrewDate' => 'Евр. дата',

            'Booking_NoBookings' => 'Нет входящих бронирований',
            'Booking_Slot' => 'Слот',
            'Booking_NA' => 'Н/Д',
            'Booking_Created' => 'Создано',
            'Booking_UserNoBookings' => 'Бронирований пока нет',

            'Booking_Status_Pending' => 'Ждёт подтверждения',
            'Booking_Status_Confirmed' => 'Подтверждено',
            'Booking_Status_Cancelled' => 'Отменён',
            'Booking_Status_Withdrawn' => 'Снят',
            'Booking_Status_Declined' => 'Отклонён',
            'Booking_Status_Missed' => 'Истёк срок ответа',
            'Booking_Status_Completed' => 'Завершён',
            'Booking_Cancel' => 'Отменить',

            'Bookings_FilterAll' => 'Все',
            'Bookings_FilterPending' => 'Ожидают',
            'Bookings_FilterConfirmed' => 'Подтверждены',
            'Bookings_FilterCancelled' => 'Отменены',
            'Bookings_FilterCompleted' => 'Завершены',
            'Bookings_ShowPast' => 'Показать прошедшие',
            'Bookings_HidePast' => 'Скрыть прошедшие',

            'Booking_Chat_Confirmed' => 'Ваша бронь на %s подтверждена.',
            'Booking_Chat_Declined' => 'Ваша бронь на %s отклонена.',
            'Booking_Chat_Cancelled' => 'Ваша бронь на %s отменена.',
            'Booking_Chat_LocationChanged' => 'Место встречи для занятия %s изменилось — прежняя ссылка или адрес, которые вы получали раньше в переписке, больше не действительны. Актуальное место — в карточке брони.',
            'Booking_Chat_Rescheduled' => 'Занятие перенесено: было %s, стало %s.',
            // D-195. Действие исчезает по времени, а не по статусу, и молчать
            // об этом нельзя: пропавшая без объяснения кнопка читается как
            // поломка (тот же урок, что D-169).
            'Booking_CannotCancelStarted' => 'Занятие началось — отменить бронь уже нельзя. Если оно не состоялось, напишите в поддержку.',
            'Booking_Confirm' => 'Подтвердить',
            'Booking_CancelConfirm' => 'Вы уверены, что хотите отменить бронирование?',
            'Booking_UserName' => 'Пользователь',

            // Booking modal
            'Booking_OtherSlots' => 'Другие слоты эксперта',
            'Booking_Total' => 'Итого',
            'Booking_Balance' => 'Баланс',
            'Booking_Items' => 'шт.',

            // Expert cancellations
            'Cancel_BookedSlot' => 'Отменить бронь',
            'Cancel_BookedSlotTitle' => 'Отмена забронированного слота',
            'Cancel_ReasonLabel' => 'Причина отмены',
            'Cancel_ReasonPlaceholder' => 'Укажите причину отмены...',
            'Cancel_ReasonRequired' => 'Укажите причину отмены',
            'Cancel_Submit' => 'Отменить бронь',
            'Cancel_Success' => 'Бронь отменена, средства возвращены пользователю',
            // D-193. Перенос — не отмена: цена действия ноль, и это первое,
            // что должно быть написано, потому что спрашивают именно об этом.
            'Reschedule_Action' => 'Перенести',
            'Reschedule_Title' => 'Перенести занятие',
            'Reschedule_PickSlot' => 'Выберите новое время',
            'Reschedule_Free' => 'Перенос бесплатный: деньги остаются на этом же занятии, неустойка не удерживается.',
            'Reschedule_NeedsReconfirm' => 'После переноса занятие снова будет ждать подтверждения преподавателя. Если он не ответит до начала, бронь снимется, а деньги вернутся полностью.',
            'Reschedule_NoSlots' => 'У преподавателя нет другого свободного времени той же стоимости.',
            'Reschedule_Submit' => 'Перенести занятие',
            'Reschedule_Success' => 'Занятие перенесено',
            'Reschedule_Err_NotFound' => 'Бронь не найдена',
            'Reschedule_Err_Access' => 'Перенести это занятие могут только его ученик и преподаватель',
            'Reschedule_Err_Status' => 'Эту бронь уже нельзя перенести: она отменена или занятие завершено',
            'Reschedule_Err_SourceStarted' => 'Занятие уже началось — перенести его нельзя, только отменить',
            'Reschedule_Err_TargetMissing' => 'Выбранное время больше не доступно',
            'Reschedule_Err_TargetPast' => 'Это время уже прошло',
            'Reschedule_Err_TargetOtherExpert' => 'Перенести можно только на другое время того же преподавателя',
            'Reschedule_Err_TargetOtherCost' => 'Перенести можно только на занятие той же стоимости — иначе пришлось бы доплачивать или возвращать разницу, а перенос обещан бесплатным',
            'Reschedule_Err_TargetSame' => 'Это то же самое время',
            'Reschedule_Err_TargetFull' => 'Место только что заняли — выберите другое время. Ваша бронь осталась на прежнем месте',
            'Reschedule_Err_AlreadyBooked' => 'Вы уже записаны на это время',
            'Reschedule_Err_Raced' => 'Бронь изменилась, пока вы выбирали время — откройте её заново',
            'Cancellations_DateFrom' => 'С даты',
            'Cancellations_DateTo' => 'По дату',
            'Cancellations_Search' => 'Поиск по причине',
            'Cancellations_Empty' => 'Отмен не найдено',
            'Cancellations_ColumnDate' => 'Дата отмены',
            'Cancellations_ColumnReason' => 'Причина',
            'Cancellations_ColumnExpert' => 'Эксперт',
            'Cancellations_ColumnUser' => 'Пользователь',
            'Cancellations_ColumnSlot' => 'Слот',
            'Cancellations_ColumnBooking' => 'Бронь',
            'Cancellations_ResetFilters' => 'Сбросить фильтры',
            // Цену действия человек узнавал только открыв окно. Короткая
            // подпись рядом с кнопкой отвечает на вопрос «чего мне это
            // будет стоить» до нажатия, а не после.
            'Booking_CostHint_Withdraw' => 'Деньги вернутся полностью, счётчик ваших снятий вырастет',
            'Booking_CostHint_CancelFree' => 'Деньги вернутся полностью, счётчик ваших отмен вырастет',
            'Booking_CostHint_CancelPenalty' => 'У эксперта останется %s ₽ (%s%%), счётчик ваших отмен вырастет',
            // Условия отмены меняются вместе со статусом, а до сих пор человек
            // узнавал их по частям в разное время: удержание — в окне перед
            // бронированием, полный возврат — на карточке уже созданной
            // заявки, автоснятие — вообще нигде. Собираем всё туда, где
            // решение принимается (чейндж-реквест user-5).
            'Booking_CancelTerms_AfterConfirm' => 'После подтверждения отмена будет стоить %s%% — %s ₽ останется у эксперта',
            'Booking_CancelTerms_Unanswered' => 'Если преподаватель откажет или не подтвердит до начала занятия, деньги вернутся полностью',
            'Booking_CostHint_Decline' => 'Ученику вернутся деньги полностью, счётчик ваших отклонений вырастет',
            'Booking_CostHint_CancelLesson' => 'Ученику вернутся деньги, счётчик ваших отмен вырастет',

            // Booking UX
            'Booking_RefundInfo' => 'После отмены на ваш баланс будет возвращено',
            'Booking_MessageExpert' => 'Написать эксперту',
            'Booking_MessageUser' => 'Написать пользователю',
            'Booking_Reject' => 'Отклонить',
            'Booking_User' => 'Пользователь',
            'Bookings_IncomingTitle' => 'Входящие брони',
            'Booking_RejectReasonLabel' => 'Причина отказа',
            'Booking_RejectReasonPlaceholder' => 'Объясните ученику, почему не получится...',
            'Booking_RejectReasonRequired' => 'Укажите причину',
            'Booking_RejectTitle' => 'Отказ по неподтверждённой заявке',
            'Booking_RejectSuccess' => 'Заявка отклонена',
            // Отказ по заявке и отмена уже подтверждённого занятия стоят
            // преподавателю разного: первое ничего, второе портит счётчик
            // отмен и ломает человеку планы. Слово «Отклонить» стояло на обеих
            // кнопках, и разницу продукт называл только внутри окна (нашёл
            // expert-2).
            'Booking_DeclineCard' => 'Отклонить заявку',
            'Booking_CancelLessonCard' => 'Отменить занятие',
            'Booking_CancelLessonTitle' => 'Отмена подтверждённого занятия',
            'Booking_CancelLessonReasonLabel' => 'Причина отмены',
            'Booking_CancelLessonReasonPlaceholder' => 'Объясните ученику, почему занятие не состоится...',
            'Booking_CancelLessonSubmit' => 'Отменить занятие',
            'Booking_CancelLessonSuccess' => 'Занятие отменено, ученику возвращены деньги',
            'Booking_ConfirmSuccess' => 'Бронь подтверждена',
            'Booking_GroupCount' => 'броней: %d',
            'Booking_PenaltyWarning' => 'При отмене подтверждённой брони эксперт удержит %d%% (%d ₽)',
            'Booking_PenaltyKeptByExpert' => 'Неустойка (%d%%): %d ₽ останется у эксперта',
            'Booking_RefundAmount' => 'Возврат: %d ₽',
            'Booking_DeclineImpact' => 'Это отклонение неподтверждённой брони: ученику вернутся деньги полностью, а счётчик ваших отклонений вырастет.',
            'Booking_CancelLessonImpact' => 'Это отмена подтверждённой брони: ученику вернутся деньги, а счётчик ваших отмен вырастет.',
            'Booking_CancelImpact' => 'Это отмена подтверждённой брони — она увеличит счётчик ваших отмен.',
            'Booking_WithdrawImpact' => 'Это снятие неподтверждённой брони: деньги вернутся вам полностью, а счётчик ваших снятий вырастет.',

            // Booking form
            'Booking_Submitting' => 'Бронирование...',
            'Booking_InsufficientBalance' => 'Недостаточно средств на балансе.',
        ];
    }
}
