export default function About() {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">About LensLedger</h1>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
          LensLedger is a specialized management system designed for optical retailers.
          It provides tools for tracking stock levels, processing lens orders, and managing retail sales
          efficiently across multiple shop locations.
        </p>
      </div>
    </div>
  );
}
