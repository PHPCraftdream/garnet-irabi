import * as React from 'react';
import {useEffect, useState} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {D} from '@common/Debug/D';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../Common/statusHelpers';

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
export default function TicketClientContext({ticketId, clientContextUrl}: Props) {
    const [data, setData] = useState<ClientContextData | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!clientContextUrl) return;
        setData(null);
        setFailed(false);
        sendPost(clientContextUrl, {ticket_id: ticketId}).then((r: any) => {
            if (!r || r.error) { setFailed(true); return; }
            setData(r as ClientContextData);
        }).catch((err) => {
            D('support.error', {action: 'clientContext', ticketId, error: err});
            setFailed(true);
        });
    }, [ticketId, clientContextUrl]);

    if (!clientContextUrl || failed) return null;
    if (!data) return null;

    const hasAnything = data.bookings.length > 0 || data.ledger.length > 0;

    return (
        <div className="admin-detail-section" data-test-id="ticket-client-context">
            <div className="admin-detail-section-title">
                {t.Support_ClientContextTitle()}
                <span className="ms-2 text-muted" data-test-id="ticket-client-balance">
                    {t.Balance_Current()}: {data.balance} &#8381;
                </span>
            </div>

            {!hasAnything && (
                <div className="text-muted text-sm" data-test-id="ticket-client-empty">
                    {t.Support_ClientContextEmpty()}
                </div>
            )}

            {data.bookings.length > 0 && (
                <ul className="admin-detail-list" data-test-id="ticket-client-bookings">
                    {data.bookings.map(b => (
                        <li key={b.id} className="text-sm" data-test-id={`ticket-client-booking-${b.id}`}>
                            <strong>#{b.id}</strong>{' '}
                            {b.start_at > 0 ? formatTs(b.start_at) : '—'}
                            {b.duration_min > 0 && <>, {b.duration_min} {t.Slot_Duration_Min()}</>}
                            {b.expert_name && <>, {b.expert_name}</>}
                            {', '}{b.cost} &#8381;
                            {b.is_group && <> · {t.User_Group()}</>}
                            {' · '}<span className="text-muted">{translateStatus(b.status)}</span>
                        </li>
                    ))}
                </ul>
            )}

            {data.ledger.length > 0 && (
                <ul className="admin-detail-list" data-test-id="ticket-client-ledger">
                    {data.ledger.map(e => (
                        <li key={e.id} className="text-sm" data-test-id={`ticket-client-ledger-${e.id}`}>
                            {formatTs(e.created_at)}{': '}
                            {/* Знак — первое, что ищут глазами в вопросе про деньги. */}
                            <strong>{e.is_credit ? '+' : '−'}{e.amount} &#8381;</strong>
                            {e.note && <> — {e.note}</>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
