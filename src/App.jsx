import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import GuestRoute from './components/GuestRoute'
import ProtectedRoute from './components/ProtectedRoute'
import Spinner from './components/Spinner'
import { AuthProvider } from './hooks/useAuth'
import { WaiterProvider } from './hooks/useWaiter'
import DashboardLayout from './layouts/DashboardLayout'
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
const TableWiseModule = lazy(() => import('./pages/dashboard/tableWise/TableWiseModule'))
const Waiters = lazy(() => import('./pages/dashboard/tableWise/Waiters'))
const Settings = lazy(() => import('./pages/dashboard/Settings'))
const WaiterLogin = lazy(() => import('./pages/waiter/WaiterLogin'))
const WaiterHome = lazy(() => import('./pages/waiter/WaiterHome'))
const WaiterSession = lazy(() => import('./pages/waiter/WaiterSession'))
const WaiterOrder = lazy(() => import('./pages/waiter/WaiterOrder'))
const LiveOrders = lazy(() => import('./pages/dashboard/tableWise/LiveOrders'))
const Kitchen = lazy(() => import('./pages/dashboard/tableWise/Kitchen'))

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
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
                <Route path="table-wise/bills" element={<TableWiseModule />} />
                <Route path="table-wise/collections" element={<TableWiseModule />} />
                <Route path="table-wise/waiters" element={<Waiters />} />
                <Route path="table-wise/history" element={<TableWiseModule />} />
                <Route path="qr" element={<Qr />} />
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
                <Route path="sessions/:sessionId" element={<WaiterSession />} />
                <Route path="sessions/:sessionId/order" element={<WaiterOrder />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
