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
    setSearchStatus('Connecting to Google Maps API...');
    setLastSearchParams({ k: keyword, l: location, r: radius });

    let currentProgress = 0;
    progressInterval.current = window.setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += (Math.random() * 1.5 + 0.5);
        setSearchProgress(Math.floor(currentProgress));
        if (currentProgress < 30) setSearchStatus('Analyzing Local Map Data...');
        else if (currentProgress < 70) setSearchStatus('Identifying High-Value Prospects...');
        else setSearchStatus('Compiling Business Report...');
      }
    }, 300);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Scan Complete!');
      
      setLeads(prev => {
        const existingNames = new Set(prev.map(l => l.businessName.toLowerCase()));
        const uniqueNew = newLeads.filter(l => !existingNames.has(l.businessName.toLowerCase()));
        return [...prev, ...uniqueNew].sort((a, b) => a.rank - b.rank);
      });
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      
      if (err instanceof QuotaError) {
        setError(`System Pause: Establishing new connection session.`);
        setRetryTimer(err.retryAfter);
        setSearchStatus('Refreshing Connection...');
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
              GMB Lead Deep-Scanner
              {leads.length > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-black">
                  {leads.length} LEADS FOUND
                </span>
              )}
            </h2>
            <p className="text-slate-500 font-medium max-w-lg">
              Advanced business intelligence for local SEO and targeted lead acquisition.
            </p>
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${geoStatus === 'active' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
            <span className={`h-2 w-2 rounded-full ${geoStatus === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></span>
            {geoStatus === 'active' ? 'GPS Position Active' : 'City-Based Search'}
          </div>
        </div>

        {retryTimer !== null && (
          <div className="mb-8 bg-slate-900 text-white p-8 rounded-[2rem] flex flex-col items-center text-center shadow-2xl relative overflow-hidden border-4 border-indigo-500/20">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-pulse"></div>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Connection Refresh</h3>
            </div>

            <p className="text-slate-400 text-sm mb-8 max-w-sm">
              We are momentarily refreshing our map data connection. The scanner will automatically resume as soon as the session is updated.
            </p>
            
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-end gap-2">
                <span className="text-7xl font-black tracking-tighter tabular-nums text-indigo-400 leading-none">{retryTimer}</span>
                <span className="text-xl font-black text-indigo-400/50 mb-1 uppercase tracking-widest">sec</span>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                <button 
                  onClick={handleCancelCooldown}
                  className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-sm border border-slate-700"
                >
                  CANCEL SCAN & CLEAR
                </button>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-slate-800 w-full flex justify-center gap-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <span>Auto-Resume Enabled</span>
              <span>•</span>
              <span>Data Persistent</span>
              <span>•</span>
              <span>Session Optimization</span>
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
          <div className="bg-red-900/10 border-2 border-red-500/20 p-6 mb-8 rounded-2xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-4">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-red-500 text-white rounded-lg shadow-lg">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-black text-red-900 uppercase tracking-tight">Scanner Interrupted</h3>
                <p className="text-xs text-red-800 mt-0.5 font-bold opacity-75">{error}</p>
              </div>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        
        {leads.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <LeadTable leads={leads} />
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-1 bg-indigo-600 rounded-full"></div>
            <span className="font-black text-lg tracking-tighter text-slate-800">PRECISION PROSPECTOR</span>
            <div className="w-10 h-1 bg-indigo-600 rounded-full"></div>
          </div>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] text-center max-w-sm leading-relaxed">
            Professional Lead Intelligence Engine • Data-Driven Acquisition • Global Coverage
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;