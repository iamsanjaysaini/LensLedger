import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import StockPage from './pages/StockPage';
import OrderPage from './pages/OrderPage';
import Auth from './components/Auth';
import { LayoutDashboard, Package, ShoppingCart, LogOut } from 'lucide-react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';

function App() {
  const [session, setSession] = useState<any>(null);
  const [isConfigured, setIsConfigured] = useState(true);

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
    return <Auth />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {!isConfigured && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
            <p className="font-bold">Demo Mode</p>
            <p>Supabase is not configured. Data will not persist and shop data is mocked.</p>
          </div>
        )}
        <nav className="bg-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <span className="text-xl font-bold text-indigo-600">LensLedger</span>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    to="/"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Link>
                  <Link
                    to="/stock"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Stock
                  </Link>
                  <Link
                    to="/order"
                    className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Orders
                  </Link>
                </div>
              </div>
              <div className="flex items-center">
                <button
                  onClick={() => isConfigured ? supabase.auth.signOut() : setSession(null)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard isDemo={!isConfigured} />} />
            <Route path="/stock" element={<StockPage isDemo={!isConfigured} />} />
            <Route path="/order" element={<OrderPage isDemo={!isConfigured} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
