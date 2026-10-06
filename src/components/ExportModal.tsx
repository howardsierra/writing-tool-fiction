import { useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { FileText, Download, Loader2, BookOpen, FileType2, FileArchive, FileCode2, Database } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { Modal, Field, Toggle, inputClass, SectionLabel } from './ui';
import { Document } from '../types';
import { countWords, escapeXml, formatNumber, stripMarkdown, safeFilename, downloadBlob, toMillis } from '../utils/text';

type Format = 'pdf' | 'epub' | 'docx' | 'md' | 'zip' | 'json';

function mdToHtml(md: string): string {
  return renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>);
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { documents, activeProject, user } = useStore();
  const { toast } = useUI();
  const [busy, setBusy] = useState<Format | null>(null);
  const [author, setAuthor] = useState(() => localStorage.getItem('exportAuthor') || user?.displayName || '');
  const [includeScenes, setIncludeScenes] = useState(true);
  const [includeTitlePage, setIncludeTitlePage] = useState(true);

  const title = activeProject?.title || 'Manuscript';
  const manuscript = useMemo(() => {
    const chapters = documents.filter(d => d.type === 'chapter');
    const scenes = includeScenes ? documents.filter(d => d.type === 'scene') : [];
    return [...chapters, ...scenes];
  }, [documents, includeScenes]);
  const totalWords = manuscript.reduce((sum, d) => sum + countWords(d.content), 0);

  const run = async (format: Format, fn: () => Promise<void> | void) => {
    if (format !== 'zip' && format !== 'json' && manuscript.length === 0) {
      toast('There are no chapters or scenes to export yet.', 'info');
      return;
    }
    localStorage.setItem('exportAuthor', author);
    setBusy(format);
    try {
      await fn();
      toast('Export ready', 'success');
    } catch (err: any) {
      console.error(`Export ${format} failed`, err);
      toast(`Export failed: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  /* ---------- PDF: standard manuscript layout ---------- */
  const exportPDF = () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a5' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const textW = pageW - margin * 2;
    const lineH = 5.4;
    pdf.setFont('times', 'normal');

    if (includeTitlePage) {
      pdf.setFontSize(24);
      pdf.text(pdf.splitTextToSize(title, textW), pageW / 2, pageH * 0.38, { align: 'center' });
      if (author) {
        pdf.setFontSize(13);
        pdf.setFont('times', 'italic');
        pdf.text(author, pageW / 2, pageH * 0.38 + 16, { align: 'center' });
        pdf.setFont('times', 'normal');
      }
      pdf.setFontSize(9);
      pdf.text(`${formatNumber(totalWords)} words`, pageW / 2, pageH - margin, { align: 'center' });
    }

    manuscript.forEach((doc, idx) => {
      if (includeTitlePage || idx > 0) pdf.addPage();
      let y = margin + 22;
      pdf.setFont('times', 'normal');
      pdf.setFontSize(17);
      const heading = pdf.splitTextToSize(doc.title, textW);
      pdf.text(heading, pageW / 2, y, { align: 'center' });
      y += heading.length * 7 + 10;
      pdf.setFontSize(11);

      const paragraphs = stripMarkdown(doc.content).split(/\n+/).map(p => p.trim()).filter(Boolean);
      paragraphs.forEach((para, pIdx) => {
        if (para === '* * *') {
          y += lineH;
          pdf.text('*   *   *', pageW / 2, y, { align: 'center' });
          y += lineH * 2;
          return;
        }
        // First-line indent except for the opening paragraph.
        const indent = pIdx === 0 ? '' : ' '.repeat(6);
        const lines: string[] = pdf.splitTextToSize(indent + para, textW);
        lines.forEach(line => {
          if (y > pageH - margin - 6) {
            pdf.addPage();
            y = margin + 4;
          }
          pdf.text(line, margin, y);
          y += lineH;
        });
      });
    });

    // Page numbers (skip the title page).
    const pages = pdf.getNumberOfPages();
    pdf.setFontSize(8);
    for (let i = includeTitlePage ? 2 : 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.text(String(includeTitlePage ? i - 1 : i), pageW / 2, pageH - 8, { align: 'center' });
    }
    pdf.save(`${safeFilename(title)}.pdf`);
  };

  /* ---------- EPUB 3 (with NCX for older readers) ---------- */
  const exportEPUB = async () => {
    const zip = new JSZip();
    // The mimetype file must come first and be stored uncompressed.
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.folder('META-INF')!.file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

    const oebps = zip.folder('OEBPS')!;
    const uid = `urn:uuid:${crypto.randomUUID()}`;
    const t = escapeXml(title);
    const a = escapeXml(author || 'Unknown');

    oebps.file('style.css', `body { font-family: Georgia, serif; line-height: 1.6; margin: 0 5%; }
h1 { text-align: center; font-weight: normal; margin: 3em 0 2em; page-break-before: always; }
p { margin: 0; text-indent: 1.5em; text-align: justify; }
h1 + p, hr + p { text-indent: 0; }
hr { border: none; text-align: center; margin: 1.5em 0; }
hr::after { content: "* * *"; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { font-size: 2em; margin: 0 0 .5em; page-break-before: avoid; }
.title-page p { text-indent: 0; text-align: center; font-style: italic; }`);

    const xhtml = (heading: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><meta charset="UTF-8"/><title>${escapeXml(heading)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`;

    const items: { id: string; href: string; title: string }[] = [];
    if (includeTitlePage) {
      oebps.file('title.xhtml', xhtml(title, `<div class="title-page"><h1>${t}</h1>${author ? `<p>${a}</p>` : ''}</div>`));
      items.push({ id: 'title', href: 'title.xhtml', title });
    }
    manuscript.forEach((doc, i) => {
      const id = `ch${i + 1}`;
      oebps.file(`${id}.xhtml`, xhtml(doc.title, `<section epub:type="chapter"><h1>${escapeXml(doc.title)}</h1>${mdToHtml(doc.content)}</section>`));
      items.push({ id, href: `${id}.xhtml`, title: doc.title });
    });

    const tocItems = items.filter(it => it.id !== 'title');
    oebps.file('nav.xhtml', xhtml('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${tocItems.map(it => `<li><a href="${it.href}">${escapeXml(it.title)}</a></li>`).join('')}</ol></nav>`));
    oebps.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${uid}"/></head>
  <docTitle><text>${t}</text></docTitle>
  <navMap>${tocItems.map((it, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(it.title)}</text></navLabel><content src="${it.href}"/></navPoint>`).join('')}</navMap>
</ncx>`);

    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <dc:title>${t}</dc:title>
    <dc:creator>${a}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${items.map(it => `<item id="${it.id}" href="${it.href}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${items.map(it => `<itemref idref="${it.id}"/>`).join('\n    ')}
  </spine>
</package>`);

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
    downloadBlob(blob, `${safeFilename(title)}.epub`);
  };

  /* ---------- Word (HTML-based .doc that Word, Pages and Google Docs open) ---------- */
  const exportWord = () => {
    const chapters = manuscript.map((doc, i) =>
      `<h1 style="${i > 0 || includeTitlePage ? 'page-break-before:always;' : ''}">${escapeXml(doc.title)}</h1>${mdToHtml(doc.content)}`
    ).join('');
    const titlePage = includeTitlePage
      ? `<div style="text-align:center;margin-top:200pt"><p style="font-size:26pt;text-indent:0">${escapeXml(title)}</p>${author ? `<p style="font-size:14pt;font-style:italic;text-indent:0">${escapeXml(author)}</p>` : ''}<p style="font-size:10pt;text-indent:0;margin-top:120pt">${formatNumber(totalWords)} words</p></div>`
      : '';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 200%; }
  h1 { font-size: 16pt; font-weight: normal; text-align: center; margin: 120pt 0 36pt; }
  p { margin: 0; text-indent: 0.5in; }
  h1 + p { text-indent: 0; }
  hr { border: none; text-align: center; }
</style></head>
<body>${titlePage}${chapters}</body></html>`;
    downloadBlob(new Blob(['﻿', html], { type: 'application/msword' }), `${safeFilename(title)}.doc`);
  };

  /* ---------- Markdown (single compiled file) ---------- */
  const exportMarkdown = () => {
    let md = `# ${title}\n\n`;
    if (author) md += `*by ${author}*\n\n`;
    manuscript.forEach(doc => {
      md += `\n## ${doc.title}\n\n${doc.content.trim()}\n`;
    });
    downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeFilename(title)}.md`);
  };

  /* ---------- Everything, as folders of Markdown ---------- */
  const exportZip = async () => {
    const zip = new JSZip();
    const used = new Set<string>();
    documents.forEach((doc, i) => {
      const folder = zip.folder(doc.type)!;
      let name = `${String(i + 1).padStart(3, '0')} ${safeFilename(doc.title)}`;
      while (used.has(`${doc.type}/${name}`)) name += '_';
      used.add(`${doc.type}/${name}`);
      const front = [doc.synopsis && `> ${doc.synopsis}`, doc.tags?.length && `Tags: ${doc.tags.join(', ')}`].filter(Boolean).join('\n\n');
      folder.file(`${name}.md`, `# ${doc.title}\n\n${front ? front + '\n\n' : ''}${doc.content}`);
    });
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${safeFilename(title)} - all documents.zip`);
  };

  /* ---------- Full JSON backup ---------- */
  const exportJSON = () => {
    const serialize = (d: Document) => ({
      title: d.title, type: d.type, status: d.status, synopsis: d.synopsis, tags: d.tags, order: d.order,
      content: d.content, versions: d.versions, createdAt: toMillis(d.createdAt), updatedAt: toMillis(d.updatedAt),
    });
    const backup = {
      app: "The Author's Desk",
      exportedAt: new Date().toISOString(),
      project: { title, customAuthors: activeProject?.customAuthors, wordGoal: activeProject?.wordGoal, dailyGoal: activeProject?.dailyGoal },
      documents: documents.map(serialize),
    };
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `${safeFilename(title)} - backup.json`);
  };

  const formats: { id: Format; title: string; desc: string; icon: typeof FileText; fn: () => Promise<void> | void }[] = [
    { id: 'pdf', title: 'PDF', desc: 'Book-style A5 pages with a title page and page numbers.', icon: FileText, fn: exportPDF },
    { id: 'epub', title: 'EPUB eBook', desc: 'For Apple Books, Kobo, Kindle (via Send to Kindle) and other e-readers.', icon: BookOpen, fn: exportEPUB },
    { id: 'docx', title: 'Word (.doc)', desc: 'Double-spaced manuscript format — ready for agents and editors.', icon: FileType2, fn: exportWord },
    { id: 'md', title: 'Markdown', desc: 'The whole manuscript compiled into one .md file.', icon: FileCode2, fn: exportMarkdown },
    { id: 'zip', title: 'All documents (.zip)', desc: 'Every chapter, character, lore entry and note, as Markdown files in folders.', icon: FileArchive, fn: exportZip },
    { id: 'json', title: 'Full backup (.json)', desc: 'Everything including version history — for safekeeping.', icon: Database, fn: exportJSON },
  ];

  return (
    <Modal title={`Export · ${title}`} icon={<Download className="w-4 h-4" />} onClose={onClose} size="lg">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-4 items-end">
          <Field label="Author name">
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your pen name" className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg-muted pb-2">
            <Toggle checked={includeScenes} onChange={setIncludeScenes} label="Include scenes" /> Scenes
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-muted pb-2">
            <Toggle checked={includeTitlePage} onChange={setIncludeTitlePage} label="Title page" /> Title page
          </label>
        </div>

        <div className="text-xs text-fg-subtle">
          Manuscript: {manuscript.length} {manuscript.length === 1 ? 'document' : 'documents'} · {formatNumber(totalWords)} words, in sidebar order.
        </div>

        <div>
          <SectionLabel className="mb-2">Format</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {formats.map(f => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => run(f.id, f.fn)}
                  disabled={!!busy}
                  className={twMerge(
                    'group flex items-start gap-3 p-4 rounded-xl border border-line bg-surface text-left transition-all',
                    'hover:border-accent/50 hover:bg-accent-soft/40 disabled:opacity-60'
                  )}
                >
                  <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
                    {busy === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">{f.title}</div>
                    <div className="text-xs text-fg-subtle mt-0.5 leading-relaxed">{f.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
