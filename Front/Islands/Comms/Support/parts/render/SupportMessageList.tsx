import * as React from 'react';
import {SupportMessage} from '../supportTypes';
import {SupportBubble} from '../SupportBubble';

interface ListProps {
    messages: SupportMessage[];
    loading: boolean;
    emptyText: string;
    loadingText: string;
    endRef: React.RefObject<HTMLDivElement>;
    className?: string;
    tight?: boolean;
}

/** Лента сообщений с якорем для автопрокрутки вниз. */
export const SupportMessageList: React.FC<ListProps> = ({
    messages,
    loading,
    emptyText,
    loadingText,
    endRef,
    className = 'support-thread-body',
    tight = false,
}) => (
    <div className={className}>
        {loading && <div className="support-empty-line">{loadingText}</div>}
        {!loading && messages.length === 0 && <div className="support-empty-line">{emptyText}</div>}
        {!loading && messages.map(msg => <SupportBubble key={msg.id} msg={msg} tight={tight} />)}
        <div ref={endRef} />
    </div>
);
