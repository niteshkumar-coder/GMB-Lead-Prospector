
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
    setSearchStatus('Establishing Secure Connection...');
    setLastSearchParams({ k: keyword, l: location, r: radius });

    let currentProgress = 0;
    progressInterval.current = window.setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += (Math.random() * 1.2 + 0.3);
        setSearchProgress(Math.floor(currentProgress));
        if (currentProgress < 30) setSearchStatus('Scanning Google Maps Layer...');
        else if (currentProgress < 70) setSearchStatus('Identifying Low-Ranking Targets...');
        else setSearchStatus('Finalizing Lead Report...');
      }
    }, 400);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Success! Leads found.');
      // Persist leads: Add new ones while avoiding duplicates by ID or name
      setLeads(prev => {
        const existingNames = new Set(prev.map(l => l.businessName.toLowerCase()));
        const uniqueNew = newLeads.filter(l => !existingNames.has(l.businessName.toLowerCase()));
        return [...prev, ...uniqueNew].sort((a, b) => a.rank - b.rank);
      });
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      
      if (err instanceof QuotaError) {
        setError(`FREE TIER LIMIT: Too many requests. Resuming scan in ${err.retryAfter}s...`);
        setRetryTimer(err.retryAfter);
        setSearchStatus('System Cooling Down...');
      } else {
        setError(err?.message || "Scan failed. Please try again.");
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
              Deep Lead Scanner
              {retryTimer !== null && (
                <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded uppercase font-black animate-pulse shadow-sm">
                  Limited
                </span>
              )}
            </h2>
            <p className="text-slate-600 font-medium tracking-tight">
              Collecting businesses ranking below top 5 for local SEO leads.
            </p>
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${geoStatus === 'active' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
            <span className={`h-2 w-2 rounded-full ${geoStatus === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></span>
            {geoStatus === 'active' ? 'Precision GPS Active' : 'City Mode'}
          </div>
        </div>

        {retryTimer !== null && (
          <div className="mb-8 bg-white border-2 border-amber-200 p-8 rounded-3xl flex flex-col items-center text-center shadow-xl animate-in fade-in zoom-in-95 duration-500">
            <div className="relative">
              <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-4 border-4 border-amber-100">
                <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            
            <h3 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tighter italic">Free Tier Limit Reached</h3>
            <p className="text-slate-500 text-sm font-medium mb-6 max-w-md">
              Google Gemini limits "Google Maps" tool usage on free accounts. We will automatically resume the scan shortly.
            </p>
            
            <div className="flex flex-col items-center gap-4 w-full max-w-xs">
              <div className="text-6xl font-black text-amber-500 tracking-tighter tabular-nums bg-amber-50 px-8 py-4 rounded-2xl border border-amber-100 shadow-inner">
                {retryTimer}<span className="text-2xl ml-1 text-amber-300">s</span>
              </div>
              
              <button 
                onClick={handleCancelCooldown}
                className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors p-2 underline decoration-2 underline-offset-4"
              >
                Cancel & Reset Scan
              </button>
            </div>
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
          <div className="bg-red-50 border-2 border-red-100 p-5 mb-8 rounded-2xl flex items-start gap-4 shadow-sm animate-in slide-in-from-top-2">
            <div className="bg-red-100 p-2 rounded-xl text-red-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-red-800 uppercase tracking-tight">Scan Interrupted</h3>
              <p className="text-sm text-red-700 mt-0.5 font-medium">{error}</p>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        
        {leads.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <LeadTable leads={leads} />
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 opacity-30 grayscale">
            <div className="w-6 h-6 bg-slate-600 rounded"></div>
            <span className="font-black text-sm tracking-tighter">PRECISION SCANNERS</span>
          </div>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest text-center">
            &copy; {new Date().getFullYear()} Lead Prospector Engine • Powered by Gemini 2.5 • Smart Rate-Limit Recovery Enabled
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
