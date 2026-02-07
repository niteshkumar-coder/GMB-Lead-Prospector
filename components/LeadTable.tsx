
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

  const exportToCsv = () => {
    const headers = ['Business Name', 'Phone', 'Rank', 'Website', 'Maps URL', 'Rating', 'Distance'];
    const csvRows = [
      headers.join(','),
      ...sortedLeads.map(l => [
        `"${l.businessName.replace(/"/g, '""')}"`,
        `"${l.phoneNumber}"`,
        l.rank,
        `"${l.website}"`,
        `"${l.locationLink}"`,
        l.rating,
        `"${l.distance}"`
      ].join(','))
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `leads_${Date.now()}.csv`);
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
      
      doc.setFontSize(20);
      doc.setTextColor(40);
      doc.text('GMB Rankings Deep-Scan Report', 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Origin: Current GPS / Selected City | Scan Date: ${new Date().toLocaleDateString()}`, 14, 28);

      autoTable(doc, {
        startY: 35,
        head: [['#', 'Business Name', 'Phone', 'Rating', 'Distance', 'Website Link', 'Google Maps Link']],
        body: sortedLeads.map(l => [
          l.rank,
          l.businessName,
          l.phoneNumber,
          l.rating,
          l.distance,
          l.website !== 'None' ? 'Visit Website' : 'N/A',
          'Open on Maps'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [63, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          5: { textColor: [63, 70, 229], fontStyle: 'bold' }, // Website Link
          6: { textColor: [63, 70, 229], fontStyle: 'bold' }  // Maps Link
        },
        didDrawCell: (data: any) => {
          if (data.section === 'body') {
            const lead = sortedLeads[data.row.index];
            // Handle Website Column (5)
            if (data.column.index === 5 && lead.website !== 'None') {
              const url = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
            }
            // Handle Maps Column (6)
            if (data.column.index === 6 && lead.locationLink !== '#') {
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: lead.locationLink });
            }
          }
        }
      });

      doc.save(`GMB_Leads_${Date.now()}.pdf`);
    } catch (error) {
      console.error(error);
      alert("PDF Export failed. Please try CSV or check your internet connection.");
    } finally {
      setIsGeneratingPdf(false);
      setIsExportOpen(false);
    }
  };

  const SortIcon = ({ column }: { column: keyof Lead }) => {
    if (sortConfig.key !== column) return <span className="ml-1 opacity-30 text-[10px]">↕</span>;
    return <span className="ml-1 text-indigo-600 text-[10px]">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="font-bold text-slate-800">Business Rankings</h3>
          <p className="text-xs text-slate-500 font-medium">{leads.length} leads extracted within radius</p>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setIsExportOpen(!isExportOpen)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
          >
            Export Results
            <svg className={`w-3 h-3 transition-transform ${isExportOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {isExportOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2">
              <button onClick={exportToCsv} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <span className="text-green-600 font-bold">CSV</span> Download Excel
              </button>
              <button 
                onClick={exportToPdf} 
                disabled={isGeneratingPdf}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
              >
                <span className="text-red-600 font-bold">PDF</span> {isGeneratingPdf ? 'Generating...' : 'Professional Report'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase cursor-pointer" onClick={() => setSortConfig({ key: 'rank', direction: sortConfig.direction === 'ascending' ? 'descending' : 'ascending' })}>
                Rank <SortIcon column="rank" />
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Business Details</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Contact</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase cursor-pointer" onClick={() => setSortConfig({ key: 'distance', direction: sortConfig.direction === 'ascending' ? 'descending' : 'ascending' })}>
                Distance <SortIcon column="distance" />
              </th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Rating</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <span className={`inline-block w-8 h-8 rounded-full text-center leading-8 text-xs font-bold ${lead.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {lead.rank}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">{lead.businessName}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{lead.keyword}</div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                  {lead.phoneNumber}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-indigo-600">
                  {lead.distance}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-black text-slate-900">{lead.rating}</span>
                    <span className="text-amber-400">★</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <a href={lead.locationLink} target="_blank" rel="noopener noreferrer" className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Maps">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </a>
                    {lead.website !== 'None' && (
                      <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" title="Website">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                      </a>
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
