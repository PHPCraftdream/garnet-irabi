import * as React from 'react';
import {AdminGrid as BaseAdminGrid, AdminGridProps} from '@common/Components/AdminGrid/AdminGrid';
import {globalRenders} from './gridRenders';

/**
 * IRabi-specific AdminGrid — wraps the generic AdminGrid with IRabi field renders.
 */
export function AdminGrid<T>(props: AdminGridProps<T>) {
    return <BaseAdminGrid {...props} globalRenders={globalRenders} />;
}
