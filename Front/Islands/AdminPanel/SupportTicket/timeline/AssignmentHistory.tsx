import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {AssignmentLogEntry} from '../../../Support/supportTypes';
import {AdminUserLink} from '../../../../Common/people/EntityLinks';
import {formatTs} from '@common/Utils/Time/DateUtils';

/** Человек или прочерк — кто передал, кому передали. */
const Party: React.FC<{id?: number | null; name?: string | null}> = ({id, name}) => {
    if (!id) return <>{name ?? '—'}</>;

    return <AdminUserLink id={id} name={name ?? `#${id}`} />;
};

const HistoryRow: React.FC<{entry: AssignmentLogEntry}> = ({entry}) => (
    <tr className="hover:bg-surface-hover">
        <td>
            {entry.actor_id > 0 ? <AdminUserLink id={entry.actor_id} name={entry.actor_name} /> : entry.actor_name}
        </td>
        <td className="text-muted"><Party id={entry.from_id} name={entry.from_name} /></td>
        <td className="text-muted"><Party id={entry.to_id} name={entry.to_name} /></td>
        <td className="text-muted text-xs whitespace-nowrap">{formatTs(entry.created_at)}</td>
    </tr>
);

const HistoryTable: React.FC<{entries: AssignmentLogEntry[]}> = ({entries}) => (
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
                {entries.map(entry => <HistoryRow key={entry.id} entry={entry} />)}
            </tbody>
        </table>
    </div>
);

/**
 * Кому передавали обращение. Свёрнута по умолчанию: интересна редко, а места
 * занимает столько же, сколько сама переписка.
 */
export const AssignmentHistory: React.FC<{entries: AssignmentLogEntry[]}> = ({entries}) => {
    const [open, setOpen] = React.useState(false);

    if (entries.length === 0) return null;

    return (
        <div className="mt-4">
            <button
                type="button"
                className="text-sm text-muted hover:text-secondary flex items-center gap-1"
                onClick={() => setOpen(!open)}
                data-test-id="support-assignment-history-toggle"
            >
                <span className="text-xs select-none">{open ? '\u25BE' : '\u25B8'}</span>
                {t.Support_AssignmentHistory()} ({entries.length})
            </button>
            {open && <HistoryTable entries={entries} />}
        </div>
    );
};
