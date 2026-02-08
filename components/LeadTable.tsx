
import React, { useMemo, useState } from 'react';
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
  return val;
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

  const exportToPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || autoTableModule;
      const doc = new jsPDF({ orientation: 'landscape' });
      
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.text('GMB Lead Rankings Report', 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Origin: GPS Search Mode | Keyword: ${leads[0]?.keyword || 'GMB Scan'} | Results: ${leads.length}`, 14, 28);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 33);

      autoTable(doc, {
        startY: 40,
        head: [['Rank', 'Business Name', 'Phone', 'Rating', 'Distance', 'Website', 'Google Maps Link']],
        body: sortedLeads.map(l => [
          `#${l.rank}`,
          l.businessName,
          l.phoneNumber,
          l.rating,
          l.distance,
          l.website !== 'None' ? 'Visit Website' : 'No Website',
          'Click to Open Map'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: {
          5: { textColor: [79, 70, 229], fontStyle: 'bold' },
          6: { textColor: [79, 70, 229], fontStyle: 'bold' }
        },
        didDrawCell: (data: any) => {
          if (data.section === 'body') {
            const lead = sortedLeads[data.row.index];
            if (data.column.index === 5 && lead.website !== 'None') {
              const url = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            }
            if (data.column.index === 6 && lead.locationLink && lead.locationLink !== '#') {
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: lead.locationLink });
            }
          }
        }
      });

      doc.save(`GMB_Leads_${Date.now()}.pdf`);
    } catch (error) {
      console.error(error);
      alert("PDF Error: Please try again or use CSV.");
    } finally {
      setIsGeneratingPdf(false);
      setIsExportOpen(false);
    }
  };

  const exportToCsv = () => {
    const headers = ['Rank', 'Business Name', 'Phone', 'Rating', 'Distance', 'Maps Link', 'Website'];
    const csvRows = [
      headers.join(','),
      ...sortedLeads.map(l => [
        l.rank,
        `"${l.businessName.replace(/"/g, '""')}"`,
        `"${l.phoneNumber}"`,
        l.rating,
        `"${l.distance}"`,
        `"${l.locationLink}"`,
        `"${l.website === 'None' ? 'N/A' : l.website}"`
      ].join(','))
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `gmb_data_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportOpen(false);
  };

  const SortIcon = ({ column }: { column: keyof Lead }) => {
    if (sortConfig.key !== column) return <span className="ml-1 opacity-20">↕</span>;
    return <span className="ml-1 text-indigo-600">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center bg-slate-50/50 gap-4">
        <div>
          <h3 className="font-bold text-slate-800">Ranked Results (1-100)</h3>
          <p className="text-xs text-slate-500 font-medium">Found {leads.length} businesses matching your criteria</p>
        </div>
        
        <div className="relative w-full sm:w-auto">
          <button 
            onClick={() => setIsExportOpen(!isExportOpen)}
            className="w-full px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export All Leads
          </button>
          
          {isExportOpen && (
            <div className="absolute right-0 mt-2 w-full sm:w-56 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 py-2 border-t-4 border-t-indigo-500 animate-in zoom-in-95">
              <button onClick={exportToCsv} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 font-semibold">
                <div className="w-8 h-8 rounded bg-green-50 text-green-600 flex items-center justify-center font-black">X</div>
                Download Excel (CSV)
              </button>
              <button 
                onClick={exportToPdf} 
                disabled={isGeneratingPdf}
                className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 font-semibold disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded bg-red-50 text-red-600 flex items-center justify-center font-black">P</div>
                {isGeneratingPdf ? 'Generating...' : 'Professional PDF (Digital)'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer" onClick={() => setSortConfig({ key: 'rank', direction: sortConfig.direction === 'ascending' ? 'descending' : 'ascending' })}>
                Rank <SortIcon column="rank" />
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Business Detail</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Info</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer" onClick={() => setSortConfig({ key: 'distance', direction: sortConfig.direction === 'ascending' ? 'descending' : 'ascending' })}>
                Distance <SortIcon column="distance" />
              </th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rating</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-indigo-50/30 transition-colors group">
                <td className="px-6 py-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm border-2 ${lead.rank <= 3 ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    {lead.rank}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{lead.businessName}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{lead.keyword}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-semibold text-slate-700">{lead.phoneNumber}</div>
                  {lead.website !== 'None' && lead.website !== '' ? (
                    <div className="text-[10px] text-indigo-500 font-bold truncate max-w-[180px] hover:text-indigo-700">
                      {lead.website}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black bg-slate-100 text-slate-400 border border-slate-200 uppercase tracking-tighter">
                        <svg className="w-2.5 h-2.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        No Website Found
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                    <span className="text-sm font-black text-indigo-600">{lead.distance}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 bg-slate-100 w-fit px-2 py-1 rounded-lg">
                    <span className="text-xs font-black text-slate-900">{lead.rating}</span>
                    <span className="text-amber-500 text-xs">★</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <a 
                      href={lead.locationLink} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-2.5 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm" 
                      title="Open Google Maps"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </a>
                    
                    {lead.website !== 'None' && lead.website !== '' ? (
                      <a 
                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="p-2 bg-white border border-slate-200 text-indigo-500 hover:bg-indigo-500 hover:text-white rounded-xl transition-all shadow-sm" 
                        title="Visit Website"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                      </a>
                    ) : (
                      <div 
                        className="p-2 bg-slate-50 border border-slate-100 text-slate-300 rounded-xl cursor-not-allowed opacity-40 flex items-center justify-center" 
                        title="Website Unavailable"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                      </div>
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
