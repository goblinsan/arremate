import { useState } from 'react';
import { Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom';
import { ShoppingCart, Store, UserRound, LogOut, Plus } from 'lucide-react';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import SellerApplicationPage from './pages/SellerApplicationPage';
import SellerShowsPage from './pages/SellerShowsPage';
import SellerShowFormPage from './pages/SellerShowFormPage';
import SellerLiveControlPage from './pages/SellerLiveControlPage';
import SellerInventoryPage from './pages/SellerInventoryPage';
import SellerInventoryFormPage from './pages/SellerInventoryFormPage';
import SellerOrdersPage from './pages/SellerOrdersPage';
import SellerOrderDetailPage from './pages/SellerOrderDetailPage';
import SellerPayoutLedgerPage from './pages/SellerPayoutLedgerPage';
import BuyerOrdersPage from './pages/BuyerOrdersPage';
import BuyerOrderDetailPage from './pages/BuyerOrderDetailPage';
import UpcomingShowsPage from './pages/UpcomingShowsPage';
import ShowDetailPage from './pages/ShowDetailPage';
import LiveRoomPage from './pages/LiveRoomPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function ProfileSwitcher() {
  const { user, profile, currentRole, isSeller, switchProfile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!user) return null;

  const initials = (profile?.name ?? user.email)
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  const isSellerMode = currentRole === 'SELLER' || currentRole === 'ADMIN';

  async function handleSwitch(role: 'BUYER' | 'SELLER') {
    setSwitching(true);
    try {
      await switchProfile(role);
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 focus:outline-none"
        aria-label="Abrir menu de perfil"
        aria-expanded={open}
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-colors ${isSellerMode ? 'bg-brand-500' : 'bg-gray-400'}`}>
          {initials || '?'}
        </div>
        <span className="hidden sm:block text-xs font-medium text-gray-500">
          {isSellerMode ? 'Vendedor' : 'Comprador'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-400">Conectado como</p>
            <p className="text-sm font-medium text-gray-800 truncate">{user.email}</p>
          </div>

          <div className="py-1">
            <button
              onClick={() => !switching && handleSwitch('BUYER')}
              disabled={switching}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${!isSellerMode ? 'bg-brand-50 text-brand-600 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <ShoppingCart className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Perfil Comprador</p>
                {!isSellerMode && <p className="text-xs text-brand-500">Ativo</p>}
              </div>
            </button>

            {isSeller && (
              <button
                onClick={() => !switching && handleSwitch('SELLER')}
                disabled={switching}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${isSellerMode ? 'bg-brand-50 text-brand-600 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <Store className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-medium">Perfil Vendedor</p>
                  {isSellerMode && <p className="text-xs text-brand-500">Ativo</p>}
                </div>
              </button>
            )}

            {!isSeller && (
              <Link
                to="/seller-application"
                onClick={() => setOpen(false)}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-5 h-5 shrink-0" />
                <p className="font-medium">Tornar-se Vendedor</p>
              </Link>
            )}
          </div>

          <div className="border-t border-gray-100 py-1">
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
            >
              <UserRound className="w-5 h-5 shrink-0" />
              <p>Meu Perfil</p>
            </Link>
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-3"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <p>Sair</p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AppShell() {
  const { isAuthenticated, currentRole, startSignUp } = useAuth();
  const navigate = useNavigate();

  const isSellerMode = currentRole === 'SELLER' || currentRole === 'ADMIN';

  async function handleRegisterClick() {
    try {
      await startSignUp();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar cadastro';
      navigate(`/login?oauthError=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/assets/logo.svg"
                alt="Arremate"
                className="h-20 w-auto object-contain"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                  }`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/shows"
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                  }`
                }
              >
                Shows
              </NavLink>
              <NavLink
                to="/auctions"
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                  }`
                }
              >
                Leilões
              </NavLink>
              {isAuthenticated && isSellerMode && (
                <>
                  <NavLink
                    to="/seller/shows"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                      }`
                    }
                  >
                    Meus Shows
                  </NavLink>
                  <NavLink
                    to="/seller/inventory"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                      }`
                    }
                  >
                    Inventário
                  </NavLink>
                  <NavLink
                    to="/seller/orders"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                      }`
                    }
                  >
                    Pedidos
                  </NavLink>
                  <NavLink
                    to="/seller/payouts"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                      }`
                    }
                  >
                    Repasses
                  </NavLink>
                </>
              )}
              {isAuthenticated && !isSellerMode && (
                <NavLink
                  to="/orders"
                  className={({ isActive }) =>
                    `text-sm font-medium transition-colors ${
                      isActive ? 'text-brand-500' : 'text-gray-600 hover:text-brand-500'
                    }`
                  }
                >
                  Minhas Compras
                </NavLink>
              )}
            </nav>

            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <ProfileSwitcher />
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm font-medium text-gray-600 hover:text-brand-500 transition-colors"
                  >
                    Entrar
                  </Link>
                  <button
                    onClick={handleRegisterClick}
                    className="bg-brand-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Cadastrar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route
            path="/auth/callback"
            element={<AuthCallbackPage />}
          />
          <Route path="/shows" element={<UpcomingShowsPage />} />
          <Route path="/shows/:id" element={<ShowDetailPage />} />
          <Route
            path="/auctions"
            element={
              <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">
                Leilões em breve…
              </div>
            }
          />
          <Route path="/seller-application" element={<SellerApplicationPage />} />
          <Route path="/seller/shows" element={<SellerShowsPage />} />
          <Route path="/seller/shows/:id" element={<SellerShowFormPage />} />
          <Route path="/seller/shows/:id/live" element={<SellerLiveControlPage />} />
          <Route path="/seller/inventory" element={<SellerInventoryPage />} />
          <Route path="/seller/inventory/:id" element={<SellerInventoryFormPage />} />
          <Route path="/seller/orders" element={<SellerOrdersPage />} />
          <Route path="/seller/orders/:orderId" element={<SellerOrderDetailPage />} />
          <Route path="/seller/payouts" element={<SellerPayoutLedgerPage />} />
          <Route path="/orders" element={<BuyerOrdersPage />} />
          <Route path="/orders/:orderId" element={<BuyerOrderDetailPage />} />
          <Route path="/shows/:id/live" element={<LiveRoomPage />} />
        </Routes>
      </main>

      <footer className="bg-gray-900 text-gray-400 text-sm py-10 mt-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="font-semibold text-white mb-1">Arremate</p>
          <p>© {new Date().getFullYear()} Arremate Tecnologia Ltda. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
