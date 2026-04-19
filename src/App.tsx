import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import StockPage from './pages/StockPage';
import OrderPage from './pages/OrderPage';
import Auth from './components/Auth';
import { LayoutDashboard, Package, ShoppingCart, LogOut, Menu, X } from 'lucide-react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';

function App() {
  const [session, setSession] = useState<any>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_URL === 'https://placeholder-url.supabase.co') {
      console.warn("Supabase credentials missing or placeholder. App will run in demo mode.");
      setIsConfigured(false);
      setSession({ user: { email: 'demo@example.com' } });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Auth />
      </div>
    );
  }

  return (
    <Router>
      <AppContent session={session} setSession={setSession} isConfigured={isConfigured} isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
    </Router>
  );
}

function AppContent({ session, setSession, isConfigured, isMenuOpen, setIsMenuOpen }: any) {
  const location = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location, setIsMenuOpen]);

  return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
        {!isConfigured && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
            <p className="font-bold">Demo Mode</p>
            <p>Supabase is not configured. Data will not persist and shop data is mocked.</p>
          </div>
        )}
        <nav className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">LensLedger</span>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    to="/"
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${location.pathname === '/' ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Link>
                  <Link
                    to="/stock"
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${location.pathname === '/stock' ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Stock
                  </Link>
                  <Link
                    to="/order"
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${location.pathname === '/order' ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Orders
                  </Link>
                </div>
              </div>
              <div className="hidden sm:flex items-center">
                <button
                  onClick={() => isConfigured ? supabase.auth.signOut() : setSession(null)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </button>
              </div>
              <div className="flex items-center sm:hidden">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                  aria-label="Open main menu"
                >
                  <span className="sr-only">Open main menu</span>
                  {isMenuOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          <div className={`${isMenuOpen ? 'block' : 'hidden'} sm:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700`}>
            <div className="pt-2 pb-3 space-y-1">
              <Link
                to="/"
                className={`flex items-center px-3 py-2 text-base font-medium ${location.pathname === '/' ? 'bg-indigo-50 dark:bg-indigo-900/50 border-l-4 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                <LayoutDashboard className="w-5 h-5 mr-3" />
                Dashboard
              </Link>
              <Link
                to="/stock"
                className={`flex items-center px-3 py-2 text-base font-medium ${location.pathname === '/stock' ? 'bg-indigo-50 dark:bg-indigo-900/50 border-l-4 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                <Package className="w-5 h-5 mr-3" />
                Stock
              </Link>
              <Link
                to="/order"
                className={`flex items-center px-3 py-2 text-base font-medium ${location.pathname === '/order' ? 'bg-indigo-50 dark:bg-indigo-900/50 border-l-4 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                <ShoppingCart className="w-5 h-5 mr-3" />
                Orders
              </Link>
            </div>
            <div className="pt-4 pb-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center px-4">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                    <span className="text-indigo-600 dark:text-indigo-300 font-bold">{session?.user?.email?.[0].toUpperCase()}</span>
                  </div>
                </div>
                <div className="ml-3">
                  <div className="text-base font-medium text-gray-800 dark:text-gray-200">{session?.user?.email}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <button
                  onClick={() => isConfigured ? supabase.auth.signOut() : setSession(null)}
                  className="flex w-full items-center px-4 py-2 text-base font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard isDemo={!isConfigured} />} />
            <Route path="/stock" element={<StockPage isDemo={!isConfigured} />} />
            <Route path="/order" element={<OrderPage isDemo={!isConfigured} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
  );
}

export default App;
