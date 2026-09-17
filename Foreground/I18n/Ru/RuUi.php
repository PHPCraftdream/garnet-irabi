<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\Ru {
    /**
     * Подписи: Ui.
     *
     * Часть разложенного файла данных (был один на 1358 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class RuUi {
        public static array $data = [
            'Reg_AccountType' => 'Тип аккаунта',
            'Reg_AccountTypeExpert' => 'Эксперт',
            'Reg_AccountTypeUser' => 'Пользователь',

            'Menu_Teaching' => 'Преподавание',
            'Menu_Bookings' => 'Брони',

            'User_Individual' => 'Индивидуальное занятие',
            // D-141: карточка брони на дашборде всегда писала «Индивидуальное»
            // даже для группового слота — ученица записалась в тройку и не
            // узнала об этом со своей же карточки.
            'User_Group' => 'Групповое занятие',

            'Finance_Filter_From' => 'От',
            'Finance_Filter_To' => 'Кому',
            'Finance_Filter_Type' => 'Тип',
            'Finance_Filter_Note' => 'Примечание',
            'Finance_Filter_NoMatches' => 'Нет совпадений',

            'User_Status_Disabled' => 'Отключён',
            'User_Status_Approved' => 'Одобрен',
            'User_Loading' => 'Загрузка...',
            'User_LoadError' => 'Ошибка загрузки',
            'User_Balance' => 'Баланс',
            'User_RegTime' => 'Регистрация',
            'User_LastOnline' => 'Онлайн',
            'User_Anonymous' => 'Пользователь',
            'User_Disabled' => 'Пользователь #%s отключён',

            'General_Yes' => 'Да',
            'General_No' => 'Нет',
            'General_Error' => 'Ошибка',

            'Im_FileTooLarge' => 'Файл слишком большой. Максимум 25 МБ на сообщение.',
            'Im_NetworkError' => 'Нет соединения с сервером',

            'Lightbox_Download' => 'Скачать',
            'Lightbox_Close' => 'Закрыть',

            'Menu_Balance' => 'Баланс',
            'Menu_Study' => 'Учёба',
            'Menu_BrowseSlots' => 'Обзор слотов',
            'Menu_ManageSlots' => 'Управление слотами',

            'Dashboard_Balance' => 'Баланс',

            // Support
            'Menu_Support' => 'Поддержка',
            'Unit_DayShort' => 'д',
            'Unit_HourShort' => 'ч',
            'Unit_MinuteShort' => 'мин',
            'MyReviews_Title' => 'Мои отзывы',
            'Menu_Messages' => 'Сообщения',

            // Dashboard
            'Dash_Welcome' => 'Привет, %s!',
            'Dash_Role_User' => 'Пользователь',
            'Dash_Role_Expert' => 'Эксперт',
            'Dash_Role_Moderator' => 'Модератор',
            'Dash_Role_Owner' => 'Владелец',
            'Dash_Upcoming' => 'Мои ближайшие сессии',
            'Dash_StartLearning' => 'Начните обучение',
            'Dash_Recommendations' => 'Рекомендации',
            'Dash_ViewAll' => 'Показать все',
            'Feed_NoUpcoming' => 'Нет предстоящих сессий',
            'Dash_ExpertSlots' => 'Мои ближайшие слоты',
            'Dash_PendingBookings' => 'Ожидают подтверждения',
            'Dash_Stats' => 'Статистика',
            'Dash_UsersThisMonth' => 'Пользователей за месяц',
            'Dash_EarningsThisMonth' => 'Доход за месяц',
            'Dash_OpenTickets' => 'Открытые тикеты',
            'Dash_PendingApprovals' => 'Эксперты на одобрении',
            'Dash_TotalUsers' => 'Всего пользователей',
            'Dash_BookingsThisMonth' => 'Бронирований за месяц',
            'Dash_UnreadSupport' => 'Непрочитанные обращения',
            'Dash_UnreadMessages' => 'Непрочитанные сообщения',
            'Dash_Booked' => 'записано',

            // Study Dashboard
            'Menu_StudyDashboard' => 'Обзор',

            // User cancellations
            'User_Cancel_Title' => 'Отмена подтверждённой брони',
            'User_Cancel_ReasonLabel' => 'Причина отмены',
            'User_Cancel_ReasonPlaceholder' => 'Укажите причину отмены...',
            'User_Cancel_ReasonRequired' => 'Укажите причину',
            'User_Cancel_Submit' => 'Отменить бронь',
            'User_Cancel_Success' => 'Бронь отменена, средства возвращены',
            // Снятие своей ещё не подтверждённой заявки — не то же самое, что
            // отмена подтверждённой брони: занятия ещё не было в расписании,
            // неустойка не удерживается, растёт другой счётчик. Пока оба
            // действия назывались «Отменить», цену своего шага человек узнавал
            // только открыв окно.
            'User_Withdraw_Card' => 'Снять заявку',
            'User_Withdraw_Title' => 'Снятие неподтверждённой заявки',
            'User_Withdraw_ReasonLabel' => 'Причина снятия',
            'User_Withdraw_ReasonPlaceholder' => 'Укажите причину снятия...',
            'User_Withdraw_Submit' => 'Снять заявку',
            'User_Withdraw_Success' => 'Заявка снята, средства возвращены',
            'User_Cancel_Card' => 'Отменить бронь',
            // D-191: назывались «Отмен бронирований» и «Снятий бронирования»
            // — в быту это синонимы, и различить их было нельзя. Пользователь
            // видел в своём списке бронь со статусом «Отменён», смотрел на
            // «Отмен» и читал там ноль: числа верны, а вывод напрашивался
            // неверный — «счётчик сломан». Разделение идёт не по тому, КТО
            // отменил, а по тому, была ли бронь уже подтверждена, — теперь
            // это сказано прямо.
            'User_Cancellations' => 'Отменено после подтверждения',
            'User_Declines' => 'Снято до подтверждения',
            'QuickChat_Title' => 'Быстрый чат',
            'QuickChat_NoMessages' => 'Сообщений пока нет',
            'QuickChat_OpenProfile' => 'Открыть профиль',
            'QuickChat_AllMessages' => 'Все сообщения',

            // Generic actions
            'Action_Edit' => 'Редактировать',
            'Action_Delete' => 'Удалить',
            'Action_Cancel' => 'Отменить',
            'Action_Close' => 'Закрыть',
            'Action_Remove' => 'Убрать',
            'Action_Add' => 'Добавить',
            // Пустой результат в выпадающих списках с поиском. Без него
            // подставлялась английская строка по умолчанию из компонента.
            'Filter_NoResults' => 'Ничего не найдено',

            // User preview modal (foreground, generic)
            'Preview_UserTitle' => 'Профиль',
            'Preview_Loading' => 'Загрузка...',
            'Preview_OpenProfile' => 'Открыть профиль',
            'Preview_SendMessage' => 'Написать сообщение',
            'Preview_Specialization' => 'Специализация',
            'Preview_Bio' => 'О себе',
            'Preview_Rating' => 'Рейтинг',
            'Preview_Conducted' => 'Проведено',
            'Preview_TotalBookings' => 'Предстоящих',
            'Preview_Cancellations' => 'Отмены',
            'Preview_CompletedBookings' => 'Завершено',
            'Preview_RoleExpert' => 'Эксперт',
            'Preview_RoleUser' => 'Пользователь',

            // Pagination
            'Pagination_Prev' => 'Назад',
            'Pagination_Next' => 'Вперёд',
            'Pagination_Of' => 'из',
            'Pagination_Items' => 'записей',
            'Im_GoToDialogs' => 'Перейти в диалоги',

            'Profile_MyProfile' => 'Мой профиль',
            'NotifPrefs_Title' => 'Уведомления по почте',
            'NotifPrefs_Messages' => 'Личные сообщения',
            'NotifPrefs_Support' => 'Поддержка',
            'NotifPrefs_Bookings' => 'Бронирования',
            'NotifFreq_Each' => 'Каждое событие',
            'NotifFreq_Hourly' => 'Раз в час',
            'NotifFreq_Daily' => 'Раз в день',
            'NotifFreq_Off' => 'Выключить',
            'NotifPrefs_Saved' => 'Настройки сохранены',

            // AdminGrid i18n
            'Grid_Search' => 'Поиск…',
            'Grid_PrevPage' => 'Предыдущая страница',
            'Grid_NextPage' => 'Следующая страница',
            'Grid_Items' => 'записей',

            // Вложения: что можно приложить и почему конкретный файл не взяли.
            // Отказ приходит до отправки, поэтому назван файл, а не «ошибка».
            'Attach_Hint' => 'До %s файлов, каждый до %s МБ: изображения, PDF, TXT, LOG',
            'Attach_TooLarge' => '%s: файл больше %s МБ — не приложен',
            'Attach_Empty' => '%s: файл пустой — не приложен',
            'Attach_ExtNotAllowed' => '%s: такие файлы прикладывать нельзя — не приложен',
            'Attach_TooMany' => 'Приложить можно не больше %s файлов — не приложены: %s',

            // Accessibility (A11y)
            'A11y_CloseModal' => 'Закрыть диалог',
            'A11y_RemoveAttachment' => 'Удалить вложение',
            'A11y_AttachFiles' => 'Прикрепить файлы',
            'A11y_PreviousImage' => 'Предыдущее изображение',
            'A11y_NextImage' => 'Следующее изображение',
            'A11y_ImagePreview' => 'Просмотр изображения',
            'A11y_WriteMessage' => 'Написать сообщение',
            'A11y_WriteComment' => 'Написать комментарий',
            'A11y_PriceMin' => 'Минимальная цена',
            'A11y_PriceMax' => 'Максимальная цена',

            'User_SupportTickets' => 'Обращения в поддержку',
            'User_NoBookings' => 'Бронирований нет',
            'User_ExpertCancellations' => 'Отмен (эксперт)',
            'User_ExpertDeclines' => 'Отклонений (эксперт)',
            'User_UserCancellations' => 'Отмен (пользователь)',
            'User_UserDeclines' => 'Снятий (пользователь)',
            'User_TicketSubject' => 'Тема',
            'User_TicketStatus' => 'Статус',
            'User_TicketUpdated' => 'Обновлено',
            'User_LedgerParty' => 'Контрагент',
            'Settings_CancellationPenaltyPercent' => 'Процент неустойки при отмене брони пользователем',
            'Settings_CancellationPenaltyHelp' => 'Доля стоимости слота (0–100%), удерживаемая с пользователя при отмене подтвержденной брони. Применяется по умолчанию для новых слотов; эксперт может переопределить для каждого слота.',
            'Registration_Disabled_Title' => 'Регистрация временно закрыта',
            'Registration_Disabled' => 'Создание новых аккаунтов сейчас отключено. Обратитесь к администратору.',
            'Footer_Contact' => 'Связаться с нами:',

            'External_Title' => 'Вы покидаете %s',
            'External_Description' => 'Эта ссылка ведёт на внешний сайт. Мы не отвечаем за его содержимое и безопасность.',
            'External_Host' => 'Сайт назначения',
            'External_FullUrl' => 'Полный адрес',
            'External_Continue' => 'Продолжить',
            'External_Cancel' => 'Отменить',
            'External_InvalidUrl' => 'Недопустимый адрес',

            // Ссылка входа из письма — это не регистрация, поэтому у отказа
            // свой заголовок: по ссылке приходит уже зарегистрированный
            // человек, и «Регистрация недоступна» сбивает его с толку.
            'MagicLink_Error_Title' => 'Ссылка для входа недействительна',
            'MagicLink_Error_Guidance' => 'Запросите новый код входа на странице входа — старая ссылка больше не нужна.',
            'MagicLink_Error_ContactSupport' => 'Если код так и не приходит, свяжитесь с нами:',
        ];
    }
}
