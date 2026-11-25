import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import SendButton from '@common/Components/Controls/SendButton';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {sendPost} from '@common/Api/Send/sendPost';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import {ModalShell} from '../../../../Common/Components/ModalShell';

const batchCancel = t.Batch_Cancel;
const rescheduleNoSlots = t.Reschedule_NoSlots;
const reschedulePickSlot = t.Reschedule_PickSlot;
const rescheduleSubmit = t.Reschedule_Submit;
const userLoading = t.User_Loading;

interface SlotOption {
    id: number;
    start_at: number;
    duration_min: number;
}

interface OptionsResponse {
    options?: SlotOption[];
    error?: string;
}

export interface RescheduleModalProps {
    open: boolean;
    bookingId: number | null;
    sending: boolean;
    /** Внешняя ошибка (отказ сервера на submit) — показывается тем же блоком, что и своя. */
    error?: string;
    onSubmit: (slotId: number) => void;
    onClose: () => void;
}

/**
 * D-193: окно выбора нового времени для уже существующей брони.
 *
 * Список вариантов приходит с сервера уже отфильтрованным (тот же
 * преподаватель, та же цена, свободно, в будущем, без брони этого ученика) —
 * окно не повторяет эти правила на клиенте, только показывает и отправляет
 * выбор.
 */
interface RescheduleState {
    loading: boolean;
    options: SlotOption[];
    loadError: string;
    selectedId: number | null;
}

class RescheduleModalView extends AntiHookComponent<RescheduleModalProps> {
    private readonly ui = new Carburetor<RescheduleState>({
        loading: false, options: [], loadError: '', selectedId: null,
    });

    /** Загружает варианты переноса при открытии окна. */
    componentDidMount() {
        super.componentDidMount();
        this.loadOptions();
    }

    /** Перезагружает варианты при открытии окна или смене брони. */
    componentDidUpdate(previous: RescheduleModalProps) {
        super.componentDidUpdate(previous);
        if (previous.open !== this.props.open || previous.bookingId !== this.props.bookingId) this.loadOptions();
    }

    /** Запрашивает доступные слоты и сохраняет ответ или ошибку загрузки. */
    private readonly loadOptions = () => {
        const {open, bookingId} = this.props;
        if (!open || !bookingId) return;
        this.ui.setData({options: [], selectedId: null, loadError: '', loading: true});
        (async () => {
            try {
                const res = await sendPost<{}, OptionsResponse>(
                    appUrl(`/bookings/id~${bookingId}/~rescheduleOptions`),
                    {},
                );
                const data = ('data' in res && res.data) ? res.data : (res as unknown as OptionsResponse);
                if (data?.error) {
                    this.patch({loadError: data.error});
                    return;
                }
                this.patch({options: data?.options ?? []});
            } catch {
                this.patch({loadError: t.General_Error()});
            } finally {
                this.patch({loading: false});
            }
        })();
    };

    /** Передаёт выбранный слот обработчику переноса. */
    private readonly submit = () => {
        const {selectedId} = this.ui.getData();
        if (selectedId !== null) this.props.onSubmit(selectedId);
    };

    private readonly options = this.connectSelection(this.ui, state => state.options);

    /** Частично обновляет локальное состояние окна переноса. */
    private readonly patch = (patch: Partial<RescheduleState>) => this.ui.setData({...this.ui.getData(), ...patch});
    /** Запоминает идентификатор выбранного варианта. */
    private readonly select = (selectedId: number) => this.patch({selectedId});

    /** Показывает окно выбора, ошибки и доступные временные слоты. */
    render() {
        const {open, sending, error, onClose} = this.props;
        const {loading, loadError, selectedId} = this.useCarburetor(this.ui);
        const options = this.options();
        if (!open) return null;
        const shownError = loadError || error;
        return (
            <ModalShell title={t.Reschedule_Title()} testId="reschedule-modal" onClose={onClose}>
                <p className="reschedule-message" data-test-id="reschedule-modal-free">{t.Reschedule_Free()}</p>
                <p className="reschedule-message" data-tone="warning"
                    data-test-id="reschedule-modal-reconfirm">{t.Reschedule_NeedsReconfirm()}</p>
                <RescheduleStatus shownError={shownError} loading={loading}
                    optionsCount={options.length} loadError={loadError} />
                {!loading && options.length > 0 && (
                    <RescheduleSlotPicker options={options} selectedId={selectedId} onSelect={this.select} />
                )}
                <RescheduleActions sending={sending} selectedId={selectedId} onSubmit={this.submit} onClose={onClose} />
            </ModalShell>
        );
    }
}

/** Отображает окно выбора нового слота, блокируя прокрутку страницы. */
export const RescheduleModal: React.FC<RescheduleModalProps> = (props) => {
    useBodyScrollLock(props.open);
    return <RescheduleModalView {...props} />;
};

interface RescheduleStatusProps {
    shownError: string;
    loading: boolean;
    optionsCount: number;
    loadError: string;
}

const RescheduleStatus: React.FC<RescheduleStatusProps> = ({shownError, loading, optionsCount, loadError}) => (
    <>
        {shownError && (
            <div className="reschedule-message" data-tone="error"
                data-test-id="reschedule-modal-error">{shownError}</div>
        )}

        {loading && (
            <p className="reschedule-status" data-test-id="reschedule-modal-loading">{userLoading()}</p>
        )}

        {!loading && optionsCount === 0 && !loadError && (
            <p className="reschedule-status" data-test-id="reschedule-modal-empty">{rescheduleNoSlots()}</p>
        )}
    </>
);

interface RescheduleOptionProps {
    option: SlotOption;
    checked: boolean;
    onSelect: (id: number) => void;
}

class RescheduleOption extends AntiHookComponent<RescheduleOptionProps> {
    /** Передаёт выбранный идентификатор слота родительскому окну. */
    private readonly select = () => this.props.onSelect(this.props.option.id);

    /** Отображает время и отмечает, выбран ли этот слот. */
    render() {
        const {option, checked} = this.props;
        return (
            <label className="reschedule-option" data-test-id={`reschedule-option-${option.id}`}>
                <input type="radio" name="reschedule-target-slot" checked={checked} onChange={this.select} />
                <span>{formatTs(option.start_at)}</span>
            </label>
        );
    }
}

interface RescheduleSlotPickerProps {
    options: readonly SlotOption[];
    selectedId: number | null;
    onSelect: (id: number) => void;
}

/** Рендерит список радио-кнопок доступных слотов переноса. */
function RescheduleSlotPicker({options, selectedId, onSelect}: RescheduleSlotPickerProps) {
    const rows: React.ReactNode[] = [];
    for (const option of options) {
        rows.push(
            <RescheduleOption key={option.id} option={option}
                checked={selectedId === option.id} onSelect={onSelect} />,
        );
    }
    return (
        <fieldset className="reschedule-picker" data-test-id="reschedule-modal-options">
            <legend className="reschedule-legend">{reschedulePickSlot()}</legend>
            <div className="reschedule-options">{rows}</div>
        </fieldset>
    );
}

interface RescheduleActionsProps {
    sending: boolean;
    selectedId: number | null;
    onSubmit: () => void;
    onClose: () => void;
}

const RescheduleActions: React.FC<RescheduleActionsProps> = ({sending, selectedId, onSubmit, onClose}) => (
    <div className="reschedule-actions">
        <button
            type="button"
            className="reschedule-dismiss"
            onClick={onClose}
            disabled={sending}
            data-test-id="reschedule-modal-dismiss"
        >
            {batchCancel()}
        </button>
        <SendButton
            onClick={onSubmit}
            sending={sending}
            disabled={selectedId === null}
            label={rescheduleSubmit()}
            testId="reschedule-modal-submit"
            variant="outline-warning"
        />
    </div>
);
