import {Carburetor} from '@react-carburetor/core';
import type {ConfirmOptions, ConfirmState} from '@common/hooks/ui/useConfirm';

/**
 * Порт хука useConfirm: состояние модального подтверждения и его callbacks.
 */
export class ConfirmController extends Carburetor<ConfirmState> {
    private resolver: ((value: boolean) => void) | null = null;

    /** Создаёт состояние контроллера. */
    constructor() { super({visible: false, message: '', items: []}); }

    /** Возвращает текущий снимок состояния. */
    readonly snapshot = () => this.getData();

    /** Подписывает слушателя на изменения снимка. */
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    /** Обрабатывает confirm. */
    readonly confirm = (message: string, opts: string[] | ConfirmOptions = []): Promise<boolean> =>
        new Promise<boolean>(resolve => {
            // Как в хуке: повторный вызов перезаписывает резолвер, очередь не вводится.
            this.resolver = resolve;
            if (Array.isArray(opts)) {
                // Массив = items; confirmLabel/variant явно сбрасываются, как при замене состояния в хуке.
                this.patch({visible: true, message, items: opts, confirmLabel: undefined, variant: undefined});
            } else {
                this.patch({
                    visible: true,
                    message,
                    items: opts.items ?? [],
                    confirmLabel: opts.confirmLabel,
                    variant: opts.variant,
                });
            }
        });

    /** Подтверждает действие. */
    readonly handleConfirm = () => {
        this.patch({visible: false});
        this.settle(true);
    };

    /** Отменяет действие. */
    readonly handleCancel = () => {
        this.patch({visible: false});
        this.settle(false);
    };

    /** Завершает ожидание подтверждения. */
    private settle(value: boolean): void {
        this.resolver?.(value);
        this.resolver = null;
    }

    /** Обновляет часть состояния. */
    private patch(changes: Partial<ConfirmState>) {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...changes});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }
}
