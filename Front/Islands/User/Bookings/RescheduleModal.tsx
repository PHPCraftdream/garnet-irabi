import * as React from 'react';
import {useState, useEffect} from 'react';
import SendButton from '@common/Components/Controls/SendButton';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {sendPost} from '@common/Api/Send/sendPost';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import {ModalShell} from '../../../Common/Components/ModalShell';

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
export const RescheduleModal: React.FC<RescheduleModalProps> = ({
    open,
    bookingId,
    sending,
    error,
    onSubmit,
    onClose,
}) => {
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState<SlotOption[]>([]);
    const [loadError, setLoadError] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);

    useBodyScrollLock(open);

    useEffect(() => {
        if (!open || !bookingId) return;
        setOptions([]);
        setSelectedId(null);
        setLoadError('');
        setLoading(true);
        (async () => {
            try {
                const res = await sendPost<{}, OptionsResponse>(
                    appUrl(`/bookings/id~${bookingId}/~rescheduleOptions`),
                    {},
                );
                const data = ('data' in res && res.data) ? res.data : (res as unknown as OptionsResponse);
                if (data?.error) {
                    setLoadError(data.error);
                    return;
                }
                setOptions(data?.options ?? []);
            } catch {
                setLoadError(t.General_Error());
            } finally {
                setLoading(false);
            }
        })();
    }, [open, bookingId]);

    if (!open) return null;

    const shownError = loadError || error;

    return (
        <ModalShell title={t.Reschedule_Title()} testId="reschedule-modal" onClose={onClose}>
            <p className="mb-3 text-sm text-muted" data-test-id="reschedule-modal-free">{t.Reschedule_Free()}</p>
            <p className="mb-3 text-sm text-warning" data-test-id="reschedule-modal-reconfirm">{t.Reschedule_NeedsReconfirm()}</p>

            {shownError && (
                <div className="mb-3 text-sm text-danger" data-test-id="reschedule-modal-error">{shownError}</div>
            )}

            {loading && (
                <p className="text-sm text-muted" data-test-id="reschedule-modal-loading">{t.User_Loading()}</p>
            )}

            {!loading && options.length === 0 && !loadError && (
                <p className="text-sm text-muted" data-test-id="reschedule-modal-empty">{t.Reschedule_NoSlots()}</p>
            )}

            {!loading && options.length > 0 && (
                <fieldset className="mb-4" data-test-id="reschedule-modal-options">
                    <legend className="text-sm text-secondary mb-1">{t.Reschedule_PickSlot()}</legend>
                    <div className="flex flex-col gap-2">
                        {options.map(opt => (
                            <label
                                key={opt.id}
                                className="flex items-center gap-2 cursor-pointer"
                                data-test-id={`reschedule-option-${opt.id}`}
                            >
                                <input
                                    type="radio"
                                    name="reschedule-target-slot"
                                    checked={selectedId === opt.id}
                                    onChange={() => setSelectedId(opt.id)}
                                />
                                <span>{formatTs(opt.start_at)}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}

            <div className="flex gap-2 justify-end">
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onClose}
                    disabled={sending}
                    data-test-id="reschedule-modal-dismiss"
                >
                    {t.Batch_Cancel()}
                </button>
                <SendButton
                    onClick={() => selectedId !== null && onSubmit(selectedId)}
                    sending={sending}
                    disabled={selectedId === null}
                    label={t.Reschedule_Submit()}
                    testId="reschedule-modal-submit"
                    variant="outline-warning"
                />
            </div>
        </ModalShell>
    );
};
