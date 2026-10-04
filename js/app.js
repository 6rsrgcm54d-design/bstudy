/**
 * BStudy - Controlador Principal do Aplicativo para iPad
 * Orquestração de Bíblia, Apple Pencil, Armazenamento, Exportação e Interface
 */

class BStudyApp {
  constructor() {
    this.bibleEngine = new BibleEngine();
    this.pencilEngine = null;
    this.exportEngine = null;
    this.notesStorage = window.notesStorage;

    this.currentViewMode = 'split'; // 'split', 'bible', 'notes'
    this.isDraggingDivider = false;
    this.autoSaveTimeout = null;

    this.init();
  }

  async init() {
    console.log('Iniciando BStudy para iPad...');

    // 1. Inicializar Motor Bíblico
    const loaded = await this.bibleEngine.loadBibleData();
    if (!loaded) {
      console.error('Falha ao carregar dados da Bíblia');
    }

    // 2. Inicializar Motor de Desenho Apple Pencil
    const canvasContainer = document.getElementById('notesCanvasContainer');
    this.pencilEngine = new ApplePencilEngine(canvasContainer, {
      paperType: localStorage.getItem('bstudy_paper_type') || 'linhas',
      paperTheme: localStorage.getItem('bstudy_paper_theme') || 'marfim'
    });

    // 3. Inicializar Motor de Exportação
    this.exportEngine = new ExportEngine(this.bibleEngine, this.pencilEngine);

    // 4. Configurar Callbacks de Mudança
    this.bibleEngine.onChapterChangeCallback = (data) => this.handleChapterChanged(data);
    this.pencilEngine.onChangeCallback = () => this.handleNotesDrawn();

    // 5. Vincular Eventos da UI
    this.setupUIEventListeners();
    this.setupModalEvents();
    this.setupSplitDivider();
    this.setupKeyboardShortcuts();

    // 6. Carregar Capítulo Inicial (ex: Livro de João ou último visitado)
    const savedBookIdx = parseInt(localStorage.getItem('bstudy_last_book') || '42', 10);
    const savedChapter = parseInt(localStorage.getItem('bstudy_last_chapter') || '1', 10);
    this.bibleEngine.setBookAndChapter(savedBookIdx, savedChapter);

    // 7. Registrar Service Worker para Modo Offline PWA
    this.registerServiceWorker();

    console.log('BStudy pronto com Rejeição de Palma predefinida!');
  }

  // =========================================================================
  // GESTÃO DE CAPÍTULOS E PERSISTÊNCIA DE NOTAS
  // =========================================================================
  async handleChapterChanged(info) {
    // 1. Atualizar Títulos e Header
    const bookTitleElem = document.getElementById('currentBookChapterTitle');
    const headerTitleElem = document.getElementById('bibleHeaderTitle');
    const subtitleElem = document.getElementById('bibleHeaderSubtitle');
    const notesBadgeElem = document.getElementById('notesChapterBadge');

    const formattedTitle = `${info.bookName} ${info.chapterNumber}`;
    if (bookTitleElem) bookTitleElem.textContent = formattedTitle;
    if (headerTitleElem) headerTitleElem.textContent = formattedTitle;
    if (subtitleElem) {
      subtitleElem.textContent = `${this.bibleEngine.getTestament()} • Almeida Atualizada (Domínio Público)`;
    }
    if (notesBadgeElem) {
      notesBadgeElem.textContent = `Notas: ${formattedTitle}`;
    }

    // Salvar última localização
    localStorage.setItem('bstudy_last_book', info.bookIndex);
    localStorage.setItem('bstudy_last_chapter', info.chapterNumber);

    // 2. Renderizar Versículos na Tela
    this.renderBibleVerses();

    // 3. Carregar as Notas Manuscritas Salvas para este Capítulo Específico
    const savedNote = await this.notesStorage.getNote(info.chapterKey, 0);
    if (savedNote && savedNote.dataUrl) {
      await this.pencilEngine.loadFromDataUrl(savedNote.dataUrl);
      this.updateSaveIndicator('Guardado');
    } else {
      this.pencilEngine.clear();
      this.updateSaveIndicator('Nova Página');
    }

    // Rolar Bíblia para o topo
    const scrollContainer = document.getElementById('bibleScrollContainer');
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }

  renderBibleVerses() {
    const container = document.getElementById('bibleVersesList');
    if (!container) return;

    const verses = this.bibleEngine.getCurrentChapterVerses();
    container.innerHTML = '';

    verses.forEach((verseText, index) => {
      const vNum = index + 1;
      const verseDiv = document.createElement('div');
      verseDiv.className = 'verse-item';
      verseDiv.dataset.verseNum = vNum;

      const numSpan = document.createElement('span');
      numSpan.className = 'verse-number';
      numSpan.textContent = vNum;

      const textSpan = document.createElement('span');
      textSpan.className = 'verse-text';
      if (this.bibleEngine.fontFamily === 'sans') {
        textSpan.classList.add('font-sans');
      }
      textSpan.style.fontSize = `${this.bibleEngine.fontSize}px`;
      textSpan.textContent = verseText;

      verseDiv.appendChild(numSpan);
      verseDiv.appendChild(textSpan);

      // Clique para selecionar versículo para estudo/cópia
      verseDiv.addEventListener('click', () => {
        verseDiv.classList.toggle('selected');
        this.bibleEngine.toggleVerseSelection(vNum);
      });

      container.appendChild(verseDiv);
    });
  }

  handleNotesDrawn() {
    this.updateSaveIndicator('A guardar...');
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(async () => {
      const chapterKey = this.bibleEngine.getChapterKey();
      const book = this.bibleEngine.getCurrentBook();
      const dataUrl = this.pencilEngine.getDataUrl();

      await this.notesStorage.saveNote(chapterKey, 0, dataUrl, {
        bookName: book ? book.name : '',
        chapterNum: this.bibleEngine.currentChapter,
        paperType: this.pencilEngine.paperType
      });

      this.updateSaveIndicator('Guardado');
    }, 600);
  }

  updateSaveIndicator(statusText) {
    const statusElem = document.getElementById('saveIndicatorText');
    if (statusElem) {
      statusElem.textContent = statusText;
    }
  }

  // =========================================================================
  // VINCULAR EVENTOS DA BARRA DE FERRAMENTAS DO APPLE PENCIL
  // =========================================================================
  setupUIEventListeners() {
    // 1. Alternador de Ferramenta Principal: Caneta / Marca-Texto / Borracha
    const toolButtons = document.querySelectorAll('.tool-mode-btn');
    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        toolButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool;
        this.pencilEngine.selectTool(tool);

        // Atualizar visibilidade dos controles de cor específicos
        const penColorsGroup = document.getElementById('penColorsGroup');
        const hlColorsGroup = document.getElementById('hlColorsGroup');
        if (tool === 'pen') {
          if (penColorsGroup) penColorsGroup.style.display = 'flex';
          if (hlColorsGroup) hlColorsGroup.style.display = 'none';
        } else if (tool === 'highlighter') {
          if (penColorsGroup) penColorsGroup.style.display = 'none';
          if (hlColorsGroup) hlColorsGroup.style.display = 'flex';
        }
      });
    });

    // 2. Cores das Canetas Solicitadas (Preto, Azul Escuro, Vermelho)
    const penSwatches = document.querySelectorAll('.pen-color-swatch');
    penSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        penSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const colorKey = swatch.dataset.color;
        this.pencilEngine.setPenColor(colorKey);

        // Ativar modo caneta se não estiver
        const penBtn = document.getElementById('btnToolPen');
        if (penBtn && !penBtn.classList.contains('active')) {
          toolButtons.forEach(b => b.classList.remove('active'));
          penBtn.classList.add('active');
        }
      });
    });

    // 3. Cores dos Highlighters Solicitados (Amarelo, Verde, Vermelho Claro)
    const hlSwatches = document.querySelectorAll('.hl-color-swatch');
    hlSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        hlSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const colorKey = swatch.dataset.color;
        this.pencilEngine.setHighlighterColor(colorKey);

        // Ativar modo marca-texto se não estiver
        const hlBtn = document.getElementById('btnToolHl');
        if (hlBtn && !hlBtn.classList.contains('active')) {
          toolButtons.forEach(b => b.classList.remove('active'));
          hlBtn.classList.add('active');
        }
      });
    });

    // 4. Seletor de Espessura
    const strokeSizeBtn = document.getElementById('btnStrokeSize');
    const sizePopover = document.getElementById('sizePopover');
    const sizeSlider = document.getElementById('strokeSizeSlider');
    const sizePreview = document.getElementById('strokePreviewDot');

    if (strokeSizeBtn && sizePopover) {
      strokeSizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sizePopover.classList.toggle('open');
        const paperPopover = document.getElementById('paperPopover');
        if (paperPopover) paperPopover.classList.remove('open');
      });
    }

    if (sizeSlider) {
      sizeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.pencilEngine.tool === 'highlighter') {
          this.pencilEngine.setHighlighterSize(val * 3);
        } else if (this.pencilEngine.tool === 'eraser') {
          this.pencilEngine.setEraserSize(val * 2.5);
        } else {
          this.pencilEngine.setPenSize(val);
        }
        if (sizePreview) {
          sizePreview.style.width = `${Math.min(val, 20)}px`;
          sizePreview.style.height = `${Math.min(val, 20)}px`;
        }
      });
    }

    // Preset chips de espessura
    const sizeChips = document.querySelectorAll('.size-chip');
    sizeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sz = parseFloat(chip.dataset.size);
        this.pencilEngine.setPenSize(sz);
        if (sizeSlider) sizeSlider.value = sz;
        if (sizePreview) {
          sizePreview.style.width = `${Math.min(sz, 20)}px`;
          sizePreview.style.height = `${Math.min(sz, 20)}px`;
        }
        sizePopover.classList.remove('open');
      });
    });

    // 5. Seletor de Papel (Linhas, Quadriculado, Pontilhado, Liso)
    const paperBtn = document.getElementById('btnPaperType');
    const paperPopover = document.getElementById('paperPopover');
    if (paperBtn && paperPopover) {
      paperBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        paperPopover.classList.toggle('open');
        if (sizePopover) sizePopover.classList.remove('open');
      });
    }

    const paperOptions = document.querySelectorAll('.paper-option-item');
    paperOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        paperOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const type = opt.dataset.paper;
        this.pencilEngine.setPaperType(type);
        localStorage.setItem('bstudy_paper_type', type);
        
        const paperLabel = document.getElementById('currentPaperLabel');
        if (paperLabel) paperLabel.textContent = opt.textContent.trim();
        paperPopover.classList.remove('open');
      });
    });

    // Fechar popovers ao clicar fora
    document.addEventListener('click', () => {
      if (sizePopover) sizePopover.classList.remove('open');
      if (paperPopover) paperPopover.classList.remove('open');
    });

    // 6. Botão de Rejeição da Palma da Mão (Apple Pencil Only)
    const palmPill = document.getElementById('palmStatusPill');
    if (palmPill) {
      palmPill.addEventListener('click', () => {
        const isPenOnly = this.pencilEngine.togglePalmRejection();
        if (isPenOnly) {
          palmPill.classList.remove('touch-mode');
          palmPill.querySelector('.palm-label').textContent = 'Apple Pencil (Palma Rejeitada)';
        } else {
          palmPill.classList.add('touch-mode');
          palmPill.querySelector('.palm-label').textContent = 'Modo Toque (Dedo)';
        }
      });
    }

    // 7. Ações de Desfazer / Refazer / Limpar
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    const btnClear = document.getElementById('btnClear');

    if (btnUndo) btnUndo.addEventListener('click', () => this.pencilEngine.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => this.pencilEngine.redo());
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Deseja limpar todos os traços desta página de notas?')) {
          this.pencilEngine.clear();
        }
      });
    }

    // 8. Navegação de Capítulos na Barra Superior e Rodapé
    const btnPrevCh = document.getElementById('btnPrevChapter');
    const btnNextCh = document.getElementById('btnNextChapter');
    const footerPrev = document.getElementById('footerPrevChapter');
    const footerNext = document.getElementById('footerNextChapter');

    const handlePrev = () => this.bibleEngine.prevChapter();
    const handleNext = () => this.bibleEngine.nextChapter();

    if (btnPrevCh) btnPrevCh.addEventListener('click', handlePrev);
    if (btnNextCh) btnNextCh.addEventListener('click', handleNext);
    if (footerPrev) footerPrev.addEventListener('click', handlePrev);
    if (footerNext) footerNext.addEventListener('click', handleNext);

    // 9. Alternador de Visão (Bíblia / Dividido / Notas)
    const viewButtons = document.querySelectorAll('.view-switch-btn');
    viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        viewButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.view;
        this.setViewMode(mode);
      });
    });

    // 10. Botão de Ecrã Inteiro (Fullscreen iPad)
    const btnFullscreen = document.getElementById('btnFullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }
  }

  setViewMode(mode) {
    this.currentViewMode = mode;
    const biblePanel = document.getElementById('biblePanel');
    const notesPanel = document.getElementById('notesPanel');
    const divider = document.getElementById('splitDivider');

    if (mode === 'split') {
      biblePanel.style.display = 'flex';
      notesPanel.style.display = 'flex';
      biblePanel.style.flex = '1';
      notesPanel.style.flex = '1';
      if (divider) divider.style.display = 'flex';
    } else if (mode === 'bible') {
      biblePanel.style.display = 'flex';
      notesPanel.style.display = 'none';
      biblePanel.style.flex = '1';
      if (divider) divider.style.display = 'none';
    } else if (mode === 'notes') {
      biblePanel.style.display = 'none';
      notesPanel.style.display = 'flex';
      notesPanel.style.flex = '1';
      if (divider) divider.style.display = 'none';
    }

    // Redimensionar canvas de desenho se necessário
    setTimeout(() => this.pencilEngine.initSize(), 150);
  }

  // =========================================================================
  // DIVISOR REDIMENSIONÁVEL ENTRE BÍBLIA E NOTAS
  // =========================================================================
  setupSplitDivider() {
    const divider = document.getElementById('splitDivider');
    const biblePanel = document.getElementById('biblePanel');
    const notesPanel = document.getElementById('notesPanel');
    const container = document.getElementById('splitWorkspace');

    if (!divider || !biblePanel || !notesPanel || !container) return;

    const onPointerDown = (e) => {
      this.isDraggingDivider = true;
      document.body.style.cursor = 'col-resize';
      divider.classList.add('active');
    };

    const onPointerMove = (e) => {
      if (!this.isDraggingDivider) return;
      const rect = container.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      if (!clientX) return;

      const offsetX = clientX - rect.left;
      const totalWidth = rect.width;
      const percentage = (offsetX / totalWidth) * 100;

      // Limitar entre 25% e 75%
      if (percentage >= 25 && percentage <= 75) {
        biblePanel.style.flex = `0 0 ${percentage}%`;
        notesPanel.style.flex = `0 0 ${100 - percentage}%`;
        this.pencilEngine.initSize();
      }
    };

    const onPointerUp = () => {
      if (this.isDraggingDivider) {
        this.isDraggingDivider = false;
        document.body.style.cursor = '';
        divider.classList.remove('active');
        this.pencilEngine.initSize();
      }
    };

    divider.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // =========================================================================
  // GESTÃO DE MODAIS (SELETOR DE LIVROS E EXPORTAÇÃO)
  // =========================================================================
  setupModalEvents() {
    // 1. Modal do Seletor de Livros
    const btnOpenNav = document.getElementById('btnOpenBookSelector');
    const navModal = document.getElementById('bookSelectorModal');
    const closeNavBtn = document.getElementById('btnCloseBookSelector');

    if (btnOpenNav && navModal) {
      btnOpenNav.addEventListener('click', () => {
        this.populateBookSelectorModal();
        navModal.classList.add('open');
      });
    }

    if (closeNavBtn && navModal) {
      closeNavBtn.addEventListener('click', () => navModal.classList.remove('open'));
    }

    // 2. Modal de Exportação
    const btnOpenExport = document.getElementById('btnOpenExportModal');
    const exportModal = document.getElementById('exportModal');
    const closeExportBtn = document.getElementById('btnCloseExportModal');
    const btnDoExport = document.getElementById('btnExecuteExport');

    if (btnOpenExport && exportModal) {
      btnOpenExport.addEventListener('click', () => {
        exportModal.classList.add('open');
      });
    }

    if (closeExportBtn && exportModal) {
      closeExportBtn.addEventListener('click', () => exportModal.classList.remove('open'));
    }

    // Seleção de formato de exportação (PNG vs PDF)
    let selectedExportFormat = 'png';
    const exportCards = document.querySelectorAll('.export-option-card');
    exportCards.forEach(card => {
      card.addEventListener('click', () => {
        exportCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedExportFormat = card.dataset.format;
      });
    });

    if (btnDoExport) {
      btnDoExport.addEventListener('click', async () => {
        btnDoExport.disabled = true;
        const originalText = btnDoExport.innerHTML;
        btnDoExport.innerHTML = '<span>A processar...</span>';

        try {
          if (selectedExportFormat === 'png') {
            await this.exportEngine.exportAsImage({ useShareSheet: true });
          } else {
            await this.exportEngine.exportAsPdf({ useShareSheet: true });
          }
          exportModal.classList.remove('open');
        } catch (err) {
          console.error('Erro ao exportar:', err);
          alert('Ocorreu um problema ao gerar a exportação.');
        } finally {
          btnDoExport.disabled = false;
          btnDoExport.innerHTML = originalText;
        }
      });
    }

    // 3. Modal de Configurações de Leitura
    const btnThemeToggle = document.getElementById('btnToggleReadingTheme');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => {
        const themes = ['claro', 'marfim', 'sepia', 'escuro'];
        const currentIdx = themes.indexOf(this.bibleEngine.readingTheme);
        const nextTheme = themes[(currentIdx + 1) % themes.length];
        this.bibleEngine.setReadingTheme(nextTheme);

        const biblePanel = document.getElementById('biblePanel');
        if (biblePanel) {
          biblePanel.className = `bible-panel theme-${nextTheme}`;
        }
      });
    }
  }

  // Preencher modal de navegação de livros e capítulos
  async populateBookSelectorModal() {
    const testamentTabs = document.querySelectorAll('.testament-tab');
    const searchInput = document.getElementById('booksSearchInput');
    const booksGrid = document.getElementById('booksGrid');
    const chaptersGrid = document.getElementById('chaptersGrid');
    const chaptersTitle = document.getElementById('chaptersSectionTitle');

    let currentTestament = 'todos'; // 'todos', 'AT', 'NT'
    let selectedBookIndex = this.bibleEngine.currentBookIndex;

    const chaptersWithNotes = await this.notesStorage.getChaptersWithNotesSet();

    const renderBooks = (query = '') => {
      booksGrid.innerHTML = '';
      let books = this.bibleEngine.searchBooks(query);

      if (currentTestament === 'AT') {
        books = books.filter(b => b.originalIndex < 39);
      } else if (currentTestament === 'NT') {
        books = books.filter(b => b.originalIndex >= 39);
      }

      books.forEach(book => {
        const item = document.createElement('div');
        item.className = 'book-card-item';
        if (book.originalIndex === selectedBookIndex) {
          item.classList.add('active');
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = book.name;
        item.appendChild(nameSpan);

        item.addEventListener('click', () => {
          document.querySelectorAll('.book-card-item').forEach(c => c.classList.remove('active'));
          item.classList.add('active');
          selectedBookIndex = book.originalIndex;
          renderChapters(selectedBookIndex);
        });

        booksGrid.appendChild(item);
      });

      renderChapters(selectedBookIndex);
    };

    const renderChapters = (bookIdx) => {
      chaptersGrid.innerHTML = '';
      const book = this.bibleEngine.books[bookIdx];
      if (!book) return;

      if (chaptersTitle) {
        chaptersTitle.textContent = `Capítulos de ${book.name} (${book.chapters.length})`;
      }

      const totalChapters = book.chapters.length;
      for (let c = 1; c <= totalChapters; c++) {
        const chBtn = document.createElement('div');
        chBtn.className = 'chapter-square-btn';
        chBtn.textContent = c;

        if (bookIdx === this.bibleEngine.currentBookIndex && c === this.bibleEngine.currentChapter) {
          chBtn.classList.add('active');
        }

        const key = `aa_${book.abbrev}_${c}`;
        if (chaptersWithNotes.has(key)) {
          chBtn.classList.add('has-notes');
        }

        chBtn.addEventListener('click', () => {
          this.bibleEngine.setBookAndChapter(bookIdx, c);
          document.getElementById('bookSelectorModal').classList.remove('open');
        });

        chaptersGrid.appendChild(chBtn);
      }
    };

    testamentTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        testamentTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTestament = tab.dataset.testament;
        renderBooks(searchInput.value);
      });
    });

    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = (e) => renderBooks(e.target.value);
    }

    renderBooks();
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Atalhos no teclado do iPad (Magic Keyboard)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          this.pencilEngine.redo();
        } else {
          this.pencilEngine.undo();
        }
      } else if (e.key === 'ArrowRight' && (e.metaKey || e.altKey)) {
        this.bibleEngine.nextChapter();
      } else if (e.key === 'ArrowLeft' && (e.metaKey || e.altKey)) {
        this.bibleEngine.prevChapter();
      }
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('BStudy ServiceWorker registado com sucesso:', reg.scope);
      }).catch((err) => {
        console.log('Registo do ServiceWorker opcional falhou:', err);
      });
    }
  }
}

// Iniciar a aplicação com suporte a todos os estados do DOM
function startBStudyApp() {
  if (!window.bStudyApp) {
    try {
      window.bStudyApp = new BStudyApp();
    } catch (e) {
      console.error('Erro ao instanciar BStudyApp:', e);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startBStudyApp);
} else {
  // Se o documento já carregou quando o script foi executado
  startBStudyApp();
}
