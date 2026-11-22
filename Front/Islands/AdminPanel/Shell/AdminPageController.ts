import {Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {PageResponse} from '@common/hooks/data/usePagination';
import {readPageSize, writePageSize} from '@common/Utils/Data/pagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

interface AdminPageState<TRow> {
    items: TRow[];
    page: number;
    perPage: number;
    totalPages: number;
    total: number;
    loading: boolean;
}

interface AdminPageOptions<TRow, TFilters, TBody extends object> {
    url: string;
    initialData: PageResponse<TRow> | null;
    /** Фильтры на момент создания: совпадение по ссылке считается «уже применёнными». */
    filters: TFilters;
    buildBody: (filters: TFilters, page: number, perPage: number) => TBody;
    debounceMs?: number;
}

/**
 * Контроллер страницы списка в админке: заменяет прежний хук `useAdminPage`,
 * но без хуков — те же шесть полей состояния и те же операции.
 * Фильтры приходят через `setFilters`, где совпадение по ссылке значит «уже применены»,
 * поэтому открытие страницы не дублирует первичный запрос.
 */
export class AdminPageController<TRow, TFilters, TBody extends object = Record<string, unknown>>
    extends Carburetor<AdminPageState<TRow>> {
    private readonly url: string;
    private readonly buildBody: (filters: TFilters, page: number, perPage: number) => TBody;
    private debounceMs: number;
    private filters: TFilters;
    private loadedOnce: boolean;
    private active = false;
    private generation = 0;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(opts: AdminPageOptions<TRow, TFilters, TBody>) {
        super({
            items: opts.initialData?.items ?? [],
            page: opts.initialData?.page ?? 1,
            perPage: readPageSize(),
            totalPages: opts.initialData?.totalPages ?? 1,
            total: opts.initialData?.total ?? 0,
            loading: false,
        });
        this.url = opts.url;
        this.buildBody = opts.buildBody;
        this.debounceMs = opts.debounceMs ?? 300;
        this.filters = opts.filters;
        this.loadedOnce = opts.initialData !== null;
    }

    readonly snapshot = () => this.getData();

    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private patch(changes: Partial<AdminPageState<TRow>>): void {
        const previous = this.getData();
        const version = this.getVersion();
        this.setData({...previous, ...changes});
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly start = (): void => {
        if (this.active) return;
        this.active = true;
        window.addEventListener('garnet:pageSizeChange', this.onPageSizeChange);
        window.addEventListener('storage', this.onStorageChange);
        if (!this.loadedOnce) void this.fetchPage(1);
    };

    readonly stop = (): void => {
        if (!this.active) return;
        this.active = false;
        this.generation++;
        clearTimeout(this.debounceTimer);
        window.removeEventListener('garnet:pageSizeChange', this.onPageSizeChange);
        window.removeEventListener('storage', this.onStorageChange);
    };

    private schedulePageOne(): void {
        if (!this.active) return;
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => void this.fetchPage(1), this.debounceMs);
    }

    private readonly onPageSizeChange = (event: Event) => {
        const detail = (event as CustomEvent<number>).detail;
        if (typeof detail !== 'number' || detail === this.getData().perPage) return;
        // Размер страницы входит в тело запроса, поэтому его смена перезапрашивает первую страницу — в хуке это делал effect по зависимостям.
        this.patch({perPage: detail});
        this.schedulePageOne();
    };

    private readonly onStorageChange = (event: StorageEvent) => {
        if (event.key !== null && event.key !== 'garnet.pageSize') return;
        const size = readPageSize();
        if (size === this.getData().perPage) return;
        this.patch({perPage: size});
        this.schedulePageOne();
    };

    readonly fetchPage = async (targetPage: number, targetPerPage: number = this.getData().perPage): Promise<void> => {
        if (!this.active) return;
        // Поколение на каждый запрос: поздний ответ устаревшего запроса не затирает свежий.
        const generation = ++this.generation;
        this.patch({loading: true});
        try {
            const body = this.buildBody(this.filters, targetPage, targetPerPage);
            const resp = await sendPost<TBody, PageResponse<TRow>>(this.url, body);
            if (generation !== this.generation) return;
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as PageResponse<TRow>);
            this.patch({items: data.items, page: data.page, totalPages: data.totalPages, total: data.total});
            this.loadedOnce = true;
        } catch {
            if (generation === this.generation) showToast(t.User_LoadError(), 'danger');
        } finally {
            if (generation === this.generation) this.patch({loading: false});
        }
    };

    readonly setFilters = (filters: TFilters, debounceMs: number = this.debounceMs): void => {
        if (Object.is(filters, this.filters) && debounceMs === this.debounceMs) return;
        this.filters = filters;
        this.debounceMs = debounceMs;
        this.schedulePageOne();
    };

    readonly goToPage = (target: number): void => {
        const {page, totalPages, loading} = this.getData();
        if (target < 1 || target > totalPages || (target === page && !loading)) return;
        void this.fetchPage(target);
    };

    readonly setPerPage = (size: number): void => {
        writePageSize(size);
        this.patch({perPage: size});
        // writePageSize синхронно шлёт garnet:pageSizeChange и планирует отложенный запрос; немедленный ниже его замещает — то же состояние и тело, дубль не нужен.
        clearTimeout(this.debounceTimer);
        void this.fetchPage(1, size);
    };

    readonly reload = (): void => {
        void this.fetchPage(this.getData().page);
    };

    readonly setItems = (value: TRow[] | ((previous: TRow[]) => TRow[])): void => {
        const previous = this.getData().items;
        const items = typeof value === 'function' ? value(previous) : value;
        if (!Object.is(items, previous)) this.patch({items});
    };
}
