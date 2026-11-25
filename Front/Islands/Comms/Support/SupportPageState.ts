import {Carburetor} from '@react-carburetor/core';
import type {SupportTicket} from './parts/supportTypes';

interface State {
    selectedId: number | null;
    selectedTicketData: SupportTicket | null;
    readIds: number[];
    showNewForm: boolean;
    subject: string;
    message: string;
    replyText: string;
}

export class SupportPageState extends Carburetor<State> {
    /** Создаёт состояние контроллера. */
    constructor() {
        super({selectedId: null, selectedTicketData: null, readIds: [], showNewForm: false, subject: '',
            message: '', replyText: ''});
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

    /** Отмечает обращение прочитанным. */
    markRead(id: number, ticket?: SupportTicket): void {
        const {readIds, selectedTicketData} = this.getData();
        this.patch({readIds: readIds.includes(id) ? readIds : [...readIds, id],
            selectedTicketData: ticket ? {...ticket, unread_user: 0} : selectedTicketData});
    }

    /** Обновляет тему обращения. */
    readonly setSubject = (subject: string) => this.patch({subject});
    /** Обновляет текст обращения. */
    readonly setMessage = (message: string) => this.patch({message});
    /** Обновляет текст ответа. */
    readonly setReplyText = (replyText: string) => this.patch({replyText});
    /** Закрывает форму создания обращения. */
    readonly closeForm = () => this.patch({showNewForm: false});
    /** Возвращает к списку обращений. */
    readonly back = () => this.patch({selectedId: null, showNewForm: false});
}
