import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {zodFromFieldsInfo, getFieldRegisterOptions} from '@common/Utils/Data/zodFromFieldsInfo';
import {IFromFieldsInfo} from '@common/Dom/GridTable/Models';
import {createSlot} from '../../api';
import {DateInput} from '@common/Components/ui/DateInput';

const INVALID_FIELD = <input className="slot-field-invalid" />;

import {Slot} from '../../types';
import {SlotFormatFields} from './SlotFormatFields';

type Name = 'date' | 'time' | 'duration' | 'cost' | 'max_users' | 'cancellation_penalty_percent';
type Values = Record<Name, string | number>;
type FieldErrors = Partial<Record<Name, string>>;

const FIELD_NAMES: Name[] = ['date', 'time', 'duration', 'cost', 'max_users', 'cancellation_penalty_percent'];

function toNumber(raw: string): number {
    // Как valueAsNumber в master: пустая строка — NaN, а не 0.
    return raw === '' ? NaN : Number(raw);
}

/** Ошибки читаются в render владельца: подписка покрывает только прочитанные в нём пути. */
function readErrors(errors: FieldErrors): FieldErrors {
    return {
        date: errors.date,
        time: errors.time,
        duration: errors.duration,
        cost: errors.cost,
        max_users: errors.max_users,
        cancellation_penalty_percent: errors.cancellation_penalty_percent,
    };
}

function focusFirstError(form: HTMLFormElement, errors: FieldErrors): void {
    for (const name of FIELD_NAMES) {
        if (!errors[name]) continue;
        form.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
        return;
    }
}

interface FormState {
    errors: FieldErrors;
    serverError: string;
    isOnline: boolean;
    location: string;
    submitting: boolean;
    submitted: boolean;
}

function getTomorrow(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface SlotFieldProps {
    label: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}

const SlotField: React.FC<SlotFieldProps> = ({label, error, hint, children}) => (
    <div>
        <label className="slot-format-label">{label}</label>
        {children}
        {error && <div className="invalid-feedback" data-slot-error="field">{error}</div>}
        {hint && <div className="slot-format-hint">{hint}</div>}
    </div>
);

interface SlotRowProps {
    errors: FieldErrors;
}

const SlotDateTimeRow: React.FC<SlotRowProps> = ({errors}) => (
    <div className="create-slot-dates">
        <SlotField label={t.Slot_Date()} error={errors.date}>
            <DateInput
                field={errors.date ? INVALID_FIELD : undefined}
                aria-invalid={!!errors.date}
                data-slot-input="date-time"
                data-test-id="slot-date"
                name="date"
                defaultValue={getTomorrow()}
            />
        </SlotField>
        <SlotField label={t.Slot_Time()} error={errors.time}>
            <DateInput
                type="time"
                field={errors.time ? INVALID_FIELD : undefined}
                aria-invalid={!!errors.time}
                data-slot-input="date-time"
                data-test-id="slot-time"
                name="time"
                defaultValue="10:00"
            />
        </SlotField>
    </div>
);

const DURATION_OPTIONS = [30, 45, 60, 90, 120].map(renderDurationOption);

function renderDurationOption(value: number) {
    return <option key={value} value={value}>{value}</option>;
}

const SlotParamsRow: React.FC<SlotRowProps> = ({errors}) => (
    <div className="create-slot-params">
        <SlotField label={t.Slot_Duration()} error={errors.duration}>
            <select
                className="create-slot-select"
                aria-invalid={!!errors.duration}
                data-test-id="slot-duration"
                name="duration"
                defaultValue={60}
            >
                {DURATION_OPTIONS}
            </select>
        </SlotField>
        <SlotField label={t.Slot_Cost()} error={errors.cost}>
            <input
                type="number"
                className="slot-format-location"
                aria-invalid={!!errors.cost}
                min={0}
                data-test-id="slot-cost"
                name="cost"
                defaultValue={500}
            />
        </SlotField>
        <SlotField label={t.Slot_MaxUsers()} error={errors.max_users}>
            <input
                type="number"
                className="slot-format-location"
                aria-invalid={!!errors.max_users}
                min={1}
                data-test-id="slot-max-users"
                name="max_users"
                defaultValue={1}
            />
        </SlotField>
    </div>
);

interface Props {
    onSuccess: (newSlot?: Slot) => void;
    onError: (msg: string) => void;
    fieldsInfo: IFromFieldsInfo;
    defaultPenaltyPercent: number;
    onCancel?: () => void;
}

export class CreateSlotForm extends AntiHookComponent<Props> {
    private readonly schema = zodFromFieldsInfo(this.props.fieldsInfo.fields, this.props.fieldsInfo.detailsFields);
    private readonly ui = new Carburetor<FormState>({
        errors: {},
        serverError: '',
        isOnline: true,
        location: '',
        submitting: false,
        submitted: false,
    });

    private patch(changes: Partial<FormState>): void {
        this.ui.setData({...this.ui.getData(), ...changes});
    }

    private readonly changeOnline = (isOnline: boolean) => this.patch({isOnline});
    private readonly changeLocation = (location: string) => this.patch({location});

    private readValues(form: HTMLFormElement): Values {
        const data = new FormData(form);
        const values: Values = {date: '', time: '', duration: 0, cost: 0, max_users: 0, cancellation_penalty_percent: 0};
        for (const name of FIELD_NAMES) {
            const raw = String(data.get(name) ?? '');
            // Как в master: у поля штрафа опции регистрации брались с этим fallback.
            const field = this.props.fieldsInfo.fields[name];
            const options = field ? getFieldRegisterOptions(field) : {valueAsNumber: true};
            values[name] = options.valueAsNumber === true ? toNumber(raw) : raw;
        }
        return values;
    }

    private validate(values: Values): FieldErrors {
        const parsed = this.schema.safeParse(values);
        if (parsed.success) return {};
        const out: FieldErrors = {};
        for (const issue of parsed.error.issues) {
            const key = String(issue.path[0]) as Name;
            if (key && !out[key]) out[key] = issue.message;
        }
        return out;
    }

    private readonly handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = this.readValues(form);
        const errors = this.validate(values);
        this.patch({submitted: true, errors});
        if (Object.keys(errors).length) {
            focusFirstError(form, errors);
            return;
        }
        void this.send(values);
    };

    private readonly handleChange = (event: React.FormEvent<HTMLFormElement>) => {
        if (!this.ui.getData().submitted) return;
        const values = this.readValues(event.currentTarget);
        this.patch({errors: this.validate(values)});
    };

    private async send(values: Values): Promise<void> {
        const {onSuccess, onError} = this.props;
        const {isOnline, location} = this.ui.getData();
        this.patch({serverError: '', submitting: true});
        D('teaching.slot.submit', {date: values.date, time: values.time, cost: values.cost});
        try {
            const result = await createSlot({
                date: String(values.date),
                time: String(values.time),
                duration: Number(values.duration),
                cost: Number(values.cost),
                max_users: Number(values.max_users),
                cancellation_penalty_percent: Number(values.cancellation_penalty_percent),
                is_online: isOnline,
                location,
            });
            if (result.success) {
                D('teaching.slot.created', {slotId: result.slot_id});
                onSuccess(result.slot);
            } else {
                D('teaching.error', {action: 'createSlot', error: result.error});
                onError(result.error || t.General_Error());
            }
        } catch (err: any) {
            D('teaching.error', {action: 'createSlot', error: err.message});
            // Extract overlap error from ApiError response
            const response = err?.response;
            if (response && typeof response === 'object' && response.overlap) {
                this.patch({serverError: response.error || t.Slot_OverlapError()});
            } else {
                onError((response && typeof response === 'object' && response.error) ? response.error : err.message);
            }
        } finally {
            this.patch({submitting: false});
        }
    }

    private renderPenaltyField(errors: FieldErrors) {
        return (
            <SlotField label={t.Slot_PenaltyPercent()} error={errors.cancellation_penalty_percent} hint={t.Slot_PenaltyHelp()}>
                <input
                    type="number"
                    className="slot-format-location"
                    aria-invalid={!!errors.cancellation_penalty_percent}
                    min={0}
                    max={100}
                    data-test-id="slot-penalty-percent"
                    name="cancellation_penalty_percent"
                    defaultValue={this.props.defaultPenaltyPercent}
                />
            </SlotField>
        );
    }

    private renderActions(submitting: boolean) {
        const {onCancel} = this.props;
        return (
            <div className="batch-preview-actions">
                {onCancel && (
                    <button type="button" className="confirm-modal-cancel" onClick={onCancel} disabled={submitting}>
                        {t.Batch_Cancel()}
                    </button>
                )}
                <button type="submit" className="confirm-modal-success" data-test-id="create-slot-btn" disabled={submitting}>
                    {t.Slot_Create()}
                </button>
            </div>
        );
    }

    render() {
        const state = this.useCarburetor(this.ui);
        const errors = readErrors(state.errors);
        return (
            <form id="createSlotForm" noValidate onSubmit={this.handleSubmit} onChange={this.handleChange}>
                <div className="batch-form-fields">
                    <SlotDateTimeRow errors={errors} />
                    <SlotParamsRow errors={errors} />
                    {this.renderPenaltyField(errors)}
                    <SlotFormatFields
                        isOnline={state.isOnline}
                        location={state.location}
                        onIsOnlineChange={this.changeOnline}
                        onLocationChange={this.changeLocation}
                        idPrefix="slot"
                    />
                </div>
                {state.serverError && <div className="invalid-feedback" data-slot-error="server">{state.serverError}</div>}
                {this.renderActions(state.submitting)}
            </form>
        );
    }
}
