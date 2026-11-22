import type * as React from 'react';
import {Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {readPageSize, writePageSize} from '@common/Utils/Data/pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {AdminCommentRow, CommentsFetchBody} from './commentTypes';
import type {CommentsFilterState} from './CommentsFilters';

export interface CommentsPageState {
    items: AdminCommentRow[];
    page: number;
    perPage: number;
    totalPages: number;
    total: number;
    loading: boolean;
    loadedOnce: boolean;
}

interface Options {
    url: string;
    /** Данные, отданные сервером при рендере страницы; null — грузим сами. */
    initialData: PageResponse<AdminCommentRow> | null;
    buildBody: (filters: CommentsFilterState, page: number, perPage: number) => CommentsFetchBody;
    debounceMs?: number;
}

/** Раздел открывается с пустыми фильтрами — как EMPTY_FILTERS в компоненте. */
const NO_FILTERS: CommentsFilterState = {
    authorId: 0,
    expertId: 0,
    dateFrom: '',
    dateTo: '',
    search: '',
    hiddenOnly: false,
};

/**
 * Порт `useAdminPage` (Shell/useAdminPage.ts) без React: страницы, фильтры с
 * задержкой и общий с сетками размер страницы.
 *
 * Хук оставлен на месте — его читают другие разделы админки, — поэтому все
 * сторожа и порядок загрузки здесь повторены один в один.
 */
export class CommentsPaginationController extends Carburetor<CommentsPageState> {
    private readonly url: string;
    private readonly buildBody: Options['buildBody'];
    private readonly debounceMs: number;
    private readonly hasInitialData: boolean;
    // Последние фильтры: тело запроса собирается в момент запроса, а не на рендере.
    private filters: CommentsFilterState = NO_FILTERS;
    private active = false;
    private generation = 0;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    // Как в хуке: первый проход фильтров пропускается, иначе страница дважды
    // спросила бы сервер об одном и том же сразу после открытия.
    private skipFirstFilters = true;

    constructor({url, initialData, buildBody, debounceMs = 300}: Options) {
        super({
            items: initialData?.items ?? [],
            page: initialData?.page ?? 1,
            perPage: readPageSize(),
            totalPages: initialData?.totalPages ?? 1,
            total: initialData?.total ?? 0,
            loading: false,
            loadedOnce: initialData !== null,
        });
        this.url = url;
        this.buildBody = buildBody;
        this.debounceMs = debounceMs;
        this.hasInitialData = initialData !== null;
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private patch(changes: Partial<CommentsPageState>): void {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...changes});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly setItems: React.Dispatch<React.SetStateAction<AdminCommentRow[]>> = (value) => {
        const previous = this.snapshot().items;
        const items = typeof value === 'function' ? value(previous) : value;
        if (!Object.is(items, previous)) this.patch({items});
    };

    private syncPerPage(perPage: number): void {
        if (!Object.is(perPage, this.snapshot().perPage)) this.patch({perPage});
    }

    private readonly onLocalChange = (event: Event) => {
        const detail = (event as CustomEvent<number>).detail;
        if (typeof detail === 'number') this.syncPerPage(detail);
    };

    private readonly onStorageChange = (event: StorageEvent) => {
        if (event.key === null || event.key === 'garnet.pageSize') this.syncPerPage(readPageSize());
    };

    readonly start = (): void => {
        if (this.active) return;
        this.active = true;
        if (typeof window !== 'undefined') {
            window.addEventListener('garnet:pageSizeChange', this.onLocalChange);
            window.addEventListener('storage', this.onStorageChange);
        }
        if (!this.hasInitialData && !this.snapshot().loadedOnce) void this.requestPage(1, this.snapshot().perPage);
    };

    readonly dispose = (): void => {
        if (!this.active) return;
        this.active = false;
        // Счётчик поколений гасит ответы, пришедшие после размонтирования.
        this.generation++;
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
        if (typeof window !== 'undefined') {
            window.removeEventListener('garnet:pageSizeChange', this.onLocalChange);
            window.removeEventListener('storage', this.onStorageChange);
        }
    };

    readonly filtersChanged = (filters: CommentsFilterState): void => {
        this.filters = filters;
        if (this.skipFirstFilters) {
            this.skipFirstFilters = false;
            return;
        }
        if (!this.active) return;
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => void this.requestPage(1, this.snapshot().perPage), this.debounceMs);
    };

    readonly goToPage = (page: number): void => {
        const {page: current, totalPages, loading, perPage} = this.snapshot();
        if (page < 1 || page > totalPages || (page === current && !loading)) return;
        void this.requestPage(page, perPage);
    };

    readonly setPerPage = (perPage: number): void => {
        writePageSize(perPage);
        this.syncPerPage(perPage);
        void this.requestPage(1, perPage);
    };

    readonly reload = (): void => {
        const {page, perPage} = this.snapshot();
        void this.requestPage(page, perPage);
    };

    private async requestPage(page: number, perPage: number): Promise<void> {
        if (!this.active) return;
        const generation = this.generation;
        this.patch({loading: true});
        try {
            const body = this.buildBody(this.filters, page, perPage);
            const resp = await sendPost<CommentsFetchBody, PageResponse<AdminCommentRow>>(this.url, body);
            if (this.generation !== generation) return;
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as PageResponse<AdminCommentRow>);
            this.patch({
                items: data.items,
                page: data.page,
                totalPages: data.totalPages,
                total: data.total,
                loadedOnce: true,
            });
        } catch {
            // Тост — единственный сигнал о сбое в этой панели: текущий список
            // остаётся на месте, поэтому молчать нельзя.
            showToast(t.User_LoadError(), 'danger');
        } finally {
            if (this.generation === generation) this.patch({loading: false});
        }
    }
}
