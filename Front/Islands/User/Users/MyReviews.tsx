import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {usePagination, PageResponse} from '@common/hooks/data/usePagination';
import Pagination, {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';

interface MyReview {
    id: number;
    expert_id: number;
    expert_name: string;
    body: string;
    moderation_status: 'pending' | 'approved' | 'rejected' | 'flagged';
    created_at: number;
}

const STATUS_LABEL: Record<MyReview['moderation_status'], () => string> = {
    pending: () => t.Comment_StatusPending(),
    approved: () => t.Comment_StatusMine(),
    rejected: () => t.Comment_StatusRejected(),
    flagged: () => t.Comment_StatusFlagged(),
};

const MyReviewItem: React.FC<{review: MyReview}> = ({review: r}) => (
    <div className="p-4" data-test-id={`my-review-${r.id}`}>
        <div className="flex items-center justify-between gap-2 mb-1">
            <a href={appUrl(`/expert/id~${r.expert_id}`)} className="text-accent hover:underline font-medium">
                {r.expert_name || t.Booking_NA()}
            </a>
            <span className="text-xs text-muted">{STATUS_LABEL[r.moderation_status]()}</span>
        </div>
        <p className="text-sm text-on-surface mb-1">{r.body}</p>
        <span className="text-xs text-muted">{formatTs(r.created_at)}</span>
    </div>
);

/**
 * D-128: до этого отзывы не жили нигде, кроме страницы того эксперта, о
 * котором были написаны — ни числа, ни списка, ни ссылки на свои. Автор с
 * отзывами о трёх разных преподавателях не мог увидеть их разом.
 */
export const MyReviews: React.FC<{listUrl: string; initialData?: PageResponse<MyReview>}> = ({listUrl, initialData}) => {
    const {items, page, totalPages, total, loading, goToPage, perPage, setPerPage} = usePagination<MyReview>({
        url: listUrl,
        initialData,
    });

    const paginationLabels: PaginationLabels = {
        prev: t.Pagination_Prev(),
        next: t.Pagination_Next(),
        of: t.Pagination_Of(),
        items: t.Pagination_Items(),
    };

    if (!loading && total === 0) {
        return null;
    }

    return (
        <div className="profile-card mt-4" data-test-id="my-reviews-section">
            <div className="p-4 border-b border-default flex items-center justify-between">
                <h3 className="mb-0">{t.MyReviews_Title()}</h3>
                <span className="text-sm text-muted" data-test-id="my-reviews-count">{total}</span>
            </div>

            {totalPages > 1 && (
                <div className="p-4 pb-0">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        loading={loading}
                        compact
                        onPageChange={goToPage}
                        labels={paginationLabels}
                        pageSize={perPage}
                        onPageSizeChange={setPerPage}
                    />
                </div>
            )}

            <div className="divide-y divide-default">
                {items.map(r => (
                    <MyReviewItem key={r.id} review={r} />
                ))}
            </div>
        </div>
    );
};
