
import React, { useMemo, useState, useEffect } from 'react';
import { Lead } from '../types';

interface LeadTableProps {
  leads: Lead[];
}

type SortConfig = {
  key: keyof Lead;
  direction: 'ascending' | 'descending';
};

const LinkHealthIndicator: React.FC<{ url: string }> = ({ url }) => {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    const checkLink = async () => {
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        await fetch(targetUrl, { 
          mode: 'no-cors', 
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        setStatus('ok');
      } catch (err) {
        setStatus('error');
      }
    };

    if (url && url !== 'None') {
      checkLink();
    }
  }, [url]);

  if (status === 'error') {
    return (
      <span 
        title="This link may be broken or the website is inaccessible."
        className="text-amber-500 animate-pulse ml-1"
      >
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
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
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
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
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
      
      // The autoTable plugin might be the default export or need to be called on the module
      const autoTable = (autoTableModule as any).default || autoTableModule;
      
      const doc = new jsPDF({ orientation: 'landscape' });
      
      doc.setFontSize(18);
      doc.text('GMB Lead Prospector Report', 14, 20);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
      doc.text(`Total Leads: ${leads.length}`, 14, 37);
      doc.setFontSize(9);
      doc.text('Tip: Business names and websites are clickable links in this PDF.', 14, 43);

      const tableHeaders = [['Business Name', 'Phone', 'Rank', 'Website', 'Rating', 'Distance', 'Keyword']];
      const tableData = sortedLeads.map(l => [
        String(l.businessName),
        String(l.phoneNumber),
        `${l.rank}th`,
        l.website === 'None' ? 'NA' : String(l.website),
        String(l.rating),
        String(l.distance),
        String(l.keyword)
      ]);

      // Use the standalone autoTable function which is safer in ESM
      autoTable(doc, {
        startY: 48,
        head: tableHeaders,
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { textColor: [79, 70, 229], fontStyle: 'bold' },
          3: { textColor: [79, 70, 229] },
        },
        didDrawCell: (data: any) => {
          if (data.section === 'body') {
            const lead = sortedLeads[data.row.index];
            if (data.column.index === 0) {
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { 
                url: lead.locationLink 
              });
            }
            if (data.column.index === 3 && lead.website !== 'None') {
              const url = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { 
                url: url 
              });
            }
          }
        }
      });

      doc.save(`gmb_prospect_report_${Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF generation failed internal error:", error);
      alert("Failed to generate PDF. This often happens if the export libraries are still loading. Please try CSV export or wait a few seconds and try PDF again.");
    } finally {
      setIsGeneratingPdf(false);
      setIsExportOpen(false);
    }
  };

  if (leads.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900">No leads yet</h3>
        <p className="text-slate-500 max-w-xs mx-auto">Use the search form above to find businesses ranking outside the top 5 spots on Google Maps.</p>
      </div>
    );
  }

  const SortIcon = ({ column }: { column: keyof Lead }) => {
    if (sortConfig.key !== column) return <svg className="w-4 h-4 ml-1 opacity-30" fill="currentColor" viewBox="0 0 20 20"><path d="M5 10l5 5 5-5H5z"/></svg>;
    return sortConfig.direction === 'ascending' 
      ? <svg className="w-4 h-4 ml-1 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M5 15l5-5 5 5H5z"/></svg>
      : <svg className="w-4 h-4 ml-1 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M5 5l5 5 5-5H5z"/></svg>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
        <h3 className="font-bold text-slate-800">Prospecting Results</h3>
        
        <div className="relative">
          <button 
            onClick={() => setIsExportOpen(!isExportOpen)}
            disabled={isGeneratingPdf}
            className={`px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm ${isGeneratingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {isGeneratingPdf ? 'Generating PDF...' : 'Export Leads'}
            <svg className={`w-3 h-3 transition-transform ${isExportOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isExportOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <button 
                onClick={exportToCsv}
                className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-100"
              >
                <div className="w-8 h-8 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold">Export as CSV</p>
                  <p className="text-[10px] text-slate-400">For Excel/Sheets</p>
                </div>
              </button>
              <button 
                onClick={exportToPdf}
                disabled={isGeneratingPdf}
                className="w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded bg-rose-100 text-rose-600 flex items-center justify-center">
                  {isGeneratingPdf ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-semibold">{isGeneratingPdf ? 'Creating PDF...' : 'Export as PDF'}</p>
                  <p className="text-[10px] text-slate-400">Professional Report</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
            <tr>
              <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('businessName')}>
                <div className="flex items-center">Business Name <SortIcon column="businessName" /></div>
              </th>
              <th className="px-6 py-4">Phone Number</th>
              <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('rank')}>
                <div className="flex items-center">Rank <SortIcon column="rank" /></div>
              </th>
              <th className="px-6 py-4">Website</th>
              <th className="px-6 py-4">Rating</th>
              <th className="px-6 py-4">Distance</th>
              <th className="px-6 py-4">Keyword</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4 font-medium text-slate-900">
                  <div className="flex flex-col">
                    <span>{lead.businessName}</span>
                    <a 
                      href={lead.locationLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-500 hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View on Maps
                    </a>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{lead.phoneNumber}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${lead.rank <= 10 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'}`}>
                    {lead.rank}th
                  </span>
                </td>
                <td className="px-6 py-4">
                  {lead.website !== 'None' ? (
                    <div className="flex items-center gap-1.5">
                      <a 
                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-xs border border-indigo-100 hover:bg-indigo-100 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Visit Site
                      </a>
                      <LinkHealthIndicator url={lead.website} />
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-100/50 text-rose-700 font-bold text-xs border border-rose-200 shadow-sm" title="No website found for this business.">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      No Website
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <span className="text-amber-500">★</span>
                    <span className="font-medium text-slate-700">{lead.rating}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{lead.distance}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-slate-100 rounded text-[10px] text-slate-500 font-bold uppercase">{lead.keyword}</span>
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
