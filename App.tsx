
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import SearchForm from './components/SearchForm';
import LeadTable from './components/LeadTable';
import LeadStats from './components/LeadStats';
import { Lead } from './types';
import { fetchGmbLeads, QuotaError } from './services/geminiService';

const App: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryTimer, setRetryTimer] = useState<number | null>(null);
  const [lastSearchParams, setLastSearchParams] = useState<{k: string, l: string, r: number} | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number, longitude: number } | undefined>();
  const [geoStatus, setGeoStatus] = useState<'idle' | 'detecting' | 'active' | 'denied'>('idle');
  
  const progressInterval = useRef<number | null>(null);
  const countdownInterval = useRef<number | null>(null);

  const requestLocation = useCallback(() => {
    setGeoStatus('detecting');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          setGeoStatus('active');
        },
        () => setGeoStatus('denied'),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setGeoStatus('denied');
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const handleCancelCooldown = () => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    setRetryTimer(null);
    setIsLoading(false);
    setError(null);
    setSearchProgress(0);
  };

  const handleClear = () => {
    if (window.confirm("Clear all results?")) {
      setLeads([]);
      setError(null);
    }
  };

  useEffect(() => {
    if (retryTimer !== null && retryTimer > 0) {
      countdownInterval.current = window.setInterval(() => {
        setRetryTimer(prev => (prev && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (retryTimer === 0) {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      setRetryTimer(null);
      if (lastSearchParams) {
        handleSearch(lastSearchParams.k, lastSearchParams.l, lastSearchParams.r);
      }
    }
    return () => { if (countdownInterval.current) clearInterval(countdownInterval.current); };
  }, [retryTimer, lastSearchParams]);

  const handleSearch = useCallback(async (keyword: string, location: string, radius: number) => {
    setIsLoading(true);
    setError(null);
    setRetryTimer(null);
    setSearchProgress(0);
    setSearchStatus('Connecting to Maps Network...');
    setLastSearchParams({ k: keyword, l: location, r: radius });

    let currentProgress = 0;
    progressInterval.current = window.setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += (Math.random() * 2 + 0.5);
        setSearchProgress(Math.floor(currentProgress));
        if (currentProgress < 30) setSearchStatus('Searching Businesses...');
        else if (currentProgress < 70) setSearchStatus(`Scanning ${radius}km range...`);
        else setSearchStatus('Analyzing GMB Rankings...');
      }
    }, 150);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Search Complete');
      
      setLeads(prev => {
        const existingNames = new Set(prev.map(l => l.businessName.toLowerCase()));
        const uniqueNew = newLeads.filter(l => !existingNames.has(l.businessName.toLowerCase()));
        return [...prev, ...uniqueNew].sort((a, b) => a.rank - b.rank);
      });
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (err instanceof QuotaError) {
        setError(`Maps Busy: Retrying in ${err.retryAfter}s`);
        setRetryTimer(err.retryAfter);
      } else {
        setError(err?.message || "Something went wrong.");
      }
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        if (retryTimer === null) setSearchProgress(0);
      }, 500);
    }
  }, [userCoords, retryTimer]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <Header />
      
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-end gap-4">
          <div>
            <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tighter">
              GMB DEEP SCANNER
            </h2>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
              <span className="w-4 h-0.5 bg-indigo-600"></span>
              Precision Lead Intelligence
            </p>
          </div>
          
          <div className="flex gap-2">
            {leads.length > 0 && (
              <button onClick={handleClear} className="px-4 py-2 text-[10px] font-black text-red-500 bg-red-50 border border-red-100 rounded-xl hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest">
                Clear
              </button>
            )}
            <div className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-slate-400 border border-slate-200">
              {geoStatus === 'active' ? 'GPS Active' : 'City Mode'}
            </div>
          </div>
        </div>

        {retryTimer !== null && (
          <div className="mb-8 bg-slate-900 text-white p-8 rounded-[2rem] text-center shadow-xl">
            <h3 className="text-xl font-black uppercase mb-2">Syncing with Google Maps...</h3>
            <p className="text-slate-400 text-sm mb-6">Cooling down to prevent rate limits. Resuming in {retryTimer}s</p>
            <button onClick={handleCancelCooldown} className="px-6 py-2 bg-slate-800 text-white font-black rounded-xl text-xs uppercase">Cancel</button>
          </div>
        )}

        <SearchForm 
          onSearch={handleSearch} 
          isLoading={isLoading || retryTimer !== null} 
          progress={searchProgress}
          status={searchStatus}
          isGeoActive={geoStatus === 'active'}
        />

        {error && retryTimer === null && (
          <div className="bg-red-50 border-2 border-red-100 p-6 mb-8 rounded-[2rem] animate-in fade-in">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-red-500 text-white rounded-xl shadow-lg shadow-red-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="font-black text-red-900 uppercase text-[10px] tracking-widest">Scanner Error</h4>
                <p className="text-sm text-red-700 font-bold">{error}</p>
              </div>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        {leads.length > 0 && <LeadTable leads={leads} />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-4">
          <span className="font-black text-slate-900 uppercase tracking-widest text-sm">Lead Engine PRO</span>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">Rank 6-30 GMB Intelligence</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
