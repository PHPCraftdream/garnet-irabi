import * as React from 'react';
import {ImMessage} from '../imTypes';
import AttachmentDisplay from '../../../Common/AttachmentDisplay';
import {formatTs} from '@common/Utils/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';

interface Props {
    message: ImMessage;
    isMine: boolean;
}

export default function MessageBubble({message, isMine}: Props) {
    return (
        <div
            data-test-id={`im-message-${message.id}`}
            className={`im-bubble-row ${isMine ? 'justify-end' : 'justify-start'}`}
        >
            <div className={`im-bubble ${isMine ? 'im-bubble-mine' : 'im-bubble-theirs'}`}>
                {!isMine && message.sender_name && (
                    <div className="im-bubble-author">
                        <UserLink id={message.sender_id} name={message.sender_name} />
                    </div>
                )}
                <div className="im-bubble-body">{message.body}</div>
                {message.attachments && message.attachments.length > 0 && (
                    <AttachmentDisplay attachments={message.attachments as any} />
                )}
                <div className="im-bubble-time">
                    {formatTs(message.created_at)}
                </div>
            </div>
        </div>
    );
}
