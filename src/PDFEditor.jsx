import { useState, useRef, useEffect } from 'react';
import { Upload, Trash2, FileText, Image as ImageIcon, Loader2, FileDown } from 'lucide-react';

// pdf-lib for PDF manipulation
// pdfjs-dist for rendering previews

const PDFEditor = () => {
  const [pages, setPages] = useState([]); // { id, dataUrl, source: 'pdf'|'image', pdfBytes?, pdfPageIndex?, imageBytes?, imageType? }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [librariesReady, setLibrariesReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastSelectedId, setLastSelectedId] = useState(null);

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pdfLibRef = useRef(null);
  const pdfjsRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load libraries dynamically
  useEffect(() => {
    const loadLibs = async () => {
      try {
        // Load pdf-lib
        if (!window.PDFLib) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        // Load pdfjs
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        pdfLibRef.current = window.PDFLib;
        pdfjsRef.current = window.pdfjsLib;
        setLibrariesReady(true);
      } catch (e) {
        console.error('Failed to load libraries', e);
        showToast('Failed to load PDF libraries', 'error');
      }
    };
    loadLibs();
  }, []);

  const renderPdfPageToDataUrl = async (pdfBytes, pageIndex, scale = 0.5) => {
    const loadingTask = pdfjsRef.current.getDocument({ data: pdfBytes.slice(0) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.7);
  };

  const handlePdfImport = async (files) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);
    setLoadingMessage(`Importing ${files.length} PDF${files.length > 1 ? 's' : ''}...`);
    try {
      const newPages = [];
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfBytes = new Uint8Array(arrayBuffer);
        const pdfDoc = await pdfLibRef.current.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();

        // Render previews using pdfjs
        for (let i = 0; i < pageCount; i++) {
          setLoadingMessage(`Rendering ${file.name} — page ${i + 1} of ${pageCount}`);
          const dataUrl = await renderPdfPageToDataUrl(pdfBytes, i, 0.4);
          newPages.push({
            id: crypto.randomUUID(),
            dataUrl,
            source: 'pdf',
            pdfBytes,
            pdfPageIndex: i,
            sourceName: file.name,
          });
        }
      }
      setPages(prev => [...prev, ...newPages]);
      showToast(`Added ${newPages.length} page${newPages.length > 1 ? 's' : ''}`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Failed to import PDF: ${e.message}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleImageImport = async (files) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);
    setLoadingMessage(`Importing ${files.length} image${files.length > 1 ? 's' : ''}...`);
    try {
      const newPages = [];
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const imageBytes = new Uint8Array(arrayBuffer);
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        newPages.push({
          id: crypto.randomUUID(),
          dataUrl,
          source: 'image',
          imageBytes,
          imageType: file.type,
          sourceName: file.name,
        });
      }
      setPages(prev => [...prev, ...newPages]);
      showToast(`Added ${newPages.length} image${newPages.length > 1 ? 's' : ''} as pages`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Failed to import image: ${e.message}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handlePageClick = (e, id, index) => {
    if (e.shiftKey && lastSelectedId) {
      // Range select
      const lastIdx = pages.findIndex(p => p.id === lastSelectedId);
      if (lastIdx !== -1) {
        const [start, end] = [Math.min(lastIdx, index), Math.max(lastIdx, index)];
        const newSelected = new Set(selectedIds);
        for (let i = start; i <= end; i++) {
          newSelected.add(pages[i].id);
        }
        setSelectedIds(newSelected);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
      setSelectedIds(newSelected);
      setLastSelectedId(id);
      return;
    }
    // Single select toggle
    if (selectedIds.has(id) && selectedIds.size === 1) {
      setSelectedIds(new Set());
      setLastSelectedId(null);
    } else {
      setSelectedIds(new Set([id]));
      setLastSelectedId(id);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === pages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pages.map(p => p.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setPages(prev => prev.filter(p => !selectedIds.has(p.id)));
    showToast(`Deleted ${selectedIds.size} page${selectedIds.size > 1 ? 's' : ''}`, 'success');
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  // Drag and drop reordering
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    // If dragging an unselected item, treat it as the only one being moved
    if (!selectedIds.has(id)) {
      setSelectedIds(new Set([id]));
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (!draggedId) return;

    // Determine which pages are being moved
    const movingIds = selectedIds.has(draggedId) && selectedIds.size > 1
      ? selectedIds
      : new Set([draggedId]);

    const movingPages = pages.filter(p => movingIds.has(p.id));
    const remainingPages = pages.filter(p => !movingIds.has(p.id));

    // Adjust drop index for removed items before it
    let adjustedIndex = dropIndex;
    for (let i = 0; i < dropIndex && i < pages.length; i++) {
      if (movingIds.has(pages[i].id)) adjustedIndex--;
    }
    adjustedIndex = Math.max(0, Math.min(adjustedIndex, remainingPages.length));

    const newPages = [
      ...remainingPages.slice(0, adjustedIndex),
      ...movingPages,
      ...remainingPages.slice(adjustedIndex),
    ];

    setPages(newPages);
    setDraggedId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverIndex(null);
  };

  // Export
  const handleExport = async () => {
    if (pages.length === 0) {
      showToast('No pages to export', 'error');
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Compressing & exporting PDF...');
    try {
      const { PDFDocument } = pdfLibRef.current;
      const outDoc = await PDFDocument.create();

      // Cache loaded source PDFs so we don't reload the same file repeatedly
      const sourcePdfCache = new Map();

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        setLoadingMessage(`Building page ${i + 1} of ${pages.length}...`);

        if (p.source === 'pdf') {
          // Use byte reference identity as cache key
          let srcDoc = sourcePdfCache.get(p.pdfBytes);
          if (!srcDoc) {
            srcDoc = await PDFDocument.load(p.pdfBytes, { ignoreEncryption: true });
            sourcePdfCache.set(p.pdfBytes, srcDoc);
          }
          const [copied] = await outDoc.copyPages(srcDoc, [p.pdfPageIndex]);
          outDoc.addPage(copied);
        } else if (p.source === 'image') {
          let embedded;
          if (p.imageType === 'image/png') {
            embedded = await outDoc.embedPng(p.imageBytes);
          } else {
            // jpg/jpeg — for other types convert via canvas to jpg
            if (p.imageType === 'image/jpeg' || p.imageType === 'image/jpg') {
              embedded = await outDoc.embedJpg(p.imageBytes);
            } else {
              // convert via canvas
              const jpgBytes = await convertImageToJpg(p.dataUrl, 0.7);
              embedded = await outDoc.embedJpg(jpgBytes);
            }
          }
          // Always downscale large images
          let { width, height } = embedded.scale(1);
          const maxDim = 1600;
          if (Math.max(width, height) > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width *= scale;
            height *= scale;
          }
          const page = outDoc.addPage([width, height]);
          page.drawImage(embedded, { x: 0, y: 0, width, height });
        }
      }

      const bytes = await outDoc.save({ useObjectStreams: true, addDefaultPage: false });

      // Download
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();
      a.href = url;
      a.download = `edited-${now}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeKb = (bytes.length / 1024).toFixed(1);
      showToast(`Exported PDF (${sizeKb} KB)`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`Export failed: ${e.message}`, 'error');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const convertImageToJpg = async (dataUrl, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async (blob) => {
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  };

  const handleClear = () => {
    if (pages.length === 0) return;
    if (confirm('Remove all pages? This cannot be undone.')) {
      setPages([]);
      setSelectedIds(new Set());
      setLastSelectedId(null);
    }
  };

  return (
    <div className="min-h-screen w-full" style={{
      background: '#f1ebdd',
      fontFamily: '"Fraunces", Georgia, serif',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .mono { font-family: 'JetBrains Mono', monospace; }

        .page-card {
          transition: transform 0.18s cubic-bezier(0.2, 0.7, 0.3, 1), box-shadow 0.18s, border-color 0.18s;
        }
        .page-card:hover {
          transform: translateY(-2px);
        }
        .page-card.dragging {
          opacity: 0.4;
        }
        .page-card.drop-target::before {
          content: '';
          position: absolute;
          left: -8px;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #1a1a1a;
          border-radius: 2px;
        }
        .page-card.drop-target-grid::before {
          left: -8px;
          top: 10%;
          bottom: 10%;
        }

        .btn-primary {
          background: #1a1a1a;
          color: #f7f3ec;
          transition: all 0.15s;
        }
        .btn-primary:hover:not(:disabled) {
          background: #000;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .btn-primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .btn-ghost {
          background: transparent;
          color: #1a1a1a;
          transition: all 0.15s;
        }
        .btn-ghost:hover:not(:disabled) {
          background: rgba(26,26,26,0.06);
        }
        .btn-ghost:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .btn-danger:hover:not(:disabled) {
          background: rgba(180, 40, 40, 0.1);
          color: #b42828;
        }

        .scroll-fade::-webkit-scrollbar { width: 8px; height: 8px; }
        .scroll-fade::-webkit-scrollbar-thumb { background: rgba(26,26,26,0.2); border-radius: 4px; }
        .scroll-fade::-webkit-scrollbar-thumb:hover { background: rgba(26,26,26,0.4); }

        .checkbox-tick {
          background: #1a1a1a;
          color: #f7f3ec;
        }

        .toast-enter {
          animation: toastIn 0.25s cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        @keyframes toastIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .pulse-loader {
          animation: pulse 1.4s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>

      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
        <header className="border-b border-stone-900/15 px-6 py-4 backdrop-blur-sm" style={{ background: 'rgba(247, 243, 236, 0.7)' }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm flex items-center justify-center" style={{ background: '#1a1a1a' }}>
                <FileText className="w-5 h-5" style={{ color: '#f7f3ec' }} />
              </div>
              <div>
                <h1 className="text-2xl leading-none" style={{ fontWeight: 500, letterSpacing: '-0.02em' }}>
                  Paperback
                </h1>
                <p className="text-xs mono opacity-60 mt-0.5">— a quiet pdf editor</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!librariesReady || isLoading}
                className="btn-ghost px-4 py-2 text-sm flex items-center gap-2 rounded-sm border border-stone-900/20"
              >
                <Upload className="w-4 h-4" />
                Import PDF
              </button>
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={!librariesReady || isLoading}
                className="btn-ghost px-4 py-2 text-sm flex items-center gap-2 rounded-sm border border-stone-900/20"
              >
                <ImageIcon className="w-4 h-4" />
                Add Image
              </button>
              <div className="h-6 w-px bg-stone-900/15 mx-1" />
              <button
                onClick={handleExport}
                disabled={!librariesReady || isLoading || pages.length === 0}
                className="btn-primary px-5 py-2 text-sm flex items-center gap-2 rounded-sm"
              >
                <FileDown className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>
        </header>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-stone-900/10 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'rgba(247, 243, 236, 0.4)' }}>
          <div className="flex items-center gap-3 text-sm">
            <span className="mono text-xs uppercase tracking-wider opacity-60">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
              {selectedIds.size > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-sm" style={{ background: '#1a1a1a', color: '#f7f3ec' }}>
                  {selectedIds.size} selected
                </span>
              )}
            </span>
            {pages.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="btn-ghost px-2 py-1 text-xs mono uppercase tracking-wider rounded-sm"
              >
                {selectedIds.size === pages.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className="btn-ghost btn-danger px-2 py-1 text-xs mono uppercase tracking-wider rounded-sm flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
            {pages.length > 0 && (
              <button
                onClick={handleClear}
                className="btn-ghost btn-danger px-2 py-1 text-xs mono uppercase tracking-wider rounded-sm"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Main area */}
        <main className="flex-1 overflow-auto scroll-fade px-6 py-8">
          {pages.length === 0 ? (
            <EmptyState
              librariesReady={librariesReady}
              onImportPdf={() => fileInputRef.current?.click()}
              onAddImage={() => imageInputRef.current?.click()}
            />
          ) : (
            <GridView
              pages={pages}
              selectedIds={selectedIds}
              draggedId={draggedId}
              dragOverIndex={dragOverIndex}
              onPageClick={handlePageClick}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          )}
        </main>

        {/* Footer hint */}
        {pages.length > 0 && (
          <div className="px-6 py-2 text-xs mono opacity-50 border-t border-stone-900/10 text-center">
            click to select · shift+click range · ⌘/ctrl+click multi · drag to reorder
          </div>
        )}
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handlePdfImport(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleImageImport(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(247, 243, 236, 0.7)' }}>
          <div className="bg-stone-50 border border-stone-900/15 rounded-sm px-8 py-6 flex items-center gap-4 shadow-xl">
            <Loader2 className="w-5 h-5 animate-spin" />
            <div>
              <p className="text-sm" style={{ fontWeight: 500 }}>{loadingMessage || 'Working...'}</p>
              <p className="text-xs mono opacity-50 mt-0.5 pulse-loader">please hold</p>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 toast-enter px-5 py-3 rounded-sm shadow-lg border"
          style={{
            background: toast.type === 'error' ? '#b42828' : '#1a1a1a',
            color: '#f7f3ec',
            borderColor: 'rgba(0,0,0,0.2)',
          }}
        >
          <p className="text-sm mono">{toast.message}</p>
        </div>
      )}

      {/* Loading libraries banner */}
      {!librariesReady && (
        <div className="fixed bottom-6 right-6 z-40 bg-stone-50 border border-stone-900/15 rounded-sm px-4 py-2.5 flex items-center gap-2 shadow-sm">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs mono opacity-70">loading pdf engine...</span>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ librariesReady, onImportPdf, onAddImage }) => (
  <div className="h-full flex items-center justify-center fade-in">
    <div className="text-center max-w-md">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-sm border-2 border-dashed border-stone-900/20 mb-6">
        <FileText className="w-8 h-8 opacity-40" />
      </div>
      <h2 className="text-3xl mb-3" style={{ fontWeight: 400, letterSpacing: '-0.02em' }}>
        An <em style={{ fontStyle: 'italic', fontWeight: 500 }}>empty</em> manuscript.
      </h2>
      <p className="text-sm opacity-60 mb-8 leading-relaxed">
        Start by importing a PDF or dropping in a few images. Rearrange, prune, then export — quietly, on your own terms.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onImportPdf}
          disabled={!librariesReady}
          className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 rounded-sm"
        >
          <Upload className="w-4 h-4" />
          Import a PDF
        </button>
        <button
          onClick={onAddImage}
          disabled={!librariesReady}
          className="btn-ghost px-5 py-2.5 text-sm flex items-center gap-2 rounded-sm border border-stone-900/20"
        >
          <ImageIcon className="w-4 h-4" />
          Add images
        </button>
      </div>
    </div>
  </div>
);

const PageThumb = ({ page, index, isSelected, isDragging, isDropTarget, onClick, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) => {
  return (
    <div
      draggable
      onClick={(e) => onClick(e, page.id, index)}
      onDragStart={(e) => onDragStart(e, page.id)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`page-card relative group cursor-pointer rounded-sm overflow-visible fade-in ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target drop-target-grid' : ''}`}
      style={{ animationDelay: `${Math.min(index * 0.015, 0.3)}s` }}
    >
      <div
        className={`relative bg-white rounded-sm overflow-hidden border-2 ${isSelected ? 'border-stone-900' : 'border-stone-900/10'}`}
        style={{
          boxShadow: isSelected
            ? '0 8px 24px rgba(0,0,0,0.18), 0 0 0 4px rgba(26,26,26,0.08)'
            : '0 2px 6px rgba(0,0,0,0.08)',
          aspectRatio: '0.707',
        }}
      >
        <img src={page.dataUrl} alt={`Page ${index + 1}`} className="w-full h-full object-contain" draggable={false} />

        {/* Page number badge */}
        <div className="absolute top-2 left-2 mono text-[10px] px-1.5 py-0.5 rounded-sm" style={{ background: 'rgba(26,26,26,0.85)', color: '#f7f3ec' }}>
          {String(index + 1).padStart(2, '0')}
        </div>

        {/* Source icon */}
        <div className="absolute top-2 right-2 opacity-60">
          {page.source === 'pdf' ? (
            <FileText className="w-3 h-3" />
          ) : (
            <ImageIcon className="w-3 h-3" />
          )}
        </div>

        {/* Selection tick */}
        {isSelected && (
          <div className="absolute bottom-2 right-2 w-5 h-5 rounded-full checkbox-tick flex items-center justify-center text-[10px] mono">
            ✓
          </div>
        )}
      </div>
    </div>
  );
};

const GridView = ({ pages, selectedIds, draggedId, dragOverIndex, onPageClick, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) => (
  <div
    className="grid gap-5 max-w-7xl mx-auto"
    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
  >
    {pages.map((page, index) => (
      <PageThumb
        key={page.id}
        page={page}
        index={index}
        isSelected={selectedIds.has(page.id)}
        isDragging={draggedId === page.id}
        isDropTarget={dragOverIndex === index && draggedId !== page.id}
        onClick={onPageClick}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      />
    ))}
    {/* Drop zone at the end */}
    <div
      onDragOver={(e) => onDragOver(e, pages.length)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, pages.length)}
      className={`min-h-[120px] rounded-sm border-2 border-dashed transition-colors ${dragOverIndex === pages.length ? 'border-stone-900 bg-stone-900/5' : 'border-stone-900/10'}`}
      style={{ aspectRatio: '0.707' }}
    />
  </div>
);

export default PDFEditor;
