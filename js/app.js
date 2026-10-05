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
    this.orientation = localStorage.getItem('bstudy_orientation') || (window.innerWidth < window.innerHeight ? 'portrait' : 'landscape');

    this.init();
  }

  async init() {
    console.log('Iniciando BStudy Journaling Bible para iPad...');

    // 1. Inicializar Motor Bíblico
    const loaded = await this.bibleEngine.loadBibleData();
    if (!loaded) {
      console.error('Falha ao carregar dados da Bíblia');
    }

    // 2. Inicializar Motor de Desenho Apple Pencil na Folha Unificada
    const initialPaperType = localStorage.getItem('bstudy_paper_type') || 'quadriculado';
    const canvasContainer = document.getElementById('notesCanvasContainer') || document.getElementById('journalSheet');
    this.pencilEngine = new ApplePencilEngine(canvasContainer, {
      paperType: initialPaperType,
      paperTheme: 'branco'
    });

    // 3. Inicializar Motor de Exportação
    this.exportEngine = new ExportEngine(this.bibleEngine, this.pencilEngine);

    // 4. Configurar Callbacks
    this.bibleEngine.onChapterChangeCallback = (data) => this.handleChapterChanged(data);
    this.pencilEngine.onChangeCallback = () => this.handleNotesDrawn();

    // 5. Vincular Eventos da UI (Header, Menus, Modais, Paleta Flutuante)
    this.setupUIEventListeners();
    this.setupModalEvents();
    this.setupKeyboardShortcuts();

    // 6. Aplicar Configurações de Layout Salvas (Lado do Texto, Fundo, Tipografia)
    this.applySavedLayoutSettings();

    // 7. Carregar Capítulo Inicial (ex: Lucas 15 ou último visitado)
    const savedBookIdx = parseInt(localStorage.getItem('bstudy_last_book') || '41', 10);
    const savedChapter = parseInt(localStorage.getItem('bstudy_last_chapter') || '15', 10);
    this.bibleEngine.setBookAndChapter(savedBookIdx, savedChapter);

    // 8. Registrar Service Worker para Modo Offline PWA
    this.registerServiceWorker();

    // 9. Garantir que a folha rola para o topo e corta no ponto final ao imprimir
    window.addEventListener('beforeprint', () => {
      const ws = document.getElementById('journalWorkspace');
      if (ws) ws.scrollTop = 0;
      this.prepareBiblePrintCut();
    });

    window.addEventListener('afterprint', () => {
      this.restoreBiblePrintCut();
    });

    console.log('BStudy pronto com Bíblia e Notas Incorporadas na Mesma Página!');
  }

  applySavedLayoutSettings() {
    this.setOrientation(this.orientation);

    const savedSide = localStorage.getItem('bstudy_text_side') || 'left';
    this.setTextSide(savedSide, false);

    const savedPaper = localStorage.getItem('bstudy_paper_type') || 'quadriculado';
    if (this.pencilEngine) this.pencilEngine.setPaperType(savedPaper);

    const bgBoxes = document.querySelectorAll('.bg-option-box');
    bgBoxes.forEach(box => {
      box.classList.toggle('active', box.dataset.paper === savedPaper);
    });

    const savedFontSize = parseInt(localStorage.getItem('bstudy_font_size') || '18', 10);
    this.bibleEngine.setFontSize(savedFontSize);
    document.documentElement.style.setProperty('--bible-font-size', `${savedFontSize}px`);
    const bibleFontSizeSlider = document.getElementById('bibleFontSizeSlider');
    if (bibleFontSizeSlider) bibleFontSizeSlider.value = savedFontSize;
    const bibleFontSizeLabel = document.getElementById('bibleFontSizeLabel');
    if (bibleFontSizeLabel) {
      bibleFontSizeLabel.textContent = `${savedFontSize}px`;
    }
  }

  setOrientation(orientation) {
    this.orientation = orientation;
    localStorage.setItem('bstudy_orientation', orientation);
    const sheet = document.getElementById('journalSheet');
    if (sheet) {
      sheet.classList.remove('orientation-landscape', 'orientation-portrait');
      sheet.classList.add(`orientation-${orientation}`);
    }
    const btnText = document.getElementById('orientationBtnText');
    if (btnText) {
      btnText.textContent = orientation === 'portrait' ? 'A4 Vertical' : 'A4 Paisagem';
    }
    const exportOrientLabel = document.getElementById('exportOrientationLabel');
    if (exportOrientLabel) {
      exportOrientLabel.textContent = orientation === 'portrait' ? 'A4 Vertical (Retrato)' : 'A4 Paisagem (Horizontal)';
    }

    // Configurar orientação da página de impressão do navegador (A4 Portrait ou Landscape)
    let styleTag = document.getElementById('bstudyPageOrientationStyle');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'bstudyPageOrientationStyle';
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = `@page { size: A4 ${orientation}; margin: 0; }`;

    setTimeout(() => {
      if (this.pencilEngine) {
        this.pencilEngine.initSize();
      }
    }, 80);
  }

  toggleOrientation() {
    this.setOrientation(this.orientation === 'portrait' ? 'landscape' : 'portrait');
  }

  getNotesColumnDefaultX() {
    const sheet = document.getElementById('journalSheet');
    const sheetW = sheet ? sheet.clientWidth : 1000;
    return Math.round(sheetW * 0.53);
  }

  setTextSide(side = 'left') {
    const layout = document.querySelector('.journal-columns-layout');
    if (layout) {
      layout.classList.remove('side-right', 'side-center');
      layout.classList.add('side-left');
    }
    localStorage.setItem('bstudy_text_side', 'left');

    setTimeout(() => {
      if (this.pencilEngine) this.pencilEngine.initSize();
    }, 100);
  }

  // =========================================================================
  // GESTÃO DE CAPÍTULOS E PERSISTÊNCIA DE NOTAS NA FOLHA UNIFICADA
  // =========================================================================
  async handleChapterChanged(info) {
    // 1. Atualizar Título na Barra Superior (Estilo "... BPT: Lucas 15 v")
    const bookTitleElem = document.getElementById('currentBookChapterTitle');
    const formattedTitle = `${this.bibleEngine.currentTranslation.toUpperCase()}: ${info.bookName} ${info.chapterNumber}`;
    if (bookTitleElem) bookTitleElem.textContent = formattedTitle;

    // Salvar última localização
    localStorage.setItem('bstudy_last_book', info.bookIndex);
    localStorage.setItem('bstudy_last_chapter', info.chapterNumber);

    // 2. Renderizar Versículos na Folha Unificada
    this.renderBibleVerses();

    // 3. Carregar as Notas Manuscritas e Stickers Salvos para este Capítulo
    const savedNote = await this.notesStorage.getNote(info.chapterKey, 0);
    if (savedNote) {
      if (savedNote.dataUrl) {
        await this.pencilEngine.loadFromDataUrl(savedNote.dataUrl);
      } else {
        this.pencilEngine.drawCtx.clearRect(0, 0, this.pencilEngine.drawCanvas.width, this.pencilEngine.drawCanvas.height);
      }
      if (savedNote.elements && Array.isArray(savedNote.elements)) {
        this.pencilEngine.loadElementsData(savedNote.elements);
      } else {
        this.pencilEngine.clearElements();
      }
      this.updateSaveIndicator('Guardado');
    } else {
      this.pencilEngine.clear();
      this.updateSaveIndicator('Nova Página');
    }

    // Rolar folha para o topo
    const workspace = document.getElementById('journalWorkspace');
    if (workspace) workspace.scrollTop = 0;
  }

  renderBibleVerses() {
    const journalContainer = document.getElementById('journalVersesList');
    if (!journalContainer) return;

    const verses = this.bibleEngine.getCurrentChapterVerses();
    const chapterNum = this.bibleEngine.currentChapter;

    // Atualizar Cabeçalho do Capítulo na Folha: apenas o grande número como na Foto 1
    const chapterNumElem = document.getElementById('journalChapterNum');
    const chapterBadgeElem = document.getElementById('journalChapterBadge');
    if (chapterNumElem) chapterNumElem.textContent = chapterNum;
    if (chapterBadgeElem) chapterBadgeElem.style.display = 'none';

    // Tipografia da Bíblia (Foto 3)
    journalContainer.className = 'journal-verses-container';
    if (this.bibleEngine.fontFamily === 'sans') {
      journalContainer.classList.add('font-sans');
    } else if (this.bibleEngine.fontFamily === 'garamond') {
      journalContainer.classList.add('font-garamond');
    } else if (this.bibleEngine.fontFamily === 'mono') {
      journalContainer.classList.add('font-mono');
    }
    const curSize = this.bibleEngine.fontSize || 18;
    journalContainer.style.fontSize = `${curSize}px`;
    document.documentElement.style.setProperty('--bible-font-size', `${curSize}px`);

    journalContainer.innerHTML = '';

    // Agrupar em parágrafos de 2 a 3 versículos para leitura contínua idêntica à Foto 1
    let currentP = document.createElement('p');
    currentP.className = 'journal-paragraph';
    currentP.style.fontSize = `${curSize}px`;

    // Função para isolar frases completas terminadas em pontuação (. ! ? e aspas/parênteses finais)
    const splitIntoSentences = (text) => {
      const regex = /[^.!?]+(?:[.!?]+(?:["'»”\)]+)?(?:\s+|$)|$)/g;
      const matches = text.match(regex);
      if (!matches) return [text.trim()];
      return matches.map(s => s.trim()).filter(Boolean);
    };

    verses.forEach((verseText, index) => {
      const vNum = index + 1;

      const span = document.createElement('span');
      span.className = 'journal-verse-span';
      span.style.fontSize = `${curSize}px`;
      span.dataset.verseNum = vNum;

      const sup = document.createElement('sup');
      sup.className = 'journal-verse-sup';
      sup.textContent = vNum;

      span.appendChild(sup);
      span.appendChild(document.createTextNode(' '));

      const sentences = splitIntoSentences(verseText);
      sentences.forEach((sent, sIdx) => {
        const sentSpan = document.createElement('span');
        sentSpan.className = 'bible-sentence';
        sentSpan.textContent = sent + ' ';
        sentSpan.dataset.verseNum = vNum;
        sentSpan.dataset.sentIdx = sIdx;
        span.appendChild(sentSpan);
      });

      currentP.appendChild(span);

      // Agrupar versículos em parágrafos elegantes
      if (vNum % 2 === 0 || index === verses.length - 1) {
        journalContainer.appendChild(currentP);
        currentP = document.createElement('p');
        currentP.className = 'journal-paragraph';
        currentP.style.fontSize = `${curSize}px`;
      }
    });

    // Reajustar altura do canvas de desenho para cobrir 100% da folha
    setTimeout(() => {
      if (this.pencilEngine) this.pencilEngine.initSize();
    }, 60);
  }

  /**
   * Prepara o texto bíblico para impressão A4 de 1 página:
   * Corta exatamente no último ponto final que cabe na folha,
   * impedindo que letras fiquem cortadas ao meio ou no topo na base da página.
   */
  prepareBiblePrintCut(targetOrientation = null) {
    const sheet = document.getElementById('journalSheet');
    const bibleCol = document.getElementById('journalBibleColumn');
    const list = document.getElementById('journalVersesList');
    if (!sheet || !bibleCol || !list) return;

    // 1. Restaurar qualquer corte prévio para medir com precisão
    this.restoreBiblePrintCut();

    const isPortrait = targetOrientation ? 
      (targetOrientation === 'portrait') : 
      sheet.classList.contains('orientation-portrait');

    // 2. Aplicar temporariamente a geometria de impressão A4 para medição fiel
    const origWidth = sheet.style.width;
    const origMaxWidth = sheet.style.maxWidth;
    const origHeight = sheet.style.height;
    const origMaxHeight = sheet.style.maxHeight;

    sheet.style.width = isPortrait ? '794px' : '1123px';
    sheet.style.maxWidth = isPortrait ? '794px' : '1123px';
    sheet.style.height = isPortrait ? '1123px' : '794px';
    sheet.style.maxHeight = isPortrait ? '1123px' : '794px';

    const sheetRect = sheet.getBoundingClientRect();
    // Altura A4 padrão a 96 DPI: Retrato = 1122.5px, Paisagem = 793.7px
    const pageHeight = isPortrait ? 1122.5 : 793.7;
    // Margem de segurança: descontar padding inferior (20px) + buffer de descida de linha (15px)
    const maxSafeBottom = pageHeight - 20 - 15;

    const sentenceSpans = Array.from(list.querySelectorAll('.bible-sentence'));
    let cutTriggered = false;

    sentenceSpans.forEach(sentSpan => {
      if (!cutTriggered) {
        const rect = sentSpan.getBoundingClientRect();
        const bottomRelSheet = rect.bottom - sheetRect.top;
        if (bottomRelSheet > maxSafeBottom) {
          cutTriggered = true;
        }
      }
      if (cutTriggered) {
        sentSpan.classList.add('print-cut-hidden');
      }
    });

    // Ocultar spans de versículos cujas frases foram todas cortadas (ocultando também o número sup)
    list.querySelectorAll('.journal-verse-span').forEach(vSpan => {
      const visibleSentences = vSpan.querySelectorAll('.bible-sentence:not(.print-cut-hidden)');
      if (visibleSentences.length === 0) {
        vSpan.classList.add('print-cut-hidden');
      }
    });

    // Ocultar parágrafos cujos versículos foram todos cortados
    list.querySelectorAll('.journal-paragraph').forEach(p => {
      const visibleVerses = p.querySelectorAll('.journal-verse-span:not(.print-cut-hidden)');
      if (visibleVerses.length === 0) {
        p.classList.add('print-cut-hidden');
      }
    });

    // 3. Restaurar estilos da folha
    sheet.style.width = origWidth;
    sheet.style.maxWidth = origMaxWidth;
    sheet.style.height = origHeight;
    sheet.style.maxHeight = origMaxHeight;
  }

  /**
   * Restaura todas as frases e versículos na folha após a impressão ou exportação.
   */
  restoreBiblePrintCut() {
    document.querySelectorAll('.print-cut-hidden').forEach(el => {
      el.classList.remove('print-cut-hidden');
    });
  }

  clearVerseSelection() {
    this.bibleEngine.selectedVerses.clear();
    document.querySelectorAll('.verse-item.selected').forEach(el => el.classList.remove('selected'));
    this.updateVerseSelectionBar();
  }

  handleNotesDrawn() {
    this.updateSaveIndicator('A guardar...');
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(async () => {
      const chapterKey = this.bibleEngine.getChapterKey();
      const book = this.bibleEngine.getCurrentBook();
      const dataUrl = this.pencilEngine.getDataUrl();
      const elements = this.pencilEngine.getElementsData();

      await this.notesStorage.saveNote(chapterKey, 0, dataUrl, {
        bookName: book ? book.name : '',
        chapterNum: this.bibleEngine.currentChapter,
        paperType: this.pencilEngine.paperType,
        elements: elements
      });

      this.updateSaveIndicator('Guardado');
    }, 600);
  }

  /**
   * Salva imediatamente as anotações atuais no IndexedDB sem esperar pelo debounce
   */
  async saveCurrentNotesNow() {
    clearTimeout(this.autoSaveTimeout);
    if (!this.pencilEngine || !this.bibleEngine || !this.notesStorage) return;
    const chapterKey = this.bibleEngine.getChapterKey();
    const book = this.bibleEngine.getCurrentBook();
    const dataUrl = this.pencilEngine.getDataUrl();
    const elements = this.pencilEngine.getElementsData();

    await this.notesStorage.saveNote(chapterKey, 0, dataUrl, {
      bookName: book ? book.name : '',
      chapterNum: this.bibleEngine.currentChapter,
      paperType: this.pencilEngine.paperType,
      elements: elements
    });

    this.updateSaveIndicator('Guardado');
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
  // VINCULAR EVENTOS DA UI (HEADER, PALETA FLUTUANTE, MENUS E MODAIS)
  // =========================================================================
  setupUIEventListeners() {
    // 1. Ferramentas da Paleta Flutuante (Caneta, Marca-Texto, Borracha)
    const toolPen = document.getElementById('toolPen');
    const toolHl = document.getElementById('toolHighlighter');
    const toolEraser = document.getElementById('toolEraser');
    const fpTools = [toolPen, toolHl, toolEraser].filter(Boolean);

    fpTools.forEach(btn => {
      btn.addEventListener('click', () => {
        fpTools.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool;
        this.pencilEngine.selectTool(tool);
      });
    });

    // 2. Cores da Paleta Flutuante
    const fpColors = document.querySelectorAll('.fp-color-dot');
    fpColors.forEach(dot => {
      dot.addEventListener('click', () => {
        fpColors.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        const color = dot.dataset.color;
        if (color) {
          if (this.pencilEngine.tool === 'highlighter') {
            this.pencilEngine.setHighlighterColor(color);
          } else {
            this.pencilEngine.setPenColor(color);
          }
        }
      });
    });

    const customColorInput = document.getElementById('customColorInput');
    if (customColorInput) {
      customColorInput.addEventListener('input', (e) => {
        const col = e.target.value;
        if (this.pencilEngine.tool === 'highlighter') {
          this.pencilEngine.setHighlighterColor(col);
        } else {
          this.pencilEngine.setPenColor(col);
        }
      });
    }

    // 3. Seletor de Espessura
    const strokeSizeBtn = document.getElementById('btnStrokeSize');
    const sizePopover = document.getElementById('sizePopover');
    const sizeSlider = document.getElementById('strokeSizeSlider');

    if (strokeSizeBtn && sizePopover) {
      strokeSizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sizePopover.classList.toggle('open');
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
      });
    }

    const sizeChips = document.querySelectorAll('.size-chip');
    sizeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sz = parseFloat(chip.dataset.size);
        this.pencilEngine.setPenSize(sz);
        if (sizeSlider) sizeSlider.value = sz;
        if (sizePopover) sizePopover.classList.remove('open');
      });
    });

    // 4. Mostrar / Ocultar Paleta Flutuante (Botão "🖊️")
    const btnTogglePalette = document.getElementById('btnTogglePencilPalette');
    const palette = document.getElementById('pencilFloatingPalette');
    if (btnTogglePalette && palette) {
      btnTogglePalette.addEventListener('click', () => {
        palette.classList.toggle('minimized');
        btnTogglePalette.classList.toggle('active', !palette.classList.contains('minimized'));
      });
    }

    // 5. Botão de Rejeição de Palma (Apple Pencil Only vs Dedo)
    const palmPill = document.getElementById('palmStatusPill');
    if (palmPill) {
      palmPill.addEventListener('click', () => {
        const isPenOnly = this.pencilEngine.togglePalmRejection();
        palmPill.textContent = isPenOnly ? '🖐️' : '✏️';
        palmPill.title = isPenOnly ? 'Apple Pencil Ativo (Palma Rejeitada)' : 'Modo Toque com Dedo';
      });
    }

    // 6. Desfazer, Refazer e Limpar
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    const btnClear = document.getElementById('btnClear');

    if (btnUndo) btnUndo.addEventListener('click', () => this.pencilEngine.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => this.pencilEngine.redo());
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        // Se houver uma imagem ou caixa de nota selecionada, apaga esse elemento imediatamente!
        if (this.pencilEngine && this.pencilEngine.deleteSelectedElement()) {
          return;
        }
        if (confirm('Deseja limpar todos os traços e anotações desta página?')) {
          this.pencilEngine.clear();
        }
      });
    }

    // 7. Navegação de Capítulos
    const btnPrevCh = document.getElementById('btnPrevChapter');
    const btnNextCh = document.getElementById('btnNextChapter');
    if (btnPrevCh) btnPrevCh.addEventListener('click', () => this.bibleEngine.prevChapter());
    if (btnNextCh) btnNextCh.addEventListener('click', () => this.bibleEngine.nextChapter());

    // 8. Seletor de Tradução (BPT, NTLH, AA)
    const transSelect = document.getElementById('bibleTranslationSelect');
    if (transSelect) {
      transSelect.value = this.bibleEngine.currentTranslation;
      transSelect.addEventListener('change', (e) => {
        this.bibleEngine.setTranslation(e.target.value);
        this.handleChapterChanged(this.bibleEngine.getCurrentChapterInfo());
      });
    }

    // 9. Opções de Notas Diretas no Header
    const btnQuickTextBox = document.getElementById('btnQuickTextBox');
    if (btnQuickTextBox) {
      btnQuickTextBox.addEventListener('click', () => {
        const x = this.getNotesColumnDefaultX();
        const y = 80;
        this.pencilEngine.addTextBox({ x, y, text: '' });
      });
    }

    const btnQuickChecklist = document.getElementById('btnQuickChecklist');
    if (btnQuickChecklist) {
      btnQuickChecklist.addEventListener('click', () => {
        const x = this.getNotesColumnDefaultX();
        const y = 80;
        this.pencilEngine.addChecklist({ x, y });
      });
    }

    const btnQuickStickers = document.getElementById('btnQuickStickers');
    const stickersModal = document.getElementById('stickersModal');
    if (btnQuickStickers && stickersModal) {
      btnQuickStickers.addEventListener('click', () => {
        stickersModal.classList.add('open');
      });
    }

    const btnQuickImage = document.getElementById('btnQuickImage');
    const imageInput = document.getElementById('imageFileInput');
    if (btnQuickImage && imageInput) {
      btnQuickImage.addEventListener('click', () => imageInput.click());
    }

    if (imageInput) {
      imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const x = this.getNotesColumnDefaultX();
            this.pencilEngine.addImage(evt.target.result, { x, y: 100 });
          };
          reader.readAsDataURL(file);
        }
      });
    }

    const btnToggleOrientation = document.getElementById('btnToggleOrientation');
    if (btnToggleOrientation) {
      btnToggleOrientation.addEventListener('click', () => this.toggleOrientation());
    }

    // Modal de Stickers
    const stickerChoices = document.querySelectorAll('.sticker-choice-item');
    if (stickersModal) {
      stickerChoices.forEach(choice => {
        choice.addEventListener('click', () => {
          const symbol = choice.dataset.symbol;
          this.pencilEngine.addSticker(symbol);
          stickersModal.classList.remove('open');
        });
      });
      const btnCloseStickers = document.getElementById('btnCloseStickers');
      if (btnCloseStickers) btnCloseStickers.addEventListener('click', () => stickersModal.classList.remove('open'));
    }

    // 10. Modal "T" Definições da Página (Foto 3)
    const btnPageSettings = document.getElementById('btnOpenPageSettings');
    const pageSettingsModal = document.getElementById('pageSettingsModal');
    const btnClosePageSettings = document.getElementById('btnClosePageSettings');

    if (btnPageSettings && pageSettingsModal) {
      btnPageSettings.addEventListener('click', () => pageSettingsModal.classList.add('open'));
    }
    if (btnClosePageSettings && pageSettingsModal) {
      btnClosePageSettings.addEventListener('click', () => pageSettingsModal.classList.remove('open'));
    }

    // "Select your background" (Blank, Lines, Dots, Grid)
    const bgBoxes = document.querySelectorAll('.bg-option-box');
    bgBoxes.forEach(box => {
      box.addEventListener('click', () => {
        bgBoxes.forEach(b => b.classList.remove('active'));
        box.classList.add('active');
        const paper = box.dataset.paper;
        this.pencilEngine.setPaperType(paper);
        localStorage.setItem('bstudy_paper_type', paper);
      });
    });


    // "Tamanho do Texto Bíblico" (Slider)
    const bibleFontSizeSlider = document.getElementById('bibleFontSizeSlider');
    const bibleFontSizeLabel = document.getElementById('bibleFontSizeLabel');

    if (bibleFontSizeSlider) {
      const applyFontSize = (val) => {
        const sizeNum = parseInt(val, 10) || 18;
        this.bibleEngine.setFontSize(sizeNum);
        document.documentElement.style.setProperty('--bible-font-size', `${sizeNum}px`);
        if (bibleFontSizeLabel) {
          bibleFontSizeLabel.textContent = `${sizeNum}px`;
        }
        const journalContainer = document.getElementById('journalVersesList');
        if (journalContainer) {
          journalContainer.style.fontSize = `${sizeNum}px`;
          journalContainer.querySelectorAll('.journal-paragraph, .journal-verse-span').forEach(el => {
            el.style.fontSize = `${sizeNum}px`;
          });
        }
        if (this.pencilEngine) {
          setTimeout(() => this.pencilEngine.initSize(), 50);
        }
      };

      bibleFontSizeSlider.addEventListener('input', (e) => applyFontSize(e.target.value));
      bibleFontSizeSlider.addEventListener('change', (e) => applyFontSize(e.target.value));
    }

    // "Typeface" (Foto 3)
    const bibleFontSelect = document.getElementById('bibleFontFamilySelect');
    if (bibleFontSelect) {
      bibleFontSelect.value = this.bibleEngine.fontFamily || 'serif';
      bibleFontSelect.addEventListener('change', (e) => {
        this.bibleEngine.setFontFamily(e.target.value);
        this.renderBibleVerses();
      });
    }

    // 11. Modal "🔍" Pesquisa de Versículos
    const btnSearch = document.getElementById('btnOpenSearch');
    const searchModal = document.getElementById('searchVersesModal');
    const btnCloseSearch = document.getElementById('btnCloseSearch');
    const searchInput = document.getElementById('verseSearchInput');
    const searchResults = document.getElementById('searchResultsList');

    if (btnSearch && searchModal) {
      btnSearch.addEventListener('click', () => {
        searchModal.classList.add('open');
        if (searchInput) {
          searchInput.value = '';
          if (searchResults) searchResults.innerHTML = '';
          setTimeout(() => searchInput.focus(), 80);
        }
      });
    }
    if (btnCloseSearch && searchModal) {
      btnCloseSearch.addEventListener('click', () => searchModal.classList.remove('open'));
    }

    if (searchInput && searchResults) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        searchResults.innerHTML = '';
        if (!q) return;

        const verses = this.bibleEngine.getCurrentChapterVerses();
        verses.forEach((vText, idx) => {
          if (vText.toLowerCase().includes(q)) {
            const vNum = idx + 1;
            const item = document.createElement('div');
            item.style.padding = '8px 10px';
            item.style.borderRadius = '6px';
            item.style.background = '#f8fafc';
            item.style.cursor = 'pointer';
            item.style.fontSize = '13.5px';
            item.innerHTML = `<strong>Versículo ${vNum}:</strong> ${vText}`;
            item.addEventListener('click', () => {
              searchModal.classList.remove('open');
              const targetRow = document.querySelector(`.journal-verse-span[data-verse-num="${vNum}"]`) || document.querySelector(`.journal-verse-row[data-verse-num="${vNum}"]`);
              if (targetRow) {
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetRow.classList.add('selected');
                setTimeout(() => targetRow.classList.remove('selected'), 3000);
              }
            });
            searchResults.appendChild(item);
          }
        });
      });
    }

    // Fechar popovers e dropdowns ao clicar fora
    document.addEventListener('click', (e) => {
      if (addDropdown && !e.target.closest('#btnOpenAddMenu') && !e.target.closest('#addMenuDropdown')) {
        addDropdown.classList.remove('open');
      }
      if (sizePopover && !e.target.closest('#btnStrokeSize') && !e.target.closest('#sizePopover')) {
        sizePopover.classList.remove('open');
      }
    });

    const pencilToolbar = document.getElementById('pencilFloatingPalette');
    if (pencilToolbar) {
      const btnScrollLeft = document.getElementById('btnScrollLeft');
      const btnScrollRight = document.getElementById('btnScrollRight');
      if (btnScrollLeft) {
        btnScrollLeft.addEventListener('click', () => {
          pencilToolbar.scrollBy({ left: -180, behavior: 'smooth' });
        });
      }
      if (btnScrollRight) {
        btnScrollRight.addEventListener('click', () => {
          pencilToolbar.scrollBy({ left: 180, behavior: 'smooth' });
        });
      }
    }

    // 12. Modal de Backup e Restauro de Notas
    const btnOpenBackup = document.getElementById('btnOpenBackupModal');
    const btnPageSettingsBackup = document.getElementById('btnPageSettingsOpenBackup');
    const backupModal = document.getElementById('backupModal');
    const btnCloseBackup = document.getElementById('btnCloseBackupModal');
    const btnCloseBackupFooter = document.getElementById('btnCloseBackupModalFooter');
    const btnExecuteBackupExport = document.getElementById('btnExecuteBackupExport');
    const btnTriggerBackupImport = document.getElementById('btnTriggerBackupImport');
    const backupFileInput = document.getElementById('backupFileInput');
    const feedbackMsg = document.getElementById('backupFeedbackMsg');

    const showBackupFeedback = (text, isError = false) => {
      if (!feedbackMsg) return;
      feedbackMsg.style.display = 'block';
      feedbackMsg.style.backgroundColor = isError ? '#fef2f2' : '#f0fdf4';
      feedbackMsg.style.color = isError ? '#b91c1c' : '#15803d';
      feedbackMsg.style.border = `1.5px solid ${isError ? '#fecaca' : '#bbf7d0'}`;
      feedbackMsg.textContent = text;
    };

    const updateBackupStatus = async () => {
      const badge = document.getElementById('backupNotesCountBadge');
      const detail = document.getElementById('backupStatusDetail');
      if (badge && window.notesStorage) {
        try {
          const notes = await window.notesStorage.getAllNotes();
          const validNotes = notes.filter(n => n.hasContent);
          badge.textContent = `${validNotes.length} capítulo(s) guardado(s)`;
          if (detail) {
            detail.textContent = validNotes.length > 0 
              ? `Total de ${validNotes.length} páginas com desenhos manuscritos, caixas de texto, tarefas e stickers prontos para cópia de segurança.`
              : `Nenhuma nota guardada ainda. Faça anotações para criar a sua cópia de segurança!`;
          }
        } catch (e) {
          badge.textContent = 'Pronto';
        }
      }
    };

    const openBackupModal = () => {
      if (backupModal) {
        if (feedbackMsg) feedbackMsg.style.display = 'none';
        updateBackupStatus();
        backupModal.classList.add('open');
      }
    };

    if (btnOpenBackup) btnOpenBackup.addEventListener('click', openBackupModal);
    if (btnPageSettingsBackup) {
      btnPageSettingsBackup.addEventListener('click', () => {
        const pageModal = document.getElementById('pageSettingsModal');
        if (pageModal) pageModal.classList.remove('open');
        openBackupModal();
      });
    }

    if (btnCloseBackup && backupModal) {
      btnCloseBackup.addEventListener('click', () => backupModal.classList.remove('open'));
    }
    if (btnCloseBackupFooter && backupModal) {
      btnCloseBackupFooter.addEventListener('click', () => backupModal.classList.remove('open'));
    }

    // Exportar Backup
    if (btnExecuteBackupExport) {
      btnExecuteBackupExport.addEventListener('click', async () => {
        try {
          btnExecuteBackupExport.disabled = true;
          btnExecuteBackupExport.innerHTML = '<span>A exportar...</span>';
          // 1. Garantir que as anotações do capítulo atual são gravadas imediatamente
          await this.saveCurrentNotesNow();
          // 2. Exportar ficheiro .json
          const res = await window.notesStorage.exportBackupFile();
          showBackupFeedback(`✅ Backup descarregado com sucesso! Ficheiro guardado como "${res.fileName}" (${res.notesCount} páginas/capítulos).`);
          updateBackupStatus();
        } catch (err) {
          console.error('Erro ao exportar backup:', err);
          showBackupFeedback(`❌ Falha ao exportar backup: ${err.message}`, true);
        } finally {
          btnExecuteBackupExport.disabled = false;
          btnExecuteBackupExport.innerHTML = '<span>Descarregar</span>';
        }
      });
    }

    // Importar / Restaurar Backup
    if (btnTriggerBackupImport && backupFileInput) {
      btnTriggerBackupImport.addEventListener('click', () => {
        backupFileInput.value = '';
        backupFileInput.click();
      });

      backupFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
          btnTriggerBackupImport.disabled = true;
          btnTriggerBackupImport.innerHTML = '<span>A restaurar...</span>';
          const res = await window.notesStorage.importBackupFile(file);
          
          // Recarregar imediatamente o capítulo atual caso tenha sido restaurado
          const currentKey = this.bibleEngine.getChapterKey();
          const restoredNote = await window.notesStorage.getNote(currentKey, 0);
          if (restoredNote) {
            if (restoredNote.dataUrl) {
              await this.pencilEngine.loadFromDataUrl(restoredNote.dataUrl);
            } else {
              this.pencilEngine.clear();
            }
            if (restoredNote.elements && Array.isArray(restoredNote.elements)) {
              this.pencilEngine.loadElementsData(restoredNote.elements);
            } else {
              this.pencilEngine.clearElements();
            }
          }

          showBackupFeedback(`✅ Restauro concluído com sucesso! ${res.restoredNotesCount} notas e definições recuperadas.`);
          updateBackupStatus();
          this.updateSaveIndicator('Restaurado');
        } catch (err) {
          console.error('Erro ao restaurar backup:', err);
          showBackupFeedback(`❌ Falha ao restaurar: ${err.message}`, true);
        } finally {
          btnTriggerBackupImport.disabled = false;
          btnTriggerBackupImport.innerHTML = '<span>Selecionar Ficheiro</span>';
          backupFileInput.value = '';
        }
      });
    }

    // 17. Ciclo de Vida de Impressão (A4 Full-Page e Limpeza de Bordas de Caixas de Texto)
    window.addEventListener('beforeprint', () => {
      if (document.activeElement) document.activeElement.blur();
      document.querySelectorAll('.note-text-box, .note-checklist-box').forEach(el => {
        el.classList.remove('is-editing');
      });
      if (this.pencilEngine) {
        this.pencilEngine.prepareForA4Print(true);
      }
    });

    window.addEventListener('afterprint', () => {
      if (this.pencilEngine) {
        this.pencilEngine.prepareForA4Print(false);
      }
    });
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
    const btnSwitchInExport = document.getElementById('btnSwitchOrientationInExport');

    if (btnSwitchInExport) {
      btnSwitchInExport.addEventListener('click', () => {
        this.toggleOrientation();
      });
    }

    if (btnOpenExport && exportModal) {
      btnOpenExport.addEventListener('click', () => {
        const exportOrientLabel = document.getElementById('exportOrientationLabel');
        if (exportOrientLabel) {
          exportOrientLabel.textContent = this.orientation === 'portrait' ? 'A4 Vertical (Retrato)' : 'A4 Paisagem (Horizontal)';
        }
        exportModal.classList.add('open');
      });
    }

    if (closeExportBtn && exportModal) {
      closeExportBtn.addEventListener('click', () => exportModal.classList.remove('open'));
    }

    // Seleção de formato de exportação (PDF A4 vs PNG)
    let selectedExportFormat = 'pdf';
    const exportCards = document.querySelectorAll('.export-option-card');
    exportCards.forEach(card => {
      card.addEventListener('click', () => {
        exportCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedExportFormat = card.dataset.format;
      });
    });

    // Botão de impressão (Imprime Bíblia + Notas incorporadas sempre juntas em 1 página A4)
    const btnPrintDirect = document.getElementById('btnPrintDirect');
    if (btnPrintDirect) {
      btnPrintDirect.addEventListener('click', async () => {
        exportModal.classList.remove('open');
        await this.exportEngine.printA4({ orientation: this.orientation });
      });
    }

    // Botão de descarregar ficheiro (PDF ou PNG sempre com Bíblia + Notas juntas)
    if (btnDoExport) {
      btnDoExport.addEventListener('click', async () => {
        btnDoExport.disabled = true;
        const originalText = btnDoExport.innerHTML;
        btnDoExport.innerHTML = '<span>A preparar...</span>';

        try {
          if (selectedExportFormat === 'png') {
            await this.exportEngine.exportAsImage({ orientation: this.orientation });
          } else {
            await this.exportEngine.exportAsPdf({ orientation: this.orientation });
          }
          exportModal.classList.remove('open');
        } catch (err) {
          console.error('Erro ao descarregar:', err);
          alert('Ocorreu um problema ao gerar o ficheiro.');
        } finally {
          btnDoExport.disabled = false;
          btnDoExport.innerHTML = originalText;
        }
      });
    }

    // 3. Modal de Configurações de Leitura / Alternância de Tema
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

        // Sincronizar simultaneamente a cor do papel das notas com o tema da Bíblia
        const paperTheme = nextTheme === 'claro' ? 'branco' : nextTheme;
        this.pencilEngine.setPaperTheme(paperTheme);
        localStorage.setItem('bstudy_paper_theme', paperTheme);
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
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(text => {
              if (text && text.trim()) {
                this.pencilEngine.stampText(text.trim());
              }
            }).catch(() => {});
          }
        }
      }
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.update();
        console.log('BStudy ServiceWorker registado e atualizado:', reg.scope);
      }).catch((err) => {
        console.log('Registo do ServiceWorker opcional falhou:', err);
      });

      // Purgar caches de versões antigas
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key !== 'bstudy-v3-network-first') {
              caches.delete(key);
            }
          });
        });
      }
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
