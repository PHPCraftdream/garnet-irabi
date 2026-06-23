import * as React from 'react';
import {useState, useEffect} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {D} from '@common/Debug/D';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '../../../Common/AttachmentPicker';
import SendButton from '@common/Components/SendButton';
import * as Popover from '@radix-ui/react-popover';
import {cn} from '@common/Utils/cn';

interface Recipient {
    id: number;
    name: string;
    role: string;
}

interface Props {
    searchRecipientsUrl: string;
    recipientId: string;
    onRecipientIdChange: (id: string) => void;
    newMessage: string;
    onNewMessageChange: (msg: string) => void;
    newFiles: PendingFile[];
    onNewFilesChange: (files: PendingFile[]) => void;
    sending: boolean;
    onSend: () => void;
}

function getInitials(name: string): string {
    const src = name || '?';
    return src.split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

const ROLE_LABELS: Record<string, string> = {
    expert: '👩‍🏫',
    moderator: '🛡️',
    owner: '👑',
};

export default function NewMessageForm({
    searchRecipientsUrl, recipientId, onRecipientIdChange,
    newMessage, onNewMessageChange, newFiles, onNewFilesChange,
    sending, onSend,
}: Props) {
    const [allRecipients, setAllRecipients] = useState<Recipient[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    // Load all recipients on mount
    useEffect(() => {
        D('im.loadRecipients');
        sendPost(searchRecipientsUrl, {query: ''}).then((r: any) => {
            setAllRecipients(r?.recipients ?? []);
            D('im.recipients.loaded', {count: r?.recipients?.length ?? 0});
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [searchRecipientsUrl]);

    const selected = allRecipients.find(r => String(r.id) === recipientId);

    const filtered = search.trim()
        ? allRecipients.filter(r => {
            const q = search.toLowerCase();
            return (r.name || '').toLowerCase().includes(q);
        })
        : allRecipients;

    const selectRecipient = (r: Recipient) => {
        D('im.selectRecipient', {id: r.id, name: r.name});
        onRecipientIdChange(String(r.id));
        setSearch('');
        setOpen(false);
    };

    return (
        <div className="support-new-form" data-test-id="im-new-form">
            <h3 className="support-new-form-title">{t.IM_NewMessage()}</h3>

            {/* Recipient Combobox */}
            <div>
                <label className="support-form-label">{t.IM_Recipient()}</label>
                <Popover.Root open={open} onOpenChange={setOpen}>
                    <Popover.Trigger asChild>
                        <button
                            type="button"
                            role="combobox"
                            aria-expanded={open}
                            className={cn('im-combobox-trigger', !selected && 'im-combobox-trigger-empty')}
                            data-test-id="im-recipient-input"
                        >
                            {selected ? (
                                <span className="flex items-center gap-2 truncate">
                                    <span className="im-avatar-sm">
                                        {getInitials(selected.name)}
                                    </span>
                                    <span className="truncate">{selected.name || t.User_Anonymous()}</span>
                                    <span className="text-xs">{ROLE_LABELS[selected.role] || ''}</span>
                                </span>
                            ) : (
                                <span>{loading ? t.User_Loading() : t.IM_Search() + '...'}</span>
                            )}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="im-combobox-chevron">
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </button>
                    </Popover.Trigger>

                    <Popover.Portal>
                        <Popover.Content
                            className="im-combobox-content"
                            sideOffset={4}
                            align="start"
                        >
                            {/* Search */}
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

                            {/* Options */}
                            <div className="im-combobox-list">
                                {filtered.length === 0 ? (
                                    <div className="im-combobox-empty">
                                        {loading ? t.User_Loading() : t.IM_NoRecipients()}
                                    </div>
                                ) : (
                                    filtered.map(r => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            className={cn('im-combobox-option', String(r.id) === recipientId && 'im-combobox-option-active')}
                                            onClick={() => selectRecipient(r)}
                                            data-test-id={`im-recipient-${r.id}`}
                                        >
                                            <span className="im-avatar">
                                                {getInitials(r.name)}
                                            </span>
                                            <span className="flex-1 text-left truncate">
                                                <span className="font-medium">{r.name || t.User_Anonymous()}</span>
                                            </span>
                                            <span className="text-xs shrink-0">{ROLE_LABELS[r.role] || ''}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>
            </div>

            {/* Message */}
            <div>
                <label className="support-form-label">{t.IM_MessagePlaceholder()}</label>
                <textarea
                    data-test-id="im-new-message-input"
                    className="form-control"
                    rows={6}
                    value={newMessage}
                    onChange={e => onNewMessageChange(e.target.value)}
                    placeholder={t.IM_MessagePlaceholder() + CTRL_ENTER_HINT}
                    onKeyDown={useCtrlEnter(onSend, sending || !recipientId.trim() || !newMessage.trim())}
                />
            </div>
            <div className="support-thread-actions">
                <AttachmentPicker files={newFiles} onChange={onNewFilesChange} />
                <SendButton
                    onClick={onSend}
                    disabled={!recipientId.trim() || !newMessage.trim()}
                    sending={sending}
                    label={t.IM_Send()}
                    testId="im-send-btn"
                />
            </div>
        </div>
    );
}
