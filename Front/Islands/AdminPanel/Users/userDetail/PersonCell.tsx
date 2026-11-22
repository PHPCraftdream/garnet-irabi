import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';

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
export class PersonCell extends AntiHookComponent<Props> {
    private readonly open = () => {
        const {id, name, onOpen} = this.props;
        if (id && name) onOpen(id, name);
    };

    render() {
        const {id, name} = this.props;
        if (!id || !name) return <span className="token-registration-ip">—</span>;
        return <button type="button" className="admin-user-history-person" onClick={this.open}>{name}</button>;
    }
}
