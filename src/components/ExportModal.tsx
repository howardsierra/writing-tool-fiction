import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { X, FileText, File as FileIcon, Download, Loader2, BookOpen } from 'lucide-react';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { documents, activeProjectId, projects } = useStore();
  const [isExporting, setIsExporting] = useState(false);
  const activeProject = projects.find(p => p.id === activeProjectId);
  const projectDocs = documents.filter(d => d.projectId === activeProjectId);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      let yOffset = 20;
      doc.setFontSize(22);
      doc.text(activeProject?.title || 'Manuscript', 20, yOffset);
      yOffset += 20;

      // Filter to only chapters and scenes for main manuscript export
      const manuscriptDocs = projectDocs.filter(d => d.type === 'chapter' || d.type === 'scene');
      
      for (const item of manuscriptDocs) {
        if (yOffset > 270) {
          doc.addPage();
          yOffset = 20;
        }
        
        doc.setFontSize(16);
        doc.text(item.title, 20, yOffset);
        yOffset += 10;
        
        doc.setFontSize(12);
        const splitText = doc.splitTextToSize(item.content, 170);
        for (const line of splitText) {
          if (yOffset > 280) {
            doc.addPage();
            yOffset = 20;
          }
          doc.text(line, 20, yOffset);
          yOffset += 7;
        }
        yOffset += 10;
      }
      
      doc.save(`${activeProject?.title || 'Manuscript'}.pdf`);
    } catch (err) {
      console.error("Export PDF failed", err);
    }
    setIsExporting(false);
  };

  const handleExportMarkdown = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      
      projectDocs.forEach(doc => {
        const folder = zip.folder(doc.type) || zip;
        folder.file(`${doc.title}.md`, doc.content);
      });
      
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${activeProject?.title || 'Project_Export'}.zip`);
    } catch (err) {
      console.error("Export Markdown failed", err);
    }
    setIsExporting(false);
  };

  const handleExportEPUB = async () => {
    setIsExporting(true);
    try {
      // Very basic EPUB scaffolding using JSZip
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      
      const metaInf = zip.folder('META-INF');
      metaInf?.file('container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

      const oebps = zip.folder('OEBPS');
      const manuscriptDocs = projectDocs.filter(d => d.type === 'chapter' || d.type === 'scene');
      
      let manifest = '';
      let spine = '';
      
      manuscriptDocs.forEach((doc, i) => {
        const id = `item_${i}`;
        manifest += `<item id="${id}" href="${id}.html" media-type="application/xhtml+xml"/>\n`;
        spine += `<itemref idref="${id}"/>\n`;
        
        // Basic escaping
        const safeContent = doc.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br/>');
        oebps?.file(`${id}.html`, `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${doc.title}</title></head>
<body><h1>${doc.title}</h1><p>${safeContent}</p></body>
</html>`);
      });

      oebps?.file('content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${activeProject?.title || 'Manuscript'}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${activeProject?.title || 'Manuscript'}.epub`);
    } catch (err) {
      console.error("Export EPUB failed", err);
    }
    setIsExporting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#11141B] border border-[#2D3139] rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-[#2D3139] bg-[#0A0C10]">
          <h2 className="text-sm font-serif italic text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-[#D4AF37]" />
            Export Manuscript
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <p className="text-xs text-gray-400 mb-2">Select an export format for "{activeProject?.title}". Chapters and scenes will be compiled sequentially.</p>
          
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="w-full flex items-center justify-between p-4 bg-[#1A1D26] hover:bg-[#2D3139] border border-[#2D3139] rounded transition-all text-left"
          >
            <div>
              <div className="text-sm text-gray-200 font-medium">Standard PDF</div>
              <div className="text-[10px] text-gray-500 mt-1">Best for printing or sharing as a digital book.</div>
            </div>
            <FileText className="w-5 h-5 text-[#D4AF37]" />
          </button>

          <button 
            onClick={handleExportEPUB}
            disabled={isExporting}
            className="w-full flex items-center justify-between p-4 bg-[#1A1D26] hover:bg-[#2D3139] border border-[#2D3139] rounded transition-all text-left"
          >
            <div>
              <div className="text-sm text-gray-200 font-medium">EPUB eBook</div>
              <div className="text-[10px] text-gray-500 mt-1">Compatible with Kindle, Apple Books, and other e-readers.</div>
            </div>
            <BookOpen className="w-5 h-5 text-[#D4AF37]" />
          </button>

          <button 
            onClick={handleExportMarkdown}
            disabled={isExporting}
            className="w-full flex items-center justify-between p-4 bg-[#1A1D26] hover:bg-[#2D3139] border border-[#2D3139] rounded transition-all text-left"
          >
            <div>
              <div className="text-sm text-gray-200 font-medium">Markdown Archive (.zip)</div>
              <div className="text-[10px] text-gray-500 mt-1">Exports all documents as raw text organized by folders.</div>
            </div>
            <FileIcon className="w-5 h-5 text-[#D4AF37]" />
          </button>
        </div>
        
        {isExporting && (
          <div className="p-4 bg-[#1A1D26] border-t border-[#2D3139] flex items-center justify-center gap-2 text-xs text-[#D4AF37]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating Export...
          </div>
        )}
      </div>
    </div>
  );
}
