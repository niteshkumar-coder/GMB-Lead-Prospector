
import React, { useMemo, useState, useEffect } from 'react';
import { Lead } from '../types';

interface LeadTableProps {
  leads: Lead[];
}

type SortConfig = {
  key: keyof Lead;
  direction: 'ascending' | 'descending';
};

const parseDistanceToMeters = (distStr: string): number => {
  if (!distStr) return 0;
  const clean = distStr.toLowerCase().replace(/,/g, '').trim();
  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  if (clean.endsWith('km')) return val * 1000;
  if (clean.endsWith('m')) return val;
  return val; // Fallback
};

const LinkHealthIndicator: React.FC<{ url: string }> = ({ url }) => {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    const checkLink = async () => {
      if (!url || url === 'None' || url === '#') return;
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        await fetch(targetUrl, { mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeoutId);
        setStatus('ok');
      } catch (err) {
        setStatus('error');
      }
    };
    checkLink();
  }, [url]);

  if (status === 'error') {
    return (
      <span title="Possible broken link" className="text-amber-500 ml-1">
        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </span>
    );
  }
  return null;
};

const LeadTable: React.FC<LeadTableProps> = ({ leads }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'rank', direction: 'ascending' });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const sortedLeads = useMemo(() => {
    const sortableLeads = [...leads];
    sortableLeads.sort((a, b) => {
      let aValue: any = a[sortConfig.key];
      let bValue: any = b[sortConfig.key];

      if (sortConfig.key === 'distance') {
        aValue = parseDistanceToMeters(String(aValue));
        bValue = parseDistanceToMeters(String(bValue));
      }

      if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
    return sortableLeads;
  }, [leads, sortConfig]);

  const requestSort = (key: keyof Lead) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const exportToCsv = () => {
    const headers = ['Business Name', 'Phone', 'Rank', 'Website', 'Maps URL', 'Rating', 'Distance', 'Keyword'];
    const csvRows = [
      headers.join(','),
      ...sortedLeads.map(l => [
        `"${l.businessName.replace(/"/g, '""')}"`,
        `"${l.phoneNumber}"`,
        l.rank,
        `"${l.website === 'None' ? 'NA' : l.website}"`,
        `"${l.locationLink}"`,
        l.rating,
        `"${l.distance}"`,
        `"${l.keyword}"`
      ].join(','))
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `gmb_leads_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportOpen(false);
  };

  const exportToPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || autoTableModule;
      const doc = new jsPDF({ orientation: 'landscape' });
      
      doc.setFontSize(18);
      doc.text('GMB Rankings Report', 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated: ${new Date().toLocaleString()} | Results: ${leads.length}`, 14, 30);

      autoTable(doc, {
        startY: 35,
        head: [['Business', 'Phone', 'Rank', 'Rating', 'Distance', 'Website', 'Google Maps Link']],
        body: sortedLeads.map(l => [
          l.businessName, 
          l.phoneNumber, 
          `${l.rank}th`, 
          String(l.rating), 
          l.distance, 
          l.website === 'None' ? 'N/A' : l.website,
          'View on Maps'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8 },
        columnStyles: {
          6: { textColor: [79, 70, 229], fontStyle: 'bold' } // Style the Maps Link column
        },
        didDrawCell: (data: any) => {
          // Add interactive link to the 'Google Maps Link' column (index 6)
          if (data.section === 'body' && data.column.index === 6) {
            const lead = sortedLeads[data.row.index];
            if (lead.locationLink && lead.locationLink !== '#') {
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: lead.locationLink });
            }
          }
        }
      });

      doc.save(`gmb_rankings_${Date.now()}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Error generating PDF. Please try CSV.");
    } finally {
      setIsGeneratingPdf(false);
      setIsExportOpen(false);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
        <div className="mx-auto w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900">No rankings captured yet</h3>
        <p className="text-slate-500 max-w-xs mx-auto">Use the form above to extract businesses from the Top 100 results on Google Maps.</p>
      </div>
    );
  }

  const SortIcon = ({ column }: { column: keyof Lead }) => {
    if (sortConfig.key !== column) return <svg className="w-3 h-3 ml-1 opacity-20" fill="currentColor" viewBox="0 0 20 20"><path d="M5 10l5 5 5-5H5z"/></svg>;
    return sortConfig.direction === 'ascending' 
      ? <svg className="w-3 h-3 ml-1 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M5 15l5-5 5 5H5z"/></svg>
      : <svg className="w-3 h-3 ml-1 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M5 5l5 5 5-5H5z"/></svg>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="font-bold text-slate-800">Extracted Results</h3>
          <p className="text-xs text-slate-500 font-medium">{leads.length} businesses from Top 100 Rankings</p>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setIsExportOpen(!isExportOpen)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
          >
            Export Data
            <svg className={`w-3 h-3 transition-transform ${isExportOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {isExportOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2 animate-in zoom-in-95 duration-100">
              <button onClick={exportToCsv} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download CSV
              </button>
              <button 
                onClick={exportToPdf} 
                disabled={isGeneratingPdf}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                   <svg className="animate-spin w-4 h-4 text-indigo-600" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                   </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                Professional PDF
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('businessName')}>
                <div className="flex items-center">Business <SortIcon column="businessName" /></div>
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('rank')}>
                <div className="flex items-center">Rank <SortIcon column="rank" /></div>
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Distance</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rating</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900 leading-tight">{lead.businessName}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-tighter">{lead.keyword}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-600 font-medium">{lead.phoneNumber}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${lead.rank <= 3 ? 'bg-emerald-50 text-emerald-700' : lead.rank <= 10 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                    {lead.rank}th
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-700">{lead.distance}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-slate-900">{lead.rating}</span>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <svg key={s} className={`w-3 h-3 ${s <= Math.round(lead.rating) ? 'text-amber-400 fill-current' : 'text-slate-200'}`} viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <a href={lead.locationLink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 p-1 hover:bg-indigo-50 rounded-md transition-all" title="View on Google Maps">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </a>
                    {lead.website !== 'None' ? (
                      <div className="flex items-center">
                        <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-indigo-600 p-1 hover:bg-slate-100 rounded-md transition-all" title="Visit Website">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                        </a>
                        <LinkHealthIndicator url={lead.website} />
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-slate-300 px-1.5 py-0.5 border border-slate-100 rounded bg-slate-50">No Web</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeadTable;
