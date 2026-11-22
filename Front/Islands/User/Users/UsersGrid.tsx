import * as React from 'react';
import {I18nFramework} from '@framework/I18nGen/I18nFramework';

interface UsersGridProps {
    gridInfo: string;
}

export const UsersGridIsland: React.FC<UsersGridProps> = ({gridInfo}) => {
    return (
        <div>
            <h1>{I18nFramework.Menu_Users()}</h1>
            {/* Маркеры нужны инициализатору таблицы Garnet. */}
            {/* carburetor-disable-next-line require-function-class */}
            <div className="grid-table-init grid-table users-grid-table">
                {/* carburetor-disable-next-line require-function-class */}
                <div className="grid-info users-grid-info">{gridInfo}</div>
                {/* carburetor-disable-next-line require-function-class */}
                <div className="header-container users-grid-header"></div>
                {/* carburetor-disable-next-line require-function-class */}
                <div className="grid-container"></div>
                {/* carburetor-disable-next-line require-function-class */}
                <div className="edit-container"></div>
            </div>
        </div>
    );
};
