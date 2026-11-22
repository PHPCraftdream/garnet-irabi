import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {ModalShell} from '../../../../../Common/Components/ModalShell';

interface Props {
    accountId: number;
    accountName: string;
    createTicketUrl: string;
    onClose: () => void;
    onSuccess: () => void;
}

interface State {
    subject: string;
    body: string;
    sending: boolean;
    error: string | null;
}

/** Написать пользователю — создаёт обращение в поддержку от его имени. */
export class WriteToUserModal extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor<State>({subject: '', body: '', sending: false, error: null});

    private update(patch: Partial<State>): void {
        this.ui.setData({...this.ui.getData(), ...patch});
    }

    private readonly changeSubject = (event: React.ChangeEvent<HTMLInputElement>) => this.update({subject: event.target.value});
    private readonly changeBody = (event: React.ChangeEvent<HTMLTextAreaElement>) => this.update({body: event.target.value});

    private readonly send = async () => {
        const {subject, body, sending} = this.ui.getData();
        if (sending || !subject.trim() || !body.trim()) return;
        const {accountId, createTicketUrl, onSuccess} = this.props;
        this.update({sending: true, error: null});
        try {
            const reply = await sendPost(createTicketUrl, {
                account_id: accountId, subject: subject.trim(), message: body.trim(),
            }) as {error?: string};
            if (reply?.error) this.update({error: reply.error});
            else onSuccess();
        } catch {
            this.update({error: t.General_Error()});
        } finally {
            this.update({sending: false});
        }
    };

    private renderFields({subject, body, sending}: State) {
        return (
            <>
                <div className="token-field">
                    <label className="admin-user-message-label">{t.Admin_MessageSubject()}</label>
                    <input type="text" className="admin-filter-field" value={subject} onChange={this.changeSubject} disabled={sending} />
                </div>
                <div className="admin-support-form">
                    <label className="admin-user-message-label">{t.Admin_MessageBody()}</label>
                    <textarea className="admin-filter-field" rows={5} value={body} onChange={this.changeBody} disabled={sending} />
                </div>
            </>
        );
    }

    render() {
        const {accountId, accountName, onClose} = this.props;
        const state = this.useCarburetor(this.ui);
        const {subject, body, sending, error} = state;
        return (
            <ModalShell title={t.Admin_WriteToUser()} testId={`write-to-user-${accountId}`} size="lg" onClose={onClose}>
                <div className="admin-user-message-caption">{accountName} (ID: {accountId})</div>
                {error && <div className="admin-user-message-error">{error}</div>}
                {this.renderFields(state)}
                <div className="booking-cancel-actions">
                    <button type="button" className="admin-user-message-cancel" onClick={onClose} disabled={sending}>{t.Action_Cancel()}</button>
                    <SendButton onClick={this.send} sending={sending} disabled={!subject.trim() || !body.trim()}
                        label={sending ? t.User_Loading() : t.Support_Send()} testId={`write-to-user-send-${accountId}`} size="sm" />
                </div>
            </ModalShell>
        );
    }
}
