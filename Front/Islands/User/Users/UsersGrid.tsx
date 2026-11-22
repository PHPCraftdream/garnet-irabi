import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nFramework} from '@framework/I18nGen/I18nFramework';

interface UsersGridProps {
    gridInfo: string;
}

// Маркерные классы нужны инициализатору таблицы Garnet: они вешаются на узел
// через ref, а не через className, потому что это селекторы, а не стилизация.
function attachGridTableInit(node: HTMLDivElement | null): void {
    if (node) node.classList.add('grid-table-init');
}

function attachGridInfo(node: HTMLDivElement | null): void {
    if (node) node.classList.add('grid-info');
}

function attachGridHeader(node: HTMLDivElement | null): void {
    if (node) node.classList.add('header-container');
}

function attachGridContainer(node: HTMLDivElement | null): void {
    if (node) node.classList.add('grid-container');
}

function attachGridEdit(node: HTMLDivElement | null): void {
    if (node) node.classList.add('edit-container');
}

export class UsersGridIsland extends AntiHookComponent<UsersGridProps> {
    render() {
        const {gridInfo} = this.props;
        return (
            <div>
                <h1>{I18nFramework.Menu_Users()}</h1>
                <div ref={attachGridTableInit} className="users-grid-table">
                    <div ref={attachGridInfo} className="users-grid-info">{gridInfo}</div>
                    <div ref={attachGridHeader} className="users-grid-header"></div>
                    <div ref={attachGridContainer}></div>
                    <div ref={attachGridEdit}></div>
                </div>
            </div>
        );
    }
}
