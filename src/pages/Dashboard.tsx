import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FileText } from 'lucide-react';
import { Shop, getDefaultShopId } from '../utils/lensUtils';
import { Link } from 'react-router-dom';

export default function Dashboard({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        setShops([
          { id: '1', name: 'SS Opticals' },
          { id: '2', name: 'Narbada Eye Care' }
        ]);
        setLoading(false);
        return;
      }

      const { data: shopsData } = await supabase.from('shops').select('*');
      if (shopsData && shopsData.length > 0) {
        setShops(shopsData);
      }
      setLoading(false);
    }
    fetchShops();
  }, [isDemo]);

  if (loading) return <div className="p-8 text-center text-sm">Loading Dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      {/* Reports Button */}
      <div className="grid grid-cols-1">
        <Link
          to="/reports"
          className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all flex justify-between items-center group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-800 dark:text-white">Reports</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Individual & Combined shop reports</p>
            </div>
          </div>
          <svg className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
