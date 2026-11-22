import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {UserDetailContext} from '../../Islands/AdminPanel/Users/UserDetailContext';
import {appUrl} from '@common/Utils/Url/appUrl';
import {classAttr} from './entityLinkHelpers';

/** Admin user link — opens user detail tab via context, falls back to href navigation */
type LinkProps = {id: number; name: string; role?: string; className?: string; dataTestId?: string};
type ContextValue = React.ContextType<typeof UserDetailContext>['openUser'];

class LinkView extends AntiHookComponent<LinkProps & {openUser: ContextValue}> {
    private readonly handleClick = (e: React.MouseEvent) => {
        const {openUser, id, name} = this.props;
        e.stopPropagation();
        // Allow modifier-clicks (Cmd/Ctrl/Shift/Alt or middle-click) to fall
        // through to native navigation — opens /admin/#user=X in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openUser(id, name || `#${id}`);
    };

    render() {
        const {id, name, role, className, dataTestId} = this.props;
        if (!id) return <span {...classAttr('', className)}>{name || '—'}</span>;

        const group = classAttr('entity-person-group', className);
        return (
            <span {...group}>
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

export const AdminUserLink: React.FC<LinkProps> = props => (
    <UserDetailContext.Consumer>{ctx => <LinkView {...props} openUser={ctx.openUser} />}</UserDetailContext.Consumer>
);
