import * as React from 'react';
import {SectionTitle} from './Header/SectionTitle';

interface Props {
    title: string;
    /** Число в скобках рядом с заголовком: сколько всего записей. */
    count: number;
    columns: string[];
    spacing?: 'after';
    children: React.ReactNode;
}

/**
 * Раздел карточки пользователя: заголовок со счётчиком и таблица.
 *
 * Шесть разделов повторяли одну и ту же обвязку из заголовка, `<table>`,
 * `<thead>` и строки заголовков — четыре уровня вложенности до того, как
 * начнутся собственно данные.
 */
function renderColumn(column: string, index: number) {
    return <th className="admin-user-history-header-cell" key={index}>{column}</th>;
}

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const DetailTable: React.FC<Props> = ({title, count, columns, spacing, children}) => (
    <>
        <SectionTitle>{title} ({count})</SectionTitle>
        <table className="admin-user-history-table" data-spacing={spacing}>
            <thead>
                <tr className="admin-user-history-header-row">{columns.map(renderColumn)}</tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    </>
);
