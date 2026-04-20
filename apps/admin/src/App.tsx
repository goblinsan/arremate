import { NavLink, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SellerApplicationsPage from './pages/SellerApplicationsPage';
import SellerApplicationDetailPage from './pages/SellerApplicationDetailPage';
import DisputesPage from './pages/DisputesPage';
import DisputeDetailPage from './pages/DisputeDetailPage';
import AuditEventsPage from './pages/AuditEventsPage';
import SystemHealthPage from './pages/SystemHealthPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';

const navItems = [
  { to: '/', label: 'Dashboard', emoji: '📊' },
  { to: '/auctions', label: 'Leilões', emoji: '🔨' },
  { to: '/seller-applications', label: 'Vendedores', emoji: '🏪' },
  { to: '/disputes', label: 'Disputas', emoji: '⚖️' },
  { to: '/users', label: 'Usuários', emoji: '👥' },
  { to: '/payments', label: 'Pagamentos', emoji: '💳' },
  { to: '/audit', label: 'Auditoria', emoji: '🔍' },
  { to: '/health', label: 'Saúde', emoji: '🩺' },
  { to: '/settings', label: 'Configurações', emoji: '⚙️' },
];

function AdminShell() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="px-6 py-5 border-b border-gray-700">
          <span className="text-xl font-extrabold text-brand-500">Arremate</span>
          <span className="ml-2 text-xs text-gray-400 font-medium">Admin</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map(({ to, label, emoji }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{emoji}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">v0.0.0 · Admin Panel</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800">Painel Administrativo</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.email ?? 'admin@arremate.com.br'}</span>
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
              A
            </div>
            <button
              onClick={signOut}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/auctions"
              element={<PlaceholderPage title="Leilões" />}
            />
            <Route path="/seller-applications" element={<SellerApplicationsPage />} />
            <Route path="/seller-applications/:id" element={<SellerApplicationDetailPage />} />
            <Route path="/disputes" element={<DisputesPage />} />
            <Route path="/disputes/:id" element={<DisputeDetailPage />} />
            <Route
              path="/users"
              element={<PlaceholderPage title="Usuários" />}
            />
            <Route
              path="/payments"
              element={<PlaceholderPage title="Pagamentos" />}
            />
            <Route path="/audit" element={<AuditEventsPage />} />
            <Route path="/health" element={<SystemHealthPage />} />
            <Route
              path="/settings"
              element={<PlaceholderPage title="Configurações" />}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-2xl font-semibold mb-2">{title}</p>
      <p className="text-sm">Em desenvolvimento…</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AdminShell />
            </AuthGuard>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

