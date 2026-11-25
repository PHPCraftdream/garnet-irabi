import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

const dashEarningsThisMonth = t.Dash_EarningsThisMonth;
const dashPendingBookings = t.Dash_PendingBookings;
const dashStats = t.Dash_Stats;
const dashUsersThisMonth = t.Dash_UsersThisMonth;
const expertMissed = t.Expert_Missed;
const expertMissedHint = t.Expert_MissedHint;
const teachingCancellations = t.Teaching_Cancellations;
const teachingDeclines = t.Teaching_Declines;

interface ExpertStatsProps {
    pendingBookings: number;
    usersThisMonth: number;
    earningsThisMonth: number;
    declines: number;
    cancellations: number;
    /** D-190: заявки, истёкшие без ответа преподавателя. */
    missed: number;
}

/** Показывает преподавателю сводные показатели его работы. */
export const ExpertStats: React.FC<ExpertStatsProps> = ({
    pendingBookings,
    usersThisMonth,
    earningsThisMonth,
    declines,
    cancellations,
    missed,
}) => (
    <div className="user-dash-stats-card" data-test-id="expert-stats">
        <div className="user-dash-stats-heading">
            <h2 className="user-dash-stats-title">{dashStats()}</h2>
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
                <div className="user-dash-stat-label">{dashPendingBookings()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="success">{usersThisMonth}</div>
                <div className="user-dash-stat-label">{dashUsersThisMonth()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="warning" data-test-id="expert-stat-earnings">
                    {earningsThisMonth} &#8381;
                </div>
                <div className="user-dash-stat-label">{dashEarningsThisMonth()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="warning" data-test-id="expert-stat-declines">
                    {declines}
                </div>
                <div className="user-dash-stat-label">{teachingDeclines()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="warning" data-test-id="expert-stat-cancellations">
                    {cancellations}
                </div>
                <div className="user-dash-stat-label">{teachingCancellations()}</div>
            </div>
            {/* Соседние два — решения преподавателя. Это — их отсутствие:
                заявка истекла без ответа, занятие не состоялось, ученику
                вернулись деньги. Отменой это не считается, но и невидимым
                оставаться не должно (D-190). */}
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="muted" data-test-id="expert-stat-missed">{missed}</div>
                <div className="user-dash-stat-label">{expertMissed()}</div>
            </div>
        </div>

        {/* D-197: объяснение висело в атрибуте title и на телефоне не
            открывалось вовсе — оставалась цифра рядом с «Отклонил» и
            «Отменил». Видимая строка вместо всплывающей подсказки. */}
        <p className="user-dash-stats-hint" data-test-id="expert-stat-missed-hint">
            {expertMissedHint()}
        </p>
    </div>
);
