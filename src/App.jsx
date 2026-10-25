import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppErrorBoundary from './components/AppErrorBoundary'
import GuestRoute from './components/GuestRoute'
import PlatformAdminRoute from './components/PlatformAdminRoute'
import ProtectedRoute from './components/ProtectedRoute'
import SessionGuard from './components/SessionGuard'
import Spinner from './components/Spinner'
import { AuthProvider } from './hooks/useAuth'
import { PlatformAdminProvider } from './hooks/usePlatformAdmin'
import { WaiterProvider } from './hooks/useWaiter'
import DashboardLayout from './layouts/DashboardLayout'
import FounderSupportLayout from './layouts/FounderSupportLayout'
import PlatformAdminLayout from './layouts/PlatformAdminLayout'
import PublicLayout from './layouts/PublicLayout'
import WaiterLayout from './layouts/WaiterLayout'

const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const PublicMenu = lazy(() => import('./pages/PublicMenu'))
const Overview = lazy(() => import('./pages/dashboard/Overview'))
const Restaurant = lazy(() => import('./pages/dashboard/Restaurant'))
const Categories = lazy(() => import('./pages/dashboard/Categories'))
const Menu = lazy(() => import('./pages/dashboard/Menu'))
const Qr = lazy(() => import('./pages/dashboard/Qr'))
const Tables = lazy(() => import('./pages/dashboard/Tables'))
const TableWiseHome = lazy(() => import('./pages/dashboard/tableWise/TableWiseHome'))
const Waiters = lazy(() => import('./pages/dashboard/tableWise/Waiters'))
const Settings = lazy(() => import('./pages/dashboard/Settings'))
const Support = lazy(() => import('./pages/dashboard/Support'))
const WaiterLogin = lazy(() => import('./pages/waiter/WaiterLogin'))
const WaiterHome = lazy(() => import('./pages/waiter/WaiterHome'))
const WaiterAccount = lazy(() => import('./pages/waiter/WaiterAccount'))
const WaiterSession = lazy(() => import('./pages/waiter/WaiterSession'))
const WaiterOrder = lazy(() => import('./pages/waiter/WaiterOrder'))
const LiveOrders = lazy(() => import('./pages/dashboard/tableWise/LiveOrders'))
const Kitchen = lazy(() => import('./pages/dashboard/tableWise/Kitchen'))
const RunningBills = lazy(() => import('./pages/dashboard/tableWise/RunningBills'))
const Collections = lazy(() => import('./pages/dashboard/tableWise/Collections'))
const OrderHistory = lazy(() => import('./pages/dashboard/tableWise/OrderHistory'))
const Reports = lazy(() => import('./pages/dashboard/Reports'))
const PlatformAdminLogin = lazy(() => import('./pages/platformAdmin/PlatformAdminLogin'))
const PlatformAdminChangePassword = lazy(() => import('./pages/platformAdmin/PlatformAdminChangePassword'))
const PlatformAdminDashboard = lazy(() => import('./pages/platformAdmin/PlatformAdminDashboard'))
const PlatformAdminRestaurants = lazy(() => import('./pages/platformAdmin/PlatformAdminRestaurants'))
const PlatformAdminRestaurantDetail = lazy(() => import('./pages/platformAdmin/PlatformAdminRestaurantDetail'))
const PlatformAdminAccount = lazy(() => import('./pages/platformAdmin/PlatformAdminAccount'))
const PlatformAdminImportMenu = lazy(() => import('./pages/platformAdmin/PlatformAdminImportMenu'))
const PlatformAdminSubscriptions = lazy(() => import('./pages/platformAdmin/PlatformAdminSubscriptions'))
const PlatformAdminBilling = lazy(() => import('./pages/platformAdmin/PlatformAdminBilling'))
const PlatformAdminReports = lazy(() => import('./pages/platformAdmin/PlatformAdminReports'))
const PlatformAdminAudit = lazy(() => import('./pages/platformAdmin/PlatformAdminAudit'))
const PlatformAdminSessions = lazy(() => import('./pages/platformAdmin/PlatformAdminSessions'))
const PlatformAdminPlanned = lazy(() => import('./pages/platformAdmin/PlatformAdminPlanned'))
const SupportOverview = lazy(() => import('./pages/dashboard/Overview'))
const SupportCategories = lazy(() => import('./pages/dashboard/Categories'))
const SupportMenu = lazy(() => import('./pages/dashboard/Menu'))
const SupportTables = lazy(() => import('./pages/dashboard/Tables'))
const SupportLiveOrders = lazy(() => import('./pages/dashboard/tableWise/LiveOrders'))
const SupportKitchen = lazy(() => import('./pages/dashboard/tableWise/Kitchen'))
const SupportRunningBills = lazy(() => import('./pages/dashboard/tableWise/RunningBills'))
const SupportCollections = lazy(() => import('./pages/dashboard/tableWise/Collections'))
const SupportOrderHistory = lazy(() => import('./pages/dashboard/tableWise/OrderHistory'))
const SupportReports = lazy(() => import('./pages/dashboard/Reports'))

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PlatformAdminProvider>
          <SessionGuard>
          <AppErrorBoundary>
            <Suspense fallback={<Spinner full label="Loading Founder Console..." />}>
            <Routes>
              <Route path="/platform-admin/login" element={<PlatformAdminLogin />} />
              <Route element={<PlatformAdminRoute />}>
                {/* Forced first-login password change. Rendered without the
                    console layout so no privileged page is reachable. */}
                <Route path="/platform-admin/change-password" element={<PlatformAdminChangePassword />} />
                <Route path="/platform-admin" element={<PlatformAdminLayout />}>
                  <Route index element={<PlatformAdminDashboard />} />
                  <Route path="restaurants" element={<PlatformAdminRestaurants />} />
                  <Route path="restaurants/:restaurantId" element={<PlatformAdminRestaurantDetail />} />
                  <Route path="import-menu" element={<PlatformAdminImportMenu />} />
                  <Route path="subscriptions" element={<PlatformAdminSubscriptions />} />
                  <Route path="subscriptions/payments" element={<PlatformAdminBilling />} />
                  <Route path="reports" element={<PlatformAdminReports />} />
                  <Route path="audit" element={<PlatformAdminAudit />} />
                  <Route path="account" element={<PlatformAdminAccount />} />
                  <Route path="sessions" element={<PlatformAdminSessions />} />
                  <Route path="*" element={<PlatformAdminPlanned />} />
                </Route>
                {/* Founder support session opens the real owner dashboard for
                    exactly one restaurant, scoped server-side. */}
                <Route path="/platform-admin/support/:restaurantId" element={<FounderSupportLayout />}>
                  <Route index element={<SupportOverview />} />
                  <Route path="categories" element={<SupportCategories />} />
                  <Route path="menu" element={<SupportMenu />} />
                  <Route path="tables" element={<SupportTables />} />
                  <Route path="orders" element={<SupportLiveOrders />} />
                  <Route path="kitchen" element={<SupportKitchen />} />
                  <Route path="bills" element={<SupportRunningBills />} />
                  <Route path="collections" element={<SupportCollections />} />
                  <Route path="history" element={<SupportOrderHistory />} />
                  <Route path="reports" element={<SupportReports />} />
                </Route>
              </Route>
              <Route path="/menu/:slug" element={<PublicMenu />} />
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route element={<GuestRoute allow="owner" />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
              </Route>
              <Route element={<GuestRoute allow="waiter" />}>
                <Route path="/waiter/login" element={<WaiterLogin />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute allow="owner" />}>
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<Overview />} />
                <Route path="restaurant" element={<Restaurant />} />
                <Route path="categories" element={<Categories />} />
                <Route path="menu" element={<Menu />} />
                <Route path="tables" element={<Navigate to="/dashboard/table-wise/tables" replace />} />
                <Route path="table-wise" element={<TableWiseHome />} />
                <Route path="table-wise/tables" element={<Tables />} />
                <Route path="table-wise/orders" element={<LiveOrders />} />
                <Route path="table-wise/kitchen" element={<Kitchen />} />
                <Route path="table-wise/bills" element={<RunningBills />} />
                <Route path="table-wise/collections" element={<Collections />} />
                <Route path="table-wise/waiters" element={<Waiters />} />
                <Route path="table-wise/history" element={<OrderHistory />} />
                <Route path="table-wise/pos-printing-settings" element={<Settings />} />
                <Route path="table-wise/settings" element={<Navigate to="/dashboard/table-wise/pos-printing-settings" replace />} />
                <Route path="reports" element={<Reports />} />
                <Route path="qr" element={<Qr />} />
                <Route path="support" element={<Support />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute allow="waiter" />}>
              <Route
                path="/waiter"
                element={
                  <WaiterProvider>
                    <WaiterLayout />
                  </WaiterProvider>
                }
              >
                <Route index element={<WaiterHome />} />
                <Route path="account" element={<WaiterAccount />} />
                <Route path="sessions/:sessionId" element={<WaiterSession />} />
                <Route path="sessions/:sessionId/order" element={<WaiterOrder />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </AppErrorBoundary>
          </SessionGuard>
        </PlatformAdminProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
