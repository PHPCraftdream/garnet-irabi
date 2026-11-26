import * as React from 'react';
import {AntiHookComponent, Carburetor, type TReadonly} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '@/Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';
import {Recipient, RecipientCombobox} from './RecipientCombobox';

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

/** Новое сообщение: кому, текст, вложения. */
interface State {
    recipients: Recipient[];
    loading: boolean;
}

// Селектор читает поля строк: иначе изменение имени/роли получателя не попадёт
// в подписку (RULES.md, «Подписки useCarburetor»).
/** Обрабатывает readRecipient. */
function readRecipient(row: TReadonly<Recipient>): Recipient {
    return {id: row.id, name: row.name, role: row.role};
}

/** Обрабатывает selectRecipients. */
function selectRecipients(state: TReadonly<State>): Recipient[] {
    return state.recipients.map(readRecipient);
}

export default class NewMessageForm extends AntiHookComponent<Props> {
    private readonly store = new Carburetor<State>({recipients: [], loading: true});
    private readonly recipients = this.connectSelection(this.store, selectRecipients);
    private requestId = 0;

    /** Запускает действия после монтирования компонента. */
    componentDidMount(): void {
        super.componentDidMount();
        void this.load();
    }

    /** Обновляет данные после изменения свойств. */
    componentDidUpdate(previous: Readonly<Props>): void {
        super.componentDidUpdate(previous);
        if (previous.searchRecipientsUrl !== this.props.searchRecipientsUrl) void this.load();
    }

    /** Останавливает ресурсы перед размонтированием. */
    componentWillUnmount(): void {
        this.requestId++;
        super.componentWillUnmount();
    }

    /** Загружает список получателей. */
    private async load(): Promise<void> {
        const request = ++this.requestId;
        D('im.loadRecipients');
        try {
            const result = await sendPost(this.props.searchRecipientsUrl, {query: ''}) as any;
            if (request !== this.requestId) return;
            this.store.setData({recipients: result?.recipients ?? [], loading: false});
            D('im.recipients.loaded', {count: result?.recipients?.length ?? 0});
        } catch {
            if (request === this.requestId) this.store.setData({...this.store.getData(), loading: false});
        }
    }

    /** Обновляет текст сообщения. */
    private readonly changeMessage = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.props.onNewMessageChange(event.target.value);
    };

    /** Проверяет готовность формы к отправке. */
    private canSend(): boolean {
        return !!this.props.recipientId.trim() && !!this.props.newMessage.trim();
    }

    /** Отправляет форму по клавиатурному сочетанию. */
    private readonly submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !this.props.sending && this.canSend()) {
            event.preventDefault();
            this.props.onSend();
        }
    };

    /** Обрабатывает renderMessage. */
    private renderMessage() {
        return (
            <div>
                <label className="support-form-label">{t.IM_MessagePlaceholder()}</label>
                <textarea data-test-id="im-new-message-input" className="support-form-control" rows={6}
                    value={this.props.newMessage} onChange={this.changeMessage}
                    placeholder={t.IM_MessagePlaceholder() + CTRL_ENTER_HINT} onKeyDown={this.submitOnShortcut} />
            </div>
        );
    }

    /** Рисует действия формы. */
    private renderActions() {
        const {newFiles, onNewFilesChange, sending, onSend} = this.props;
        return (
            <div className="im-thread-actions">
                <AttachmentPicker files={newFiles} onChange={onNewFilesChange} />
                <SendButton onClick={onSend} disabled={!this.canSend()} sending={sending} label={t.IM_Send()} testId="im-send-btn" />
            </div>
        );
    }

    /** Рисует содержимое компонента. */
    render() {
        const {recipientId, onRecipientIdChange} = this.props;
        const {loading} = this.useCarburetor(this.store);
        const recipients = this.recipients();
        return (
            <div className="im-new-form" data-test-id="im-new-form">
                <h3 className="im-new-title">{t.IM_NewMessage()}</h3>
                <div>
                    <label className="support-form-label">{t.IM_Recipient()}</label>
                    <RecipientCombobox recipients={recipients} loading={loading} value={recipientId}
                        onChange={onRecipientIdChange} />
                </div>
                {this.renderMessage()}
                {this.renderActions()}
            </div>
        );
    }
}
