// Production optimizations (configured in rspack.config.ts):
// - D() calls stripped via DefinePlugin (__GARNET_DEBUG__ = false)
// - data-test-id attributes can be stripped via babel plugin (not yet configured)
// - All islands are lazy-loaded (code splitting)
// - ErrorBoundary wraps every island

import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {createIsland} from '@common/Islands/createIsland';
import {installJsErrorReporter} from '@common/Support/Errors/JsErrorReporter';
import {initAutoLightbox} from '@framework/lightbox/autoLightbox';

// Install global JS error reporter FIRST — before any island registration —
// so we catch errors that happen during island bootstrapping.
installJsErrorReporter();

// Auto-lightbox for static pages (data-lightbox links)
initAutoLightbox();


(window as any).sendPostFormData = sendPostFormData;

// ── ALL islands are lazy-loaded (JS chunk only when element appears on page) ──

// Navigation + widget (present on every page — loaded immediately since elements exist in DOM)
createIsland({className: 'tz-banner-init', lazy: () => import('@common/Components/Feedback/TimezoneNoticeWarnIsland'), exportName: 'default'});
createIsland({className: 'top-menu-init', lazy: () => import('@common/Components/Layout/Navigation/TopMenu'), exportName: 'TopMenu'});
createIsland({className: 'sidebar-menu-init', lazy: () => import('@common/Components/Layout/Navigation/SidebarMenu'), exportName: 'SidebarMenu'});
createIsland({className: 'mobile-menu-init', lazy: () => import('@common/Components/Layout/Navigation/MobileMenu'), exportName: 'MobileMenu'});
createIsland({className: 'support-widget-init', lazy: () => import('../Islands/Comms/Support/SupportWidgetIsland'), exportName: 'SupportWidgetIsland'});

// User pages
createIsland({className: 'dashboard-init', lazy: () => import('../Islands/User/Dashboard/DashboardIsland'), exportName: 'DashboardIsland'});
createIsland({className: 'slots-calendar-init', lazy: () => import('../Islands/User/SlotsCalendar/SlotsCalendarIsland'), exportName: 'SlotsCalendarIsland'});
createIsland({className: 'booking-form-init', lazy: () => import('../Islands/User/Bookings/BookingForm'), exportName: 'BookingFormIsland'});
createIsland({className: 'bookings-list-init', lazy: () => import('../Islands/User/Bookings/BookingsList'), exportName: 'BookingsListIsland'});
createIsland({className: 'expert-profile-init', lazy: () => import('../Islands/User/Users/ExpertProfile'), exportName: 'ExpertProfileIsland'});
createIsland({className: 'user-profile-init', lazy: () => import('../Islands/User/Users/UserProfileIsland'), exportName: 'UserProfileIsland'});
createIsland({className: 'balance-init', lazy: () => import('../Islands/User/Bookings/BalanceIsland'), exportName: 'BalanceIsland'});
createIsland({className: 'registration-form-init', lazy: () => import('../Islands/User/Users/RegistrationForm'), exportName: 'RegistrationFormIsland'});
createIsland({className: 'invite-error-init', lazy: () => import('../Islands/User/InviteError/InviteErrorIsland'), exportName: 'InviteErrorIsland'});

// Expert pages
createIsland({className: 'expert-slots-init', lazy: () => import('../Islands/Expert/ExpertSlots/ExpertSlotsIsland'), exportName: 'ExpertSlotsIsland'});
createIsland({className: 'expert-bookings-init', lazy: () => import('../Islands/User/Bookings/ExpertBookings'), exportName: 'ExpertBookingsIsland'});

// Support
createIsland({className: 'support-page-init', lazy: () => import('../Islands/Comms/Support/SupportPageIsland'), exportName: 'SupportPageIsland'});

// IM
createIsland({className: 'im-page-init', lazy: () => import('../Islands/Comms/Im/ImPageIsland'), exportName: 'ImPageIsland'});

// Admin (only loaded for moderator+ users)
createIsland({className: 'admin-dashboard-init', lazy: () => import('../Islands/AdminPanel/Shell/AdminDashboard/AdminDashboardIsland'), exportName: 'AdminDashboardIsland'});
createIsland({className: 'users-grid-init', lazy: () => import('../Islands/User/Users/UsersGrid'), exportName: 'UsersGridIsland'});
createIsland({className: 'admin-panel-init', lazy: () => import('../Islands/AdminPanel/Shell/AdminPanelIsland'), exportName: 'AdminPanelIsland'});
createIsland({className: 'admin-bookings-init', lazy: () => import('../Islands/AdminPanel/Bookings/AdminBookingsIsland'), exportName: 'AdminBookingsIsland'});
createIsland({className: 'admin-finance-init', lazy: () => import('../Islands/AdminPanel/Money/AdminFinanceIsland'), exportName: 'AdminFinanceIsland'});
createIsland({className: 'admin-support-init', lazy: () => import('../Islands/AdminPanel/Support/AdminSupportIsland'), exportName: 'AdminSupportIsland'});
createIsland({className: 'admin-system-settings-init', lazy: () => import('../Islands/AdminPanel/System/AdminSystemSettingsIsland'), exportName: 'AdminSystemSettingsIsland'});
createIsland({className: 'admin-logs-viewer-init', lazy: () => import('../Islands/AdminPanel/System/AdminLogsViewerIsland'), exportName: 'AdminLogsViewerIsland'});
createIsland({className: 'admin-email-queue-init', lazy: () => import('../Islands/AdminPanel/System/EmailQueue/EmailQueueIsland'), exportName: 'EmailQueueIsland'});
createIsland({className: 'admin-static-pages-init', lazy: () => import('../Islands/AdminPanel/System/AdminStaticPagesIsland'), exportName: 'AdminStaticPagesIsland'});
