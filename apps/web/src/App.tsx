import { Routes, Route, Link, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SellerApplicationPage from './pages/SellerApplicationPage';
import SellerShowsPage from './pages/SellerShowsPage';
import SellerShowFormPage from './pages/SellerShowFormPage';
import SellerInventoryPage from './pages/SellerInventoryPage';
import SellerInventoryFormPage from './pages/SellerInventoryFormPage';
import UpcomingShowsPage from './pages/UpcomingShowsPage';
import ShowDetailPage from './pages/ShowDetailPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function AppShell() {
  const { isAuthenticated, user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl font-extrabold text-brand-500">Arremate</span>
              <span className="text-xs font-medium text-gray-400 hidden sm:block">Live Shopping</span>
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
              {isAuthenticated && (
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
                </>
              )}
            </nav>

            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-gray-600">{user?.email}</span>
                  <button
                    onClick={signOut}
                    className="text-sm font-medium text-gray-600 hover:text-brand-500 transition-colors"
                  >
                    Sair
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm font-medium text-gray-600 hover:text-brand-500 transition-colors"
                  >
                    Entrar
                  </Link>
                  <button className="bg-brand-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
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
          <Route path="/seller/inventory" element={<SellerInventoryPage />} />
          <Route path="/seller/inventory/:id" element={<SellerInventoryFormPage />} />
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
