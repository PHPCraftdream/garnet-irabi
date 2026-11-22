import {Carburetor} from '@react-carburetor/core';

/**
 * Флаг «идёт отправка» плюс защита от двойного клика.
 *
 * Флаг живёт в сторе ради перерисовки (кнопка блокируется), а защита — в
 * обычном поле: она читается синхронно, до первой перерисовки.
 */
export class SupportSending extends Carburetor<{sending: boolean}> {
    private guard = false;

    constructor() {
        super({sending: false});
    }

    readonly snapshot = () => this.getData();

    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);

        return () => this.unsubscribe(id);
    };

    private patch(changes: Partial<{sending: boolean}>): void {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...changes});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    private readonly setSending = (sending: boolean): void => {
        if (this.getData().sending === sending) return;
        this.patch({sending});
    };

    // Guard читается синхронно, а не из состояния: между быстрыми повторными
    // вызовами (двойной клик/тач) `sending` ещё не успевает обновиться, и оба
    // вызова проходили проверку — один клик отправлял несколько одинаковых
    // запросов подряд.
    readonly withSending = async (fn: () => Promise<void>): Promise<void> => {
        if (this.guard) return;
        this.guard = true;
        this.setSending(true);
        try {
            await fn();
        } finally {
            this.guard = false;
            this.setSending(false);
        }
    };
}
