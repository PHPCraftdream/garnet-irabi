import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {useConfirm} from '@common/hooks/useConfirm';
import {ConfirmModal} from '@common/Components/ConfirmModal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {TokenRow} from './tokens/tokenTypes';
import {TokenFilters} from './tokens/TokenFilters';
import {TokenTable} from './tokens/TokenTable';
import {CreateTokenModal} from './tokens/CreateTokenModal';
import {RegistrationsModal} from './tokens/RegistrationsModal';
import {LinkModal} from './tokens/LinkModal';
import {EditTokenModal} from './tokens/EditTokenModal';

export interface AdminTokensSectionProps {
    listUrl: string;
    createUrl: string;
    disableUrl: string;
    enableUrl: string;
    deleteUrl: string;
    registrationsUrl: string;
    updateUrl: string;
}

/**
 * Приглашения: список, фильтры и четыре окна.
 *
 * Раньше всё это лежало одним файлом на 777 строк, где строка таблицы и её
 * кнопки уходили на четырнадцатый уровень вложенности. Здесь остались только
 * состояние, загрузка и действия — разметка живёт в `tokens/`.
 */
export const AdminTokensSection: React.FC<AdminTokensSectionProps> = (props) => {
    const {listUrl, createUrl, disableUrl, enableUrl, deleteUrl, registrationsUrl, updateUrl} = props;

    const [tokens, setTokens] = React.useState<TokenRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('');
    const [showCreate, setShowCreate] = React.useState(false);
    const [regsModal, setRegsModal] = React.useState<TokenRow | null>(null);
    const [linkModal, setLinkModal] = React.useState<string | null>(null);
    const [editModal, setEditModal] = React.useState<TokenRow | null>(null);

    const {confirmState, confirm, handleConfirm, handleCancel} = useConfirm();

    const stateRef = React.useRef({search, statusFilter});
    stateRef.current = {search, statusFilter};

    const fetchTokens = React.useCallback(async (overrides: {search?: string; status?: string} = {}) => {
        const cur = stateRef.current;
        setLoading(true);
        try {
            const resp = await sendPost<{search: string; status: string}, {tokens: TokenRow[]}>(listUrl, {
                search: overrides.search ?? cur.search,
                status: overrides.status ?? cur.statusFilter,
            });
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {tokens: TokenRow[]});
            setTokens(data.tokens ?? []);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            setLoading(false);
        }
    }, [listUrl]);

    React.useEffect(() => {
        void fetchTokens();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Фильтр с задержкой: набор в поле не должен бить в сервер на каждую букву.
    const isFirstRef = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRef.current) {
            isFirstRef.current = false;
            return;
        }
        const handle = setTimeout(() => void fetchTokens(), 300);
        return () => clearTimeout(handle);
    }, [search, statusFilter, fetchTokens]);

    /** Общая часть «нажали — сервер ответил — правим строку в списке». */
    const applyToRow = React.useCallback(async (url: string, id: number, patch: Partial<TokenRow>) => {
        try {
            const resp = await sendPost<{id: number}, {success: boolean}>(url, {id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean});
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            setTokens(prev => prev.map(tk => tk.id === id ? {...tk, ...patch} : tk));
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }, []);

    const handleToggleDisable = React.useCallback(async (row: TokenRow) => {
        // Включение обратно ничего не ломает — спрашиваем только про отключение.
        if (row.is_disabled) {
            await applyToRow(enableUrl, row.id, {is_disabled: false, status: 'active'});
            return;
        }

        const ok = await confirm(t.Admin_Tokens_DisableConfirm(), {variant: 'danger', confirmLabel: t.Admin_Tokens_Disable()});
        if (!ok) return;
        await applyToRow(disableUrl, row.id, {is_disabled: true, status: 'disabled'});
    }, [applyToRow, confirm, disableUrl, enableUrl]);

    const handleDelete = React.useCallback(async (row: TokenRow) => {
        const ok = await confirm(t.Admin_Tokens_DeleteConfirm(), {variant: 'danger', confirmLabel: t.Action_Delete()});
        if (!ok) return;
        try {
            const resp = await sendPost<{id: number}, {success: boolean}>(deleteUrl, {id: row.id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean});
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            setTokens(prev => prev.filter(tk => tk.id !== row.id));
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }, [confirm, deleteUrl]);

    return (
        <div data-test-id="admin-tokens">
            <TokenFilters
                search={search}
                status={statusFilter}
                onSearchChange={setSearch}
                onStatusChange={setStatusFilter}
                onCreate={() => setShowCreate(true)}
            />

            {tokens.length === 0 && (
                <p className="text-muted">{loading ? t.User_Loading() : t.Admin_Tokens_Empty()}</p>
            )}
            {tokens.length > 0 && (
                <TokenTable
                    tokens={tokens}
                    onShowLink={setLinkModal}
                    onShowRegistrations={setRegsModal}
                    onEdit={setEditModal}
                    onToggleDisable={row => void handleToggleDisable(row)}
                    onDelete={row => void handleDelete(row)}
                />
            )}

            {showCreate && (
                <CreateTokenModal
                    createUrl={createUrl}
                    onCreated={newToken => {
                        setTokens(prev => [newToken, ...prev]);
                        setShowCreate(false);
                    }}
                    onClose={() => setShowCreate(false)}
                />
            )}
            {regsModal && (
                <RegistrationsModal token={regsModal} registrationsUrl={registrationsUrl} onClose={() => setRegsModal(null)} />
            )}
            {linkModal && <LinkModal url={linkModal} onClose={() => setLinkModal(null)} />}
            {editModal && (
                <EditTokenModal
                    token={editModal}
                    updateUrl={updateUrl}
                    onUpdated={updated => {
                        setTokens(prev => prev.map(tk => tk.id === updated.id ? {...tk, ...updated} : tk));
                        setEditModal(null);
                    }}
                    onClose={() => setEditModal(null)}
                />
            )}

            <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
        </div>
    );
};
