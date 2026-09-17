import * as React from 'react';

interface Props {
    id?: number | null;
    name?: string | null;
    onOpen: (id: number, name: string) => void;
}

/**
 * Человек в ячейке таблицы: кнопка, открывающая его карточку, или прочерк.
 *
 * Один и тот же тернарник «есть id и имя — ссылка, иначе прочерк» повторялся
 * в карточке пользователя пять раз подряд, в каждой из таблиц.
 */
export const PersonCell: React.FC<Props> = ({id, name, onOpen}) => {
    if (!id || !name) return <span className="admin-cell-note">{'—'}</span>;

    return (
        <button type="button" className="admin-link-btn" onClick={() => onOpen(id, name)}>
            {name}
        </button>
    );
};
