import {Carburetor} from '@react-carburetor/core';

interface DetailUIState {
    showCancelForm: boolean;
    reason: string;
    reasonError: string;
    cancelError: string;
    sending: boolean;
}

export class SlotDetailUIStore extends Carburetor<DetailUIState> {
    constructor() {
        super({showCancelForm: false, reason: '', reasonError: '', cancelError: '', sending: false});
    }

    setSending(sending: boolean): void {
        this.setData({...this.getData(), sending});
    }

    public readonly showCancel = () => {
        const state = this.getData();
        if (!state.showCancelForm) this.setData({...state, showCancelForm: true});
    };

    public readonly changeReason = (reason: string) => {
        const state = this.getData();
        if (state.reason !== reason || state.reasonError !== '') this.setData({...state, reason, reasonError: ''});
    };

    public readonly dismissCancel = () => {
        const state = this.getData();
        if (state.showCancelForm || state.reason !== '' || state.reasonError !== '') {
            this.setData({...state, showCancelForm: false, reason: '', reasonError: ''});
        }
    };

    public readonly setReasonError = (reasonError: string) => {
        const state = this.getData();
        if (state.reasonError !== reasonError) this.setData({...state, reasonError});
    };

    public readonly setCancelError = (cancelError: string) => {
        const state = this.getData();
        if (state.cancelError !== cancelError) this.setData({...state, cancelError});
    };
}
