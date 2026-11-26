import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {AssignmentLogEntry} from '@/Islands/Comms/Support/parts/supportTypes';
import {AdminUserLink} from '@/Common/people/links/EntityLinks';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';

const admin_Ledger_Date = t.Admin_Ledger_Date;
const admin_Ledger_From = t.Admin_Ledger_From;
const admin_Ledger_To = t.Admin_Ledger_To;
const admin_Log_Actor = t.Admin_Log_Actor;

/** Человек или прочерк — кто передал, кому передали. */
const Party: React.FC<{id?: number | null; name?: string | null}> = ({id, name}) => {
    if (!id) return <>{name ?? '—'}</>;

    return <AdminUserLink id={id} name={name ?? `#${id}`} />;
};

const HistoryRow: React.FC<{entry: AssignmentLogEntry}> = ({entry}) => (
    <tr className="admin-support-history-row">
        <td>
            {entry.actor_id > 0 ? <AdminUserLink id={entry.actor_id} name={entry.actor_name} /> : entry.actor_name}
        </td>
        <td className="admin-support-history-party"><Party id={entry.from_id} name={entry.from_name} /></td>
        <td className="admin-support-history-party"><Party id={entry.to_id} name={entry.to_name} /></td>
        <td className="admin-support-history-time">{formatTs(entry.created_at)}</td>
    </tr>
);

    /** Формирует представление данных для соответствующего раздела панели. */
function renderRow(entry: AssignmentLogEntry) {
    return <HistoryRow key={entry.id} entry={entry} />;
}

const HistoryTable: React.FC<{entries: AssignmentLogEntry[]}> = ({entries}) => (
    <div className="admin-support-history-box" data-test-id="support-assignment-history">
        <table className="admin-table">
            <thead>
                <tr>
                    <th>{admin_Log_Actor()}</th>
                    <th>{admin_Ledger_From()}</th>
                    <th>{admin_Ledger_To()}</th>
                    <th>{admin_Ledger_Date()}</th>
                </tr>
            </thead>
            <tbody>
                {entries.map(renderRow)}
            </tbody>
        </table>
    </div>
);

/**
 * Кому передавали обращение. Свёрнута по умолчанию: интересна редко, а места
 * занимает столько же, сколько сама переписка.
 */
export class AssignmentHistory extends AntiHookComponent<{entries: AssignmentLogEntry[]}> {
    private readonly ui = new Carburetor({open: false});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly toggle = () => this.ui.setData({open: !this.ui.getData().open});

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {entries} = this.props;
        const {open} = this.useCarburetor(this.ui);
        if (entries.length === 0) return null;

        return (
            <div className="admin-support-history">
                <button
                    type="button"
                    className="admin-support-history-toggle"
                    onClick={this.toggle}
                    aria-expanded={open}
                    data-test-id="support-assignment-history-toggle"
                >
                    <span className="admin-support-history-chevron">{open ? '\u25BE' : '\u25B8'}</span>
                    {t.Support_AssignmentHistory()} ({entries.length})
                </button>
                {open && <HistoryTable entries={entries} />}
            </div>
        );
    }
}
