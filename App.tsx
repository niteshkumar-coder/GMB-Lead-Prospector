
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
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  
  const progressInterval = useRef<number | null>(null);
  const countdownInterval = useRef<number | null>(null);

  useEffect(() => {
    const key = typeof process !== 'undefined' ? process.env.API_KEY : undefined;
    setIsApiKeyMissing(!key);
  }, []);

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
    if (window.confirm("Delete all gathered leads?")) {
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
    setSearchStatus('Establishing Maps Handshake...');
    setLastSearchParams({ k: keyword, l: location, r: radius });

    let currentProgress = 0;
    progressInterval.current = window.setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += (Math.random() * 1.5 + 0.5);
        setSearchProgress(Math.floor(currentProgress));
        if (currentProgress < 20) setSearchStatus('Validating GPS Fencing...');
        else if (currentProgress < 50) setSearchStatus(`Scanning within ${radius}km...`);
        else if (currentProgress < 85) setSearchStatus('Filtering Rank 6-30 Intelligence...');
        else setSearchStatus('Verifying distance & address accuracy...');
      }
    }, 200);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Lead Sync Complete');
      
      setLeads(prev => {
        const existingNames = new Set(prev.map(l => l.businessName.toLowerCase()));
        const uniqueNew = newLeads.filter(l => !existingNames.has(l.businessName.toLowerCase()));
        return [...prev, ...uniqueNew].sort((a, b) => a.rank - b.rank);
      });
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      
      const msg = err?.message || "";
      if (msg.includes("REDEPLOY")) {
        setIsApiKeyMissing(true);
      }

      if (err instanceof QuotaError) {
        setError(`Maps Network Congested: Auto-syncing in ${err.retryAfter}s`);
        setRetryTimer(err.retryAfter);
        setSearchStatus('Standby (Network Sync)...');
      } else {
        setError(err?.message || "An unexpected error occurred during the scan.");
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
        {isApiKeyMissing && (
          <div className="mb-8 bg-amber-50 border-2 border-amber-200 p-8 rounded-[2rem] shadow-xl shadow-amber-100 flex flex-col md:flex-row items-center gap-6 animate-in slide-in-from-top-4">
            <div className="p-4 bg-amber-500 text-white rounded-2xl shadow-lg">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="text-center md:text-left flex-grow">
              <h3 className="text-xl font-black text-amber-900 uppercase tracking-tight mb-1">API Key Connection Required</h3>
              <p className="text-amber-800 font-medium leading-relaxed max-w-2xl">
                We couldn't detect your <strong>API_KEY</strong>. If you've already added it to Vercel Settings, you <strong>MUST REDEPLOY</strong> the project to apply the changes.
              </p>
            </div>
            <a 
              href="https://vercel.com/docs/projects/environment-variables" 
              target="_blank" 
              className="px-6 py-3 bg-amber-600 text-white font-black rounded-xl hover:bg-amber-700 transition-all uppercase text-xs tracking-widest whitespace-nowrap shadow-md"
            >
              Vercel Docs
            </a>
          </div>
        )}

        <div className="mb-8 flex flex-col sm:flex-row justify-between items-end gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tighter flex items-center gap-3">
              GMB DEEP SCANNER
              {leads.length > 0 && (
                <span className="text-[10px] bg-indigo-600 text-white px-3 py-1 rounded-full font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-200">
                  {leads.length} LIVE
                </span>
              )}
            </h2>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
              <span className="w-4 h-0.5 bg-indigo-600"></span>
              Precision Acquisition Engine
            </p>
          </div>
          
          <div className="flex gap-2">
            {leads.length > 0 && (
              <button 
                onClick={handleClear}
                className="px-4 py-2 text-[10px] font-black text-red-500 bg-red-50 border border-red-100 rounded-xl hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest"
              >
                Clear Results
              </button>
            )}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${geoStatus === 'active' ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg shadow-indigo-100' : 'bg-white text-slate-400 border-slate-200'}`}>
              <span className={`h-2 w-2 rounded-full ${geoStatus === 'active' ? 'bg-white animate-pulse' : 'bg-slate-300'}`}></span>
              {geoStatus === 'active' ? 'Radius Locked' : 'City Mode'}
            </div>
          </div>
        </div>

        {retryTimer !== null && (
          <div className="mb-8 bg-slate-900 text-white p-10 rounded-[2.5rem] flex flex-col items-center text-center shadow-2xl relative overflow-hidden border-b-8 border-indigo-500">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-pulse"></div>
            <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-3xl flex items-center justify-center mb-6 border border-indigo-500/20">
              <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tighter text-indigo-100 mb-2">Network Sync Required</h3>
            <p className="text-slate-400 text-sm font-medium mb-10 max-w-sm leading-relaxed">
              We've encountered a high density of GMB data. Re-establishing connection in {retryTimer}s...
            </p>
            <button onClick={handleCancelCooldown} className="px-10 py-4 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 font-black rounded-2xl transition-all text-xs border border-slate-700 uppercase tracking-widest">
              Stop Current Scan
            </button>
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
          <div className="bg-red-50 border-2 border-red-100 p-6 mb-8 rounded-[2rem] flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-5">
              <div className="p-3 bg-red-500 text-white rounded-2xl shadow-xl shadow-red-200">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="font-black text-red-900 uppercase text-xs tracking-widest">Scanner Log</h4>
                <p className="text-sm text-red-700 font-bold mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        {leads.length > 0 && <LeadTable leads={leads} />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-16 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-8">
          <div className="flex items-center gap-5">
            <div className="w-12 h-1.5 bg-indigo-600 rounded-full"></div>
            <span className="font-black text-2xl tracking-tighter text-slate-900 uppercase">Lead Engine PRO</span>
            <div className="w-12 h-1.5 bg-indigo-600 rounded-full"></div>
          </div>
          <div className="flex flex-col items-center text-center gap-3">
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] max-w-sm leading-relaxed">
              Real-Time Map Grounding • Persistent Ranking Intelligence
            </p>
            <p className="text-slate-300 text-[9px] font-bold uppercase tracking-widest">
              Strict Radius Enforcement • Positions 6-30
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
