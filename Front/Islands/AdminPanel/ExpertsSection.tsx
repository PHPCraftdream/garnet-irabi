import * as React from 'react';
import {useState} from 'react';
import {AdminExpert, GridConfig} from './types';
import {AdminGrid} from './AdminGrid';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/sendPost';
import {formatTs} from '@common/Utils/DateUtils';
import {flag, FlagBtn} from './UsersSection';
import {useOpenUser} from './UserDetailContext';

interface Props {
    experts: AdminExpert[];
    setFlagUrl: string;
    config: GridConfig;
}

export const ExpertsSection: React.FC<Props> = ({
    experts: initialExperts, setFlagUrl, config,
}) => {
    const [experts, setExperts] = useState<AdminExpert[]>(initialExperts);
    const [pending, setPending]   = useState<Record<number, boolean>>({});
    const openUser = useOpenUser();

    const setFlag = async (userId: number, flagName: string, value: 0 | 1) => {
        if (pending[userId]) return;
        setPending(p => ({...p, [userId]: true}));
        try {
            await sendPost(setFlagUrl, {user_id: userId, flag: flagName, value});
            setExperts(prev => prev.map(u => u.id === userId ? {...u, [flagName]: value || null} : u));
        } finally {
            setPending(p => ({...p, [userId]: false}));
        }
    };

    return (
        <AdminGrid
            rows={experts}
            config={config}
            rowKey={r => r.id}
            emptyMessage={t.Admin_NoUsers()}
            renders={{
                id:   r => <span className="text-muted">{r.id}</span>,
                name: r => (
                    <button type="button" data-test-id={`expert-name-${r.id}`} className="admin-link-btn-md"
                        onClick={() => openUser(r.id, r.name || r.login)}>
                        {r.name || r.login}
                    </button>
                ),
                last_online_time: r => <span className="text-muted text-xs">{formatTs(r.last_online_time)}</span>,
                IS_APPROVED: r => (
                    <FlagBtn
                        testId={`flag-IS_APPROVED-${r.id}`}
                        label={flag(r.IS_APPROVED) ? t.Admin_Revoke() : t.Admin_Approve()}
                        active={flag(r.IS_APPROVED)}
                        cls={['btn-outline-danger', 'btn-success']}
                        disabled={pending[r.id]}
                        onClick={() => setFlag(r.id, 'IS_APPROVED', flag(r.IS_APPROVED) ? 0 : 1)}
                    />
                ),
                IS_DISABLED: r => (
                    <FlagBtn
                        testId={`flag-IS_DISABLED-${r.id}`}
                        label={flag(r.IS_DISABLED) ? t.Admin_Enable() : t.Admin_Disable()}
                        active={flag(r.IS_DISABLED)}
                        cls={['btn-secondary', 'btn-outline-danger']}
                        disabled={pending[r.id]}
                        onClick={() => setFlag(r.id, 'IS_DISABLED', flag(r.IS_DISABLED) ? 0 : 1)}
                    />
                ),
            }}
        />
    );
};
