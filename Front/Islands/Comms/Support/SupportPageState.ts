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
    constructor() {
        super({selectedId: null, selectedTicketData: null, readIds: [], showNewForm: false, subject: '', message: '', replyText: ''});
    }

    readonly snapshot = () => this.getData();

    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    update(patch: Partial<State>): void {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...patch});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    markRead(id: number, ticket?: SupportTicket): void {
        const {readIds, selectedTicketData} = this.getData();
        this.update({readIds: readIds.includes(id) ? readIds : [...readIds, id],
            selectedTicketData: ticket ? {...ticket, unread_user: 0} : selectedTicketData});
    }

    readonly setSubject = (subject: string) => this.update({subject});
    readonly setMessage = (message: string) => this.update({message});
    readonly setReplyText = (replyText: string) => this.update({replyText});
    readonly closeForm = () => this.update({showNewForm: false});
    readonly back = () => this.update({selectedId: null, showNewForm: false});
}
