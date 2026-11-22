import * as React from 'react';
import {ImMessage} from '../imTypes';
import AttachmentDisplay from '../../../../Common/attachments/AttachmentDisplay';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';

interface Props {
    message: ImMessage;
    isMine: boolean;
}

export default function MessageBubble({message, isMine}: Props) {
    return (
        <div
            data-test-id={`im-message-${message.id}`}
            className="support-message-row" data-own={isMine}
        >
            <div className="support-message-bubble" data-own={isMine}>
                {!isMine && message.sender_name && (
                    <div className="support-message-author">
                        <UserLink id={message.sender_id} name={message.sender_name} />
                    </div>
                )}
                <div className="support-message-body">{message.body}</div>
                {message.attachments && message.attachments.length > 0 && (
                    <AttachmentDisplay attachments={message.attachments as any} />
                )}
                <div className="support-message-time">
                    {formatTs(message.created_at)}
                </div>
            </div>
        </div>
    );
}
