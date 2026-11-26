import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {SupportMessage, AssignmentLogEntry} from '@/Islands/Comms/Support/parts/supportTypes';
import {SupportMessageBubble} from './timeline/SupportMessageBubble';
import {AssignmentHistory} from './timeline/AssignmentHistory';

interface Props {
    messages: SupportMessage[];
    assignmentLog: AssignmentLogEntry[];
}

    /** Формирует представление данных для соответствующего раздела панели. */
function renderMessage(msg: SupportMessage) {
    return <SupportMessageBubble key={msg.id} msg={msg} />;
}

export default class TicketTimeline extends AntiHookComponent<Props> {
    private readonly boxRef = React.createRef<HTMLDivElement>();
    private lastCount = -1;

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        this.scrollIfCountChanged();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidUpdate(previous: Readonly<Props>): void {
        super.componentDidUpdate(previous);
        this.scrollIfCountChanged();
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private scrollIfCountChanged(): void {
        const count = this.props.messages.length;
        if (this.lastCount === count) return;
        this.lastCount = count;
        const box = this.boxRef.current;
        if (box) box.scrollTop = box.scrollHeight;
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {messages, assignmentLog} = this.props;
        return (
            <>
                <div className="admin-support-timeline" data-test-id="support-timeline">
                    <div className="admin-support-timeline-scroll" ref={this.boxRef}
                        data-test-id="support-timeline-scroll">
                        {messages.length === 0 && <div
        className="admin-support-timeline-empty">{t.Support_NoMessages()}</div>}
                        {messages.map(renderMessage)}
                    </div>
                </div>
                <AssignmentHistory entries={assignmentLog} />
            </>
        );
    }
}
