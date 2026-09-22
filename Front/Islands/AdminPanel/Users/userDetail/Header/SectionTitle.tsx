import * as React from 'react';

export const SectionTitle: React.FC<{children: React.ReactNode}> = ({children}) => (
    <h3 className="admin-section-title">{children}</h3>
);
