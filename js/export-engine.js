/**
 * BStudy - Motor de Exportação em Alta Resolução (Imagem PNG & Documento PDF)
 * Gera a composição perfeita da Página da Bíblia Lado a Lado com as Notas do Apple Pencil
 */

class ExportEngine {
  constructor(bibleEngine, pencilEngine) {
    this.bible = bibleEngine;
    this.pencil = pencilEngine;
  }

  /**
   * Renderiza a composição lado a lado em um Canvas de Alta Resolução (2x Retina)
   */
  async generateCombinedCanvas(options = {}) {
    const book = this.bible.getCurrentBook();
    const chapterNum = this.bible.currentChapter;
    const verses = this.bible.getCurrentChapterVerses();
    const notesDataUrl = this.pencil.getCombinedDataUrl(2);

    // Dimensões do documento de exportação (Formato A4 Paisagem / Proporção iPad 4:3 em alta resolução: 2400 x 1700)
    const width = 2400;
    const height = 1700;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Fundo Geral do Documento
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // 2. Cabeçalho Geral
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, 140);

    // Título no cabeçalho
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Estudo Bíblico • ${book.name} ${chapterNum}`, 70, 75);

    // Subtítulo e data
    const dateStr = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
    ctx.font = '24px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Bíblia Sagrada (Almeida Atualizada • Domínio Público)   |   ${dateStr}`, 70, 112);

    // Tag do App no canto direito
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('BStudy iPad', width - 70, 85);
    ctx.textAlign = 'left';

    // 3. Coluna da Esquerda: Texto da Bíblia
    const colY = 170;
    const colHeight = height - colY - 60;
    const colWidth = (width - 180) / 2;
    const bibleX = 70;
    const notesX = bibleX + colWidth + 40;

    // Fundo da coluna bíblica
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(bibleX, colY, colWidth, colHeight, 16);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cabeçalho da coluna bíblica
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 34px Georgia, "New York", serif';
    ctx.fillText(`${book.name} — Capítulo ${chapterNum}`, bibleX + 40, colY + 60);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bibleX + 40, colY + 80);
    ctx.lineTo(bibleX + colWidth - 40, colY + 80);
    ctx.stroke();

    // Renderizar versículos com quebra de linha inteligente
    let currentY = colY + 120;
    const maxTextY = colY + colHeight - 40;
    const maxLineWidth = colWidth - 80;

    ctx.font = '22px Georgia, "New York", serif';
    ctx.fillStyle = '#334155';

    for (let i = 0; i < verses.length; i++) {
      if (currentY > maxTextY - 30) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'italic 20px Georgia, serif';
        ctx.fillText(`[... continuação de mais ${verses.length - i} versículos]`, bibleX + 40, currentY);
        break;
      }

      const vNum = (i + 1).toString();
      const vText = verses[i];
      const fullText = `${vNum}.  ${vText}`;

      // Quebrar texto do versículo em linhas
      const words = fullText.split(' ');
      let line = '';

      for (let w = 0; w < words.length; w++) {
        const testLine = line + words[w] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxLineWidth && w > 0) {
          // Desenhar linha
          if (line.startsWith(vNum + '.')) {
            // Destacar número do versículo em negrito/cor
            ctx.fillStyle = '#0284c7';
            ctx.font = 'bold 22px Georgia, serif';
            const numWidth = ctx.measureText(vNum + '. ').width;
            ctx.fillText(vNum + '. ', bibleX + 40, currentY);

            ctx.fillStyle = '#1e293b';
            ctx.font = '22px Georgia, serif';
            ctx.fillText(line.substring(vNum.length + 2), bibleX + 40 + numWidth, currentY);
          } else {
            ctx.fillStyle = '#1e293b';
            ctx.font = '22px Georgia, serif';
            ctx.fillText(line, bibleX + 40, currentY);
          }
          line = words[w] + ' ';
          currentY += 34;
          if (currentY > maxTextY - 30) break;
        } else {
          line = testLine;
        }
      }

      if (line.trim() && currentY <= maxTextY - 30) {
        if (line.startsWith(vNum + '.')) {
          ctx.fillStyle = '#0284c7';
          ctx.font = 'bold 22px Georgia, serif';
          const numWidth = ctx.measureText(vNum + '. ').width;
          ctx.fillText(vNum + '. ', bibleX + 40, currentY);

          ctx.fillStyle = '#1e293b';
          ctx.font = '22px Georgia, serif';
          ctx.fillText(line.substring(vNum.length + 2), bibleX + 40 + numWidth, currentY);
        } else {
          ctx.fillStyle = '#1e293b';
          ctx.font = '22px Georgia, serif';
          ctx.fillText(line, bibleX + 40, currentY);
        }
        currentY += 40; // Espaço entre versículos
      }
    }

    // 4. Coluna da Direita: Caderno de Notas com Apple Pencil
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(notesX, colY, colWidth, colHeight, 16);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Carregar imagem das notas e desenhar dentro do cartão da direita
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(notesX, colY, colWidth, colHeight, 16);
        ctx.clip(); // Cortar bordas arredondadas perfeitamente

        // Desenhar notas mantendo a proporção ideal
        ctx.drawImage(img, notesX, colY, colWidth, colHeight);
        ctx.restore();
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = notesDataUrl;
    });

    // 5. Rodapé
    ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('Gerado com BStudy para iPad • Bíblia e Caderno de Caligrafia Digital com Apple Pencil', width / 2, height - 22);
    ctx.textAlign = 'left';

    return canvas;
  }

  /**
   * Exportar como Imagem PNG de Alta Resolução
   */
  async exportAsImage(options = {}) {
    const canvas = await this.generateCombinedCanvas(options);
    const book = this.bible.getCurrentBook();
    const chapterNum = this.bible.currentChapter;
    const fileName = `BStudy_${book.name}_Capitulo_${chapterNum}.png`;

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(false);
          return;
        }

        // Tentar Partilha Nativa no iPad (AirDrop, Guardar Imagem em Fotografias, Ficheiros)
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && options.useShareSheet) {
          try {
            await navigator.share({
              files: [file],
              title: `Estudo Bíblico: ${book.name} ${chapterNum}`,
              text: `Estudo de ${book.name} ${chapterNum} com anotações Apple Pencil`
            });
            resolve(true);
            return;
          } catch (shareErr) {
            console.log('Partilha cancelada ou fallback para download direto');
          }
        }

        // Download direto
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        resolve(true);
      }, 'image/png');
    });
  }

  /**
   * Exportar como Documento PDF Formatado
   */
  async exportAsPdf(options = {}) {
    const canvas = await this.generateCombinedCanvas(options);
    const book = this.bible.getCurrentBook();
    const chapterNum = this.bible.currentChapter;
    const fileName = `BStudy_${book.name}_Capitulo_${chapterNum}.pdf`;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // Verificar se jsPDF está disponível
    const jsPDF = window.jspdf ? window.jspdf.jsPDF : (window.jsPDF || null);

    if (jsPDF) {
      // Criar PDF em formato Paisagem (Landscape) correspondente à proporção da imagem
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);

      if (options.useShareSheet && navigator.canShare) {
        const pdfBlob = pdf.output('blob');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `PDF Estudo: ${book.name} ${chapterNum}`,
              text: `Estudo Bíblico de ${book.name} ${chapterNum}`
            });
            return true;
          } catch (e) {
            console.log('Partilha nativa cancelada');
          }
        }
      }

      pdf.save(fileName);
      return true;
    } else {
      // Fallback via elemento para html2pdf se necessário
      const container = document.createElement('div');
      container.style.width = '1200px';
      container.style.margin = '0 auto';
      const img = document.createElement('img');
      img.src = imgData;
      img.style.width = '100%';
      container.appendChild(img);
      document.body.appendChild(container);

      if (window.html2pdf) {
        await window.html2pdf().set({
          margin: 10,
          filename: fileName,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        }).from(container).save();
      }

      document.body.removeChild(container);
      return true;
    }
  }
}

window.ExportEngine = ExportEngine;
