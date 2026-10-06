/** Reads a .txt / .md / .html / .pdf file into plain text. */
export async function readImportFile(file: File): Promise<{ title: string; content: string; tag: string }> {
  const title = file.name.replace(/\.[^/.]+$/, '');
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const pdfjsLib = await import('pdfjs-dist');
    // @ts-ignore - Vite resolves the worker URL
    const pdfWorker = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      // Respect line breaks reported by pdf.js instead of joining everything with spaces.
      let pageText = '';
      for (const item of textContent.items as any[]) {
        pageText += item.str + (item.hasEOL ? '\n' : ' ');
      }
      pages.push(pageText.replace(/[ \t]+\n/g, '\n').trim());
    }
    return { title, content: pages.join('\n\n'), tag: 'imported-pdf' };
  }

  const text = await file.text();
  if (ext === 'html' || ext === 'htm') {
    const htmlDoc = new DOMParser().parseFromString(text, 'text/html');
    htmlDoc.querySelectorAll('script, style').forEach(el => el.remove());
    const blocks = Array.from(htmlDoc.body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote'))
      .map(el => el.textContent?.trim())
      .filter(Boolean);
    const content = blocks.length ? blocks.join('\n\n') : (htmlDoc.body.textContent || '').trim();
    return { title, content, tag: 'imported-html' };
  }

  return { title, content: text.replace(/\r\n/g, '\n'), tag: ext === 'md' ? 'imported-md' : 'imported-txt' };
}

/** Firestore rules cap content at 100k characters per document. */
export const MAX_CONTENT_LENGTH = 100_000;
