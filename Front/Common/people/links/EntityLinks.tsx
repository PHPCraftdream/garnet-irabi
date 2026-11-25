import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {UserDetailContext} from '../../../Islands/AdminPanel/Users/UserDetailContext';
import {appUrl} from '@common/Utils/Url/appUrl';

/** Admin user link — opens user detail tab via context, falls back to href navigation */
type LinkProps = {id: number; name: string; role?: string; variant?: 'support-author'; dataTestId?: string};
type ContextValue = React.ContextType<typeof UserDetailContext>['openUser'];

class LinkView extends AntiHookComponent<LinkProps & {openUser: ContextValue}> {
    /** Открывает карточку пользователя или сохраняет обычную навигацию. */
    private readonly handleClick = (e: React.MouseEvent) => {
        const {openUser, id, name} = this.props;
        e.stopPropagation();
        // Allow modifier-clicks (Cmd/Ctrl/Shift/Alt or middle-click) to fall
        // through to native navigation — opens /admin/#user=X in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openUser(id, name || `#${id}`);
    };

    /** Рисует ссылку на административную карточку пользователя. */
    render() {
        const {id, name, role, variant, dataTestId} = this.props;
        if (!id) return <span>{name || '—'}</span>;

        return (
            <span className={variant === 'support-author' ? 'entity-person-support-author' : 'entity-person-group'}>
                <a
                    href={appUrl(`/admin/#user=${id}`)}
                    className="entity-person-link"
                    onClick={this.handleClick}
                    data-test-id={dataTestId}
                >{name || `#${id}`}</a>
                {role && <span className="entity-person-role">{role}</span>}
            </span>
        );
    }
}

/** Ссылка на пользователя, открывающая карточку через контекст админки. */
export const AdminUserLink: React.FC<LinkProps> = props => (
    <UserDetailContext.Consumer>{ctx => (
        <LinkView {...props} openUser={ctx.openUser} />
    )}</UserDetailContext.Consumer>
);
