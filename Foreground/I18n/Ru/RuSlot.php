<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\Ru {
    /**
     * Подписи: Slot.
     *
     * Часть разложенного файла данных (был один на 1358 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class RuSlot {
        public static array $data = [
            'Slots_Title' => 'Доступные слоты',
            'Teaching_Slots_Title' => 'Мои слоты',
            'Teaching_Bookings_Title' => 'Входящие брони',

            'Slot_Create' => 'Создать слот',
            'Slot_Date' => 'Дата',
            'Slot_Time' => 'Время',
            'Slot_Cost' => 'Стоимость',
            'Slot_PenaltyPercent' => '% неустойки при отмене',
            'Slot_PenaltyHelp' => 'Если пользователь отменит подтверждённую бронь — этот процент останется у эксперта',
            'Slot_Online' => 'Онлайн',
            'Slot_Location' => 'Место',
            'Slot_Platform' => 'Площадка',
            'Slot_LocationPlaceholderOnline' => 'Ссылка на встречу (Zoom/Meet/...)',
            'Slot_LocationPlaceholderOffline' => 'Адрес',
            'Slot_LocationHint' => 'Поле необязательное, но без него пользователь не получит ссылку или адрес',
            'Slot_Book' => 'Забронировать',
            'Slot_Status_Free' => 'Свободен',
            'Slot_Status_Booked' => 'Забронирован',
            'Slot_Status_Completed' => 'Завершен',
            'Slot_Status_Expired' => 'Не состоялось',
            'Slot_Status_Cancelled' => 'Отменен',

            'Expert_PendingApproval' => 'Ваш профиль на модерации. Слоты не видны пользователям и не попадают в новости, пока администратор не одобрит профиль. После одобрения новости появятся автоматически.',

            'Slot_Duration' => 'Длительность',
            'Slot_Duration_Min' => 'мин',

            'Slot_MySlots' => 'Мои слоты',
            'Slot_NoSlots' => 'Слоты ещё не созданы',
            'Slot_Status' => 'Статус',

            'Cal_Sun' => 'Вс',
            'Cal_Mon' => 'Пн',
            'Cal_Tue' => 'Вт',
            'Cal_Wed' => 'Ср',
            'Cal_Thu' => 'Чт',
            'Cal_Fri' => 'Пт',
            'Cal_Sat' => 'Сб',

            'Slot_Label' => 'Слот',

            'Slot_DateTime' => 'Дата и время',
            'Slot_Type' => 'Тип',
            'Slot_NoAvailable' => 'Нет доступных слотов',
            'Slot_Reset' => 'Сбросить',
            'Slot_BookSlot' => 'Бронирование слота',
            'Slot_AvailableSlots' => 'Доступные слоты',
            'Slot_Expert' => 'Эксперт',
            'Slot_About' => 'О себе',

            'Slot_MaxUsers' => 'Макс. пользователей',

            // merged from Common
            'cal_shabbat' => 'Шаббат',
            'cal_erev_shabbat' => 'Эрев Шаббат',
            'cal_yom_tov' => 'Йом Тов',
            'cal_yom_tov_named' => 'Йом Тов (%s)',
            'cal_erev_yom_tov' => 'Эрев Йом Тов',
            'cal_fast' => 'Пост',
            'cal_fast_named' => 'Пост (%s)',
            'cal_erev_fast' => 'Эрев поста',
            'cal_rosh_chodesh' => 'Рош Ходеш',
            'cal_erev_rosh_chodesh' => 'Эрев Рош Ходеш',

            'Slot_Edit' => 'Редактировать',
            'Slot_Cancel' => 'Отменить',
            'Slot_Delete' => 'Удалить',
            'Slot_Complete' => 'Завершить',
            'Slot_Save' => 'Сохранить',
            'Slot_EditTitle' => 'Редактирование слота',
            'Slot_CancelConfirm' => 'Вы уверены, что хотите отменить этот слот?',
            'Slot_DeleteConfirm' => 'Вы уверены, что хотите удалить этот слот?',
            'Study_UpcomingBookings' => 'Ближайшие бронирования',
            'Study_NoBookings' => 'Бронирований пока нет',
            'Study_TotalBookings' => 'Всего бронирований',
            'Study_CompletedBookings' => 'Завершено бронирований',
            'Study_ActiveBookings' => 'В процессе',

            // Slots Calendar
            'Teaching_Declines' => 'Отклонения',
            'Teaching_Cancellations' => 'Отмены',
            'Slots_Calendar' => 'Расписание',
            'Slots_PrevWeek' => 'Предыдущая',
            'Slots_NextWeek' => 'Следующая',
            'Slots_Today' => 'Сегодня',
            'Slots_Morning' => 'Утро',
            'Slots_Day' => 'День',
            'Slots_Evening' => 'Вечер',
            'Slots_AllExperts' => 'Все эксперты',
            'Slots_Individual' => 'Индивидуальные',
            'Slots_Group' => 'Групповые',
            'Slots_Online' => 'Онлайн',
            'Slots_Offline' => 'Очно',
            'Slots_PriceRange' => 'Цена',
            'Slots_NoSlots' => 'Нет занятий',

            'Slot_Format' => 'Формат',
            'Slot_Seats' => 'Мест',
            // D-149: общий каталог не отличал групповое занятие от
            // индивидуального ни на карточке, ни в фильтре.
            'Slot_GroupBadge' => 'Групповое, мест: %s',
            // D-186: остаток мест не показывался нигде — ни ученику в
            // каталоге, ни преподавателю в его списке, хотя именно по нему
            // обе стороны решают, записываться и держать ли слот.
            'Slot_SeatsLeft' => 'осталось мест: %s из %s',
            'Slot_SeatsTaken' => 'занято %s из %s',

            'Slot_Rescheduled' => 'Слот был перенесён. Обновляем страницу...',
            'Slot_PlaceUpdated' => 'Место встречи обновлено, записавшимся отправлено сообщение',
            'Slot_Saved' => 'Изменения сохранены',
            'Slot_ReschedulePastError' => 'Нельзя перенести слот на прошедшее время',
            'Slots_NoMatch' => 'Нет слотов, соответствующих фильтрам',
            'Slots_FilterAll' => 'Все',
            'Slots_FilterFree' => 'Свободные',
            'Slots_FilterMine' => 'Мои',
            'Slots_FilterPending' => 'Ожидание',
            'Slots_FilterConfirmed' => 'Подтверждено',
            'Slots_FilterCancelled' => 'Отказ',
            'Slots_FilterPast' => 'Прошедшие',
            'Expert_Cancellations' => 'Отменил занятий',
            'Expert_Declines' => 'Отклонил заявок',
            'Expert_Conducted' => 'Проведено уроков',
            // D-190: заявка, до которой преподаватель не успел ответить.
            // Отмены рядом — это его решения; здесь решения не было, и
            // ставить их в один ряд нельзя.
            'Expert_Missed' => 'Не ответил на заявок',
            'Expert_MissedHint' => 'Заявки, до начала которых преподаватель не дал ответа. Занятие не состоялось, деньги ученику вернулись полностью.',
            'Slot_OwnSlot' => 'Ваш слот',
            'Expert_Upcoming' => 'Предстоящих',
            'Expert_Stats' => 'Статистика',

            // User preview + Quick chat
            'Slot_User' => 'Пользователь',

            'Slot_OverlapError' => 'Слот пересекается с существующим занятием',

            // Отказы при работе со слотами. Раньше сервер отдавал их
            // по-английски, и в русском интерфейсе преподаватель получал
            // «Cannot create a slot in the past» — единственную английскую
            // фразу на экране.
            'Slot_Created' => 'Слот создан',
            'Slot_Error_DateTimeRequired' => 'Укажите дату и время',
            'Slot_Error_RangeRequired' => 'Укажите начало и конец периода',
            'Slot_Error_InvalidCost' => 'Стоимость указана неверно',
            'Slot_Error_InvalidDateTime' => 'Дата или время указаны неверно',
            'Slot_Error_PastSlot' => 'Нельзя создать слот в прошлом',
            'Slot_Error_NoSlots' => 'Не выбрано ни одного слота',
            'Slot_Error_AccessDenied' => 'Это не ваш слот',
            'Slot_Error_OnlyFreeEditable' => 'Редактировать можно только свободный слот',
            // Начинается со слова «Не сохранено» намеренно: прежний текст читался
            // как объяснение правила после успешного сохранения, и преподаватель
            // не сразу понял, что правка не прошла (замечание expert-3).
            'Slot_Error_BookedOnlyLocation' => 'Не сохранено: на слот уже записались, поэтому менять можно только место встречи. Время, стоимость, неустойку и число мест придётся оставить как есть',
            'Slot_EditPlaceOnly' => 'Изменить место встречи',
            'Slot_EditLockedNotice' => 'На это занятие уже записались. Менять можно только место встречи — остальные поля заперты, потому что человек согласился именно на эти условия.',
            'Slot_Error_PastNotEditable' => 'Прошедший слот изменить нельзя',
            'Slot_Error_CostLockedByBookings' => 'Пока на слот есть брони, стоимость и неустойку менять нельзя',
            'Slot_Error_PastReschedule' => 'Нельзя перенести слот в прошлое',
            'Slot_Error_SlotTaken' => 'Слот уже забронировали — обновите страницу',
            'Slot_Error_OnlyFreeDeletable' => 'Удалить можно только свободный слот',
            'Slot_Error_PastNotDeletable' => 'Прошедший слот удалить нельзя',
            'Slot_Error_DeleteLockedByBookings' => 'На слот есть активные брони — сначала отмените их',
            'Slot_Error_MaxUsersBelowBooked' => 'Мест не может быть меньше, чем уже записалось (%s)',
            'Slots_OwnHiddenNotice' => 'Ваши собственные занятия здесь не показываются — забронировать себя нельзя. Они в разделе «Мои слоты».',

            'Slot_Moved' => 'Слот успешно перемещён',
            'Slot_DragHint' => 'Перетащите свободные слоты на другой день',
            'Slot_CannotDropPast' => 'Нельзя перенести слот на прошедшую дату',

            // Teaching Pending Bookings widget
            'Teaching_PendingBookingsTitle' => 'Ожидают подтверждения',
            'Teaching_NoPendingBookings' => 'Нет бронирований, ожидающих подтверждения',
            'Teaching_RejectBooking' => 'Отклонить',
            'Teaching_ConfirmedBookingsTitle' => 'Подтверждённые брони',
            'Teaching_NoConfirmedBookings' => 'Нет подтверждённых броней',

            // Slot status filter (expert calendar)
            'Slot_Filter_Pending' => 'Ожидают',

            // Slot detail modal
            'Slot_Details' => 'Детали сессии',
            'Slot_PricePaid' => 'Стоимость',
            'Slot_CancelReason' => 'Причина отмены',
            'Slot_Offline' => 'Офлайн',
            'Slot_WriteExpert' => 'Написать эксперту',
            'Slot_CancelBooking' => 'Отменить бронирование',
            'Slot_DateLabel' => 'Дата и время',

            // Slot pluralization (Russian 3-form)
            'Slot_Plural_1' => 'слот',
            'Slot_Plural_2' => 'слота',
            'Slot_Plural_5' => 'слотов',

            // Expert profile pagination
            'Expert_ShowMoreSlots' => 'Показать ещё',
            'Expert_AllSlotsShown' => 'Все слоты отображены',
            'Slot_BookError_Self' => 'Нельзя забронировать собственный слот',
            'Slot_BookError_NotUser' => 'Бронировать слоты могут только пользователи',
            'Slot_BookError_Unavailable' => 'Этот слот уже занят или недоступен',
            'Slot_BookError_Past' => 'Это время уже прошло',
            'Slot_BookError_Busy' => 'Кошелёк сейчас занят другой операцией — повторите через мгновение',
            'Slot_BookError_AlreadyBooked' => 'Вы уже записаны на это занятие',

            // SlotsCalendar
            'Slots_PageHint' => 'Выберите удобный слот у эксперта на эту или следующие недели',
        ];
    }
}
