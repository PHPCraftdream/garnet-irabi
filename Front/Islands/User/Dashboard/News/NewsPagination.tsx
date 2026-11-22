import * as React from 'react';
import Pagination from '@common/Components/Layout/Paging/Pagination';

interface Props {
    position: 'top' | 'bottom';
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    total: number;
    loading: boolean;
}

export const NewsPagination: React.FC<Props> = ({position, page, totalPages, onPageChange, total, loading}) => (
    <div className={position === 'top' ? 'news-pagination-top' : 'news-pagination-bottom'}>
        {position === 'top' ? (
            <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={total} loading={loading} compact />
        ) : (
            <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} loading={loading} compact />
        )}
    </div>
);
