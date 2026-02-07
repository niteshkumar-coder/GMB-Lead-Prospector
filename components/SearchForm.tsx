
import React, { useState } from 'react';
import { INDIAN_LOCATIONS } from '../data/cities';

interface SearchFormProps {
  onSearch: (keyword: string, location: string, radius: number) => void;
  isLoading: boolean;
}

const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading }) => {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(10); // Default radius 10km

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword || !location) return;
    onSearch(keyword, location, radius);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Business Keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. Roofers, Web Designers"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Target Location</label>
            <input
              type="text"
              list="indian-cities"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Search or type a city..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
              required
              disabled={isLoading}
            />
            <datalist id="indian-cities">
              {INDIAN_LOCATIONS.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-semibold text-slate-700">Search Radius</label>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{radius} km</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] text-slate-400">1km</span>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
                className="flex-grow h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                disabled={isLoading}
              />
              <span className="text-[10px] text-slate-400">100km</span>
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-10 px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 ${isLoading ? 'opacity-70 cursor-not-allowed shadow-inner' : 'shadow-sm'}`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Prospecting...
                </>
              ) : (
                'Generate 100+ Leads'
              )}
            </button>
          </div>
        </div>
      </form>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-500 italic">
          Targeting ranking positions #6 to #100 within {radius}km of {location || 'target area'}.
        </p>
        {isLoading && (
          <span className="text-[10px] font-bold text-indigo-500 animate-pulse uppercase tracking-widest">
            Gemini is deep-scanning Google Maps...
          </span>
        )}
      </div>
    </div>
  );
};

export default SearchForm;
