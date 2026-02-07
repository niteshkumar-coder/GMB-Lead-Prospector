
import React, { useState, useEffect } from 'react';
import { INDIAN_LOCATIONS } from '../data/cities';

interface SearchFormProps {
  onSearch: (keyword: string, location: string, radius: number) => void;
  isLoading: boolean;
  progress: number;
  status: string;
}

const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading, progress, status }) => {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(10);
  const [hasGeo, setHasGeo] = useState(false);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then(res => {
        setHasGeo(res.state === 'granted');
      });
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword || !location) return;
    onSearch(keyword, location, radius);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8 relative overflow-hidden">
      {hasGeo && !isLoading && (
        <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] px-3 py-1 font-bold uppercase tracking-wider rounded-bl-lg flex items-center gap-1 shadow-sm z-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          Precise GPS Used
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Business Keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. Real Estate, Hospitals"
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
              placeholder="City Name..."
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
              <label className="block text-sm font-semibold text-slate-700">Scan Radius</label>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded underline decoration-indigo-200 underline-offset-2">{radius} km</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Min</span>
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
              <span className="text-[10px] text-slate-400 font-bold uppercase">Max</span>
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-10 px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : 'shadow-md active:scale-95'}`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Scanning...
                </>
              ) : (
                `Scan ${radius}km Area`
              )}
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="mt-2 space-y-3 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Radius Extraction</span>
                <span className="text-sm font-bold text-indigo-600 flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
                  {status}
                </span>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{progress}%</span>
              </div>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner border border-slate-200">
              <div 
                className="h-full bg-indigo-600 transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-center text-[10px] text-slate-500 font-medium italic">Finding all businesses inside the {radius}km zone...</p>
          </div>
        )}
      </form>
    </div>
  );
};

export default SearchForm;
