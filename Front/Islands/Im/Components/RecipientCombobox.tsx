import * as React from 'react';
import {useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {cn} from '@common/Utils/Ui/cn';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

export interface Recipient {
    id: number;
    name: string;
    role: string;
}

export function getInitials(name: string): string {
    return (name || '?').split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

/**
 * Пометка роли говорит, чем человек занимается.
 *
 * Раньше здесь стояли значки, и они говорили больше: значок преподавателя нёс
 * пол и ставил женское лицо рядом с именем каждого преподавателя-мужчины.
 * Корона и щит тоже несут свои оттенки. Слово называет ровно то, что нужно,
 * и ничего сверх.
 */
export function roleLabel(role: string): string {
    switch (role) {
        case 'expert': return t.Reg_AccountTypeExpert();
        case 'moderator': return t.Admin_Role_Moderator();
        case 'owner': return t.Admin_Role_Owner();
        default: return '';
    }
}

const TriggerLabel: React.FC<{selected?: Recipient; loading: boolean}> = ({selected, loading}) => {
    if (!selected) {
        return <span>{loading ? t.User_Loading() : t.IM_Search() + '...'}</span>;
    }

    return (
        <span className="flex items-center gap-2 truncate">
            <span className="im-avatar-sm">{getInitials(selected.name)}</span>
            <span className="truncate">{selected.name || t.User_Anonymous()}</span>
            <span className="text-xs text-muted shrink-0">{roleLabel(selected.role)}</span>
        </span>
    );
};

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
    recipients: Recipient[];
    loading: boolean;
    value: string;
    onChange: (id: string) => void;
}

/** Выбор получателя: поиск по имени со списком. */
export const RecipientCombobox: React.FC<Props> = ({recipients, loading, value, onChange}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const selected = recipients.find(r => String(r.id) === value);
    const q = search.trim().toLowerCase();
    const filtered = q ? recipients.filter(r => (r.name || '').toLowerCase().includes(q)) : recipients;

    const pick = (r: Recipient) => {
        D('im.selectRecipient', {id: r.id, name: r.name});
        onChange(String(r.id));
        setSearch('');
        setOpen(false);
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    className={cn('im-combobox-trigger', !selected && 'im-combobox-trigger-empty')}
                    data-test-id="im-recipient-input"
                >
                    <TriggerLabel selected={selected} loading={loading} />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="im-combobox-chevron">
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content className="im-combobox-content" sideOffset={4} align="start">
                    <div className="im-combobox-search-wrap">
                        <input
                            type="text"
                            className="im-combobox-search-input"
                            placeholder={t.IM_Search() + '...'}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                            data-test-id="im-recipient-search"
                        />
                    </div>
                    <div className="im-combobox-list">
                        {filtered.length === 0 && (
                            <div className="im-combobox-empty">{loading ? t.User_Loading() : t.IM_NoRecipients()}</div>
                        )}
                        {filtered.map(r => (
                            <Option key={r.id} r={r} active={String(r.id) === value} onPick={pick} />
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};
