import * as React from 'react';
import {UserDetailContext} from '../../Islands/AdminPanel/Users/UserDetailContext';
import {appUrl} from '@common/Utils/Url/appUrl';

/** Admin user link — opens user detail tab via context, falls back to href navigation */
export const AdminUserLink: React.FC<{id: number; name: string; role?: string; className?: string; dataTestId?: string}> = ({id, name, role, className = '', dataTestId}) => {
    const {openUser} = React.useContext(UserDetailContext);
    if (!id) return <span className={className}>{name || '—'}</span>;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Allow modifier-clicks (Cmd/Ctrl/Shift/Alt or middle-click) to fall
        // through to native navigation — opens /admin/#user=X in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openUser(id, name || `#${id}`);
    };

    return (
        <span className={`common-entity-link ${className}`}>
            <a
                href={appUrl(`/admin/#user=${id}`)}
                className="common-link"
                onClick={handleClick}
                data-test-id={dataTestId}
            >{name || `#${id}`}</a>
            {role && <span className="common-role-tag">{role}</span>}
        </span>
    );
};
