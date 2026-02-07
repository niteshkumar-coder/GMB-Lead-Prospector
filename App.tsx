
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import SearchForm from './components/SearchForm';
import LeadTable from './components/LeadTable';
import LeadStats from './components/LeadStats';
import { Lead } from './types';
import { fetchGmbLeads } from './services/geminiService';

const App: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchStatus, setSearchStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number, longitude: number } | undefined>();
  
  const progressInterval = useRef<number | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        () => console.log("User location permission denied")
      );
    }
  }, []);

  const handleSearch = useCallback(async (keyword: string, location: string, radius: number) => {
    setIsLoading(true);
    setError(null);
    setSearchProgress(0);
    setSearchStatus('Calibrating Radius Scanner...');

    let currentProgress = 0;
    const updateProgress = () => {
      if (currentProgress < 95) {
        const increment = currentProgress > 80 ? 0.3 : (Math.random() * 2 + 1);
        currentProgress += increment;
        setSearchProgress(Math.floor(currentProgress));
        
        if (currentProgress < 20) setSearchStatus(`Mapping ${radius}km boundary...`);
        else if (currentProgress < 50) setSearchStatus(`Deep scanning ${location} for "${keyword}"...`);
        else if (currentProgress < 80) setSearchStatus(`Extracting every business within ${radius}km...`);
        else if (currentProgress < 95) setSearchStatus('Finalizing lead list & contact details...');
      }
    };

    progressInterval.current = window.setInterval(updateProgress, 700);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Area Scan Complete!');

      if (newLeads.length === 0) {
        setError(`No leads found within your selected ${radius}km radius. Try a larger area.`);
      } else {
        setLeads(prev => {
          const existingNames = new Set(prev.map(l => l.businessName.toLowerCase()));
          const uniqueNewLeads = newLeads.filter(l => !existingNames.has(l.businessName.toLowerCase()));
          return [...prev, ...uniqueNewLeads];
        });
      }
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      console.error("App handleSearch error:", err);
      setError(err?.message || "An unexpected error occurred. Please try again.");
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setSearchProgress(0);
      }, 1000);
    }
  }, [userCoords]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 text-center sm:text-left">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">GMB Full Radius Scanner</h2>
          <p className="text-slate-600 font-medium">Find <span className="text-indigo-600 font-bold">ALL</span> businesses within your exact selected distance.</p>
        </div>

        <SearchForm 
          onSearch={handleSearch} 
          isLoading={isLoading} 
          progress={searchProgress}
          status={searchStatus}
        />

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg shadow-sm animate-in fade-in slide-in-from-top-1">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-red-800">Scan Incomplete</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <button onClick={() => window.location.reload()} className="mt-2 text-xs font-bold text-red-800 underline uppercase">Retry Scan</button>
              </div>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        
        <LeadTable leads={leads} />
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-400 text-sm">
          <p>&copy; {new Date().getFullYear()} GMB Deep Radius Prospector. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
