import * as React from 'react';
import {useState, useEffect} from 'react';
import SendButton from '@common/Components/Controls/SendButton';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {ModalShell} from './ModalShell';

/**
 * Окно «подтвердите действие и напишите причину».
 *
 * Было написано заново в четырёх местах — дважды в списке броней, в календаре
 * преподавателя и в карточке занятия, — и каждая копия несла своё состояние,
 * свою проверку на пустую причину, свой обработчик Escape и свой блок
 * последствий. Цена россыпи оказалась не теоретической: правку названий
 * действий приняла одна копия, а вторую нашли нетронутой уже на боевом.
 *
 * Компонент отвечает только за причину и за кнопки. Что написано в заголовке
 * и в предупреждении, решает вызывающий — обычно через
 * `Front/Common/booking/bookingAction`.
 */

interface FieldProps {
    label: string;
    placeholder?: string;
    value: string;
    testId: string;
    onChange: (v: string) => void;
}

/**
 * Поле причины. Оно обязательное — и это должно быть видно ДО нажатия.
 *
 * Выглядело как обычный необязательный textarea, и нажатие на кнопку без
 * заполнения давало тихий отказ: подсказка «Укажите причину» появлялась
 * только постфактум (нашла user-6). Звёздочка и `required` дешевле, чем
 * сообщение об ошибке после действия.
 */
const ReasonField: React.FC<FieldProps> = ({label, placeholder, value, testId, onChange}) => (
    <div className="mb-4">
        <label className="text-sm text-secondary mb-1 block">
            {label} <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <textarea
            className="form-control"
            rows={3}
            required
            aria-required="true"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            data-test-id={`${testId}-reason`}
        />
    </div>
);

interface FooterProps {
    submitLabel: string;
    sending: boolean;
    testId: string;
    onSubmit: () => void;
    onClose: () => void;
}

const ReasonFooter: React.FC<FooterProps> = ({submitLabel, sending, testId, onSubmit, onClose}) => (
    <div className="flex gap-2 justify-end">
        <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={sending}
            data-test-id={`${testId}-dismiss`}
        >
            {t.Batch_Cancel()}
        </button>
        <SendButton
            onClick={onSubmit}
            sending={sending}
            label={submitLabel}
            testId={`${testId}-submit`}
            variant="outline-warning"
        />
    </div>
);

export interface ReasonModalProps {
    open: boolean;
    title: string;
    /** Предупреждение о последствиях — то, ради чего окно вообще открывают. */
    impact?: string;
    /** Произвольный блок между предупреждением и полем: суммы, сроки, детали. */
    details?: React.ReactNode;
    reasonLabel: string;
    reasonPlaceholder?: string;
    /** Причина обязательна: пустую не пропускаем и говорим об этом. */
    reasonRequired?: boolean;
    requiredMessage?: string;
    submitLabel: string;
    sending?: boolean;
    /** Внешняя ошибка (отказ сервера) — показывается там же, где своя. */
    error?: string;
    testId: string;
    onSubmit: (reason: string) => void;
    onClose: () => void;
}

export const ReasonModal: React.FC<ReasonModalProps> = ({
    open,
    title,
    impact,
    details,
    reasonLabel,
    reasonPlaceholder,
    reasonRequired = true,
    requiredMessage,
    submitLabel,
    sending = false,
    error,
    testId,
    onSubmit,
    onClose,
}) => {
    const [reason, setReason] = useState('');
    const [reasonError, setReasonError] = useState('');

    useBodyScrollLock(open);

    // Каждое открытие начинается с чистого листа: иначе прошлая причина и
    // прошлая ошибка достаются следующей брони.
    useEffect(() => {
        if (open) {
            setReason('');
            setReasonError('');
        }
    }, [open]);

    if (!open) return null;

    const handleChange = (v: string) => {
        setReason(v);
        setReasonError('');
    };

    const handleSubmit = () => {
        const trimmed = reason.trim();
        if (reasonRequired && !trimmed) {
            setReasonError(requiredMessage || t.Booking_RejectReasonRequired());
            return;
        }
        onSubmit(trimmed);
    };

    const shownError = reasonError || error;

    return (
        <ModalShell title={title} testId={testId} onClose={onClose}>
            {impact && <div className="mb-3 text-sm text-warning" data-test-id={`${testId}-impact`}>{impact}</div>}
            {details}
            {shownError && <div className="mb-3 text-sm text-danger" data-test-id={`${testId}-error`}>{shownError}</div>}
            <ReasonField
                label={reasonLabel}
                placeholder={reasonPlaceholder}
                value={reason}
                testId={testId}
                onChange={handleChange}
            />
            <ReasonFooter
                submitLabel={submitLabel}
                sending={sending}
                testId={testId}
                onSubmit={handleSubmit}
                onClose={onClose}
            />
        </ModalShell>
    );
};
