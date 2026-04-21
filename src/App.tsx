import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import { LayoutDashboard, Package, ShoppingCart, LogOut, Tag, Home as HomeIcon, Info } from 'lucide-react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
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

  const isDemo = !isConfigured;

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
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">LensLedger</span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <NavLink
                  to="/"
                  className={({ isActive }) => `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <HomeIcon className="w-4 h-4 mr-2" />
                  Home
                </NavLink>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) => `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </NavLink>
                <NavLink
                  to="/stock"
                  className={({ isActive }) => `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Package className="w-4 h-4 mr-2" />
                  Stock
                </NavLink>
                <NavLink
                  to="/order"
                  className={({ isActive }) => `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Orders
                </NavLink>
                <NavLink
                  to="/sell"
                  className={({ isActive }) => `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Tag className="w-4 h-4 mr-2" />
                  Sell
                </NavLink>
                <NavLink
                  to="/about"
                  className={({ isActive }) => `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive ? 'border-indigo-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Info className="w-4 h-4 mr-2" />
                  About
                </NavLink>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex flex-col items-end mr-1 sm:mr-2">
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px] sm:max-w-none">
                  {session?.user?.email}
                </span>
              </div>
              <button
                onClick={() => isConfigured ? supabase.auth.signOut() : setSession(null)}
                className="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 border border-transparent text-[10px] sm:text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                <LogOut className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                <span className="hidden xs:inline">Sign Out</span>
                <span className="xs:hidden">Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu (Direct Buttons) */}
        <div className="sm:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <NavLink
              to="/"
              className={({ isActive }) => `flex flex-col items-center justify-center py-2 px-4 rounded-md text-[10px] font-medium transition-colors ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <HomeIcon className="w-5 h-5 mb-1" />
              Home
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `flex flex-col items-center justify-center py-2 px-4 rounded-md text-[10px] font-medium transition-colors ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <LayoutDashboard className="w-5 h-5 mb-1" />
              Dashboard
            </NavLink>
            <NavLink
              to="/stock"
              className={({ isActive }) => `flex flex-col items-center justify-center py-2 px-4 rounded-md text-[10px] font-medium transition-colors ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <Package className="w-5 h-5 mb-1" />
              Stock
            </NavLink>
            <NavLink
              to="/order"
              className={({ isActive }) => `flex flex-col items-center justify-center py-2 px-4 rounded-md text-[10px] font-medium transition-colors ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <ShoppingCart className="w-5 h-5 mb-1" />
              Orders
            </NavLink>
            <NavLink
              to="/sell"
              className={({ isActive }) => `flex flex-col items-center justify-center py-2 px-4 rounded-md text-[10px] font-medium transition-colors ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <Tag className="w-5 h-5 mb-1" />
              Sell
            </NavLink>
            <NavLink
              to="/about"
              className={({ isActive }) => `flex flex-col items-center justify-center py-2 px-4 rounded-md text-[10px] font-medium transition-colors ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <Info className="w-5 h-5 mb-1" />
              About
            </NavLink>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
        <Outlet context={{ isDemo }} />
      </main>
    </div>
  );
}

export default App;
