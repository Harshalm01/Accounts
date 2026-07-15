import { useState } from 'react';

interface PhotoFiltersProps {
  imageUrl?: string;
  onFilterChange?: (filterString: string) => void;
  showPreview?: boolean;
}

interface Filter {
  name: string;
  cssFilter: string;
  icon: string;
}

const FILTERS: Filter[] = [
  { name: 'None', cssFilter: 'none', icon: '⭕' },
  { name: 'Grayscale', cssFilter: 'grayscale(100%)', icon: '⚫' },
  { name: 'Sepia', cssFilter: 'sepia(100%)', icon: '🟤' },
  { name: 'Saturate', cssFilter: 'saturate(200%)', icon: '🎨' },
  { name: 'Vintage', cssFilter: 'sepia(50%) contrast(1.2)', icon: '📷' },
  { name: 'Cool', cssFilter: 'hue-rotate(180deg) saturate(1.2)', icon: '❄️' },
  { name: 'Warm', cssFilter: 'hue-rotate(-30deg) saturate(1.3)', icon: '🔥' },
  { name: 'Bright', cssFilter: 'brightness(1.3) contrast(1.1)', icon: '☀️' },
  { name: 'Dark', cssFilter: 'brightness(0.7) contrast(1.2)', icon: '🌙' },
  { name: 'Blur', cssFilter: 'blur(8px)', icon: '💨' },
  { name: 'Invert', cssFilter: 'invert(100%)', icon: '⚪' },
  { name: 'Instagram', cssFilter: 'contrast(1.1) saturate(1.2) sepia(0.1)', icon: '📱' },
];

export default function PhotoFilters({
  imageUrl = 'https://via.placeholder.com/400x300',
  onFilterChange,
  showPreview = true,
}: PhotoFiltersProps) {
  const [selectedFilter, setSelectedFilter] = useState<string>('None');

  const handleFilterSelect = (filterName: string) => {
    setSelectedFilter(filterName);
    const filter = FILTERS.find((f) => f.name === filterName);
    if (filter && onFilterChange) {
      onFilterChange(filter.cssFilter);
    }
  };

  const selectedFilterObj = FILTERS.find((f) => f.name === selectedFilter);

  return (
    <div className="space-y-4">
      {/* Preview */}
      {showPreview && selectedFilterObj && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Preview</p>
          <div className="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 aspect-video flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Preview"
              className="w-full h-full object-cover"
              style={{
                filter: selectedFilterObj.cssFilter,
              }}
            />
          </div>
        </div>
      )}

      {/* Filter Selection */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Applied Filter</p>
        <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <span className="text-xl">{selectedFilterObj?.icon}</span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{selectedFilter}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{selectedFilterObj?.cssFilter}</p>
          </div>
        </div>
      </div>

      {/* Filter Grid */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Choose Filter</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.name}
              onClick={() => handleFilterSelect(filter.name)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg transition-all ${
                selectedFilter === filter.name
                  ? 'bg-indigo-600 text-white border-2 border-indigo-700 shadow-lg'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
              }`}
            >
              <span className="text-2xl">{filter.icon}</span>
              <span className="text-xs font-semibold text-center">{filter.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter Details */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm text-blue-900 dark:text-blue-200">
          <strong>💡 Tip:</strong> Use filters to enhance campaign thumbnails and make them visually distinct. Try
          combining filters for unique effects!
        </p>
      </div>

      {/* Filter Combinations Suggestions */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Quick Combinations</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: 'Pro Black & White', filters: 'grayscale(100%) contrast(1.2)' },
            { name: 'Retro Film', filters: 'sepia(40%) saturate(1.5)' },
            { name: 'Bold Creative', filters: 'saturate(200%) brightness(1.1)' },
            { name: 'Dreamy', filters: 'blur(2px) brightness(1.05) saturate(0.9)' },
          ].map((combo) => (
            <button
              key={combo.name}
              className="p-2 text-left bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors group"
            >
              <p className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                {combo.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{combo.filters}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
