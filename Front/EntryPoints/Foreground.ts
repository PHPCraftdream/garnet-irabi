// Production optimizations (configured in rspack.config.ts):
// - D() calls stripped via DefinePlugin (__GARNET_DEBUG__ = false)
// - data-test-id attributes can be stripped via babel plugin (not yet configured)
// - All islands are lazy-loaded (code splitting)
// - ErrorBoundary wraps every island

import {sendPostFormData} from '@common/Api/sendPostFormData';
import {createIsland} from '@common/Islands/createIsland';
import {installJsErrorReporter} from '@common/Errors/JsErrorReporter';
import {initAutoLightbox} from '@framework/lightbox/autoLightbox';

// Install global JS error reporter FIRST — before any island registration —
// so we catch errors that happen during island bootstrapping.
installJsErrorReporter();

// Auto-lightbox for static pages (data-lightbox links)
initAutoLightbox();


(window as any).sendPostFormData = sendPostFormData;

// ── ALL islands are lazy-loaded (JS chunk only when element appears on page) ──

// Navigation + widget (present on every page — loaded immediately since elements exist in DOM)
createIsland({className: 'tz-banner-init', lazy: () => import('@common/Components/TimezoneNoticeWarnIsland'), exportName: 'default'});
createIsland({className: 'top-menu-init', lazy: () => import('@common/Components/Navigation/TopMenu'), exportName: 'TopMenu'});
createIsland({className: 'sidebar-menu-init', lazy: () => import('@common/Components/Navigation/SidebarMenu'), exportName: 'SidebarMenu'});
createIsland({className: 'mobile-menu-init', lazy: () => import('@common/Components/Navigation/MobileMenu'), exportName: 'MobileMenu'});
createIsland({className: 'support-widget-init', lazy: () => import('../Islands/Support/SupportWidgetIsland'), exportName: 'SupportWidgetIsland'});

// User pages
createIsland({className: 'dashboard-init', lazy: () => import('../Islands/Dashboard/DashboardIsland'), exportName: 'DashboardIsland'});
createIsland({className: 'slots-calendar-init', lazy: () => import('../Islands/SlotsCalendar/SlotsCalendarIsland'), exportName: 'SlotsCalendarIsland'});
createIsland({className: 'booking-form-init', lazy: () => import('../Islands/Bookings/BookingForm'), exportName: 'BookingFormIsland'});
createIsland({className: 'bookings-list-init', lazy: () => import('../Islands/Bookings/BookingsList'), exportName: 'BookingsListIsland'});
createIsland({className: 'expert-profile-init', lazy: () => import('../Islands/Users/ExpertProfile'), exportName: 'ExpertProfileIsland'});
createIsland({className: 'user-profile-init', lazy: () => import('../Islands/Users/UserProfileIsland'), exportName: 'UserProfileIsland'});
createIsland({className: 'balance-init', lazy: () => import('../Islands/Bookings/BalanceIsland'), exportName: 'BalanceIsland'});
createIsland({className: 'registration-form-init', lazy: () => import('../Islands/Users/RegistrationForm'), exportName: 'RegistrationFormIsland'});
createIsland({className: 'invite-error-init', lazy: () => import('../Islands/InviteError/InviteErrorIsland'), exportName: 'InviteErrorIsland'});

// Expert pages
createIsland({className: 'expert-dashboard-init', lazy: () => import('../Islands/ExpertDashboard/ExpertDashboardIsland'), exportName: 'ExpertDashboardIsland'});
createIsland({className: 'expert-slots-init', lazy: () => import('../Islands/ExpertSlots/ExpertSlotsIsland'), exportName: 'ExpertSlotsIsland'});
createIsland({className: 'expert-bookings-init', lazy: () => import('../Islands/Bookings/ExpertBookings'), exportName: 'ExpertBookingsIsland'});

// Support
createIsland({className: 'support-page-init', lazy: () => import('../Islands/Support/SupportPageIsland'), exportName: 'SupportPageIsland'});

// IM
createIsland({className: 'im-page-init', lazy: () => import('../Islands/Im/ImPageIsland'), exportName: 'ImPageIsland'});

// Admin (only loaded for moderator+ users)
createIsland({className: 'admin-dashboard-init', lazy: () => import('../Islands/AdminPanel/AdminDashboard/AdminDashboardIsland'), exportName: 'AdminDashboardIsland'});
createIsland({className: 'users-grid-init', lazy: () => import('../Islands/Users/UsersGrid'), exportName: 'UsersGridIsland'});
createIsland({className: 'admin-panel-init', lazy: () => import('../Islands/AdminPanel/AdminPanelIsland'), exportName: 'AdminPanelIsland'});
createIsland({className: 'admin-bookings-init', lazy: () => import('../Islands/AdminPanel/AdminBookingsIsland'), exportName: 'AdminBookingsIsland'});
createIsland({className: 'admin-finance-init', lazy: () => import('../Islands/AdminPanel/AdminFinanceIsland'), exportName: 'AdminFinanceIsland'});
createIsland({className: 'admin-support-init', lazy: () => import('../Islands/AdminPanel/AdminSupportIsland'), exportName: 'AdminSupportIsland'});
createIsland({className: 'admin-system-settings-init', lazy: () => import('../Islands/AdminPanel/AdminSystemSettingsIsland'), exportName: 'AdminSystemSettingsIsland'});
createIsland({className: 'admin-logs-viewer-init', lazy: () => import('../Islands/AdminPanel/AdminLogsViewerIsland'), exportName: 'AdminLogsViewerIsland'});
createIsland({className: 'admin-static-pages-init', lazy: () => import('../Islands/AdminPanel/AdminStaticPagesIsland'), exportName: 'AdminStaticPagesIsland'});
