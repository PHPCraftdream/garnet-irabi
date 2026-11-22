import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {EntityLink} from '../../../../Common/people/EntityLink';
import {userLinks} from '../../../../Common/people/entityLinkHelpers';
import type {CancellationRow} from './AdminCancellationsTab';

interface RowProps {
    row: CancellationRow;
    testIdPrefix: string;
    isModerator: boolean;
    showExpertColumn: boolean;
    showUserColumn: boolean;
}

const CancellationTr: React.FC<RowProps> = ({row, testIdPrefix, isModerator, showExpertColumn, showUserColumn}) => (
    <tr className="admin-booking-table-row" data-test-id={`${testIdPrefix}-row-${row.id}`}>
        <td className="admin-booking-table-cell-nowrap">{formatTs(row.created_at)}</td>
        {showExpertColumn && (
            <td className="admin-booking-table-cell">
                <EntityLink name={row.expert_name} {...userLinks(row.expert_id, row.expert_has_profile)} isModerator={isModerator} />
            </td>
        )}
        {showUserColumn && (
            <td className="admin-booking-table-cell">
                <EntityLink name={row.user_name} {...userLinks(row.user_id, false)} isModerator={isModerator} />
            </td>
        )}
        <td className="admin-booking-table-cell-nowrap">
            {row.slot_time ? formatTs(row.slot_time) : <span className="admin-booking-table-muted">—</span>}
        </td>
        <td className="admin-booking-table-cell">
            {row.booking_id > 0 ? <span className="admin-booking-table-muted">#{row.booking_id}</span> : <span className="admin-booking-table-muted">—</span>}
        </td>
        <td className="admin-booking-table-cell">{row.reason}</td>
    </tr>
);

interface TableProps {
    items: CancellationRow[];
    columns: string[];
    testIdPrefix: string;
    isModerator: boolean;
    showExpertColumn: boolean;
    showUserColumn: boolean;
}

const renderHeading = (column: string, index: number) => <th key={index} className="admin-booking-table-heading">{column}</th>;

export class AdminCancellationsTable extends React.Component<TableProps> {
    private readonly renderRow = (row: CancellationRow) => {
        const {testIdPrefix, isModerator, showExpertColumn, showUserColumn} = this.props;
        return <CancellationTr key={row.id} row={row} testIdPrefix={testIdPrefix} isModerator={isModerator} showExpertColumn={showExpertColumn} showUserColumn={showUserColumn} />;
    };

    public render() {
        const {items, columns} = this.props;
        return (
            <div className="booking-card-shell">
                <div className="admin-booking-table-scroll">
                    <table className="admin-table">
                        <thead>
                            <tr className="admin-booking-table-row">{columns.map(renderHeading)}</tr>
                        </thead>
                        <tbody>{items.map(this.renderRow)}</tbody>
                    </table>
                </div>
            </div>
        );
    }
}
