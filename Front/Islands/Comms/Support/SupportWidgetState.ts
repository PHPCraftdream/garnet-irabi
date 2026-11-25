import {Carburetor} from '@react-carburetor/core';
import type {SupportTicket} from './parts/supportTypes';

interface State {
    isOpen: boolean;
    view: 'list' | 'conversation' | 'new';
    tickets: SupportTicket[];
    selectedTicketId: number | null;
    loadingTickets: boolean;
    subject: string;
    message: string;
    replyText: string;
    badge: number;
    imUnread: number;
}

export class SupportWidgetState extends Carburetor<State> {
    /** Создаёт состояние контроллера. */
    constructor(badge: number, imUnread: number) {
        super({isOpen: false, view: 'list', tickets: [], selectedTicketId: null, loadingTickets: false,
            subject: '', message: '', replyText: '', badge, imUnread});
    }

    /** Возвращает текущий снимок состояния. */
    readonly snapshot = () => this.getData();

    /** Подписывает слушателя на изменения снимка. */
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    /** Обновляет часть состояния. */
    patch(patch: Partial<State>): void {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...patch});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    /** Обновляет тему обращения. */
    readonly setSubject = (subject: string) => this.patch({subject});
    /** Обновляет текст обращения. */
    readonly setMessage = (message: string) => this.patch({message});
    /** Обновляет текст ответа. */
    readonly setReplyText = (replyText: string) => this.patch({replyText});
    /** Закрывает форму обращения. */
    readonly close = () => this.patch({isOpen: false});
    /** Открывает форму нового обращения. */
    readonly openNew = () => this.patch({view: 'new', subject: '', message: ''});
    /** Возвращает к списку обращений. */
    readonly back = () => this.patch({view: 'list'});
}
