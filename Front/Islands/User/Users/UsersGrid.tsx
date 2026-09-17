import * as React from 'react';
import {I18nFramework} from '@framework/I18nGen/I18nFramework';

interface UsersGridProps {
    gridInfo: string;
}

export const UsersGridIsland: React.FC<UsersGridProps> = ({gridInfo}) => {
    return (
        <div>
            <h1>{I18nFramework.Menu_Users()}</h1>
            <div className="grid-table-init grid-table mt-3">
                <div className="hidden grid-info">{gridInfo}</div>
                <div className="header-container mb-3"></div>
                <div className="grid-container"></div>
                <div className="edit-container"></div>
            </div>
        </div>
    );
};
