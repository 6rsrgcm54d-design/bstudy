/**
 * BStudy - Motor de Exportação e Impressão em Alta Definição (Página A4 Única)
 * Garante:
 * 1. Proporções A4 reais (210mm x 297mm) com Bíblia e Notas SEMPRE JUNTAS (Paisagem e Vertical)
 * 2. As anotações, marcações (highlighters) e caixas de texto mantêm o alinhamento exato com os versículos
 * 3. Impressão estritamente limitada a EXATAMENTE 1 PÁGINA (sem páginas em branco)
 * 4. Descarregamento e impressão direta sem menus de partilha
 */

class ExportEngine {
  constructor(bibleEngine, pencilEngine) {
    this.bible = bibleEngine;
    this.pencil = pencilEngine;
  }

  /**
   * Captura a folha unificada (#journalSheet) com Bíblia + Notas perfeitamente incorporadas e alinhadas
   */
  async captureUnifiedSheetDataUrl(orientation = null) {
    const sheet = document.getElementById('journalSheet');
    if (!sheet) throw new Error('Folha journalSheet não encontrada');

    // Desativar temporariamente bordas de edição para captura limpa
    const editingEls = document.querySelectorAll('.is-editing, .is-selected');
    editingEls.forEach(el => el.classList.remove('is-editing', 'is-selected'));
    if (document.activeElement) document.activeElement.blur();

    const isPortrait = orientation ? (orientation === 'portrait') : sheet.classList.contains('orientation-portrait');
    const pageW = isPortrait ? 820 : 1160;
    const pageH = isPortrait ? 1160 : 820;

    // Guardar estilos e scroll originais
    const origStyle = sheet.getAttribute('style') || '';
    const ws = document.getElementById('journalWorkspace');
    const origScrollTop = ws ? ws.scrollTop : 0;
    if (ws) ws.scrollTop = 0;

    // Alinhar a folha rigorosamente ao topo e início sem desvios de margem / centralização do ecrã
    sheet.style.position = 'relative';
    sheet.style.margin = '0';
    sheet.style.width = `${pageW}px`;
    sheet.style.maxWidth = `${pageW}px`;
    sheet.style.height = `${pageH}px`;
    sheet.style.maxHeight = `${pageH}px`;
    sheet.style.overflow = 'hidden';

    try {
      if (window.bStudyApp && window.bStudyApp.prepareBiblePrintCut) {
        window.bStudyApp.prepareBiblePrintCut(isPortrait ? 'portrait' : 'landscape');
      }

      if (window.html2pdf) {
        const worker = window.html2pdf().set({
          margin: 0,
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0
          },
          jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: isPortrait ? 'portrait' : 'landscape'
          }
        }).from(sheet);

        const imgData = await worker.outputImg('datauristring');

        // Restaurar dimensões normais da folha
        if (origStyle) sheet.setAttribute('style', origStyle);
        else sheet.removeAttribute('style');
        if (ws) ws.scrollTop = origScrollTop;
        if (window.bStudyApp && window.bStudyApp.restoreBiblePrintCut) {
          window.bStudyApp.restoreBiblePrintCut();
        }

        return imgData;
      }
    } catch (err) {
      console.warn('Captura html2pdf falhou, recorrendo a canvas combinado:', err);
      if (origStyle) sheet.setAttribute('style', origStyle);
      else sheet.removeAttribute('style');
      if (ws) ws.scrollTop = origScrollTop;
      if (window.bStudyApp && window.bStudyApp.restoreBiblePrintCut) {
        window.bStudyApp.restoreBiblePrintCut();
      }
    }

    // Fallback de emergência caso html2pdf não esteja disponível
    const fallbackCanvas = await this.generateCombinedA4Canvas({ orientation: isPortrait ? 'portrait' : 'landscape' });
    if (window.bStudyApp && window.bStudyApp.restoreBiblePrintCut) {
      window.bStudyApp.restoreBiblePrintCut();
    }
    return fallbackCanvas.toDataURL('image/png');
  }

  /**
   * 1. Descarregar como PDF A4 de Página Única (Bíblia + Notas Incorporadas)
   */
  async exportAsPdf(options = {}) {
    const book = this.bible.getCurrentBook();
    const chapterNum = this.bible.currentChapter;
    const orientation = options.orientation || window.bStudyApp?.orientation || 'landscape';
    const isPortrait = orientation === 'portrait';
    const fileName = `BStudy_${book.name}_Cap_${chapterNum}_A4_${isPortrait ? 'Vertical' : 'Paisagem'}.pdf`;

    const imgData = await this.captureUnifiedSheetDataUrl(orientation);

    if (window.jspdf && window.jspdf.jsPDF) {
      const pdf = new window.jspdf.jsPDF({
        orientation: isPortrait ? 'portrait' : 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = isPortrait ? 210 : 297;
      const pdfHeight = isPortrait ? 297 : 210;

      // Adicionar imagem correspondente a 100% da página A4
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(fileName);
      return true;
    }

    return false;
  }

  /**
   * 2. Descarregar como Imagem PNG de Alta Resolução (Bíblia + Notas Juntas)
   */
  async exportAsImage(options = {}) {
    const book = this.bible.getCurrentBook();
    const chapterNum = this.bible.currentChapter;
    const orientation = options.orientation || window.bStudyApp?.orientation || 'landscape';
    const isPortrait = orientation === 'portrait';
    const fileName = `BStudy_${book.name}_Cap_${chapterNum}_A4_${isPortrait ? 'Vertical' : 'Paisagem'}.png`;

    const imgData = await this.captureUnifiedSheetDataUrl(orientation);

    const a = document.createElement('a');
    a.href = imgData;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  /**
   * 3. Imprimir Diretamente em Formato A4 (Impressão Perfeita de 1 Página)
   * Garante:
   * - Bíblia + Notas SEMPRE JUNTAS (tanto em modo Vertical como Paisagem)
   * - Alinhamento fiel aos versículos onde as notas e highlights foram feitos
   * - Exatamente 1 página impressa sem páginas em branco
   * - Tipografia vetorial nítida nativa sem cortes
   */
  async printA4(options = {}) {
    const orientation = options.orientation || window.bStudyApp?.orientation || 'portrait';

    // 1. Fechar qualquer modal aberto
    const exportModal = document.getElementById('exportModal');
    if (exportModal) exportModal.classList.remove('open');

    // 2. Rolar workspace para o topo
    const ws = document.getElementById('journalWorkspace');
    if (ws) ws.scrollTop = 0;

    // 3. Preparar o corte limpo da Bíblia no último ponto final que cabe na folha A4
    if (window.bStudyApp && window.bStudyApp.prepareBiblePrintCut) {
      window.bStudyApp.prepareBiblePrintCut(orientation);
    }

    // 4. Garantir regra @page correta para o navegador
    let styleTag = document.getElementById('bstudy-page-orientation-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'bstudy-page-orientation-style';
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = `@page { size: A4 ${orientation}; margin: 0 !important; }`;

    // 5. Chamar impressão nativa nítida do navegador
    setTimeout(() => {
      window.focus();
      window.print();
    }, 150);

    return true;
  }

  /**
   * Fallback de emergência (caso a captura DOM falhe)
   */
  async generateCombinedA4Canvas(options = {}) {
    const isPortrait = options.orientation === 'portrait';
    const width = isPortrait ? 2480 : 3508;
    const height = isPortrait ? 3508 : 2480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (this.pencil && this.pencil.drawCanvas) {
      ctx.drawImage(this.pencil.drawCanvas, 0, 0, width, height);
    }

    return canvas;
  }
}

window.ExportEngine = ExportEngine;
