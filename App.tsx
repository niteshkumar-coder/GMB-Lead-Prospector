
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import SearchForm from './components/SearchForm';
import LeadTable from './components/LeadTable';
import LeadStats from './components/LeadStats';
import { Lead } from './types';
import { fetchGmbLeads, QuotaError } from './services/geminiService';

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
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

  useEffect(() => {
    const checkKey = async () => {
      try {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } catch (e) {
        setHasKey(!!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeyDialog = async () => {
    await window.aistudio.openSelectKey();
    // Use timeout to allow background process to update the environment
    setTimeout(() => setHasKey(true), 500);
  };

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
    if (hasKey) requestLocation();
  }, [hasKey, requestLocation]);

  const handleCancelCooldown = () => {
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    setRetryTimer(null);
    setIsLoading(false);
    setError(null);
    setSearchProgress(0);
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
        currentProgress += (Math.random() * 1.5 + 0.5);
        setSearchProgress(Math.floor(currentProgress));
        if (currentProgress < 20) setSearchStatus('Validating Range...');
        else if (currentProgress < 50) setSearchStatus(`Scanning within ${radius}km...`);
        else if (currentProgress < 85) setSearchStatus('Filtering Rank 6-30 leads...');
        else setSearchStatus('Verifying distance accuracy...');
      }
    }, 200);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Radius-Verified Results Ready');
      
      setLeads(prev => {
        const existingNames = new Set(prev.map(l => l.businessName.toLowerCase()));
        const uniqueNew = newLeads.filter(l => !existingNames.has(l.businessName.toLowerCase()));
        return [...prev, ...uniqueNew].sort((a, b) => a.rank - b.rank);
      });
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      
      if (err instanceof QuotaError) {
        setError(`System Limit: Pausing for ${err.retryAfter}s`);
        setRetryTimer(err.retryAfter);
        setSearchStatus('Scanner in Standby...');
      } else {
        const msg = err?.message || "An error occurred";
        // Only trigger the setup screen if it's definitely an auth error
        if (msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("not found")) {
          setHasKey(false);
        }
        setError(msg);
      }
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        if (retryTimer === null) setSearchProgress(0);
      }, 500);
    }
  }, [userCoords, retryTimer]);

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 text-center border border-slate-200">
            <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Scanner Setup Required</h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              To perform deep-scans on Google Maps, you must link your paid Google Cloud project.
            </p>
            <button
              onClick={handleOpenKeyDialog}
              className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95 mb-4"
            >
              CONNECT API KEY
            </button>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              className="text-[10px] text-slate-400 font-bold uppercase tracking-widest hover:text-indigo-600 transition-colors"
            >
              Learn about Billing & Setup
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight flex items-center gap-3">
              GMB Lead Deep-Scanner
              {leads.length > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-black">
                  {leads.length} LEADS FOUND
                </span>
              )}
            </h2>
            <p className="text-slate-500 font-medium max-w-lg">
              Precision leads found strictly within your selected radius.
            </p>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setHasKey(false)} 
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors border border-slate-200 px-3 py-1.5 rounded-full"
            >
              Update API
            </button>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${geoStatus === 'active' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
              <span className={`h-2 w-2 rounded-full ${geoStatus === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></span>
              {geoStatus === 'active' ? 'GPS Radius Enabled' : 'City Scan Mode'}
            </div>
          </div>
        </div>

        {retryTimer !== null && (
          <div className="mb-8 bg-slate-900 text-white p-8 rounded-[2rem] flex flex-col items-center text-center shadow-2xl relative overflow-hidden border-4 border-indigo-500/20">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-pulse"></div>
            <h3 className="text-xl font-black uppercase tracking-tighter text-indigo-100 mb-2">Network Refresh</h3>
            <p className="text-slate-400 text-sm mb-8">Auto-resuming scan in {retryTimer}s...</p>
            <button onClick={handleCancelCooldown} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-sm border border-slate-700">
              STOP SCAN
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
          <div className="bg-red-900/10 border-2 border-red-500/20 p-6 mb-8 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-red-500 text-white rounded-lg shadow-lg">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm text-red-800 font-bold">{error}</p>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        {leads.length > 0 && <LeadTable leads={leads} />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-1 bg-indigo-600 rounded-full"></div>
            <span className="font-black text-lg tracking-tighter text-slate-800 uppercase">Lead Engine PRO</span>
            <div className="w-10 h-1 bg-indigo-600 rounded-full"></div>
          </div>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] text-center max-w-sm leading-relaxed">
            Scalable Acquisition • Radius Enforced • Rank 6-30 Intelligence
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
