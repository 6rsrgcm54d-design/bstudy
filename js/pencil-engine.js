/**
 * BStudy - Motor de Caligrafia Digital com Suporte Especializado a Apple Pencil
 * - Rejeição Nativa de Palma da Mão (Palm Rejection Predefinida)
 * - Sensibilidade à Pressão e Curvas Suaves Bézier
 * - 3 Cores de Caneta: Preto, Azul Escuro e Vermelho
 * - Seleção de Espessura com Slider e Presets
 * - 3 Highlighters: Amarelo, Verde e Vermelho Claro (Multiplicação translúcida)
 * - Papéis: Linhas, Quadriculado, Pontilhado e Liso
 * - Camadas Separadas: Papel sob os traços (Borracha apaga apenas a tinta, nunca o papel!)
 * - Desfazer / Refazer / Limpar
 */

class ApplePencilEngine {
  constructor(canvasContainer, options = {}) {
    this.container = canvasContainer;
    
    // Configurações de ferramentas
    this.tool = 'pen'; // 'pen', 'highlighter', 'eraser'
    this.penColor = '#1a1a1a'; // Preto padrão
    this.penSize = 3.0; // Espessura normal
    
    this.highlighterColor = '#facc15'; // Amarelo padrão
    this.highlighterSize = 22.0; // Espessura de marca-texto

    this.eraserSize = 24.0;
    
    // Cores oficiais especificadas pelo utilizador:
    this.PEN_COLORS = {
      black: '#1a1a1a',    // Preto grafite profundo
      blue: '#0c356a',     // Azul escuro nobre
      red: '#ba181b'       // Vermelho clássico
    };

    this.HIGHLIGHTER_COLORS = {
      yellow: '#facc15',   // Amarelo
      green: '#4ade80',    // Verde
      lightRed: '#fb7185'  // Vermelho claro / Rosa coral
    };

    // Rejeição da Palma da Mão (Predefinida como ATIVA)
    // Apenas eventos de 'pen' (Apple Pencil) geram traço. Toques acidentais da mão são rejeitados.
    this.onlyPenMode = true; 
    this.pressureEnabled = true;

    // Tipo de Papel: 'linhas', 'quadriculado', 'pontilhado', 'liso'
    this.paperType = options.paperType || 'linhas';
    this.paperTheme = options.paperTheme || 'marfim'; // 'branco', 'marfim', 'sepia', 'escuro'

    // Histórico de ações (Undo / Redo)
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 30;

    // Estado do traço atual
    this.isDrawing = false;
    this.points = [];
    this.hasDrawn = false;
    this.onChangeCallback = null;

    // Inicialização do DOM e Canvas
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
    this.container.style.touchAction = 'none'; // Prevenir gestos do navegador na área de escrita

    // 1. Canvas do Papel (Fundo)
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

    // 2. Canvas de Tinta (Desenho Apple Pencil)
    this.drawCanvas = document.createElement('canvas');
    this.drawCanvas.className = 'notes-drawing-canvas';
    this.drawCanvas.style.position = 'absolute';
    this.drawCanvas.style.top = '0';
    this.drawCanvas.style.left = '0';
    this.drawCanvas.style.width = '100%';
    this.drawCanvas.style.height = '100%';
    this.drawCanvas.style.zIndex = '2';
    this.drawCanvas.style.cursor = 'crosshair';
    this.drawCtx = this.drawCanvas.getContext('2d', { willReadFrequently: true });

    // 3. Cursor indicador de borracha / ponta
    this.cursorRing = document.createElement('div');
    this.cursorRing.className = 'pencil-cursor-ring';
    this.cursorRing.style.position = 'absolute';
    this.cursorRing.style.borderRadius = '50%';
    this.cursorRing.style.border = '1.5px solid rgba(0,0,0,0.4)';
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
    const dpr = Math.max(window.devicePixelRatio || 1, 2); // 2x ou mais no iPad Retina

    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 400);

    // Salvar estado atual do desenho antes de redimensionar
    let tempCanvas = null;
    if (this.hasDrawn && this.drawCanvas.width > 0) {
      tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.drawCanvas.width;
      tempCanvas.height = this.drawCanvas.height;
      tempCanvas.getContext('2d').drawImage(this.drawCanvas, 0, 0);
    }

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    // Configurar canvas do papel
    this.paperCanvas.width = width * dpr;
    this.paperCanvas.height = height * dpr;
    this.paperCtx.scale(dpr, dpr);

    // Configurar canvas de desenho
    this.drawCanvas.width = width * dpr;
    this.drawCanvas.height = height * dpr;
    this.drawCtx.scale(dpr, dpr);
    this.drawCtx.lineCap = 'round';
    this.drawCtx.lineJoin = 'round';

    if (tempCanvas) {
      this.drawCtx.drawImage(tempCanvas, 0, 0, width, height);
    }

    this.renderPaper();
  }

  // =========================================================================
  // GESTÃO DE EVENTOS DE PONTEIRO & REJEIÇÃO DA PALMA DA MÃO
  // =========================================================================
  attachEvents() {
    // Usar Pointer Events nativos do Safari / iPadOS
    this.drawCanvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    this.drawCanvas.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    this.drawCanvas.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    this.drawCanvas.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
    this.drawCanvas.addEventListener('pointerleave', (e) => this.onPointerLeave(e), { passive: false });

    // Prevenir comportamentos indesejados de toque e zoom acidental nativo na área de escrita
    this.container.addEventListener('touchstart', (e) => {
      if (this.onlyPenMode) {
        // Se a rejeição de palma estiver ativa e for toque com dedos, não interfere com o scroll se houver
        return;
      }
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.initSize(), 200);
    });
  }

  getPointerPos(e) {
    const rect = this.drawCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: (e.pressure !== undefined && e.pressure > 0) ? e.pressure : 0.5,
      pointerType: e.pointerType || 'touch'
    };
  }

  onPointerDown(e) {
    const pos = this.getPointerPos(e);

    // =======================================================================
    // REJEIÇÃO DA PALMA DA MÃO PREDEFINIDA:
    // Se onlyPenMode estiver ativo, aceita SOMENTE e.pointerType === 'pen'
    // Toques de dedos (touch) e palma da mão são ignorados sem riscar a tela!
    // =======================================================================
    if (this.onlyPenMode && pos.pointerType !== 'pen') {
      // Ignora completamente o toque da palma/dedos para desenho
      return;
    }

    e.preventDefault();
    this.isDrawing = true;
    this.points = [pos];

    if (this.tool === 'eraser') {
      this.updateCursorRing(pos);
      this.eraseAt(pos.x, pos.y);
    }
  }

  onPointerMove(e) {
    const pos = this.getPointerPos(e);

    // Rejeição da Palma
    if (this.onlyPenMode && pos.pointerType !== 'pen') {
      return;
    }

    if (this.tool === 'eraser') {
      this.updateCursorRing(pos);
    }

    if (!this.isDrawing) return;
    e.preventDefault();

    this.points.push(pos);

    if (this.tool === 'eraser') {
      this.eraseAt(pos.x, pos.y);
    } else {
      this.renderStrokeSegment();
    }
  }

  onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.cursorRing.style.display = 'none';

    if (this.points.length === 1 && this.tool !== 'eraser') {
      // Desenha ponto único se foi apenas um toque com a caneta
      this.drawSingleDot(this.points[0]);
    }

    this.points = [];
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
      this.cursorRing.style.borderColor = 'rgba(239, 68, 68, 0.7)';
    } else {
      this.cursorRing.style.display = 'none';
    }
  }

  // =========================================================================
  // MOTOR DE DESENHO DE TRAÇOS & SUAVIZAÇÃO BÉZIER
  // =========================================================================
  renderStrokeSegment() {
    const pts = this.points;
    if (pts.length < 2) return;

    const ctx = this.drawCtx;
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    ctx.save();

    if (this.tool === 'highlighter') {
      // Highlighters usam modo de multiplicação e transparência calibrada
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = this.hexToRgba(this.highlighterColor, 0.45);
      ctx.lineWidth = this.highlighterSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else {
      // Caneta normal
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.penColor;
      
      // Espessura dinâmica com sensibilidade à pressão do Apple Pencil
      let width = this.penSize;
      if (this.pressureEnabled && p2.pointerType === 'pen') {
        const pressureFactor = 0.45 + (p2.pressure * 0.95);
        width = this.penSize * pressureFactor;
      }
      ctx.lineWidth = Math.max(1, width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    // Suavização por ponto médio (Curva Quadrática Bézier)
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    ctx.stroke();

    ctx.restore();
  }

  drawSingleDot(pos) {
    const ctx = this.drawCtx;
    ctx.save();

    if (this.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = this.hexToRgba(this.highlighterColor, 0.45);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, this.highlighterSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.penColor;
      const radius = Math.max(1, this.penSize / 2);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  eraseAt(x, y) {
    const ctx = this.drawCtx;
    ctx.save();
    // Apaga apenas os traços desenhados, mantendo as linhas do papel 100% intactas!
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, this.eraserSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // =========================================================================
  // PAPÉIS: LINHAS, QUADRICULADO, PONTILHADO, LISO
  // =========================================================================
  renderPaper() {
    const ctx = this.paperCtx;
    const w = this.width;
    const h = this.height;

    // Cores de fundo e linhas segundo o tema
    let bgColor = '#fdfbf7'; // Marfim suave
    let lineColor = 'rgba(15, 23, 42, 0.08)';
    let marginColor = 'rgba(239, 68, 68, 0.15)'; // Linha vertical vermelha suave de margem

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
      // Papel com Linhas (Pautado)
      const lineSpacing = 32;
      const startY = 48;
      const marginX = 54;

      // Linha vertical de margem à esquerda (estilo caderno de estudo)
      ctx.strokeStyle = marginColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(marginX, 0);
      ctx.lineTo(marginX, h);
      ctx.stroke();

      // Linhas horizontais
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      for (let y = startY; y < h; y += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else if (this.paperType === 'quadriculado') {
      // Papel Quadriculado (Grid)
      const gridSize = 26;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.9;

      // Linhas verticais
      for (let x = gridSize; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // Linhas horizontais
      for (let y = gridSize; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else if (this.paperType === 'pontilhado') {
      // Papel Pontilhado (Dot Grid)
      const dotSpacing = 26;
      const dotRadius = 1.1;
      ctx.fillStyle = lineColor.replace('0.07', '0.25').replace('0.08', '0.25').replace('0.09', '0.35');

      for (let x = dotSpacing; x < w; x += dotSpacing) {
        for (let y = dotSpacing; y < h; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // 'liso' permanece liso com a cor de fundo
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
    // Truncar histórico posterior ao índice atual se tiver havido undo
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Salvar snapshot como ImageData
    const imgData = this.drawCtx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    this.history.push(imgData);

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
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

  // =========================================================================
  // CARREGAR E EXPORTAR CONTEÚDO
  // =========================================================================
  getDataUrl() {
    return this.drawCanvas.toDataURL('image/png');
  }

  // Exportar imagem composta: Papel + Notas juntas em alta resolução
  getCombinedDataUrl(scale = 2) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.width * scale;
    exportCanvas.height = this.height * scale;
    const expCtx = exportCanvas.getContext('2d');
    
    expCtx.scale(scale, scale);
    // Desenhar fundo de papel
    expCtx.drawImage(this.paperCanvas, 0, 0, this.width, this.height);
    // Desenhar traços da caneta
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
  // SELEÇÃO DE FERRAMENTAS E CORES
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
