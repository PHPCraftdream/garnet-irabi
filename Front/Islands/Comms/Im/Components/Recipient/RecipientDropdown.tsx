import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {cn} from '@common/Utils/Ui/cn';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {Recipient} from '../RecipientCombobox';
import {getInitials, roleLabel} from './recipientHelpers';

const Option: React.FC<{r: Recipient; active: boolean; onPick: (r: Recipient) => void}> = ({r, active, onPick}) => (
    <button
        type="button"
        className={cn('im-combobox-option', active && 'im-combobox-option-active')}
        onClick={() => onPick(r)}
        data-test-id={`im-recipient-${r.id}`}
    >
        <span className="im-avatar">{getInitials(r.name)}</span>
        <span className="flex-1 text-left truncate">
            <span className="font-medium">{r.name || t.User_Anonymous()}</span>
        </span>
        <span className="text-xs text-muted shrink-0">{roleLabel(r.role)}</span>
    </button>
);

interface Props {
    search: string;
    onSearchChange: (v: string) => void;
    filtered: Recipient[];
    value: string;
    onPick: (r: Recipient) => void;
    loading: boolean;
}

/**
 * Всплывающее содержимое комбобокса: поиск и список получателей.
 *
 * Вынесено из `RecipientCombobox`, чтобы цепочка компонентов внутри
 * `Popover.Content` (сам Content уже третий уровень от `Popover.Root`) не
 * ныряла глубже разрешённых трёх уровней вложенности — здесь она начинает
 * счёт заново.
 */
export const RecipientDropdown: React.FC<Props> = ({search, onSearchChange, filtered, value, onPick, loading}) => (
    <Popover.Portal>
        <Popover.Content className="im-combobox-content" sideOffset={4} align="start">
            <div className="im-combobox-search-wrap">
                <input
                    type="text"
                    className="im-combobox-search-input"
                    placeholder={t.IM_Search() + '...'}
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    autoFocus
                    data-test-id="im-recipient-search"
                />
            </div>
            <div className="im-combobox-list">
                {filtered.length === 0 && (
                    <div className="im-combobox-empty">{loading ? t.User_Loading() : t.IM_NoRecipients()}</div>
                )}
                {filtered.map(r => (
                    <Option key={r.id} r={r} active={String(r.id) === value} onPick={onPick} />
                ))}
            </div>
        </Popover.Content>
    </Popover.Portal>
);
