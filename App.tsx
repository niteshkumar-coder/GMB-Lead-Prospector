
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

  // Handle Quota Countdown
  useEffect(() => {
    if (retryTimer !== null && retryTimer > 0) {
      countdownInterval.current = window.setInterval(() => {
        setRetryTimer(prev => (prev && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (retryTimer === 0) {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      setRetryTimer(null);
      // Auto-resume if we have last params
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
    setSearchStatus('Connecting to Gemini API...');
    setLastSearchParams({ k: keyword, l: location, r: radius });

    let currentProgress = 0;
    progressInterval.current = window.setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += (Math.random() * 0.8 + 0.2);
        setSearchProgress(Math.floor(currentProgress));
        if (currentProgress < 30) setSearchStatus('Searching Google Maps Database...');
        else if (currentProgress < 70) setSearchStatus('Extracting Business Details...');
        else setSearchStatus('Ranking Prospects...');
      }
    }, 400);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Deep Scan Success!');
      setLeads(newLeads);
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      
      if (err instanceof QuotaError) {
        setError(`FREE TIER LIMIT: Too many requests. Resuming scan in ${err.retryAfter}s...`);
        setRetryTimer(err.retryAfter);
        setSearchStatus('Cooling Down (API Limit)...');
      } else {
        setError(err?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        if (retryTimer === null) setSearchProgress(0);
      }, 800);
    }
  }, [userCoords, retryTimer]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight flex items-center gap-3">
              GMB Deep Scanner
              {retryTimer !== null && (
                <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full animate-pulse border border-amber-200">
                  Rate Limited
                </span>
              )}
            </h2>
            <p className="text-slate-600 font-medium tracking-tight">
              Scanning rank 6-100 for high-quality marketing leads.
            </p>
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${geoStatus === 'active' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            <span className={`h-2 w-2 rounded-full ${geoStatus === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></span>
            {geoStatus === 'active' ? 'GPS Active' : 'GPS Idle'}
          </div>
        </div>

        {retryTimer !== null && (
          <div className="mb-8 bg-amber-50 border-2 border-amber-200 p-6 rounded-2xl flex flex-col items-center text-center shadow-sm animate-in zoom-in-95">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-sm">
              <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-amber-900 mb-1 uppercase tracking-tight">Gemini API Cooldown</h3>
            <p className="text-amber-700 text-sm font-bold mb-4">You've hit the Free Tier limit. Resuming scan automatically in:</p>
            <div className="text-5xl font-black text-amber-600 tracking-tighter tabular-nums">
              {retryTimer}s
            </div>
            <p className="mt-4 text-[10px] text-amber-500 uppercase font-black tracking-widest bg-white px-4 py-1 rounded-full border border-amber-100">
              System is on standby • DO NOT REFRESH
            </p>
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
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0 text-red-500">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-red-800">Scan Interrupted</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        
        {leads.length > 0 && <LeadTable leads={leads} />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-400 text-sm font-medium">
          <p>&copy; {new Date().getFullYear()} GMB Precision Rank Scanner. Smart Recovery System Enabled.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
