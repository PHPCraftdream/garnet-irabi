import * as React from 'react';
import {SupportMessage} from '@/Islands/Comms/Support/parts/supportTypes';
import {SupportBubble} from '@/Islands/Comms/Support/parts/SupportBubble';

interface ListProps {
    messages: SupportMessage[];
    loading: boolean;
    emptyText: string;
    loadingText: string;
    endRef: React.RefObject<HTMLDivElement>;
    tight?: boolean;
}

/** Лента сообщений с якорем для автопрокрутки вниз. */
export function SupportMessageList({messages, loading, emptyText, loadingText, endRef, tight = false}: ListProps) {
    const rows: React.ReactNode[] = [];
    if (!loading) {
        for (const msg of messages) rows.push(<SupportBubble key={msg.id} msg={msg} tight={tight} />);
    }
    return (
        <div className="im-thread-body">
            {loading && <div className="support-empty-line">{loadingText}</div>}
            {!loading && messages.length === 0 && <div className="support-empty-line">{emptyText}</div>}
            {rows}
            <div ref={endRef} />
        </div>
    );
}
