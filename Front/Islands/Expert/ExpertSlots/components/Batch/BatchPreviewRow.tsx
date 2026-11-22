import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {DurationSelect} from '@common/Components/Controls/DurationSelect';
import {ExistingItem, ProposedSlot} from '../../types';
import {BatchPreviewWarnings} from './BatchPreviewWarnings';

export interface RowWarnings {
    existingOverlap: boolean;
    proposedOverlap: boolean;
    outOfRange: boolean;
    pastDate: boolean;
}

function DayItems({items, format}: {items: ExistingItem[]; format: (item: ExistingItem) => string}) {
    const badges: React.ReactNode[] = [];
    for (const item of items) {
        badges.push(<span key={`${item.time}-${item.duration_min}`} className="batch-preview-existing">{format(item)}</span>);
    }
    return <>{badges}</>;
}

interface Props {
    slot: ProposedSlot;
    index: number;
    weekday: string;
    hebrewDate: string;
    startDate: string;
    endDate: string;
    dayItems: ExistingItem[];
    warnings: RowWarnings;
    formatExistingItem: (item: ExistingItem) => string;
    onDateChange: (index: number, value: string) => void;
    onTimeChange: (index: number, value: string) => void;
    onDurationChange: (index: number, value: number) => void;
    onRemove: (index: number) => void;
}

/** Одна предлагаемая строка в партии создаваемых занятий. */
export class BatchPreviewRow extends AntiHookComponent<Props> {
    private readonly changeDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onDateChange(this.props.index, event.target.value);
    };

    private readonly changeTime = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onTimeChange(this.props.index, event.target.value);
    };

    private readonly changeDuration = (value: number) => {
        this.props.onDurationChange(this.props.index, value);
    };

    private readonly remove = () => this.props.onRemove(this.props.index);

    private renderDate() {
        const {slot, index, weekday, startDate, endDate} = this.props;
        return (
            <td className="batch-preview-cell">
                <span className="batch-preview-weekday">{weekday}</span>
                <DateInput
                    className="batch-preview-date-input"
                    value={slot.date}
                    min={startDate}
                    max={endDate}
                    data-index={index}
                    onChange={this.changeDate}
                />
            </td>
        );
    }

    private renderTime() {
        const {slot, index} = this.props;
        return (
            <td className="batch-preview-cell">
                <DateInput
                    type="time"
                    className="slot-time-input"
                    value={slot.time}
                    data-index={index}
                    onChange={this.changeTime}
                />
            </td>
        );
    }

    private renderDuration() {
        const {slot} = this.props;
        return (
            <td className="batch-preview-cell">
                <DurationSelect
                    value={slot.duration}
                    onChange={this.changeDuration}
                    variant="compact"
                    data-test-id="slot-duration-select"
                />
            </td>
        );
    }

    render() {
        const {index, hebrewDate, dayItems, warnings, formatExistingItem} = this.props;
        const hasWarning = warnings.existingOverlap || warnings.proposedOverlap || warnings.outOfRange || warnings.pastDate;

        return (
            <tr data-index={index} className={hasWarning ? 'batch-preview-row-warning' : undefined}>
                {this.renderDate()}
                <td className="batch-preview-cell">{hebrewDate}</td>
                {this.renderTime()}
                {this.renderDuration()}
                <td className="batch-preview-cell"><DayItems items={dayItems} format={formatExistingItem} /></td>
                <td className="batch-preview-cell">
                    <BatchPreviewWarnings {...warnings} />
                    <button
                        type="button"
                        className="slot-remove-btn"
                        title={t.Action_Remove()}
                        data-index={index}
                        onClick={this.remove}
                    >
                        &times;
                    </button>
                </td>
            </tr>
        );
    }
}
