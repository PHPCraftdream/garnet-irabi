import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {AdminUserLink} from '@/Common/people/links/EntityLinks';
import {Registration, TokenRow} from '@/Islands/AdminPanel/System/tokens/config/tokenTypes';

const admin_Tokens_RegAccount = t.Admin_Tokens_RegAccount;
const admin_Tokens_RegDate = t.Admin_Tokens_RegDate;
const admin_Tokens_RegIp = t.Admin_Tokens_RegIp;
const admin_Tokens_RegUa = t.Admin_Tokens_RegUa;

const RegistrationRow: React.FC<{reg: Registration}> = ({reg}) => (
    <tr>
        <td className="token-cell">
            <AdminUserLink id={reg.account_id} name={reg.account_name} />
        </td>
        <td className="token-cell-time">{formatTs(reg.registered_at)}</td>
        <td className="token-registration-ip">{reg.ip}</td>
        <td className="token-registration-agent" title={reg.user_agent}>{reg.user_agent}</td>
    </tr>
);

    /** Формирует представление данных для соответствующего раздела панели. */
function renderRegistration(reg: Registration) {
    return <RegistrationRow key={reg.id} reg={reg} />;
}

const RegistrationsTable: React.FC<{registrations: readonly Registration[]}> = ({registrations}) => (
    <div className="token-table-scroll">
        <table className="admin-table" data-test-id="token-registrations-table">
            <thead>
                <tr>
                    <th className="admin-grid-heading">{admin_Tokens_RegAccount()}</th>
                    <th className="admin-grid-heading">{admin_Tokens_RegDate()}</th>
                    <th className="admin-grid-heading">{admin_Tokens_RegIp()}</th>
                    <th className="admin-grid-heading">{admin_Tokens_RegUa()}</th>
                </tr>
            </thead>
            <tbody>
                {registrations.map(renderRegistration)}
            </tbody>
        </table>
    </div>
);

interface Props {
    token: TokenRow;
    registrationsUrl: string;
    onClose: () => void;
}

/** Кто вошёл по этому приглашению: аккаунт, время, адрес, браузер. */
export class RegistrationsModal extends AntiHookComponent<Props> {
    private readonly stateStore = new Carburetor<{registrations: Registration[]; loading:
        boolean}>({registrations: [], loading: true});
    private readonly registrations = this.connectSelection(this.stateStore, state => state.registrations);

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        void this.load();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidUpdate(previous: Readonly<Props>): void {
        super.componentDidUpdate(previous);
        if (previous.token.id !== this.props.token.id || previous.registrationsUrl !==
        this.props.registrationsUrl) void this.load();
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private update(patch: Partial<ReturnType<typeof this.stateStore.getData>>): void {
        this.stateStore.setData({...this.stateStore.getData(), ...patch});
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private async load(): Promise<void> {
        const {token, registrationsUrl} = this.props;
        this.update({loading: true});
        try {
            const resp = await sendPost<{token_id: number}, {registrations: Registration[]}>(registrationsUrl, {
                token_id: token.id,
            });
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {registrations:
        Registration[]});
            this.update({registrations: data.registrations ?? []});
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            this.update({loading: false});
        }
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {token, onClose} = this.props;
        const {loading} = this.useCarburetor(this.stateStore);
        const registrations = this.registrations();
        const title = `${t.Admin_Tokens_Registrations()} — ${token.label || token.token.slice(0, 8)}`;
        return (
            <LogDetailModal title={title} onClose={onClose}>
                {loading && <p className="token-cell-muted">{t.User_Loading()}</p>}
                {!loading && registrations.length === 0 && <p
        className="token-cell-muted">{t.Admin_Tokens_RegEmpty()}</p>}
                {!loading && registrations.length > 0 && <RegistrationsTable registrations={registrations} />}
            </LogDetailModal>
        );
    }
}
