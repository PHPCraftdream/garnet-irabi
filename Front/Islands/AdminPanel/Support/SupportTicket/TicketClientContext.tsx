import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../../Common/booking/status/statusHelpers';

export interface ClientBooking {
    id: number;
    status: string;
    start_at: number;
    duration_min: number;
    cost: number;
    expert_name: string;
    is_group: boolean;
}

export interface ClientLedgerEntry {
    id: number;
    is_credit: boolean;
    amount: number;
    entry_type: string;
    note: string;
    created_at: number;
}

interface ClientContextData {
    balance: number;
    bookings: ClientBooking[];
    ledger: ClientLedgerEntry[];
}

interface Props {
    ticketId: number;
    clientContextUrl?: string;
}

/**
 * D-209: чем живёт человек, который написал в поддержку.
 *
 * Обращение знало, кто его написал, и показывало только имя. Чтобы ответить
 * на «что с моей бронью» или «куда делись деньги», модератор уходил в раздел
 * «Брони» и искал там по имени — на каждое обращение заново. Контраст замерен
 * в том же цикле: там, где данные под рукой, ответ занимает 2–6 минут и ни
 * одного переспроса.
 *
 * Пять последних занятий и пять последних движений денег — ровно столько,
 * чтобы узнать ту самую бронь и увидеть списание с возвратом. Длинный список
 * здесь пришлось бы читать глазами, и находка вернулась бы в другом виде.
 */
function renderBooking(b: ClientBooking) {
    return (
        <li key={b.id} className="admin-client-context-line" data-test-id={`ticket-client-booking-${b.id}`}>
        <strong>#{b.id}</strong>{' '}
        {b.start_at > 0 ? formatTs(b.start_at) : '—'}
        {b.duration_min > 0 && <>, {b.duration_min} {t.Slot_Duration_Min()}</>}
        {b.expert_name && <>, {b.expert_name}</>}
        {', '}{b.cost} &#8381;
        {b.is_group && <> · {t.User_Group()}</>}
        {' · '}<span className="admin-support-history-party">{translateStatus(b.status)}</span>
        </li>
    );
}

    /** Формирует представление данных для соответствующего раздела панели. */
function renderEntry(e: ClientLedgerEntry) {
    return (
        <li key={e.id} className="admin-client-context-line" data-test-id={`ticket-client-ledger-${e.id}`}>
        {formatTs(e.created_at)}{': '}
        {/* Знак — первое, что ищут глазами в вопросе про деньги. */}
        <strong>{e.is_credit ? '+' : '−'}{e.amount} &#8381;</strong>
        {e.note && <> — {e.note}</>}
        </li>
    );
}

export default class TicketClientContext extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor<{data: ClientContextData | null}>({data: null});
    private requestId = 0;

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        void this.load();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidUpdate(previous: Readonly<Props>): void {
        super.componentDidUpdate(previous);
        if (previous.ticketId !== this.props.ticketId || previous.clientContextUrl !==
        this.props.clientContextUrl) void this.load();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        this.requestId++;
        super.componentWillUnmount();
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private async load(): Promise<void> {
        const requestId = ++this.requestId;
        const {ticketId, clientContextUrl} = this.props;
        this.ui.setData({data: null});
        if (!clientContextUrl) return;
        try {
            const result = await sendPost(clientContextUrl, {ticket_id: ticketId}) as unknown as
        (ClientContextData & {error?: string}) | null;
            if (requestId === this.requestId && result && !result.error) this.ui.setData({data: result});
        } catch (error) {
            if (requestId === this.requestId) D('support.error', {action: 'clientContext', ticketId, error});
        }
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {data} = this.useCarburetor(this.ui);
        if (!this.props.clientContextUrl || !data) return null;
        const hasAnything = data.bookings.length > 0 || data.ledger.length > 0;

        return (
            <div className="admin-client-context" data-test-id="ticket-client-context">
                <div className="admin-client-context-title">
                    {t.Support_ClientContextTitle()}
                    <span className="admin-client-context-balance" data-test-id="ticket-client-balance">
                        {t.Balance_Current()}: {data.balance} &#8381;
                    </span>
                </div>

                {!hasAnything && (
                    <div className="admin-client-context-empty" data-test-id="ticket-client-empty">
                        {t.Support_ClientContextEmpty()}
                    </div>
                )}

                {data.bookings.length > 0 && (
                    <ul className="admin-client-context-list" data-test-id="ticket-client-bookings">
                        {data.bookings.map(renderBooking)}
                    </ul>
                )}

                {data.ledger.length > 0 && (
                    <ul className="admin-client-context-list" data-test-id="ticket-client-ledger">
                        {data.ledger.map(renderEntry)}
                    </ul>
                )}
            </div>
        );
    }
}
