
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
  const [geoStatus, setGeoStatus] = useState<'idle' | 'detecting' | 'active' | 'denied'>('idle');
  
  const progressInterval = useRef<number | null>(null);

  const requestLocation = useCallback(() => {
    setGeoStatus('detecting');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setGeoStatus('active');
        },
        (error) => {
          console.warn("Geolocation error:", error);
          setGeoStatus('denied');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      setGeoStatus('denied');
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const handleSearch = useCallback(async (keyword: string, location: string, radius: number) => {
    setIsLoading(true);
    setError(null);
    setSearchProgress(0);
    setSearchStatus('Establishing Precise GPS Link...');

    // Attempt to refresh location right before search for maximum accuracy
    if (geoStatus !== 'active') {
      requestLocation();
    }

    let currentProgress = 0;
    const updateProgress = () => {
      if (currentProgress < 98) {
        // Slower progress for 100 leads as it takes more time to generate
        const increment = currentProgress > 90 ? 0.1 : currentProgress > 70 ? 0.3 : (Math.random() * 1.5 + 0.5);
        currentProgress += increment;
        setSearchProgress(Math.floor(currentProgress));
        
        if (currentProgress < 15) setSearchStatus('Locking GPS Satellite Signal...');
        else if (currentProgress < 35) setSearchStatus(`Mapping ${radius}km Radius for "${keyword}"...`);
        else if (currentProgress < 60) setSearchStatus(`Finding Rank 1 to 50...`);
        else if (currentProgress < 85) setSearchStatus(`Finding Rank 51 to 100...`);
        else if (currentProgress < 98) setSearchStatus('Compiling exhaustive 100+ lead database...');
      }
    };

    progressInterval.current = window.setInterval(updateProgress, 600);

    try {
      const newLeads = await fetchGmbLeads(keyword, location, radius, userCoords);
      
      if (progressInterval.current) clearInterval(progressInterval.current);
      setSearchProgress(100);
      setSearchStatus('Deep Scan Complete!');

      if (newLeads.length === 0) {
        setError(`No leads found within ${radius}km. Please try a broader keyword.`);
      } else {
        setLeads(newLeads); // Replace instead of append to show the specific scan's 100 leads
      }
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      console.error("App handleSearch error:", err);
      setError(err?.message || "Search failed. Check your internet connection and location permissions.");
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setSearchProgress(0);
      }, 1000);
    }
  }, [userCoords, geoStatus, requestLocation]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">GMB Top 100 Radius Scanner</h2>
            <p className="text-slate-600 font-medium tracking-tight">
              Scanning exactly <span className="text-indigo-600 font-bold">{leads.length > 0 ? leads.length : 'up to 100'}</span> leads relative to your GPS.
            </p>
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${geoStatus === 'active' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : geoStatus === 'denied' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            <span className={`h-2 w-2 rounded-full ${geoStatus === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`}></span>
            {geoStatus === 'active' ? 'GPS: Highly Accurate' : geoStatus === 'denied' ? 'GPS: Access Denied' : 'GPS: Detecting...'}
            {geoStatus === 'denied' && (
              <button onClick={requestLocation} className="ml-2 underline hover:text-red-900">Enable</button>
            )}
          </div>
        </div>

        <SearchForm 
          onSearch={handleSearch} 
          isLoading={isLoading} 
          progress={searchProgress}
          status={searchStatus}
          isGeoActive={geoStatus === 'active'}
        />

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg shadow-sm animate-in fade-in slide-in-from-top-1">
            <div className="flex">
              <div className="flex-shrink-0 text-red-500">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-red-800">Deep Scan Interrupted</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <div className="mt-2 flex gap-3">
                  <button onClick={() => window.location.reload()} className="text-xs font-bold text-red-800 underline uppercase">Refresh App</button>
                  {geoStatus === 'denied' && <p className="text-[10px] text-red-600 italic">Please enable location for distance accuracy.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {leads.length > 0 && <LeadStats leads={leads} />}
        
        <LeadTable leads={leads} />
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-400 text-sm font-medium">
          <p>&copy; {new Date().getFullYear()} GMB Precision Rank Scanner. All distances relative to search origin.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
