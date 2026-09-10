import * as React from 'react';
import {useEffect, useRef} from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportMessage, AssignmentLogEntry} from '../../Support/supportTypes';
import {SupportMessageBubble} from './timeline/SupportMessageBubble';
import {AssignmentHistory} from './timeline/AssignmentHistory';

interface Props {
    messages: SupportMessage[];
    assignmentLog: AssignmentLogEntry[];
}

/** Переписка по обращению и, отдельно, история передач между сотрудниками. */
export default function TicketTimeline({messages, assignmentLog}: Props) {
    const boxRef = useRef<HTMLDivElement>(null);

    // Лента ограничена по высоте и прокручивается внутри себя. Без явной
    // прокрутки вниз сотрудник видит начало переписки, а свой только что
    // отправленный ответ — нет, и делает вывод, что отправка не сработала.
    // Прокручиваем сам контейнер, а не через scrollIntoView: тот тянет за
    // собой и страницу целиком.
    useEffect(() => {
        const box = boxRef.current;

        if (box) box.scrollTop = box.scrollHeight;
    }, [messages.length]);

    return (
        <>
            <div className="border border-default rounded-lg mb-4 overflow-hidden bg-surface" data-test-id="support-timeline">
                <div className="max-h-96 overflow-y-auto px-4 py-3" ref={boxRef} data-test-id="support-timeline-scroll">
                    {messages.length === 0 && (
                        <div className="text-center text-muted text-sm py-4">{t.Support_NoMessages()}</div>
                    )}
                    {messages.map(msg => <SupportMessageBubble key={msg.id} msg={msg} />)}
                </div>
            </div>
            <AssignmentHistory entries={assignmentLog} />
        </>
    );
}
