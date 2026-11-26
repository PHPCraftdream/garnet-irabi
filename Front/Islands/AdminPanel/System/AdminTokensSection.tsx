import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import type {ConfirmOptions, ConfirmState} from '@common/hooks/ui/useConfirm';
import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {TokenRow} from './tokens/config/tokenTypes';
import {TokenFilters} from './tokens/TokenFilters';
import {TokenTable} from './tokens/TokenTable';
import {CreateTokenModal} from './tokens/Modals/CreateTokenModal';
import {RegistrationsModal} from './tokens/Modals/RegistrationsModal';
import {LinkModal} from './tokens/Modals/LinkModal';
import {EditTokenModal, type TokenUpdate} from './tokens/Modals/EditTokenModal';

export interface AdminTokensSectionProps {
    listUrl: string;
    createUrl: string;
    disableUrl: string;
    enableUrl: string;
    deleteUrl: string;
    registrationsUrl: string;
    updateUrl: string;
}

interface State {
    tokens: TokenRow[];
    loading: boolean;
    search: string;
    status: string;
    showCreate: boolean;
    registrations: TokenRow | null;
    link: string | null;
    edit: TokenRow | null;
    confirmState: ConfirmState;
}

export class AdminTokensSection extends AntiHookComponent<AdminTokensSectionProps> {
    private readonly ui = new Carburetor<State>({tokens: [], loading: false, search: '', status: '',
        showCreate: false, registrations: null, link: null, edit: null, confirmState: {visible: false,
        message: '', items: []}});
    private readonly snapshot = this.connectSelection(this.ui, state => ({tokens: state.tokens, loading:
        state.loading, search: state.search, status: state.status, showCreate: state.showCreate,
        registrations: state.registrations, link: state.link, edit: state.edit, confirmState: state.confirmState}));
    private timer?: ReturnType<typeof setTimeout>;
    private confirmResolver?: (ok: boolean) => void;

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        void this.fetchTokens();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidUpdate(previous: Readonly<AdminTokensSectionProps>): void {
        super.componentDidUpdate(previous);
        if (previous.listUrl !== this.props.listUrl) this.scheduleFetch();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        clearTimeout(this.timer);
        super.componentWillUnmount();
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private update(patch: Partial<State>): void {
        this.ui.setData({...this.ui.getData(), ...patch});
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private scheduleFetch(): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(this.fetchTokens, 300);
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly fetchTokens = async () => {
        const {search, status} = this.ui.getData();
        this.update({loading: true});
        try {
            const response = await sendPost<{search: string; status: string}, {tokens:
        TokenRow[]}>(this.props.listUrl, {search, status});
            const data = ('data' in response && response.data) ? response.data : (response as unknown as
        {tokens: TokenRow[]});
            this.update({tokens: data.tokens ?? []});
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            this.update({loading: false});
        }
    };

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly search = (search: string) => {
        if (search === this.ui.getData().search) return;
        this.update({search});
        this.scheduleFetch();
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly filter = (status: string) => {
        if (status === this.ui.getData().status) return;
        this.update({status});
        this.scheduleFetch();
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private patchRow(id: number, patch: Partial<TokenRow>): void {
        const previous = this.ui.getData().tokens;
        const index = previous.findIndex(row => row.id === id);
        if (index < 0) return;
        const tokens = previous.slice();
        tokens[index] = {...tokens[index], ...patch};
        this.update({tokens});
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private async changeRow(url: string, id: number, patch?: Partial<TokenRow>): Promise<void> {
        try {
            const response = await sendPost<{id: number}, {success: boolean}>(url, {id});
            const data = ('data' in response && response.data) ? response.data : (response as unknown as
        {success: boolean});
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            if (patch) this.patchRow(id, patch);
            else this.update({tokens: this.ui.getData().tokens.filter(row => row.id !== id)});
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private confirm(message: string, opts: string[] | ConfirmOptions = []): Promise<boolean> {
        return new Promise(resolve => {
            this.confirmResolver = resolve;
            if (Array.isArray(opts)) {
                this.update({confirmState: {visible: true, message, items: opts}});
            } else {
                this.update({
                    confirmState: {
                        visible: true,
                        message,
                        items: opts.items ?? [],
                        confirmLabel: opts.confirmLabel,
                        variant: opts.variant,
                    },
                });
            }
        });
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private settleConfirm(confirmed: boolean): void {
        const data = this.ui.getData();
        this.update({confirmState: {...data.confirmState, visible: false}});
        this.confirmResolver?.(confirmed);
        this.confirmResolver = null;
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly handleConfirm = (): void => { this.settleConfirm(true); };
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly handleCancel = (): void => { this.settleConfirm(false); };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly toggle = async (row: TokenRow) => {
        const {enableUrl, disableUrl} = this.props;
        if (row.is_disabled) {
            await this.changeRow(enableUrl, row.id, {is_disabled: false, status: 'active'});
            return;
        }
        const ok = await this.confirm(t.Admin_Tokens_DisableConfirm(), {variant: 'danger', confirmLabel:
        t.Admin_Tokens_Disable()});
        if (ok) await this.changeRow(disableUrl, row.id, {is_disabled: true, status: 'disabled'});
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly remove = async (row: TokenRow) => {
        const {deleteUrl} = this.props;
        const ok = await this.confirm(t.Admin_Tokens_DeleteConfirm(), {variant: 'danger', confirmLabel:
        t.Action_Delete()});
        if (ok) await this.changeRow(deleteUrl, row.id);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly openCreate = () => this.update({showCreate: true});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly closeCreate = () => this.update({showCreate: false});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly showRegistrations = (registrations: TokenRow) => this.update({registrations});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly closeRegistrations = () => this.update({registrations: null});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly showLink = (link: string) => this.update({link});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly closeLink = () => this.update({link: null});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly openEdit = (edit: TokenRow) => this.update({edit});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly closeEdit = () => this.update({edit: null});

    /** Формирует представление данных для соответствующего раздела панели. */
    private readonly created = (token: TokenRow) => {
        this.update({tokens: [token, ...this.ui.getData().tokens], showCreate: false});
    };

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly edited = (updated: TokenUpdate) => {
        this.patchRow(updated.id, updated);
        this.closeEdit();
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderTable(tokens: readonly TokenRow[], loading: boolean) {
        if (!tokens.length) return <p className="token-cell-muted">{loading ? t.User_Loading() :
        t.Admin_Tokens_Empty()}</p>;
        return <TokenTable tokens={tokens} onShowLink={this.showLink} onShowRegistrations={this.showRegistrations}
            onEdit={this.openEdit} onToggleDisable={this.toggle} onDelete={this.remove} />;
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderModals({showCreate, registrations, link, edit}: Omit<State, 'tokens' | 'confirmState'>) {
        const {createUrl, registrationsUrl, updateUrl} = this.props;
        return (
            <>
                {showCreate && <CreateTokenModal createUrl={createUrl} onCreated={this.created}
        onClose={this.closeCreate} />}
                {registrations && <RegistrationsModal token={registrations}
        registrationsUrl={registrationsUrl} onClose={this.closeRegistrations} />}
                {link && <LinkModal url={link} onClose={this.closeLink} />}
                {edit && <EditTokenModal token={edit} updateUrl={updateUrl} onUpdated={this.edited}
        onClose={this.closeEdit} />}
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const state = this.snapshot();
        const {confirmState} = state;
        return (
            <div data-test-id="admin-tokens">
                <TokenFilters search={state.search} status={state.status} onSearchChange={this.search}
        onStatusChange={this.filter} onCreate={this.openCreate} />
                {this.renderTable(state.tokens, state.loading)}
                {this.renderModals(state)}
                <ConfirmModal state={{...confirmState, items: [...confirmState.items]}}
        onConfirm={this.handleConfirm} onCancel={this.handleCancel} />
            </div>
        );
    }
}
