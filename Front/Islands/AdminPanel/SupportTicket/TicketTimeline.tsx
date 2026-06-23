import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportMessage, AssignmentLogEntry} from '../../Support/supportTypes';
import AttachmentDisplay from '../../../Common/AttachmentDisplay';
import {AdminUserLink} from '../../../Common/EntityLinks';
import {formatTs} from '@common/Utils/DateUtils';

interface Props {
    messages: SupportMessage[];
    assignmentLog: AssignmentLogEntry[];
    messagesEndRef: React.RefObject<HTMLDivElement>;
}

export default function TicketTimeline({messages, assignmentLog, messagesEndRef}: Props) {
    const [showHistory, setShowHistory] = React.useState(false);

    return (
        <>
            {/* Messages timeline */}
            <div className="border border-default rounded-lg mb-4 overflow-hidden bg-surface" data-test-id="support-timeline">
                <div className="max-h-96 overflow-y-auto px-4 py-3">
                    {messages.length === 0 ? (
                        <div className="text-center text-muted text-sm py-4">{t.Support_NoMessages()}</div>
                    ) : (
                        messages.map(msg => {
                            if (msg.msg_type === 'system') {
                                return (
                                    <div key={msg.id} className="text-center text-xs text-muted italic my-3 px-4" data-test-id={`support-msg-${msg.id}`}>
                                        {msg.body}
                                        <div className="text-muted mt-0.5">{formatTs(msg.created_at)}</div>
                                    </div>
                                );
                            }

                            const isInternal = !!msg.is_internal;
                            const isUser     = msg.msg_type === 'user';

                            return (
                                <div key={msg.id} className={`flex mb-3 ${isUser ? 'justify-end' : 'justify-start'}`} data-test-id={`support-msg-${msg.id}`}>
                                    <div className={`max-w-[70%] rounded-lg px-4 py-3 text-sm ${
                                        isInternal
                                            ? 'bg-warning-subtle border border-default text-on-surface'
                                            : isUser
                                                ? 'bg-surface-hover text-on-surface'
                                                : 'bg-accent-subtle text-on-surface'
                                    }`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            {msg.author_name && (
                                                msg.author_id > 0 ? (
                                                    <AdminUserLink id={msg.author_id} name={msg.author_name} className="text-xs font-medium" />
                                                ) : (
                                                    <span className="text-xs font-medium text-muted">{msg.author_name}</span>
                                                )
                                            )}
                                            {isInternal && (
                                                <span className="text-xs font-medium text-warning">({t.Support_InternalComment()})</span>
                                            )}
                                        </div>
                                        <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <AttachmentDisplay attachments={msg.attachments} />
                                        )}
                                        <div className="text-xs text-muted mt-1">{formatTs(msg.created_at)}</div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Assignment history */}
            {assignmentLog.length > 0 && (
                <div className="mt-4">
                    <button
                        type="button"
                        className="text-sm text-muted hover:text-secondary flex items-center gap-1"
                        onClick={() => setShowHistory(!showHistory)}
                        data-test-id="support-assignment-history-toggle"
                    >
                        <span className="text-xs select-none">{showHistory ? '\u25BE' : '\u25B8'}</span>
                        {t.Support_AssignmentHistory()} ({assignmentLog.length})
                    </button>
                    {showHistory && (
                        <div className="mt-2 rounded border border-default overflow-hidden" data-test-id="support-assignment-history">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>{t.Admin_Log_Actor()}</th>
                                        <th>{t.Admin_Ledger_From()}</th>
                                        <th>{t.Admin_Ledger_To()}</th>
                                        <th>{t.Admin_Ledger_Date()}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {assignmentLog.map(entry => (
                                        <tr key={entry.id} className="hover:bg-surface-hover">
                                            <td>
                                                {entry.actor_id > 0 ? <AdminUserLink id={entry.actor_id} name={entry.actor_name} /> : entry.actor_name}
                                            </td>
                                            <td className="text-muted">
                                                {entry.from_id ? <AdminUserLink id={entry.from_id} name={entry.from_name ?? `#${entry.from_id}`} /> : (entry.from_name ?? '\u2014')}
                                            </td>
                                            <td className="text-muted">
                                                {entry.to_id ? <AdminUserLink id={entry.to_id} name={entry.to_name ?? `#${entry.to_id}`} /> : (entry.to_name ?? '\u2014')}
                                            </td>
                                            <td className="text-muted text-xs whitespace-nowrap">{formatTs(entry.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
