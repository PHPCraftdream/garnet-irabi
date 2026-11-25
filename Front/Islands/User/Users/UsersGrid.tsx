import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nFramework} from '@framework/I18nGen/I18nFramework';

interface UsersGridProps {
    gridInfo: string;
}

/** Добавляет селектор инициализации таблицы Garnet к узлу. */
function attachGridTableInit(node: HTMLDivElement | null): void {
    if (node) node.classList.add('grid-table-init');
}

/** Добавляет селектор информационной области таблицы. */
function attachGridInfo(node: HTMLDivElement | null): void {
    if (node) node.classList.add('grid-info');
}

/** Добавляет селектор заголовка таблицы. */
function attachGridHeader(node: HTMLDivElement | null): void {
    if (node) node.classList.add('header-container');
}

/** Добавляет селектор контейнера строк таблицы. */
function attachGridContainer(node: HTMLDivElement | null): void {
    if (node) node.classList.add('grid-container');
}

/** Добавляет селектор области редактирования таблицы. */
function attachGridEdit(node: HTMLDivElement | null): void {
    if (node) node.classList.add('edit-container');
}

export class UsersGridIsland extends AntiHookComponent<UsersGridProps> {
    /** Рисует пользовательскую таблицу Garnet и её контейнеры. */
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
