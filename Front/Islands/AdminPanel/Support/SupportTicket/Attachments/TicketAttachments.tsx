import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {SupportMessage} from '../../../../Comms/Support/parts/supportTypes';
import {AttachmentRow, AttachmentWithAuthor} from './AttachmentRow';

interface Props {
    messages: SupportMessage[];
}

function collect(messages: SupportMessage[]): AttachmentWithAuthor[] {
    const attachments: AttachmentWithAuthor[] = [];
    for (const msg of messages) {
        for (const attachment of msg.attachments ?? []) attachments.push({...attachment, author_name: msg.author_name});
    }
    return attachments;
}

function renderAttachment(att: AttachmentWithAuthor) {
    return <AttachmentRow key={att.id} att={att} />;
}

export default class TicketAttachments extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({expanded: false});
    private readonly toggle = () => this.ui.setData({expanded: !this.ui.getData().expanded});

    render() {
        const {expanded} = this.useCarburetor(this.ui);
        const attachments = collect(this.props.messages);
        if (attachments.length === 0) return null;

        return (
            <div className="admin-support-form" data-test-id="support-attachments-block">
                <button
                    type="button"
                    className="admin-support-history-toggle"
                    onClick={this.toggle}
                    aria-expanded={expanded}
                    data-test-id="support-attachments-toggle"
                >
                    <span className="admin-support-history-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
                    {t.Support_Attachments()} ({attachments.length})
                </button>
                {expanded && (
                    <div className="admin-attachment-panel" data-test-id="support-attachments-list">
                        <div className="admin-attachment-list">
                            {attachments.map(renderAttachment)}
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
