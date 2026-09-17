import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import GuestRoute from './components/GuestRoute'
import ProtectedRoute from './components/ProtectedRoute'
import Spinner from './components/Spinner'
import { AuthProvider } from './hooks/useAuth'
import DashboardLayout from './layouts/DashboardLayout'
import PublicLayout from './layouts/PublicLayout'

const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const PublicMenu = lazy(() => import('./pages/PublicMenu'))
const Overview = lazy(() => import('./pages/dashboard/Overview'))
const Restaurant = lazy(() => import('./pages/dashboard/Restaurant'))
const Categories = lazy(() => import('./pages/dashboard/Categories'))
const Menu = lazy(() => import('./pages/dashboard/Menu'))
const Qr = lazy(() => import('./pages/dashboard/Qr'))
const Settings = lazy(() => import('./pages/dashboard/Settings'))

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/menu/:slug" element={<PublicMenu />} />
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route element={<GuestRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<Overview />} />
                <Route path="restaurant" element={<Restaurant />} />
                <Route path="categories" element={<Categories />} />
                <Route path="menu" element={<Menu />} />
                <Route path="qr" element={<Qr />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
