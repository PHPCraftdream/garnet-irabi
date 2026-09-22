import * as React from 'react';
import {SectionTitle} from './Header/SectionTitle';

interface Props {
    title: string;
    /** Число в скобках рядом с заголовком: сколько всего записей. */
    count: number;
    columns: string[];
    className?: string;
    children: React.ReactNode;
}

/**
 * Раздел карточки пользователя: заголовок со счётчиком и таблица.
 *
 * Шесть разделов повторяли одну и ту же обвязку из заголовка, `<table>`,
 * `<thead>` и строки заголовков — четыре уровня вложенности до того, как
 * начнутся собственно данные.
 */
export const DetailTable: React.FC<Props> = ({title, count, columns, className = 'admin-detail-table', children}) => (
    <>
        <SectionTitle>{title} ({count})</SectionTitle>
        <table className={className}>
            <thead>
                <tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    </>
);
