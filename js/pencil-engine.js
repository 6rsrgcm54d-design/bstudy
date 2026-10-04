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
    
    this.highlighterColor = '#facc15'; // Amarelo padrão
    this.highlighterSize = 24.0; // Espessura de marca-texto
    this.eraserSize = 26.0;
    
    // Cores oficiais especificadas pelo utilizador:
    this.PEN_COLORS = {
      black: '#1a1a1a',    // Preto tinta profunda
      blue: '#0c356a',     // Azul escuro clássico
      red: '#ba181b'       // Vermelho vivo editorial
    };

    this.HIGHLIGHTER_COLORS = {
      yellow: '#facc15',   // Amarelo
      green: '#4ade80',    // Verde
      lightRed: '#fb7185'  // Vermelho claro / Rosa coral
    };

    // Rejeição da Palma da Mão (Predefinida como ATIVA)
    // Apenas 'pen' desenha; toques com a mão/dedo são ignorados sem riscar a tela!
    this.onlyPenMode = true; 
    this.pressureEnabled = true;

    // Tipo de Papel: 'linhas', 'quadriculado', 'pontilhado', 'liso'
    this.paperType = options.paperType || 'linhas';
    this.paperTheme = options.paperTheme || 'marfim';

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
    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.userSelect = 'none';
    this.container.style.webkitUserSelect = 'none';
    this.container.style.touchAction = 'none';
    this.container.style.webkitTouchCallout = 'none';

    // 1. Canvas de Fundo (Papel com Pautas/Grade)
    this.paperCanvas = document.createElement('canvas');
    this.paperCanvas.className = 'notes-paper-canvas';
    this.paperCanvas.style.position = 'absolute';
    this.paperCanvas.style.top = '0';
    this.paperCanvas.style.left = '0';
    this.paperCanvas.style.width = '100%';
    this.paperCanvas.style.height = '100%';
    this.paperCanvas.style.zIndex = '1';
    this.paperCanvas.style.pointerEvents = 'none';
    this.paperCtx = this.paperCanvas.getContext('2d');

    // 2. Canvas de Desenho (Apple Pencil)
    this.drawCanvas = document.createElement('canvas');
    this.drawCanvas.className = 'notes-drawing-canvas';
    this.drawCanvas.style.position = 'absolute';
    this.drawCanvas.style.top = '0';
    this.drawCanvas.style.left = '0';
    this.drawCanvas.style.width = '100%';
    this.drawCanvas.style.height = '100%';
    this.drawCanvas.style.zIndex = '2';
    this.drawCanvas.style.cursor = 'crosshair';
    this.drawCanvas.style.touchAction = 'none';
    this.drawCanvas.style.webkitTouchCallout = 'none';
    this.drawCanvas.style.webkitUserSelect = 'none';
    this.drawCtx = this.drawCanvas.getContext('2d', { willReadFrequently: true });

    // 3. Cursor indicador de Borracha
    this.cursorRing = document.createElement('div');
    this.cursorRing.className = 'pencil-cursor-ring';
    this.cursorRing.style.position = 'absolute';
    this.cursorRing.style.borderRadius = '50%';
    this.cursorRing.style.border = '1.5px solid rgba(239, 68, 68, 0.7)';
    this.cursorRing.style.pointerEvents = 'none';
    this.cursorRing.style.display = 'none';
    this.cursorRing.style.zIndex = '10';
    this.cursorRing.style.transform = 'translate(-50%, -50%)';

    this.container.appendChild(this.paperCanvas);
    this.container.appendChild(this.drawCanvas);
    this.container.appendChild(this.cursorRing);
  }

  initSize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 2);

    const width = Math.max(rect.width || 0, window.innerWidth > 600 ? window.innerWidth / 2 : 400);
    const height = Math.max(rect.height || 0, window.innerHeight - 120, 500);

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
    this.paperCtx.scale(dpr, dpr);

    this.drawCanvas.width = width * dpr;
    this.drawCanvas.height = height * dpr;
    this.drawCtx.scale(dpr, dpr);
    this.drawCtx.lineCap = 'round';
    this.drawCtx.lineJoin = 'round';

    if (tempCanvas) {
      try {
        this.drawCtx.drawImage(tempCanvas, 0, 0, width, height);
      } catch (e) {}
    }

    this.renderPaper();
  }

  // =========================================================================
  // GESTÃO DE EVENTOS E PREVENÇÃO DE MENUS NATIVOS DO SAFARI
  // =========================================================================
  attachEvents() {
    // 1. Bloquear menu nativo de seleção do iOS ("Copiar / Procurar / Traduzir")
    this.drawCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, { passive: false });

    this.drawCanvas.addEventListener('selectstart', (e) => {
      e.preventDefault();
      return false;
    }, { passive: false });

    // 2. Prevenir gestos nativos de scroll ou pinça com touch no canvas de escrita
    this.drawCanvas.addEventListener('touchstart', (e) => {
      if (this.onlyPenMode) return; // Se a palma estiver sendo rejeitada, ignora
      e.preventDefault();
    }, { passive: false });

    this.drawCanvas.addEventListener('touchmove', (e) => {
      if (this.onlyPenMode) return;
      e.preventDefault();
    }, { passive: false });

    // 3. Pointer Events do Apple Pencil
    this.drawCanvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    this.drawCanvas.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    this.drawCanvas.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    this.drawCanvas.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
    this.drawCanvas.addEventListener('pointerleave', (e) => this.onPointerLeave(e), { passive: false });

    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.initSize(), 200);
    });
  }

  getPointerPos(e) {
    const rect = this.drawCanvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    
    // Normalizar pressão (se o navegador/caneta suportar)
    let pressure = 0.5;
    if (e.pressure !== undefined && e.pressure > 0) {
      pressure = e.pressure;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      pressure: pressure,
      pointerType: e.pointerType || 'touch'
    };
  }

  onPointerDown(e) {
    const pos = this.getPointerPos(e);

    // =======================================================================
    // REJEIÇÃO DA PALMA DA MÃO PREDEFINIDA:
    // Se onlyPenMode estiver ativo, aceita EXCLUSIVAMENTE o Apple Pencil (pen)
    // A palma da mão pousada na tela não interfere nem cria riscos!
    // =======================================================================
    if (this.onlyPenMode && pos.pointerType !== 'pen') {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Capturar o ponteiro para que movimentos rápidos nunca percam eventos
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

    // Se estiver no modo apenas caneta, ignorar toques da palma
    if (this.onlyPenMode && e.pointerType !== 'pen') {
      return;
    }

    // Se houver um ponteiro ativo específico, ignorar outros
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
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

    // Processar eventos coalescidos do Apple Pencil (suporte a 120Hz/240Hz ProMotion)
    const coalescedEvents = (e.getCoalescedEvents && e.getCoalescedEvents().length > 0)
      ? e.getCoalescedEvents()
      : [e];

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

    this.isDrawing = false;
    this.cursorRing.style.display = 'none';

    // Se foi apenas um toque rápido (ponto ou acento)
    if (this.strokePointsCount === 1 && this.lastPoint && this.tool !== 'eraser') {
      this.drawSingleDot(this.lastPoint);
    }

    this.lastPoint = null;
    this.lastMidPoint = null;
    this.strokePointsCount = 0;
    this.hasDrawn = true;
    this.saveState();

    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }

  onPointerLeave(e) {
    this.cursorRing.style.display = 'none';
    if (this.isDrawing) {
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

  // =========================================================================
  // MOTOR DE CURVAS BÉZIER CONTÍNUAS (SEM FALHAS NEM PONTILHADO)
  // =========================================================================
  renderContinuousStroke(currentPoint) {
    if (!this.lastPoint || !this.lastMidPoint) {
      this.lastPoint = currentPoint;
      this.lastMidPoint = { x: currentPoint.x, y: currentPoint.y };
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
      // Marcador de texto translúcido com multiplicação óptica
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = this.hexToRgba(this.highlighterColor, 0.40);
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
        const factor = 0.5 + (currentPoint.pressure * 0.9);
        width = this.penSize * factor;
      }
      ctx.lineWidth = Math.max(1, width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    // =======================================================================
    // TRAÇADO PERFEITO: Começa em lastMidPoint e termina em currentMid
    // Isto garante que NUNCA existe espaço vazio entre dois movimentos!
    // =======================================================================
    ctx.beginPath();
    ctx.moveTo(this.lastMidPoint.x, this.lastMidPoint.y);
    ctx.quadraticCurveTo(this.lastPoint.x, this.lastPoint.y, currentMid.x, currentMid.y);
    ctx.stroke();

    ctx.restore();

    // Avançar para o próximo segmento
    this.lastPoint = currentPoint;
    this.lastMidPoint = currentMid;
    this.strokePointsCount++;
  }

  drawSingleDot(pos) {
    const ctx = this.drawCtx;
    ctx.save();

    if (this.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = this.hexToRgba(this.highlighterColor, 0.40);
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
    const ctx = this.paperCtx;
    const w = this.width;
    const h = this.height;

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

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (this.paperType === 'linhas') {
      const lineSpacing = 32;
      const startY = 48;
      const marginX = 54;

      // Linha de margem vertical suave
      ctx.strokeStyle = marginColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(marginX, 0);
      ctx.lineTo(marginX, h);
      ctx.stroke();

      // Pautas horizontais
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      for (let y = startY; y < h; y += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else if (this.paperType === 'quadriculado') {
      const gridSize = 26;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.9;

      for (let x = gridSize; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = gridSize; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else if (this.paperType === 'pontilhado') {
      const dotSpacing = 26;
      const dotRadius = 1.1;
      ctx.fillStyle = lineColor.replace('0.07', '0.28').replace('0.08', '0.28').replace('0.09', '0.35');

      for (let x = dotSpacing; x < w; x += dotSpacing) {
        for (let y = dotSpacing; y < h; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
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
  }

  setPenColor(colorKeyOrHex) {
    this.penColor = this.PEN_COLORS[colorKeyOrHex] || colorKeyOrHex;
    this.tool = 'pen';
  }

  setHighlighterColor(colorKeyOrHex) {
    this.highlighterColor = this.HIGHLIGHTER_COLORS[colorKeyOrHex] || colorKeyOrHex;
    this.tool = 'highlighter';
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
