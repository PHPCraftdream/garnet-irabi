import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {PageResponse} from '@common/hooks/usePagination';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

interface Options<TRow, TFilters, TBody extends object> {
    url: string;
    /** Данные, отданные сервером при рендере страницы; null — грузим сами. */
    initialData: PageResponse<TRow> | null;
    filters: TFilters;
    /** Собрать тело запроса из фильтров и номера страницы. */
    buildBody: (filters: TFilters, page: number) => TBody;
    /** Задержка перед применением изменившегося фильтра. */
    debounceMs?: number;
}

interface Result<TRow> {
    items: TRow[];
    page: number;
    totalPages: number;
    total: number;
    loading: boolean;
    goToPage: (p: number) => void;
    reload: () => void;
    setItems: React.Dispatch<React.SetStateAction<TRow[]>>;
}

/**
 * Страница списка в админке: загрузка, фильтры с задержкой, пагинация.
 *
 * Один и тот же кусок — состояние из шести переменных, `fetchPage`, первичная
 * загрузка, задержка на фильтрах и проверка границ страницы — был написан
 * заново в пяти разделах: брони, слоты, отмены, отзывы, приглашения.
 *
 * Фильтры остаются у вызывающего: у каждого раздела они свои. Хук только
 * следит за ними и решает, когда спрашивать сервер.
 */
export function useAdminPage<TRow, TFilters, TBody extends object = Record<string, unknown>>(
    opts: Options<TRow, TFilters, TBody>,
): Result<TRow> {
    const {url, initialData, filters, buildBody, debounceMs = 300} = opts;

    const [items, setItems] = React.useState<TRow[]>(initialData?.items ?? []);
    const [page, setPage] = React.useState<number>(initialData?.page ?? 1);
    const [totalPages, setTotalPages] = React.useState<number>(initialData?.totalPages ?? 1);
    const [total, setTotal] = React.useState<number>(initialData?.total ?? 0);
    const [loading, setLoading] = React.useState(false);
    const [loadedOnce, setLoadedOnce] = React.useState(initialData !== null);

    // Свежие фильтры и сборщик тела — через ref, иначе `fetchPage` замкнётся
    // на значениях того рендера, в котором был создан.
    const filtersRef = React.useRef(filters);
    filtersRef.current = filters;
    const buildRef = React.useRef(buildBody);
    buildRef.current = buildBody;

    const fetchPage = React.useCallback(async (targetPage: number) => {
        setLoading(true);
        try {
            const body = buildRef.current(filtersRef.current, targetPage);
            const resp = await sendPost<TBody, PageResponse<TRow>>(url, body);
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as PageResponse<TRow>);
            setItems(data.items);
            setPage(data.page);
            setTotalPages(data.totalPages);
            setTotal(data.total);
            setLoadedOnce(true);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            setLoading(false);
        }
    }, [url]);

    React.useEffect(() => {
        if (initialData === null && !loadedOnce) {
            void fetchPage(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Первый проход пропускается: иначе страница дважды спросила бы сервер об
    // одном и том же сразу после открытия.
    const isFirstRunRef = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRunRef.current) {
            isFirstRunRef.current = false;
            return;
        }
        const handle = setTimeout(() => void fetchPage(1), debounceMs);
        return () => clearTimeout(handle);
    }, [filters, fetchPage, debounceMs]);

    const goToPage = React.useCallback((p: number) => {
        if (p < 1 || p > totalPages || (p === page && !loading)) return;
        void fetchPage(p);
    }, [fetchPage, totalPages, page, loading]);

    const reload = React.useCallback(() => void fetchPage(page), [fetchPage, page]);

    return {items, page, totalPages, total, loading, goToPage, reload, setItems};
}
