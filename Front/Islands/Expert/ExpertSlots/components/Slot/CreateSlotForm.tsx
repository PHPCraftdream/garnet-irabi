import * as React from 'react';
import {useForm, FieldError, FieldErrors, UseFormRegister} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
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
        <label className="form-label">{label}</label>
        {children}
        {error && <div className="invalid-feedback">{error.message}</div>}
        {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
);

type SlotFormData = {date: string; time: string; duration: number; cost: number; max_users: number; cancellation_penalty_percent: number};

interface SlotRowProps {
    fieldsInfo: IFromFieldsInfo;
    errors: FieldErrors<SlotFormData>;
    register: UseFormRegister<SlotFormData>;
}

const SlotDateTimeRow: React.FC<SlotRowProps> = ({errors, register}) => (
    <div className="grid grid-cols-2 gap-3">
        <SlotField label={t.Slot_Date()} error={errors.date}>
            <DateInput
                className={errors.date ? 'is-invalid' : ''}
                data-test-id="slot-date"
                {...register('date')}
            />
        </SlotField>
        <SlotField label={t.Slot_Time()} error={errors.time}>
            <DateInput
                type="time"
                className={errors.time ? 'is-invalid' : ''}
                data-test-id="slot-time"
                {...register('time')}
            />
        </SlotField>
    </div>
);

const SlotParamsRow: React.FC<SlotRowProps> = ({fieldsInfo, errors, register}) => {
    const durationOpts = getFieldRegisterOptions(fieldsInfo.fields['duration']);
    const costOpts     = getFieldRegisterOptions(fieldsInfo.fields['cost']);
    const maxStudOpts  = getFieldRegisterOptions(fieldsInfo.fields['max_users']);

    return (
        <div className="grid grid-cols-3 gap-3">
            <SlotField label={t.Slot_Duration()} error={errors.duration}>
                <select
                    className={`form-select${errors.duration ? ' is-invalid' : ''}`}
                    data-test-id="slot-duration"
                    {...register('duration', durationOpts)}
                >
                    {[30, 45, 60, 90, 120].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            </SlotField>
            <SlotField label={t.Slot_Cost()} error={errors.cost}>
                <input
                    type="number"
                    className={`form-control${errors.cost ? ' is-invalid' : ''}`}
                    min={0}
                    data-test-id="slot-cost"
                    {...register('cost', costOpts)}
                />
            </SlotField>
            <SlotField label={t.Slot_MaxUsers()} error={errors.max_users}>
                <input
                    type="number"
                    className={`form-control${errors.max_users ? ' is-invalid' : ''}`}
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

export const CreateSlotForm: React.FC<Props> = ({onSuccess, onError, fieldsInfo, defaultPenaltyPercent, onCancel}) => {
    const schema = React.useMemo(
        () => zodFromFieldsInfo(fieldsInfo.fields, fieldsInfo.detailsFields),
        [fieldsInfo],
    );

    const {register, handleSubmit, formState: {errors, isSubmitting}} = useForm<SlotFormData>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(schema) as any,
        defaultValues: {date: getTomorrow(), time: '10:00', duration: 60, cost: 500, max_users: 1, cancellation_penalty_percent: defaultPenaltyPercent},
    });

    const [serverError, setServerError] = React.useState('');

    // is_online/location are held in local state, not in the zod-validated
    // form data: the schema is built from slotFieldsInfo (date/time/duration/
    // cost/max_users/penalty) and would strip unknown keys. Plain state matches
    // how EditSlotModal already handles these fields.
    const [isOnline, setIsOnline] = React.useState(true);
    const [location, setLocation] = React.useState('');

    const onSubmit = async (data: SlotFormData) => {
        setServerError('');
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
                setServerError(resp.error || t.Slot_OverlapError());
            } else {
                const msg = (resp && typeof resp === 'object' && resp.error) ? resp.error : err.message;
                onError(msg);
            }
        }
    };

    const penaltyField = fieldsInfo.fields['cancellation_penalty_percent'];
    const penaltyOpts  = penaltyField ? getFieldRegisterOptions(penaltyField) : {valueAsNumber: true};

    return (
        <form id="createSlotForm" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-3 mb-4">
                <SlotDateTimeRow fieldsInfo={fieldsInfo} errors={errors} register={register} />
                <SlotParamsRow fieldsInfo={fieldsInfo} errors={errors} register={register} />
                <SlotField
                    label={t.Slot_PenaltyPercent()}
                    error={errors.cancellation_penalty_percent}
                    hint={t.Slot_PenaltyHelp()}
                >
                    <input
                        type="number"
                        className={`form-control${errors.cancellation_penalty_percent ? ' is-invalid' : ''}`}
                        min={0}
                        max={100}
                        data-test-id="slot-penalty-percent"
                        {...register('cancellation_penalty_percent', penaltyOpts)}
                    />
                </SlotField>
                <SlotFormatFields
                    isOnline={isOnline}
                    location={location}
                    onIsOnlineChange={setIsOnline}
                    onLocationChange={setLocation}
                    idPrefix="slot"
                />
            </div>
            {serverError && (
                <div className="mb-3 text-sm text-danger">{serverError}</div>
            )}
            <div className="flex gap-2 justify-end">
                {onCancel && (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onCancel}
                        disabled={isSubmitting}
                    >
                        {t.Batch_Cancel()}
                    </button>
                )}
                <button
                    type="submit"
                    className="btn btn-success"
                    data-test-id="create-slot-btn"
                    disabled={isSubmitting}
                >
                    {t.Slot_Create()}
                </button>
            </div>
        </form>
    );
};
