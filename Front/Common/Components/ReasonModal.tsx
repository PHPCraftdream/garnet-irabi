import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {ModalShell} from './ModalShell';

const batchCancel = t.Batch_Cancel;

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
 * `Front/Common/booking/actions/rules/bookingAction`.
 */

interface FieldProps {
    label: string;
    placeholder?: string;
    value: string;
    testId: string;
    onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
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
    <div className="reason-modal-field">
        <label className="booking-cancel-label">
            {label} <span className="booking-cancel-error" aria-hidden="true">*</span>
        </label>
        <textarea
            className="booking-cancel-input"
            rows={3}
            required
            aria-required="true"
            value={value}
            onChange={onChange}
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
    <div className="booking-cancel-actions">
        <button
            type="button"
            className="confirm-modal-cancel"
            onClick={onClose}
            disabled={sending}
            data-test-id={`${testId}-dismiss`}
        >
            {batchCancel()}
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

interface ReasonState {reason: string; reasonError: string}

/** Рисует уведомление о последствиях действия. */
function renderImpact(impact: React.ReactNode, testId: string) {
    if (!impact) return null;
    return (
        <div className="reason-modal-notice" data-tone="warning" data-test-id={`${testId}-impact`}>
            {impact}
        </div>
    );
}

/** Рисует сообщение об ошибке формы. */
function renderError(error: string | undefined, testId: string) {
    if (!error) return null;
    return (
        <div className="reason-modal-notice" data-tone="error" data-test-id={`${testId}-error`}>
            {error}
        </div>
    );
}

class ReasonModalView extends AntiHookComponent<ReasonModalProps> {
    private readonly ui = new Carburetor<ReasonState>({reason: '', reasonError: ''});

    /** Обновляет причину и очищает сообщение об ошибке. */
    private readonly handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.ui.setData({reason: event.currentTarget.value, reasonError: ''});
    };

    /** Проверяет причину и вызывает обработчик отправки. */
    private readonly handleSubmit = () => {
        const {reasonRequired = true, requiredMessage, onSubmit} = this.props;
        const state = this.ui.getData();
        const trimmed = state.reason.trim();
        if (reasonRequired && !trimmed) {
            this.ui.setData({...state, reasonError: requiredMessage || t.Booking_RejectReasonRequired()});
            return;
        }
        onSubmit(trimmed);
    };

    /** Рисует форму подтверждения действия и её пояснения. */
    render() {
        const {
            title, impact, details, reasonLabel, reasonPlaceholder, submitLabel,
            sending = false, error, testId, onClose,
        } = this.props;
        const {reason, reasonError} = this.useCarburetor(this.ui);
        const shownError = reasonError || error;
        return (
            <ModalShell title={title} testId={testId} onClose={onClose}>
                {renderImpact(impact, testId)}
                {details}
                {renderError(shownError, testId)}
                <ReasonField
                    label={reasonLabel}
                    placeholder={reasonPlaceholder}
                    value={reason}
                    testId={testId}
                    onChange={this.handleChange}
                />
                <ReasonFooter
                    submitLabel={submitLabel}
                    sending={sending}
                    testId={testId}
                    onSubmit={this.handleSubmit}
                    onClose={onClose}
                />
            </ModalShell>
        );
    }
}

/**
 * Запирает прокрутку страницы, пока окно открыто.
 *
 * Сохраняем прежнее значение `overflow`: у вложенных окон второе запоминает
 * `'hidden'`, поэтому при закрытии вернёт `'hidden'`, а не исходное значение.
 */
export class ReasonModal extends AntiHookComponent<ReasonModalProps> {
    /** Блокирует прокрутку, пока окно открыто. */
    private readonly lockBody = () => {
        if (!this.props.open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    };

/** Подключает блокировку прокрутки к состоянию окна. */
    protected useEffects(): void {
        this.useEffect(this.lockBody, [this.props.open]);
    }

/** Показывает содержимое только при открытом окне. */
    render() {
        return this.props.open ? <ReasonModalView {...this.props} /> : null;
    }
}
