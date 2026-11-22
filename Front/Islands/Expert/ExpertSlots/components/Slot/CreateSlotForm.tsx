import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {useForm, FieldError, FieldErrors, UseFormRegister, UseFormHandleSubmit} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {zodFromFieldsInfo, getFieldRegisterOptions} from '@common/Utils/Data/zodFromFieldsInfo';
import {IFromFieldsInfo} from '@common/Dom/GridTable/Models';
import {createSlot} from '../../api';
import {DateInput} from '@common/Components/ui/DateInput';

import {Slot} from '../../types';
import {SlotFormatFields} from './SlotFormatFields';

function getTomorrow(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface SlotFieldProps {
    label: string;
    error?: FieldError;
    hint?: string;
    children: React.ReactNode;
}

const SlotField: React.FC<SlotFieldProps> = ({label, error, hint, children}) => (
    <div>
        <label className="slot-format-label">{label}</label>
        {children}
        {error && <div className="invalid-feedback" data-slot-error="field">{error.message}</div>}
        {hint && <div className="slot-format-hint">{hint}</div>}
    </div>
);

type SlotFormData = {date: string; time: string; duration: number; cost: number; max_users: number; cancellation_penalty_percent: number};

interface SlotRowProps {
    fieldsInfo: IFromFieldsInfo;
    errors: FieldErrors<SlotFormData>;
    register: UseFormRegister<SlotFormData>;
}

const SlotDateTimeRow: React.FC<SlotRowProps> = ({errors, register}) => (
    <div className="create-slot-dates">
        <SlotField label={t.Slot_Date()} error={errors.date}>
            <DateInput
                className={errors.date ? 'is-invalid' : undefined}
                aria-invalid={!!errors.date}
                data-slot-input="date-time"
                data-test-id="slot-date"
                {...register('date')}
            />
        </SlotField>
        <SlotField label={t.Slot_Time()} error={errors.time}>
            <DateInput
                type="time"
                className={errors.time ? 'is-invalid' : undefined}
                aria-invalid={!!errors.time}
                data-slot-input="date-time"
                data-test-id="slot-time"
                {...register('time')}
            />
        </SlotField>
    </div>
);

const DURATION_OPTIONS = [30, 45, 60, 90, 120].map(renderDurationOption);

function renderDurationOption(value: number) {
    return <option key={value} value={value}>{value}</option>;
}

const SlotParamsRow: React.FC<SlotRowProps> = ({fieldsInfo, errors, register}) => {
    const durationOpts = getFieldRegisterOptions(fieldsInfo.fields['duration']);
    const costOpts     = getFieldRegisterOptions(fieldsInfo.fields['cost']);
    const maxStudOpts  = getFieldRegisterOptions(fieldsInfo.fields['max_users']);

    return (
        <div className="create-slot-params">
            <SlotField label={t.Slot_Duration()} error={errors.duration}>
                <select
                    className="create-slot-select"
                    aria-invalid={!!errors.duration}
                    data-test-id="slot-duration"
                    {...register('duration', durationOpts)}
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
                    {...register('cost', costOpts)}
                />
            </SlotField>
            <SlotField label={t.Slot_MaxUsers()} error={errors.max_users}>
                <input
                    type="number"
                    className="slot-format-location"
                        aria-invalid={!!errors.max_users}
                    min={1}
                    data-test-id="slot-max-users"
                    {...register('max_users', maxStudOpts)}
                />
            </SlotField>
        </div>
    );
};

interface Props {
    onSuccess: (newSlot?: Slot) => void;
    onError: (msg: string) => void;
    fieldsInfo: IFromFieldsInfo;
    defaultPenaltyPercent: number;
    onCancel?: () => void;
}

export function CreateSlotForm(props: Props) {
    const {fieldsInfo, defaultPenaltyPercent} = props;
    const schema = zodFromFieldsInfo(fieldsInfo.fields, fieldsInfo.detailsFields) as unknown as z.ZodType<SlotFormData, SlotFormData>;

    const {register, handleSubmit, formState: {errors, isSubmitting}} = useForm<SlotFormData>({
        resolver: zodResolver(schema),
        defaultValues: {date: getTomorrow(), time: '10:00', duration: 60, cost: 500, max_users: 1, cancellation_penalty_percent: defaultPenaltyPercent},
    });

    return <CreateSlotFormView {...props} register={register} errors={errors} isSubmitting={isSubmitting} handleSubmit={handleSubmit} />;
}

interface ViewProps extends Props, SlotRowProps {
    isSubmitting: boolean;
    handleSubmit: UseFormHandleSubmit<SlotFormData>;
}

class CreateSlotFormView extends AntiHookComponent<ViewProps> {
    // Формат и место не входят в Zod-схему полей слота.
    private readonly form = new Carburetor({serverError: '', isOnline: true, location: ''});

    private updateForm(patch: Partial<ReturnType<typeof this.form.getData>>): void {
        this.form.setData({...this.form.getData(), ...patch});
    }

    private readonly changeOnline = (isOnline: boolean) => this.updateForm({isOnline});
    private readonly changeLocation = (location: string) => this.updateForm({location});
    private readonly handleSubmit = (event: React.FormEvent<HTMLFormElement>) => this.props.handleSubmit(this.submit)(event);

    private readonly submit = async (data: SlotFormData) => {
        const {onSuccess, onError} = this.props;
        const {isOnline, location} = this.form.getData();
        this.updateForm({serverError: ''});
        D('teaching.slot.submit', {date: data.date, time: data.time, cost: data.cost});
        try {
            const result = await createSlot({
                date: data.date,
                time: data.time,
                duration: data.duration,
                cost: data.cost,
                max_users: data.max_users,
                cancellation_penalty_percent: data.cancellation_penalty_percent,
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
            const resp = err?.response;
            if (resp && typeof resp === 'object' && resp.overlap) {
                this.updateForm({serverError: resp.error || t.Slot_OverlapError()});
            } else {
                const msg = (resp && typeof resp === 'object' && resp.error) ? resp.error : err.message;
                onError(msg);
            }
        }
    };

    private renderPenaltyField() {
        const {fieldsInfo, errors, register} = this.props;
        const penaltyField = fieldsInfo.fields['cancellation_penalty_percent'];
        const penaltyOpts = penaltyField ? getFieldRegisterOptions(penaltyField) : {valueAsNumber: true};
        return (
            <SlotField label={t.Slot_PenaltyPercent()} error={errors.cancellation_penalty_percent} hint={t.Slot_PenaltyHelp()}>
                <input
                    type="number"
                    className="slot-format-location"
                    aria-invalid={!!errors.cancellation_penalty_percent}
                    min={0}
                    max={100}
                    data-test-id="slot-penalty-percent"
                    {...register('cancellation_penalty_percent', penaltyOpts)}
                />
            </SlotField>
        );
    }

    private renderActions() {
        const {onCancel, isSubmitting} = this.props;
        return (
            <div className="batch-preview-actions">
                {onCancel && (
                    <button type="button" className="confirm-modal-cancel" onClick={onCancel} disabled={isSubmitting}>
                        {t.Batch_Cancel()}
                    </button>
                )}
                <button type="submit" className="confirm-modal-success" data-test-id="create-slot-btn" disabled={isSubmitting}>
                    {t.Slot_Create()}
                </button>
            </div>
        );
    }

    // RHF может менять содержимое errors, оставляя прежнюю ссылку.
    shouldComponentUpdate(nextProps: Readonly<ViewProps>, nextState: typeof this.state): boolean {
        return super.shouldComponentUpdate(nextProps, nextState) || this.props !== nextProps;
    }

    render() {
        const {fieldsInfo, errors, register} = this.props;
        const {serverError, isOnline, location} = this.useCarburetor(this.form);
        return (
            <form id="createSlotForm" onSubmit={this.handleSubmit} noValidate>
                <div className="batch-form-fields">
                    <SlotDateTimeRow fieldsInfo={fieldsInfo} errors={errors} register={register} />
                    <SlotParamsRow fieldsInfo={fieldsInfo} errors={errors} register={register} />
                    {this.renderPenaltyField()}
                    <SlotFormatFields
                        isOnline={isOnline}
                        location={location}
                        onIsOnlineChange={this.changeOnline}
                        onLocationChange={this.changeLocation}
                        idPrefix="slot"
                    />
                </div>
                {serverError && <div className="invalid-feedback" data-slot-error="server">{serverError}</div>}
                {this.renderActions()}
            </form>
        );
    }
}
