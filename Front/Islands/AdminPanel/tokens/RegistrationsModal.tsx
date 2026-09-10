import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {LogDetailModal} from '@common/Components/AdminLog/LogDetailModal';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {AdminUserLink} from '../../../Common/EntityLinks';
import {Registration, TokenRow} from './tokenTypes';

const RegistrationRow: React.FC<{reg: Registration}> = ({reg}) => (
    <tr className="border-b border-subtle">
        <td className="p-3">
            <AdminUserLink id={reg.account_id} name={reg.account_name} />
        </td>
        <td className="p-3 whitespace-nowrap text-muted text-xs">{formatTs(reg.registered_at)}</td>
        <td className="p-3 text-muted text-xs">{reg.ip}</td>
        <td className="p-3 text-muted text-xs max-w-xs truncate" title={reg.user_agent}>{reg.user_agent}</td>
    </tr>
);

const RegistrationsTable: React.FC<{registrations: Registration[]}> = ({registrations}) => (
    <div className="overflow-x-auto">
        <table className="admin-table" data-test-id="token-registrations-table">
            <thead>
                <tr className="border-b border-subtle">
                    <th className="text-left p-3">{t.Admin_Tokens_RegAccount()}</th>
                    <th className="text-left p-3">{t.Admin_Tokens_RegDate()}</th>
                    <th className="text-left p-3">{t.Admin_Tokens_RegIp()}</th>
                    <th className="text-left p-3">{t.Admin_Tokens_RegUa()}</th>
                </tr>
            </thead>
            <tbody>
                {registrations.map(reg => <RegistrationRow key={reg.id} reg={reg} />)}
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
export const RegistrationsModal: React.FC<Props> = ({token, registrationsUrl, onClose}) => {
    const [registrations, setRegistrations] = React.useState<Registration[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const resp = await sendPost<{token_id: number}, {registrations: Registration[]}>(registrationsUrl, {
                    token_id: token.id,
                });
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {registrations: Registration[]});
                setRegistrations(data.registrations ?? []);
            } catch {
                showToast(t.User_LoadError(), 'danger');
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [registrationsUrl, token.id]);

    const title = `${t.Admin_Tokens_Registrations()} — ${token.label || token.token.slice(0, 8)}`;

    return (
        <LogDetailModal title={title} onClose={onClose}>
            {loading && <p className="text-muted">{t.User_Loading()}</p>}
            {!loading && registrations.length === 0 && <p className="text-muted">{t.Admin_Tokens_RegEmpty()}</p>}
            {!loading && registrations.length > 0 && <RegistrationsTable registrations={registrations} />}
        </LogDetailModal>
    );
};
