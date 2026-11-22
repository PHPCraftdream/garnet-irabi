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
    constructor(badge: number, imUnread: number) {
        super({isOpen: false, view: 'list', tickets: [], selectedTicketId: null, loadingTickets: false,
            subject: '', message: '', replyText: '', badge, imUnread});
    }

    readonly snapshot = () => this.getData();

    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    patch(patch: Partial<State>): void {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...patch});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly setSubject = (subject: string) => this.patch({subject});
    readonly setMessage = (message: string) => this.patch({message});
    readonly setReplyText = (replyText: string) => this.patch({replyText});
    readonly close = () => this.patch({isOpen: false});
    readonly openNew = () => this.patch({view: 'new', subject: '', message: ''});
    readonly back = () => this.patch({view: 'list'});
}
