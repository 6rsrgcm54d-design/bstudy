/**
 * BStudy - Motor de Caligrafia Digital Especializado para iPad & Apple Pencil
 * - Traçado Contínuo de Alta Precisão (Interpolação Bézier sem falhas nem pontilhados)
 * - Suporte a Eventos Coalescidos de Alta Frequência (Apple Pencil 120Hz/240Hz ProMotion)
 * - Rejeição Nativa e Estrita da Palma da Mão (Palm Rejection Predefinida)
 * - Bloqueio Total de Seleção de Texto e Popups Nativos do Safari ("Copiar / Procurar")
 * - 3 Cores de Caneta: Preto, Azul Escuro e Vermelho
 * - Seletor de Espessura e 3 Highlighters Translúcidos (Multiply)
 * - Papéis: Linhas, Quadriculado, Pontilhado e Liso
 */

// Polyfill universal para roundRect no Safari
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const radius = typeof r === 'number' ? r : 8;
    this.beginPath();
    this.moveTo(x + radius, y);
    this.lineTo(x + w - radius, y);
    this.quadraticCurveTo(x + w, y, x + w, y + radius);
    this.lineTo(x + w, y + h - radius);
    this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    this.lineTo(x + radius, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    this.closePath();
    return this;
  };
}

class ApplePencilEngine {
  constructor(canvasContainer, options = {}) {
    this.container = canvasContainer || document.body;
    
    // Configurações de ferramentas
    this.tool = 'pen'; // 'pen', 'highlighter', 'eraser'
    this.penColor = '#1a1a1a'; // Preto padrão
    this.penSize = 3.0; // Espessura normal
    
    this.highlighterColor = '#fef08a'; // Amarelo pastel suave padrão (não alaranjado)
    this.highlighterSize = 24.0; // Espessura de marca-texto
    this.eraserSize = 26.0;
    
    // Cores oficiais especificadas pelo utilizador:
    this.PEN_COLORS = {
      black: '#1a1a1a',    // Preto tinta profunda
      blue: '#0c356a',     // Azul escuro clássico
      red: '#ba181b'       // Vermelho vivo editorial
    };

    this.HIGHLIGHTER_COLORS = {
      yellow: '#fef08a',   // Amarelo pastel suave e luminoso (sem tom alaranjado)
      green: '#bbf7d0',    // Verde menta suave e translúcido (não escuro)
      lightRed: '#fbcfe8'  // Rosa/vermelho pastel muito delicado e suave
    };

    // Rejeição da Palma da Mão (Predefinida como ATIVA)
    // Apenas 'pen' desenha; toques com a mão/dedo são ignorados sem riscar a tela!
    this.onlyPenMode = true; 
    this.pressureEnabled = true;

    // Tipo de Papel: 'linhas', 'quadriculado', 'pontilhado', 'liso'
    this.paperType = options.paperType || 'liso';
    this.paperTheme = options.paperTheme || 'branco';

    // Histórico de ações (Undo / Redo)
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 30;

    // Estado do traço contínuo
    this.isDrawing = false;
    this.activePointerId = null;
    this.lastPoint = null;
    this.lastMidPoint = null;
    this.hasDrawn = false;
    this.strokePointsCount = 0;
    this.onChangeCallback = null;

    // Inicialização
    this.setupCanvases();
    this.initSize();
    this.renderPaper();
    this.attachEvents();
    this.saveState();
  }

  setupCanvases() {
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.userSelect = 'none';
    this.container.style.webkitUserSelect = 'none';
    this.container.style.touchAction = 'pan-y';
    this.container.style.webkitTouchCallout = 'none';

    // Remover canvases antigos se existirem
    const oldPaper = this.container.querySelector('.notes-paper-canvas');
    if (oldPaper) oldPaper.remove();
    const oldDraw = this.container.querySelector('.notes-drawing-canvas');
    if (oldDraw) oldDraw.remove();
    const oldRing = this.container.querySelector('.pencil-cursor-ring');
    if (oldRing) oldRing.remove();
    const oldLayer = this.container.querySelector('.notes-elements-layer');
    if (oldLayer) oldLayer.remove();

    // 1. Canvas de Fundo (Papel com Pautas/Grade - z-index 1)
    this.paperCanvas = document.createElement('canvas');
    this.paperCanvas.className = 'notes-paper-canvas';
    this.paperCanvas.style.position = 'absolute';
    this.paperCanvas.style.top = '0';
    this.paperCanvas.style.left = '0';
    this.paperCanvas.style.zIndex = '1';
    this.paperCanvas.style.pointerEvents = 'none';
    this.paperCtx = this.paperCanvas.getContext('2d');

    // 2. Canvas de Desenho Apple Pencil (z-index 3, transparente por cima da Bíblia)
    this.drawCanvas = document.createElement('canvas');
    this.drawCanvas.className = 'notes-drawing-canvas';
    this.drawCanvas.style.position = 'absolute';
    this.drawCanvas.style.top = '0';
    this.drawCanvas.style.left = '0';
    this.drawCanvas.style.zIndex = '3';
    this.drawCanvas.style.pointerEvents = 'auto';
    this.drawCanvas.style.cursor = 'crosshair';
    this.drawCanvas.style.touchAction = 'pan-y';
    this.drawCanvas.style.mixBlendMode = 'multiply';
    this.drawCanvas.style.webkitTouchCallout = 'none';
    this.drawCanvas.style.webkitUserSelect = 'none';
    this.drawCanvas.style.userSelect = 'none';
    this.drawCtx = this.drawCanvas.getContext('2d', { willReadFrequently: true });

    // 3. Cursor indicador de Borracha
    this.cursorRing = document.createElement('div');
    this.cursorRing.className = 'pencil-cursor-ring';
    this.cursorRing.style.position = 'absolute';
    this.cursorRing.style.borderRadius = '50%';
    this.cursorRing.style.border = '1.5px solid rgba(239, 68, 68, 0.7)';
    this.cursorRing.style.pointerEvents = 'none';
    this.cursorRing.style.display = 'none';
    this.cursorRing.style.zIndex = '15';
    this.cursorRing.style.transform = 'translate(-50%, -50%)';

    // 4. Camada Interativa de Caixas de Texto, Tarefas e Stickers (z-index 4)
    this.elementsLayer = document.createElement('div');
    this.elementsLayer.className = 'notes-elements-layer';
    this.elementsLayer.style.position = 'absolute';
    this.elementsLayer.style.top = '0';
    this.elementsLayer.style.left = '0';
    this.elementsLayer.style.width = '100%';
    this.elementsLayer.style.height = '100%';
    this.elementsLayer.style.zIndex = '4';
    this.elementsLayer.style.pointerEvents = 'none';

    // Inserir paperCanvas na base do container
    if (this.container.firstChild) {
      this.container.insertBefore(this.paperCanvas, this.container.firstChild);
    } else {
      this.container.appendChild(this.paperCanvas);
    }
    this.container.appendChild(this.drawCanvas);
    this.container.appendChild(this.elementsLayer);
    this.container.appendChild(this.cursorRing);
  }

  // Define o tamanho lógico da folha A4 (em px CSS, antes da escala visual do ecrã)
  setLogicalSize(width, height) {
    this.logicalWidth = Math.round(width);
    this.logicalHeight = Math.round(height);
    this.initSize();
  }

  // Fator de escala visual aplicado à folha (transform: scale) para converter coordenadas do ecrã
  getViewScale() {
    if (!this.drawCanvas || !this.width) return 1;
    const rect = this.drawCanvas.getBoundingClientRect();
    return rect.width > 0 ? rect.width / this.width : 1;
  }

  initSize() {
    const sheet = document.getElementById('journalSheet') || this.container.parentElement || this.container;
    const isPortrait = sheet ? sheet.classList.contains('orientation-portrait') : false;
    const minW = isPortrait ? 820 : 1160;
    const minH = isPortrait ? 1160 : 820;

    const width = this.logicalWidth || (sheet ? Math.max(sheet.offsetWidth || minW, minW) : minW);
    // IMPORTANTE: Garantir que a altura cobre 100% de todo o scroll do conteúdo sem cortes!
    const height = sheet ? Math.max(sheet.scrollHeight || 0, sheet.offsetHeight || 0, minH) : minH;

    if (this.container) {
      this.container.style.width = `${width}px`;
      this.container.style.height = `${height}px`;
    }

    // Nada mudou: não recriar os canvases (evita perder qualidade dos traços)
    if (this.width === width && this.height === height && this.drawCanvas.width > 0) {
      return;
    }

    const dpr = Math.max(window.devicePixelRatio || 1, 2);

    let tempCanvas = null;
    if (this.hasDrawn && this.drawCanvas && this.drawCanvas.width > 0 && this.drawCanvas.height > 0) {
      try {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.drawCanvas.width;
        tempCanvas.height = this.drawCanvas.height;
        tempCanvas.getContext('2d').drawImage(this.drawCanvas, 0, 0);
      } catch (e) {}
    }

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    this.paperCanvas.width = width * dpr;
    this.paperCanvas.height = height * dpr;
    this.paperCanvas.style.width = `${width}px`;
    this.paperCanvas.style.height = `${height}px`;
    this.paperCtx.scale(dpr, dpr);

    this.drawCanvas.width = width * dpr;
    this.drawCanvas.height = height * dpr;
    this.drawCanvas.style.width = `${width}px`;
    this.drawCanvas.style.height = `${height}px`;
    this.drawCtx.scale(dpr, dpr);
    this.drawCtx.lineCap = 'round';
    this.drawCtx.lineJoin = 'round';

    if (tempCanvas) {
      try {
        // Redesenhar traços em escala 1:1 real para que redimensionar nunca estique os desenhos
        this.drawCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width / dpr, tempCanvas.height / dpr);
      } catch (e) {}
    }

    this.renderPaper();
  }

  // =========================================================================
  // GESTÃO DE EVENTOS E PREVENÇÃO DE MENUS NATIVOS DO SAFARI
  // =========================================================================
  attachEvents() {
    // 1. Bloquear menu nativo de seleção do iOS ("Copiar / Procurar / Traduzir") e menus de contexto
    const suppressCallout = (e) => {
      // Se não for modo de seleção pura de texto, bloquear menus nativos
      if (this.tool !== 'select') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    this.drawCanvas.addEventListener('contextmenu', suppressCallout, { passive: false });
    this.drawCanvas.addEventListener('selectstart', suppressCallout, { passive: false });
    this.drawCanvas.addEventListener('gesturestart', suppressCallout, { passive: false });
    this.drawCanvas.addEventListener('gesturechange', suppressCallout, { passive: false });

    // 2. Pointer Events do Apple Pencil com suporte a deslizamento (scroll) com o dedo
    this.drawCanvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    this.drawCanvas.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    this.drawCanvas.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    this.drawCanvas.addEventListener('pointercancel', (e) => this.onPointerCancel(e), { passive: false });
    this.drawCanvas.addEventListener('pointerleave', (e) => this.onPointerLeave(e), { passive: false });

    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.initSize(), 200);
    });

    // 3. Ao tocar fora de qualquer elemento (na folha, Bíblia ou fundo), desmarca as caixas e oculta o menu de escrita
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.note-text-box, .note-checklist-box, .note-image-box, .text-box-toolbar, .checklist-toolbar, .image-toolbar, .pencil-floating-palette, .app-header, .modal-overlay')) {
        document.querySelectorAll('.note-text-box.is-editing, .note-checklist-box.is-editing').forEach(el => {
          el.classList.remove('is-editing');
        });
      }
    });

    // 4. Duplo clique no papel para inserir caixa de texto no local exato
    this.container.addEventListener('dblclick', (e) => {
      if (e.target.closest('.note-text-box') || e.target.closest('.note-checklist-box') || e.target.closest('.pencil-toolbar')) return;
      const rect = this.container.getBoundingClientRect();
      const x = Math.max(20, Math.min(rect.width - 240, e.clientX - rect.left));
      const y = Math.max(20, Math.min(rect.height - 80, e.clientY - rect.top));
      this.addTextBox({ x, y, text: '' });
    });
  }

  getPointerPos(e) {
    const rect = this.drawCanvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const scale = this.getViewScale() || 1;
    
    let pressure = 0.5;
    if (e.pressure !== undefined && e.pressure > 0) {
      pressure = e.pressure;
    }

    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
      pressure: pressure,
      pointerType: e.pointerType || 'touch'
    };
  }

  onPointerDown(e) {
    if (this.tool === 'select') return;

    const pos = this.getPointerPos(e);

    // =======================================================================
    // DISTINÇÃO INTELIGENTE: APPLE PENCIL ('pen') VS DEDO ('touch')
    // 1) Se for toque com o dedo (touch):
    //    - Se já estivermos a desenhar com o Apple Pencil (palma da mão na tela),
    //      ignora completamente o toque sem riscar nem saltar o scroll!
    //    - Se NÃO estivermos a desenhar e onlyPenMode for true, NÃO chama preventDefault!
    //      Isto permite ao utilizador deslizar o texto bíblico e o caderno com 1 dedo!
    // 2) Se for Apple Pencil ('pen') ou Rato ('mouse'):
    //    - Chama preventDefault para bloquear qualquer gesto nativo do Safari
    //    - Captura o ponteiro e inicia o traço contínuo de alta precisão
    // =======================================================================
    if (pos.pointerType === 'touch') {
      if (this.isDrawing) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.onlyPenMode) {
        // Permitir deslizamento vertical natural do texto bíblico
        return;
      }
    }

    e.preventDefault();
    e.stopPropagation();

    try {
      this.drawCanvas.setPointerCapture(e.pointerId);
      this.activePointerId = e.pointerId;
    } catch (err) {}

    this.isDrawing = true;
    this.strokePointsCount = 1;
    this.lastPoint = pos;
    this.lastMidPoint = { x: pos.x, y: pos.y };

    if (this.tool === 'eraser') {
      this.updateCursorRing(pos);
      this.eraseAt(pos.x, pos.y);
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing) return;

    // Se o evento pertencer a outro ponteiro enquanto desenhamos (ex: palma da mão descansada), ignora
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (this.tool === 'eraser') {
      const pos = this.getPointerPos(e);
      this.updateCursorRing(pos);
      this.eraseAt(pos.x, pos.y);
      return;
    }

    // Processar eventos coalescidos do Apple Pencil (120Hz/240Hz ProMotion no iPad)
    let coalescedEvents = [e];
    try {
      if (typeof e.getCoalescedEvents === 'function') {
        const ce = e.getCoalescedEvents();
        if (ce && ce.length > 0) {
          coalescedEvents = ce;
        }
      }
    } catch (err) {}

    for (let i = 0; i < coalescedEvents.length; i++) {
      const pos = this.getPointerPos(coalescedEvents[i]);
      this.renderContinuousStroke(pos);
    }
  }

  onPointerUp(e) {
    if (!this.isDrawing) return;

    if (this.activePointerId !== null) {
      try {
        this.drawCanvas.releasePointerCapture(this.activePointerId);
      } catch (err) {}
      this.activePointerId = null;
    }

    // =======================================================================
    // FINAL DO TRAÇO: Traçar o último segmento até ao ponto exato onde a caneta levantou
    // Isto elimina falhas no fim das letras ou pequenos acentos e pingos
    // =======================================================================
    if (this.strokePointsCount > 1 && this.lastPoint && this.lastMidPoint && this.tool !== 'eraser') {
      const ctx = this.drawCtx;
      ctx.save();
      if (this.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.getHighlighterRgba();
        ctx.lineWidth = this.highlighterSize;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.penColor;
        let width = this.penSize;
        if (this.pressureEnabled && this.lastPoint.pointerType === 'pen') {
          width = this.penSize * (0.6 + (this.lastPoint.pressure * 0.8));
        }
        ctx.lineWidth = Math.max(1, width);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.lastMidPoint.x, this.lastMidPoint.y);
      ctx.lineTo(this.lastPoint.x, this.lastPoint.y);
      ctx.stroke();
      ctx.restore();
    } else if (this.strokePointsCount === 1 && this.lastPoint && this.tool !== 'eraser') {
      // Se foi apenas um toque rápido (ponto ou acento)
      this.drawSingleDot(this.lastPoint);
    }

    this.isDrawing = false;
    this.cursorRing.style.display = 'none';
    this.lastPoint = null;
    this.lastMidPoint = null;
    this.strokePointsCount = 0;
    this.hasDrawn = true;
    this.saveState();

    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }

  onPointerCancel(e) {
    if (this.activePointerId !== null && e.pointerId === this.activePointerId) {
      this.onPointerUp(e);
    }
  }

  onPointerLeave(e) {
    this.cursorRing.style.display = 'none';
    if (this.isDrawing && this.activePointerId !== null && e.pointerId === this.activePointerId) {
      this.onPointerUp(e);
    }
  }

  updateCursorRing(pos) {
    if (this.tool === 'eraser') {
      const diameter = this.eraserSize;
      this.cursorRing.style.width = `${diameter}px`;
      this.cursorRing.style.height = `${diameter}px`;
      this.cursorRing.style.left = `${pos.x}px`;
      this.cursorRing.style.top = `${pos.y}px`;
      this.cursorRing.style.display = 'block';
    } else {
      this.cursorRing.style.display = 'none';
    }
  }

  getHighlighterRgba() {
    // Cores pastel suaves e luminosas que não escurecem o texto bíblico
    const map = {
      '#fef08a': 'rgba(254, 240, 138, 0.42)', // Amarelo suave
      '#bbf7d0': 'rgba(187, 247, 208, 0.45)', // Verde menta
      '#fbcfe8': 'rgba(251, 207, 232, 0.46)'  // Rosa suave
    };
    if (map[this.highlighterColor]) return map[this.highlighterColor];
    return this.hexToRgba(this.highlighterColor, 0.42);
  }

  // =========================================================================
  // MOTOR DE CURVAS BÉZIER CONTÍNUAS (FLUIDEZ MÁXIMA E SEM FALHAS)
  // =========================================================================
  renderContinuousStroke(currentPoint) {
    if (!this.lastPoint || !this.lastMidPoint) {
      this.lastPoint = currentPoint;
      this.lastMidPoint = { x: currentPoint.x, y: currentPoint.y };
      return;
    }

    const dx = currentPoint.x - this.lastPoint.x;
    const dy = currentPoint.y - this.lastPoint.y;
    // Calibração de precisão para 120Hz/240Hz ProMotion sem falhas
    if (dx * dx + dy * dy < 0.04) {
      return;
    }

    const ctx = this.drawCtx;

    // Ponto médio entre o último ponto e o ponto atual
    const currentMid = {
      x: (this.lastPoint.x + currentPoint.x) / 2,
      y: (this.lastPoint.y + currentPoint.y) / 2
    };

    ctx.save();

    if (this.tool === 'highlighter') {
      // Marcador pastel suave com blend multiply no CSS do canvas:
      // Mantém o texto bíblico 100% nítido, luminoso e legível, sem manchas escuras!
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.getHighlighterRgba();
      ctx.lineWidth = this.highlighterSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else {
      // Caneta normal
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.penColor;

      // Espessura sensível à pressão do Apple Pencil
      let width = this.penSize;
      if (this.pressureEnabled && currentPoint.pointerType === 'pen') {
        const factor = 0.6 + (currentPoint.pressure * 0.8);
        width = this.penSize * factor;
      }
      ctx.lineWidth = Math.max(1, width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    // Traçado contínuo entre pontos médios
    ctx.beginPath();
    ctx.moveTo(this.lastMidPoint.x, this.lastMidPoint.y);
    ctx.quadraticCurveTo(this.lastPoint.x, this.lastPoint.y, currentMid.x, currentMid.y);
    ctx.stroke();

    ctx.restore();

    this.lastPoint = currentPoint;
    this.lastMidPoint = currentMid;
    this.strokePointsCount++;
  }

  drawSingleDot(pos) {
    const ctx = this.drawCtx;
    ctx.save();

    if (this.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.getHighlighterRgba();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, this.highlighterSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.penColor;
      const radius = Math.max(1.2, this.penSize / 2);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  eraseAt(x, y) {
    const ctx = this.drawCtx;
    ctx.save();
    // Apaga apenas os traços da caneta, mantendo o papel de fundo intacto
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, this.eraserSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // =========================================================================
  // PAPÉIS DE ESTUDO (LINHAS, QUADRICULADO, PONTILHADO, LISO)
  // =========================================================================
  renderPaper() {
    const sheet = document.getElementById('journalSheet');
    if (sheet) {
      sheet.classList.remove('paper-liso', 'paper-linhas', 'paper-pontilhado', 'paper-quadriculado');
      sheet.classList.add(`paper-${this.paperType}`);
    }
    // No ecrã, o canvas de papel fica transparente para o padrão CSS de journalSheet ficar visível atrás de ambas as colunas
    if (this.paperCtx) {
      this.paperCtx.clearRect(0, 0, this.width, this.height);
    }
  }

  renderPaperOnCtx(ctx, w, h) {
    this.renderPaperInRect(ctx, 0, 0, w, h, 0);
  }

  renderPaperInRect(ctx, x, y, w, h, radius = 0) {
    let bgColor = '#fdfbf7'; // Marfim natural
    let lineColor = 'rgba(15, 23, 42, 0.08)';
    let marginColor = 'rgba(239, 68, 68, 0.16)';

    if (this.paperTheme === 'branco') {
      bgColor = '#ffffff';
      lineColor = 'rgba(0, 0, 0, 0.07)';
      marginColor = 'rgba(220, 38, 38, 0.14)';
    } else if (this.paperTheme === 'sepia') {
      bgColor = '#f4ecd8';
      lineColor = 'rgba(92, 64, 40, 0.12)';
      marginColor = 'rgba(180, 83, 9, 0.18)';
    } else if (this.paperTheme === 'escuro') {
      bgColor = '#18181b';
      lineColor = 'rgba(255, 255, 255, 0.09)';
      marginColor = 'rgba(248, 113, 113, 0.2)';
    }

    ctx.save();
    if (radius > 0) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.clip();
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, w, h);

    if (this.paperType === 'linhas') {
      const lineSpacing = Math.max(28, Math.round(Math.min(w, h) / 28));
      const startY = y + Math.round(lineSpacing * 1.5);
      const marginX = x + Math.max(45, Math.round(w * 0.08));

      // Linha de margem vertical suave
      ctx.strokeStyle = marginColor;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(marginX, y);
      ctx.lineTo(marginX, y + h);
      ctx.stroke();

      // Pautas horizontais
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      for (let curY = startY; curY < y + h; curY += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, curY);
        ctx.lineTo(x + w, curY);
        ctx.stroke();
      }
    } else if (this.paperType === 'quadriculado') {
      const gridSize = Math.max(24, Math.round(Math.min(w, h) / 36));
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.95;

      for (let curX = x + gridSize; curX < x + w; curX += gridSize) {
        ctx.beginPath();
        ctx.moveTo(curX, y);
        ctx.lineTo(curX, y + h);
        ctx.stroke();
      }
      for (let curY = y + gridSize; curY < y + h; curY += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, curY);
        ctx.lineTo(x + w, curY);
        ctx.stroke();
      }
    } else if (this.paperType === 'pontilhado') {
      const dotSpacing = Math.max(24, Math.round(Math.min(w, h) / 36));
      const dotRadius = 1.2;
      ctx.fillStyle = lineColor.replace('0.07', '0.28').replace('0.08', '0.28').replace('0.09', '0.35');

      for (let curX = x + dotSpacing; curX < x + w; curX += dotSpacing) {
        for (let curY = y + dotSpacing; curY < y + h; curY += dotSpacing) {
          ctx.beginPath();
          ctx.arc(curX, curY, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // 'liso' mantém apenas o fundo bgColor preenchido

    ctx.restore();
  }

  prepareForA4Print(isPrinting) {
    if (isPrinting) {
      this.savedPaperWidth = this.paperCanvas.width;
      this.savedPaperHeight = this.paperCanvas.height;
      const a4Width = 1754;
      const a4Height = 2480;
      this.paperCanvas.width = a4Width;
      this.paperCanvas.height = a4Height;
      this.renderPaperOnCtx(this.paperCtx, a4Width, a4Height);
    } else {
      if (this.savedPaperWidth && this.savedPaperHeight) {
        this.paperCanvas.width = this.savedPaperWidth;
        this.paperCanvas.height = this.savedPaperHeight;
        this.paperCtx.scale(this.dpr, this.dpr);
        this.renderPaper();
      }
    }
  }

  setPaperType(type) {
    this.paperType = type;
    this.renderPaper();
  }

  setPaperTheme(theme) {
    this.paperTheme = theme;
    this.renderPaper();
  }

  // =========================================================================
  // GESTÃO DE ESTADOS (UNDO / REDO / CLEAR)
  // =========================================================================
  saveState() {
    if (!this.drawCanvas || this.drawCanvas.width <= 0 || this.drawCanvas.height <= 0) return;
    try {
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1);
      }

      const imgData = this.drawCtx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height);
      this.history.push(imgData);

      if (this.history.length > this.maxHistory) {
        this.history.shift();
      } else {
        this.historyIndex++;
      }
    } catch (e) {
      console.warn('saveState ignorado:', e);
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const snapshot = this.history[this.historyIndex];
      this.drawCtx.putImageData(snapshot, 0, 0);
      if (this.onChangeCallback) this.onChangeCallback();
      return true;
    }
    return false;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const snapshot = this.history[this.historyIndex];
      this.drawCtx.putImageData(snapshot, 0, 0);
      if (this.onChangeCallback) this.onChangeCallback();
      return true;
    }
    return false;
  }

  clear() {
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    this.clearElements();
    this.hasDrawn = false;
    this.saveState();
    if (this.onChangeCallback) this.onChangeCallback();
  }

  getDataUrl() {
    return this.drawCanvas.toDataURL('image/png');
  }

  getCombinedDataUrl(scale = 2) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.width * scale;
    exportCanvas.height = this.height * scale;
    const expCtx = exportCanvas.getContext('2d');
    
    expCtx.scale(scale, scale);
    expCtx.drawImage(this.paperCanvas, 0, 0, this.width, this.height);
    expCtx.drawImage(this.drawCanvas, 0, 0, this.width, this.height);

    // Renderizar caixas de texto e checklists com resolução retina
    const elements = this.getElementsData();
    for (const el of elements) {
      if (el.type === 'text') {
        expCtx.save();
        const fontSize = parseInt(el.fontSize, 10) || 18;
        const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        expCtx.font = `500 ${fontSize}px ${fontFamily}`;
        expCtx.fillStyle = el.color || (this.paperTheme === 'escuro' ? '#ffffff' : '#1a1a1a');
        expCtx.textBaseline = 'top';

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = el.html || '';
        const paragraphs = (tempDiv.innerText || '').split('\n');
        let curY = el.y + 4;
        const curX = el.x + 4;
        const lineH = fontSize * 1.5;
        const maxTextW = Math.max(260, Math.min(680, this.width - el.x - 20));

        for (const para of paragraphs) {
          const words = para.split(' ');
          let currentLine = '';
          for (let w = 0; w < words.length; w++) {
            const testLine = currentLine ? (currentLine + ' ' + words[w]) : words[w];
            const metrics = expCtx.measureText(testLine);
            if (metrics.width > maxTextW && currentLine) {
              expCtx.fillText(currentLine, curX, curY);
              curY += lineH;
              currentLine = words[w];
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            expCtx.fillText(currentLine, curX, curY);
            curY += lineH;
          }
        }
        expCtx.restore();
      } else if (el.type === 'checklist' && el.items) {
        expCtx.save();
        const baseFontSize = parseInt(el.fontSize, 10) || 15;
        const fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const fontWeight = el.fontWeight || 'normal';
        const fontStyle = el.fontStyle || 'normal';
        expCtx.font = `${fontStyle} ${fontWeight} ${baseFontSize}px ${fontFamily}`;
        expCtx.textBaseline = 'top';
        let curY = el.y + 10;
        const curX = el.x + 6;
        const lineH = Math.round(baseFontSize * 1.6);
        for (const it of el.items) {
          expCtx.fillStyle = it.checked ? '#10b981' : '#64748b';
          expCtx.fillText(it.checked ? '☑ ' : '☐ ', curX, curY);
          expCtx.fillStyle = it.checked ? '#94a3b8' : (el.color || (this.paperTheme === 'escuro' ? '#ffffff' : '#1a1a1a'));
          expCtx.fillText(it.text, curX + 24, curY);
          curY += lineH;
        }
        expCtx.restore();
      } else if (el.type === 'sticker' && el.symbol) {
        expCtx.save();
        expCtx.font = '36px -apple-system, sans-serif';
        expCtx.textBaseline = 'top';
        expCtx.fillText(el.symbol, el.x, el.y);
        expCtx.restore();
      } else if (el.type === 'image' && el.src) {
        try {
          const imgEl = new Image();
          imgEl.src = el.src;
          if (imgEl.complete && imgEl.naturalWidth > 0) {
            const w = el.width || 240;
            const h = (imgEl.naturalHeight / imgEl.naturalWidth) * w;
            expCtx.drawImage(imgEl, el.x, el.y, w, h);
          }
        } catch(e) {}
      }
    }

    return exportCanvas.toDataURL('image/png');
  }

  async loadFromDataUrl(dataUrl) {
    if (!dataUrl) {
      this.clear();
      return;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.drawCtx.drawImage(img, 0, 0, this.width, this.height);
        this.hasDrawn = true;
        this.history = [];
        this.historyIndex = -1;
        this.saveState();
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = dataUrl;
    });
  }

  // =========================================================================
  // FERRAMENTAS E CORES
  // =========================================================================
  selectTool(tool) {
    this.tool = tool;
    this.cursorRing.style.display = 'none';
    if (this.drawCanvas) {
      if (tool === 'select') {
        this.drawCanvas.style.pointerEvents = 'none';
        this.drawCanvas.style.cursor = 'default';
      } else {
        this.drawCanvas.style.pointerEvents = 'auto';
        this.drawCanvas.style.cursor = tool === 'eraser' ? 'none' : 'crosshair';
      }
    }
  }

  setTool(tool) {
    this.selectTool(tool);
  }

  setPenColor(colorKeyOrHex) {
    this.penColor = this.PEN_COLORS[colorKeyOrHex] || colorKeyOrHex;
    this.selectTool('pen');
  }

  setHighlighterColor(colorKeyOrHex) {
    this.highlighterColor = this.HIGHLIGHTER_COLORS[colorKeyOrHex] || colorKeyOrHex;
    this.selectTool('highlighter');
  }

  setPenSize(size) {
    this.penSize = parseFloat(size);
  }

  setHighlighterSize(size) {
    this.highlighterSize = parseFloat(size);
  }

  setEraserSize(size) {
    this.eraserSize = parseFloat(size);
  }

  togglePalmRejection(forceValue) {
    if (typeof forceValue === 'boolean') {
      this.onlyPenMode = forceValue;
    } else {
      this.onlyPenMode = !this.onlyPenMode;
    }
    return this.onlyPenMode;
  }

  // =========================================================================
  // CAIXAS DE TEXTO LIMPO & CHECKLISTS (SEM CAIXAS COLORIDAS, ARRASTÁVEIS)
  // =========================================================================
  stampText(text, options = {}) {
    return this.addTextBox({ text, ...options });
  }

  addTextBox(options = {}) {
    if (!this.elementsLayer) return null;
    const box = document.createElement('div');
    box.className = 'note-text-box';
    const count = this.elementsLayer.children.length;
    const initialX = options.x !== undefined ? options.x : (40 + ((count % 5) * 20));
    const initialY = options.y !== undefined ? options.y : (50 + ((count % 8) * 35));
    box.style.left = `${initialX}px`;
    box.style.top = `${initialY}px`;
    box.dataset.type = 'text';

    // Toolbar de formatação (visível ao focar / passar o cursor)
    const toolbar = document.createElement('div');
    toolbar.className = 'text-box-toolbar';
    toolbar.innerHTML = `
      <div class="tb-drag-handle" title="Arraste para mover para qualquer lugar da página">⠿</div>
      <select class="tb-font-family-select" title="Tipo de Letra">
        <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" selected>Sans</option>
        <option value="Georgia, 'Times New Roman', serif">Serifa</option>
        <option value="'Caveat', 'Comic Sans MS', 'Segoe Print', cursive">Manuscrita</option>
        <option value="'Courier New', Courier, monospace">Mono</option>
      </select>
      <select class="tb-font-size-select" title="Tamanho da letra">
        <option value="14px">14</option>
        <option value="16px">16</option>
        <option value="18px" selected>18</option>
        <option value="22px">22</option>
        <option value="28px">28</option>
        <option value="36px">36</option>
      </select>
      <button type="button" class="tb-btn tb-bold" title="Negrito"><b>B</b></button>
      <button type="button" class="tb-btn tb-italic" title="Itálico"><i>I</i></button>
      <button type="button" class="tb-btn tb-underline" title="Sublinhado"><u>U</u></button>
      <span class="tb-color-dot" data-color="#1a1a1a" style="background:#1a1a1a;" title="Preto"></span>
      <span class="tb-color-dot" data-color="#0c356a" style="background:#0c356a;" title="Azul"></span>
      <span class="tb-color-dot" data-color="#ba181b" style="background:#ba181b;" title="Vermelho"></span>
      <button type="button" class="tb-btn tb-btn-done" style="color: #16a34a; font-weight: 700; font-size: 13px; padding: 0 6px;" title="Concluir e Ocultar Menu">✓</button>
      <button type="button" class="tb-btn tb-btn-delete" title="Apagar este texto">🗑️</button>
    `;

    // Conteúdo da caixa de texto (100% transparente, sem fundo nem caixa colorida)
    const content = document.createElement('div');
    content.className = 'text-box-content';
    content.contentEditable = 'true';
    content.spellcheck = false;
    content.setAttribute('placeholder', 'Escreva aqui...');

    if (options.html) {
      content.innerHTML = options.html;
    } else if (options.text) {
      // Se for texto simples, preservar quebras de linha com <br>
      content.innerHTML = options.text.replace(/\n/g, '<br>');
    }

    if (options.fontFamily) {
      content.style.fontFamily = options.fontFamily;
      const famSelect = toolbar.querySelector('.tb-font-family-select');
      if (famSelect) famSelect.value = options.fontFamily;
    }
    if (options.fontSize) {
      content.style.fontSize = options.fontSize;
      const select = toolbar.querySelector('.tb-font-size-select');
      if (select) select.value = options.fontSize;
    }
    if (options.color) {
      content.style.color = options.color;
    }

    box.appendChild(toolbar);
    box.appendChild(content);

    this.setupTextBoxEvents(box, toolbar, content);
    this.elementsLayer.appendChild(box);

    if (options.initialSelect !== false) {
      document.querySelectorAll('.note-text-box.is-editing, .note-checklist-box.is-editing').forEach(el => {
        if (el !== box) el.classList.remove('is-editing');
      });
      box.classList.add('is-editing');
    }

    this.hasDrawn = true;
    if (this.onChangeCallback) this.onChangeCallback();

    // Se for caixa nova vazia, focar imediatamente
    if (!options.text && !options.html) {
      setTimeout(() => content.focus(), 60);
    }

    return box;
  }

  setupTextBoxEvents(box, toolbar, content) {
    const dragHandle = toolbar.querySelector('.tb-drag-handle');
    const famSelect = toolbar.querySelector('.tb-font-family-select');
    const sizeSelect = toolbar.querySelector('.tb-font-size-select');
    const boldBtn = toolbar.querySelector('.tb-bold');
    const italicBtn = toolbar.querySelector('.tb-italic');
    const underlineBtn = toolbar.querySelector('.tb-underline');
    const doneBtn = toolbar.querySelector('.tb-btn-done');
    const deleteBtn = toolbar.querySelector('.tb-btn-delete');
    const colorDots = toolbar.querySelectorAll('.tb-color-dot');

    // Movimentação / Arraste
    let isDragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    const onPointerDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(box.style.left, 10) || 0;
      origTop = parseInt(box.style.top, 10) || 0;
      box.classList.add('is-editing');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      box.style.left = `${Math.max(0, origLeft + dx)}px`;
      box.style.top = `${Math.max(0, origTop + dy)}px`;
    };

    const onPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (this.onChangeCallback) this.onChangeCallback();
      }
    };

    if (dragHandle) {
      dragHandle.addEventListener('pointerdown', onPointerDown);
    }

    // Comandos de Formatação
    if (famSelect) {
      famSelect.addEventListener('change', (e) => {
        content.style.fontFamily = e.target.value;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    if (sizeSelect) {
      sizeSelect.addEventListener('change', (e) => {
        content.style.fontSize = e.target.value;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    if (boldBtn) {
      boldBtn.addEventListener('click', (e) => {
        e.preventDefault();
        content.focus();
        document.execCommand('bold', false, null);
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    if (italicBtn) {
      italicBtn.addEventListener('click', (e) => {
        e.preventDefault();
        content.focus();
        document.execCommand('italic', false, null);
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    if (underlineBtn) {
      underlineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        content.focus();
        document.execCommand('underline', false, null);
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    colorDots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        content.style.color = dot.dataset.color;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    });

    if (doneBtn) {
      doneBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        box.classList.remove('is-editing');
        content.blur();
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        box.remove();
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    // Ao tocar na caixa de texto: ativa a edição e mostra a barra de ferramentas
    const activateEditing = (e) => {
      if (e && e.target && (e.target.closest('.tb-btn-done') || e.target.closest('.tb-btn-delete'))) return;
      document.querySelectorAll('.note-text-box.is-editing, .note-checklist-box.is-editing').forEach(el => {
        if (el !== box) el.classList.remove('is-editing');
      });
      box.classList.add('is-editing');
    };

    box.addEventListener('pointerdown', activateEditing);
    box.addEventListener('click', activateEditing);
    content.addEventListener('focus', activateEditing);

    content.addEventListener('input', () => {
      if (this.onChangeCallback) this.onChangeCallback();
    });
  }

  addChecklist(options = {}) {
    if (!this.elementsLayer) return null;
    const box = document.createElement('div');
    box.className = 'note-checklist-box';
    const count = this.elementsLayer.children.length;
    const initialX = options.x !== undefined ? options.x : (40 + ((count % 4) * 20));
    const initialY = options.y !== undefined ? options.y : (160 + ((count % 6) * 30));
    box.style.left = `${initialX}px`;
    box.style.top = `${initialY}px`;
    box.dataset.type = 'checklist';

    const toolbar = document.createElement('div');
    toolbar.className = 'checklist-toolbar';
    toolbar.innerHTML = `
      <div class="tb-drag-handle" title="Arraste para mover">⠿</div>
      <span style="font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">TAREFAS</span>
      <select class="tb-font-family-select" title="Tipo de Letra">
        <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" selected>Sans</option>
        <option value="Georgia, 'Times New Roman', serif">Serifa</option>
        <option value="'Caveat', 'Comic Sans MS', 'Segoe Print', cursive">Manuscrita</option>
        <option value="'Courier New', Courier, monospace">Mono</option>
      </select>
      <select class="tb-font-size-select" title="Tamanho da letra">
        <option value="13px">13</option>
        <option value="15px" selected>15</option>
        <option value="18px">18</option>
        <option value="22px">22</option>
      </select>
      <button type="button" class="tb-btn tb-bold" title="Negrito"><b>B</b></button>
      <button type="button" class="tb-btn tb-italic" title="Itálico"><i>I</i></button>
      <span class="tb-color-dot" data-color="#1a1a1a" style="background:#1a1a1a;" title="Preto"></span>
      <span class="tb-color-dot" data-color="#0c356a" style="background:#0c356a;" title="Azul"></span>
      <span class="tb-color-dot" data-color="#10b981" style="background:#10b981;" title="Verde"></span>
      <span class="tb-color-dot" data-color="#ba181b" style="background:#ba181b;" title="Vermelho"></span>
      <button type="button" class="tb-btn tb-add-item" style="width: auto; padding: 0 6px; font-size: 11px;" title="Adicionar Tarefa">+ Tarefa</button>
      <button type="button" class="tb-btn tb-btn-done" style="color: #16a34a; font-weight: 700; font-size: 13px; padding: 0 6px;" title="Concluir e Ocultar Menu">✓</button>
      <button type="button" class="tb-btn tb-btn-delete" title="Apagar tarefas">🗑️</button>
    `;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'checklist-items';

    // Aplicar estilos tipográficos se existirem nas opções
    if (options.fontFamily) {
      itemsContainer.style.fontFamily = options.fontFamily;
      const famSelect = toolbar.querySelector('.tb-font-family-select');
      if (famSelect) famSelect.value = options.fontFamily;
    }
    if (options.fontSize) {
      itemsContainer.style.fontSize = options.fontSize;
      const szSelect = toolbar.querySelector('.tb-font-size-select');
      if (szSelect) szSelect.value = options.fontSize;
    }
    if (options.fontWeight) {
      itemsContainer.style.fontWeight = options.fontWeight;
    }
    if (options.fontStyle) {
      itemsContainer.style.fontStyle = options.fontStyle;
    }
    if (options.color) {
      itemsContainer.style.color = options.color;
    }

    box.appendChild(toolbar);
    box.appendChild(itemsContainer);

    const addItem = (itemText = '', isDone = false) => {
      const item = document.createElement('div');
      item.className = 'checklist-item';
      if (isDone) item.classList.add('is-done');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isDone;

      const textSpan = document.createElement('span');
      textSpan.className = 'task-text';
      textSpan.contentEditable = 'true';
      textSpan.spellcheck = false;
      textSpan.textContent = itemText;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'task-remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remover item';

      checkbox.addEventListener('change', () => {
        item.classList.toggle('is-done', checkbox.checked);
        if (this.onChangeCallback) this.onChangeCallback();
      });

      removeBtn.addEventListener('click', () => {
        item.remove();
        if (this.onChangeCallback) this.onChangeCallback();
      });

      textSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addItem('', false);
        }
      });

      textSpan.addEventListener('input', () => {
        if (this.onChangeCallback) this.onChangeCallback();
      });

      item.appendChild(checkbox);
      item.appendChild(textSpan);
      item.appendChild(removeBtn);
      itemsContainer.appendChild(item);

      if (!itemText) {
        setTimeout(() => textSpan.focus(), 50);
      }
    };

    if (options.items && Array.isArray(options.items) && options.items.length > 0) {
      options.items.forEach(it => addItem(it.text, it.checked));
    } else {
      addItem('Leitura do capítulo', false);
      addItem('Anotar reflexão pessoal', false);
    }

    // Eventos de Formatação Tipográfica das Tarefas
    const famSelect = toolbar.querySelector('.tb-font-family-select');
    if (famSelect) {
      famSelect.addEventListener('change', (e) => {
        itemsContainer.style.fontFamily = e.target.value;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    const sizeSelect = toolbar.querySelector('.tb-font-size-select');
    if (sizeSelect) {
      sizeSelect.addEventListener('change', (e) => {
        itemsContainer.style.fontSize = e.target.value;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    const boldBtn = toolbar.querySelector('.tb-bold');
    if (boldBtn) {
      boldBtn.addEventListener('click', (e) => {
        e.preventDefault();
        itemsContainer.style.fontWeight = itemsContainer.style.fontWeight === 'bold' ? 'normal' : 'bold';
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    const italicBtn = toolbar.querySelector('.tb-italic');
    if (italicBtn) {
      italicBtn.addEventListener('click', (e) => {
        e.preventDefault();
        itemsContainer.style.fontStyle = itemsContainer.style.fontStyle === 'italic' ? 'normal' : 'italic';
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    const colorDots = toolbar.querySelectorAll('.tb-color-dot');
    colorDots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        itemsContainer.style.color = dot.dataset.color;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    });

    const dragHandle = toolbar.querySelector('.tb-drag-handle');
    let isDragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('select, button, .tb-color-dot, .tb-add-item, .tb-btn-done, .tb-btn-delete')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(box.style.left, 10) || 0;
      origTop = parseInt(box.style.top, 10) || 0;
      box.classList.add('is-editing');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const scale = this.getViewScale() || 1;
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      box.style.left = `${Math.max(0, origLeft + dx)}px`;
      box.style.top = `${Math.max(0, origTop + dy)}px`;
    };

    const onPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (this.onChangeCallback) this.onChangeCallback();
      }
    };

    if (dragHandle) dragHandle.addEventListener('pointerdown', onPointerDown);

    const addBtn = toolbar.querySelector('.tb-add-item');
    if (addBtn) addBtn.addEventListener('click', () => addItem('', false));

    const doneBtn = toolbar.querySelector('.tb-btn-done');
    if (doneBtn) {
      doneBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        box.classList.remove('is-editing');
      });
    }

    const delBtn = toolbar.querySelector('.tb-btn-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      box.remove();
      if (this.onChangeCallback) this.onChangeCallback();
    });

    // Ao tocar na lista de tarefas: ativa a edição e mostra a barra de ferramentas
    const activateChecklistEditing = (e) => {
      if (e && e.target && (e.target.closest('.tb-btn-done') || e.target.closest('.tb-btn-delete') || e.target.closest('.task-remove-btn'))) return;
      document.querySelectorAll('.note-text-box.is-editing, .note-checklist-box.is-editing').forEach(el => {
        if (el !== box) el.classList.remove('is-editing');
      });
      box.classList.add('is-editing');
    };

    box.addEventListener('pointerdown', activateChecklistEditing);
    box.addEventListener('click', activateChecklistEditing);

    if (options.initialSelect !== false) {
      document.querySelectorAll('.note-text-box.is-editing, .note-checklist-box.is-editing').forEach(el => {
        if (el !== box) el.classList.remove('is-editing');
      });
      box.classList.add('is-editing');
    }

    this.elementsLayer.appendChild(box);
    this.hasDrawn = true;
    if (this.onChangeCallback) this.onChangeCallback();

    return box;
  }

  getElementsData() {
    if (!this.elementsLayer) return [];
    const elements = [];
    const children = Array.from(this.elementsLayer.children);

    for (const child of children) {
      const type = child.dataset.type;
      const x = parseInt(child.style.left, 10) || 0;
      const y = parseInt(child.style.top, 10) || 0;

      if (type === 'text') {
        const content = child.querySelector('.text-box-content');
        if (content) {
          elements.push({
            type: 'text',
            x,
            y,
            html: content.innerHTML,
            fontFamily: content.style.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: content.style.fontSize || '18px',
            color: content.style.color || '#1a1a1a'
          });
        }
      } else if (type === 'checklist') {
        const items = [];
        const itemElems = child.querySelectorAll('.checklist-item');
        itemElems.forEach(it => {
          const cb = it.querySelector('input[type="checkbox"]');
          const txt = it.querySelector('.task-text');
          items.push({
            text: txt ? txt.textContent : '',
            checked: cb ? cb.checked : false
          });
        });
        const itemsContainer = child.querySelector('.checklist-items');
        elements.push({
          type: 'checklist',
          x,
          y,
          items,
          fontFamily: itemsContainer ? itemsContainer.style.fontFamily : '',
          fontSize: itemsContainer ? itemsContainer.style.fontSize : '',
          fontWeight: itemsContainer ? itemsContainer.style.fontWeight : '',
          fontStyle: itemsContainer ? itemsContainer.style.fontStyle : '',
          color: itemsContainer ? itemsContainer.style.color : ''
        });
      } else if (type === 'sticker') {
        elements.push({
          type: 'sticker',
          x,
          y,
          symbol: child.dataset.symbol || ''
        });
      } else if (type === 'image') {
        const img = child.querySelector('img');
        const imgW = img ? (parseInt(img.style.width, 10) || 240) : 240;
        elements.push({
          type: 'image',
          x,
          y,
          src: child.dataset.src || '',
          width: imgW
        });
      }
    }
    return elements;
  }

  loadElementsData(elements) {
    this.clearElements();
    if (!elements || !Array.isArray(elements)) return;
    elements.forEach(el => {
      if (el.type === 'text') {
        this.addTextBox({
          x: el.x,
          y: el.y,
          html: el.html,
          fontFamily: el.fontFamily,
          fontSize: el.fontSize,
          color: el.color,
          initialSelect: false
        });
      } else if (el.type === 'checklist') {
        this.addChecklist({
          x: el.x,
          y: el.y,
          items: el.items,
          fontFamily: el.fontFamily,
          fontSize: el.fontSize,
          fontWeight: el.fontWeight,
          fontStyle: el.fontStyle,
          color: el.color,
          initialSelect: false
        });
      } else if (el.type === 'sticker') {
        this.addSticker(el.symbol, {
          x: el.x,
          y: el.y
        });
      } else if (el.type === 'image') {
        this.addImage(el.src, {
          x: el.x,
          y: el.y,
          width: el.width
        });
      }
    });
  }

  addSticker(symbol, options = {}) {
    if (!this.elementsLayer) return null;
    const box = document.createElement('div');
    box.className = 'note-sticker-box';
    const count = this.elementsLayer.children.length;
    const initialX = options.x !== undefined ? options.x : (100 + ((count % 4) * 35));
    const initialY = options.y !== undefined ? options.y : (120 + ((count % 6) * 35));
    box.style.left = `${initialX}px`;
    box.style.top = `${initialY}px`;
    box.dataset.type = 'sticker';
    box.dataset.symbol = symbol;

    box.innerHTML = `
      <div class="sticker-toolbar">
        <span class="tb-drag-handle" style="font-size: 11px; cursor: grab; padding: 2px 4px;" title="Arraste">⠿</span>
        <button type="button" class="sticker-del" title="Apagar">✕</button>
      </div>
      <div class="sticker-content">${symbol}</div>
    `;

    this.setupDraggableElement(box);
    this.elementsLayer.appendChild(box);
    this.hasDrawn = true;
    if (this.onChangeCallback) this.onChangeCallback();
    return box;
  }

  addImage(dataUrl, options = {}) {
    if (!this.elementsLayer) return null;
    const box = document.createElement('div');
    box.className = 'note-image-box';
    box.style.position = 'absolute';
    box.style.pointerEvents = 'auto';
    box.style.zIndex = '10';
    const count = this.elementsLayer.children.length;
    const initialX = options.x !== undefined ? options.x : (80 + ((count % 4) * 30));
    const initialY = options.y !== undefined ? options.y : (100 + ((count % 6) * 30));
    const imgWidth = options.width || 240;
    box.style.left = `${initialX}px`;
    box.style.top = `${initialY}px`;
    box.dataset.type = 'image';
    box.dataset.src = dataUrl;
    box.dataset.width = imgWidth;

    box.innerHTML = `
      <button type="button" class="img-corner-del-btn" title="Apagar Imagem">✕</button>
      <div class="image-toolbar">
        <span class="tb-drag-handle" style="font-size: 12px; cursor: grab; padding: 2px 4px;" title="Arraste para mover">⠿</span>
        <button type="button" class="img-tb-btn btn-shrink" title="Reduzir Imagem">➖</button>
        <button type="button" class="img-tb-btn btn-grow" title="Aumentar Imagem">➕</button>
        <button type="button" class="img-tb-btn btn-del" title="Apagar Imagem">🗑️ Apagar</button>
      </div>
      <img src="${dataUrl}" style="width: ${imgWidth}px; max-width: 600px; display: block;" />
    `;

    this.setupImageBoxEvents(box);
    this.elementsLayer.appendChild(box);
    this.hasDrawn = true;
    if (this.onChangeCallback) this.onChangeCallback();
    return box;
  }

  setupImageBoxEvents(box) {
    const dragHandle = box.querySelector('.tb-drag-handle');
    const delBtn = box.querySelector('.btn-del');
    const cornerDelBtn = box.querySelector('.img-corner-del-btn');
    const shrinkBtn = box.querySelector('.btn-shrink');
    const growBtn = box.querySelector('.btn-grow');
    const img = box.querySelector('img');

    // Seleção ao clicar ou tocar na imagem
    const selectThisBox = (e) => {
      if (!e.target.closest('.image-toolbar') && !e.target.closest('.img-corner-del-btn')) {
        document.querySelectorAll('.note-image-box.is-selected').forEach(b => {
          if (b !== box) b.classList.remove('is-selected');
        });
        box.classList.add('is-selected');
      }
    };
    box.addEventListener('pointerdown', selectThisBox);
    box.addEventListener('click', selectThisBox);

    // Deselecionar ao clicar fora
    const onDocClick = (e) => {
      if (!box.contains(e.target)) {
        box.classList.remove('is-selected');
      }
    };
    document.addEventListener('pointerdown', onDocClick);

    // Apagar imagem com prioridade imediata (responde a click, pointerdown e touchend)
    const doDelete = (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      document.removeEventListener('pointerdown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      if (box.parentElement) {
        box.parentElement.removeChild(box);
      } else {
        box.remove();
      }
      if (this.onChangeCallback) this.onChangeCallback();
    };

    if (cornerDelBtn) {
      cornerDelBtn.addEventListener('pointerdown', doDelete);
      cornerDelBtn.addEventListener('click', doDelete);
      cornerDelBtn.addEventListener('touchend', doDelete);
    }

    if (delBtn) {
      delBtn.addEventListener('pointerdown', doDelete);
      delBtn.addEventListener('click', doDelete);
      delBtn.addEventListener('touchend', doDelete);
    }

    // Tecla Delete / Backspace quando a imagem está selecionada
    const onKeyDown = (e) => {
      if (box.classList.contains('is-selected')) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (!e.target.closest('input, textarea, [contenteditable="true"]')) {
            e.preventDefault();
            doDelete(e);
          }
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Redimensionar imagem
    if (shrinkBtn && img) {
      shrinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let curW = parseInt(img.style.width, 10) || 240;
        curW = Math.max(90, curW - 30);
        img.style.width = `${curW}px`;
        box.dataset.width = curW;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    if (growBtn && img) {
      growBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let curW = parseInt(img.style.width, 10) || 240;
        curW = Math.min(650, curW + 30);
        img.style.width = `${curW}px`;
        box.dataset.width = curW;
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    // Arrasto suave proporcional à escala da visualização
    let isDragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('.img-tb-btn')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(box.style.left, 10) || 0;
      origTop = parseInt(box.style.top, 10) || 0;
      box.classList.add('is-selected');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const scale = this.getViewScale() || 1;
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      box.style.left = `${Math.max(0, origLeft + dx)}px`;
      box.style.top = `${Math.max(0, origTop + dy)}px`;
    };

    const onPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (this.onChangeCallback) this.onChangeCallback();
      }
    };

    const targetHandle = dragHandle || box;
    targetHandle.addEventListener('pointerdown', onPointerDown);
  }

  setupDraggableElement(box) {
    const dragHandle = box.querySelector('.tb-drag-handle') || box;
    const delBtn = box.querySelector('.sticker-del');

    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        box.remove();
        if (this.onChangeCallback) this.onChangeCallback();
      });
    }

    let isDragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('.sticker-del')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseInt(box.style.left, 10) || 0;
      origTop = parseInt(box.style.top, 10) || 0;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const scale = this.getViewScale() || 1;
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      box.style.left = `${Math.max(0, origLeft + dx)}px`;
      box.style.top = `${Math.max(0, origTop + dy)}px`;
    };

    const onPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (this.onChangeCallback) this.onChangeCallback();
      }
    };

    dragHandle.addEventListener('pointerdown', onPointerDown);
  }

  clearElements() {
    if (this.elementsLayer) {
      this.elementsLayer.innerHTML = '';
    }
  }

  deleteSelectedElement() {
    if (!this.elementsLayer) return false;
    const selected = this.elementsLayer.querySelector('.note-image-box.is-selected, .note-text-box.is-editing, .note-checklist-box.is-editing');
    if (selected) {
      if (selected.parentElement) {
        selected.parentElement.removeChild(selected);
      } else {
        selected.remove();
      }
      if (this.onChangeCallback) this.onChangeCallback();
      return true;
    }
    return false;
  }

  swapSides(fromSide, toSide) {
    if (fromSide === toSide) return;
    const sheet = document.getElementById('journalSheet');
    const W = this.width || (sheet ? sheet.offsetWidth : 1000);
    const H = this.height || (sheet ? sheet.offsetHeight : 1200);
    const halfW = W / 2;

    // 1. Transpor traços do canvas de desenho (Apple Pencil & highlights)
    if (this.drawCanvas && this.drawCanvas.width > 0) {
      const dpr = this.dpr || 1;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.drawCanvas.width;
      tempCanvas.height = this.drawCanvas.height;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(this.drawCanvas, 0, 0);

      const dprHalfW = Math.round(halfW * dpr);
      const dprFullW = this.drawCanvas.width;
      const dprH = this.drawCanvas.height;

      this.drawCtx.save();
      this.drawCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawCtx.clearRect(0, 0, dprFullW, dprH);

      // Metade esquerda vai para a direita
      this.drawCtx.drawImage(tempCanvas, 0, 0, dprHalfW, dprH, dprHalfW, 0, dprHalfW, dprH);
      // Metade direita vai para a esquerda
      this.drawCtx.drawImage(tempCanvas, dprHalfW, 0, dprFullW - dprHalfW, dprH, 0, 0, dprFullW - dprHalfW, dprH);
      this.drawCtx.restore();

      this.saveState();
    }

    // 2. Mover elementos interativos (caixas de texto, checklists, stickers, imagens)
    if (this.elementsLayer) {
      const children = Array.from(this.elementsLayer.children);
      for (const child of children) {
        const curX = parseInt(child.style.left, 10) || 0;
        let newX;
        if (curX < halfW) {
          newX = curX + halfW;
        } else {
          newX = curX - halfW;
        }
        child.style.left = `${Math.max(10, Math.min(W - 140, newX))}px`;
      }
    }

    if (this.onChangeCallback) this.onChangeCallback();
  }

  hexToRgba(hex, alpha = 1) {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    const num = parseInt(cleanHex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

window.ApplePencilEngine = ApplePencilEngine;
