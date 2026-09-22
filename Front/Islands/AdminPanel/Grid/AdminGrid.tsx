import * as React from 'react';
import {AdminGrid as BaseAdminGrid, AdminGridProps, AdminGridHandle} from '@common/Components/Admin/AdminGrid/AdminGrid';
import {globalRenders} from './gridRenders';

export type {AdminGridHandle} from '@common/Components/Admin/AdminGrid/AdminGrid';

/**
 * IRabi-specific AdminGrid — wraps the generic AdminGrid with IRabi field renders.
 */
function AdminGridInner<T>(props: AdminGridProps<T>, ref: React.ForwardedRef<AdminGridHandle<T>>) {
    return <BaseAdminGrid {...props} ref={ref} globalRenders={globalRenders} />;
}

export const AdminGrid = React.forwardRef(AdminGridInner) as <T>(
    props: AdminGridProps<T> & {ref?: React.ForwardedRef<AdminGridHandle<T>>},
) => ReturnType<typeof AdminGridInner>;
