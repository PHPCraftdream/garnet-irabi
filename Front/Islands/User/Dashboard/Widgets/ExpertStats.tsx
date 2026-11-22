import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

interface ExpertStatsProps {
    pendingBookings: number;
    usersThisMonth: number;
    earningsThisMonth: number;
    declines: number;
    cancellations: number;
    /** D-190: заявки, истёкшие без ответа преподавателя. */
    missed: number;
}

export const ExpertStats: React.FC<ExpertStatsProps> = ({pendingBookings, usersThisMonth, earningsThisMonth, declines, cancellations, missed}) => (
    <div className="user-dash-stats-card" data-test-id="expert-stats">
        <div className="user-dash-stats-heading">
            <h2 className="user-dash-stats-title">{t.Dash_Stats()}</h2>
        </div>
        {/* D-194: значения были размечены классами expert-stat-value-accent
            /-success/-warning, которых нет нигде — ни в стилях приложения, ни
            во фреймворке, ноль вхождений по всему дереву. Числа рендерились
            без стилей, пока соседняя подпись stat-tile-label работала:
            похоже на незавершённое переименование пары. Парный к подписи
            класс — stat-tile-value, цвет отдельной утилитой. */}
        <div className="user-dash-expert-grid">
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value">{pendingBookings}</div>
                <div className="user-dash-stat-label">{t.Dash_PendingBookings()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="success">{usersThisMonth}</div>
                <div className="user-dash-stat-label">{t.Dash_UsersThisMonth()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="warning" data-test-id="expert-stat-earnings">{earningsThisMonth} &#8381;</div>
                <div className="user-dash-stat-label">{t.Dash_EarningsThisMonth()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="warning" data-test-id="expert-stat-declines">{declines}</div>
                <div className="user-dash-stat-label">{t.Teaching_Declines()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="warning" data-test-id="expert-stat-cancellations">{cancellations}</div>
                <div className="user-dash-stat-label">{t.Teaching_Cancellations()}</div>
            </div>
            {/* Соседние два — решения преподавателя. Это — их отсутствие:
                заявка истекла без ответа, занятие не состоялось, ученику
                вернулись деньги. Отменой это не считается, но и невидимым
                оставаться не должно (D-190). */}
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="muted" data-test-id="expert-stat-missed">{missed}</div>
                <div className="user-dash-stat-label">{t.Expert_Missed()}</div>
            </div>
        </div>

        {/* D-197: объяснение висело в атрибуте title и на телефоне не
            открывалось вовсе — оставалась цифра рядом с «Отклонил» и
            «Отменил». Видимая строка вместо всплывающей подсказки. */}
        <p className="user-dash-stats-hint" data-test-id="expert-stat-missed-hint">
            {t.Expert_MissedHint()}
        </p>
    </div>
);
