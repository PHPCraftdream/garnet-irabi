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
export function SupportMessageList({messages, loading, emptyText, loadingText, endRef, className = 'im-thread-body', tight = false}: ListProps) {
    const rows: React.ReactNode[] = [];
    if (!loading) {
        for (const msg of messages) rows.push(<SupportBubble key={msg.id} msg={msg} tight={tight} />);
    }
    return (
        <div className={className}>
            {loading && <div className="support-empty-line">{loadingText}</div>}
            {!loading && messages.length === 0 && <div className="support-empty-line">{emptyText}</div>}
            {rows}
            <div ref={endRef} />
        </div>
    );
}
