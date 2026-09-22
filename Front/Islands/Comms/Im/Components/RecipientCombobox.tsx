import * as React from 'react';
import {useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {cn} from '@common/Utils/Ui/cn';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {getInitials, roleLabel} from './recipientHelpers';
import {RecipientDropdown} from './RecipientDropdown';

export interface Recipient {
    id: number;
    name: string;
    role: string;
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
            <RecipientDropdown
                search={search}
                onSearchChange={setSearch}
                filtered={filtered}
                value={value}
                onPick={pick}
                loading={loading}
            />
        </Popover.Root>
    );
};
