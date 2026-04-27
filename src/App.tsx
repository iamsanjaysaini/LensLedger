// App.tsx
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import StockPage from './pages/StockPage';
import OrderPage from './pages/OrderPage';
import SellPage from './pages/SellPage';
import ReportsPage from './pages/ReportsPage';
import Auth from './components/Auth';
import { LayoutDashboard, Package, ShoppingCart, LogOut, Tag, FileText } from 'lucide-react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';

function App() {
  const [session, setSession] = useState<any>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const location = useLocation();

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_URL === 'https://placeholder-url.supabase.co') {
      console.warn("Supabase credentials missing or placeholder. App will run in demo mode.");
      setIsConfigured(false);
      setSession({ user: { email: 'demo@example.com' } });
      return;
    }

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Auth />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      {!isConfigured && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
          <p className="font-bold">Demo Mode</p>
          <p>Supabase is not configured. Data will not persist and shop data is mocked.</p>
        </div>
      )}
      <nav className="bg-white dark:bg-gray-800 lg:!bg-slate-900 lg:dark:!bg-black shadow-lg border-b border-gray-200 dark:border-gray-700 lg:!border-amber-500/50 sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex-shrink-0 flex flex-col justify-center group">
                <span className="text-[10px] leading-tight font-bold text-gray-400 dark:text-gray-500 lg:!text-amber-600/70 uppercase tracking-[0.2em] transition-all">S.S. Opticals</span>
                <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400 lg:!text-amber-500 lg:dark:!text-amber-500 lg:font-black lg:tracking-tight transition-all -mt-1">LensLedger</span>
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link to="/" className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-all ${location.pathname === '/' ? 'border-indigo-500 text-gray-900 dark:text-white lg:!text-amber-400 lg:!border-amber-400 lg:dark:!text-amber-400 lg:dark:!border-amber-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 lg:!text-amber-600/70 lg:hover:!text-amber-400 lg:dark:!text-amber-600/60 lg:dark:hover:!text-amber-400'}`}>
                  <LayoutDashboard className="w-4 h-4 mr-2" />Dashboard
                </Link>
                <Link to="/stock" className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-all ${location.pathname === '/stock' ? 'border-indigo-500 text-gray-900 dark:text-white lg:!text-amber-400 lg:!border-amber-400 lg:dark:!text-amber-400 lg:dark:!border-amber-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 lg:!text-amber-600/70 lg:hover:!text-amber-400 lg:dark:!text-amber-600/60 lg:dark:hover:!text-amber-400'}`}>
                  <Package className="w-4 h-4 mr-2" />Stock
                </Link>
                <Link to="/order" className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-all ${location.pathname === '/order' ? 'border-indigo-500 text-gray-900 dark:text-white lg:!text-amber-400 lg:!border-amber-400 lg:dark:!text-amber-400 lg:dark:!border-amber-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 lg:!text-amber-600/70 lg:hover:!text-amber-400 lg:dark:!text-amber-600/60 lg:dark:hover:!text-amber-400'}`}>
                  <ShoppingCart className="w-4 h-4 mr-2" />Orders
                </Link>
                <Link to="/sell" className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-all ${location.pathname === '/sell' ? 'border-indigo-500 text-gray-900 dark:text-white lg:!text-amber-400 lg:!border-amber-400 lg:dark:!text-amber-400 lg:dark:!border-amber-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 lg:!text-amber-600/70 lg:hover:!text-amber-400 lg:dark:!text-amber-600/60 lg:dark:hover:!text-amber-400'}`}>
                  <Tag className="w-4 h-4 mr-2" />Sell
                </Link>
                <Link to="/reports" className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-all ${location.pathname === '/reports' ? 'border-indigo-500 text-gray-900 dark:text-white lg:!text-amber-400 lg:!border-amber-400 lg:dark:!text-amber-400 lg:dark:!border-amber-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 lg:!text-amber-600/70 lg:hover:!text-amber-400 lg:dark:!text-amber-600/60 lg:dark:hover:!text-amber-400'}`}>
                  <FileText className="w-4 h-4 mr-2" />Reports
                </Link>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex flex-col items-end mr-1 sm:mr-2">
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 lg:!text-amber-500/60 lg:dark:!text-amber-500/60 lg:font-bold truncate max-w-[120px] sm:max-w-none">
                  {session?.user?.email}
                </span>
              </div>
              <button
                onClick={() => isConfigured ? supabase.auth.signOut() : setSession(null)}
                className="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 border border-transparent text-[10px] sm:text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 lg:!bg-amber-600 lg:hover:!bg-amber-500 lg:dark:!bg-amber-600 lg:dark:hover:!bg-amber-500 lg:!text-black lg:font-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
              >
                <LogOut className="w-3 h-3 sm:w-4 h-4 mr-1" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <div className="sm:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2">
          <div className="grid grid-cols-5 gap-1">
            <Link to="/" className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-medium transition-colors ${location.pathname === '/' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <LayoutDashboard className="w-5 h-5 mb-1" />Dashboard
            </Link>
            <Link to="/stock" className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-medium transition-colors ${location.pathname === '/stock' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <Package className="w-5 h-5 mb-1" />Stock
            </Link>
            <Link to="/order" className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-medium transition-colors ${location.pathname === '/order' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <ShoppingCart className="w-5 h-5 mb-1" />Orders
            </Link>
            <Link to="/sell" className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-medium transition-colors ${location.pathname === '/sell' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <Tag className="w-5 h-5 mb-1" />Sell
            </Link>
            <Link to="/reports" className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-medium transition-colors ${location.pathname === '/reports' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <FileText className="w-5 h-5 mb-1" />Reports
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl py-4 px-4 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Dashboard isDemo={!isConfigured} />} />
          <Route path="/stock" element={<StockPage isDemo={!isConfigured} />} />
          <Route path="/order" element={<OrderPage isDemo={!isConfigured} />} />
          <Route path="/sell" element={<SellPage isDemo={!isConfigured} />} />
          <Route path="/reports" element={<ReportsPage isDemo={!isConfigured} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
