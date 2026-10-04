/**
 * BStudy - Motor Bíblico em Português (Domínio Público - Almeida Atualizada)
 * Carregamento dos 66 Livros, Navegação de Capítulos, Pesquisa e Formatação
 */

class BibleEngine {
  constructor() {
    this.books = [];
    this.currentBookIndex = 42; // Livro de João (índice 42 nos 66 livros) como padrão devocional acolhedor
    this.currentChapter = 1; // Capítulo 1 (1-indexed)
    this.isLoaded = false;
    this.onChapterChangeCallback = null;

    // Configurações de leitura
    this.fontSize = parseInt(localStorage.getItem('bstudy_font_size') || '18', 10);
    this.fontFamily = localStorage.getItem('bstudy_font_family') || 'serif';
    this.readingTheme = localStorage.getItem('bstudy_reading_theme') || 'claro'; // 'claro', 'marfim', 'sepia', 'escuro'
    this.selectedVerses = new Set();
  }

  async loadBibleData() {
    if (this.isLoaded) return true;

    // 1. Tentar ler de window.BIBLE_AA_DATA (carregado via script tag, 100% offline e sem restrições CORS)
    if (window.BIBLE_AA_DATA && Array.isArray(window.BIBLE_AA_DATA) && window.BIBLE_AA_DATA.length === 66) {
      this.books = window.BIBLE_AA_DATA;
      this.isLoaded = true;
      return true;
    }

    // 2. Fallback via fetch do JSON local
    try {
      const response = await fetch('./data/pt_aa.json');
      if (response.ok) {
        this.books = await response.json();
        this.isLoaded = true;
        return true;
      }
    } catch (e) {
      console.warn('Tentando fallback alternativo de pt_aa.json:', e);
    }

    return false;
  }

  getCurrentBook() {
    if (!this.books || !this.books[this.currentBookIndex]) return null;
    return this.books[this.currentBookIndex];
  }

  getChapterKey(bookIdx = this.currentBookIndex, chNum = this.currentChapter) {
    const book = this.books[bookIdx];
    const abbrev = book ? book.abbrev : 'b';
    return `aa_${abbrev}_${chNum}`;
  }

  getTotalChapters(bookIdx = this.currentBookIndex) {
    const book = this.books[bookIdx];
    return (book && book.chapters) ? book.chapters.length : 1;
  }

  getCurrentChapterVerses() {
    const book = this.getCurrentBook();
    if (!book || !book.chapters) return [];
    const chapterIdx = this.currentChapter - 1;
    return book.chapters[chapterIdx] || [];
  }

  setBookAndChapter(bookIndex, chapterNumber) {
    if (bookIndex >= 0 && bookIndex < this.books.length) {
      this.currentBookIndex = bookIndex;
      const totalCh = this.getTotalChapters(bookIndex);
      this.currentChapter = Math.min(Math.max(1, chapterNumber), totalCh);
      this.selectedVerses.clear();

      if (this.onChapterChangeCallback) {
        this.onChapterChangeCallback({
          bookIndex: this.currentBookIndex,
          chapterNumber: this.currentChapter,
          chapterKey: this.getChapterKey(),
          bookName: this.getCurrentBook().name
        });
      }
      return true;
    }
    return false;
  }

  nextChapter() {
    const total = this.getTotalChapters();
    if (this.currentChapter < total) {
      return this.setBookAndChapter(this.currentBookIndex, this.currentChapter + 1);
    } else if (this.currentBookIndex < this.books.length - 1) {
      // Avançar para o próximo livro
      return this.setBookAndChapter(this.currentBookIndex + 1, 1);
    }
    return false;
  }

  prevChapter() {
    if (this.currentChapter > 1) {
      return this.setBookAndChapter(this.currentBookIndex, this.currentChapter - 1);
    } else if (this.currentBookIndex > 0) {
      // Retroceder para o último capítulo do livro anterior
      const prevBookIdx = this.currentBookIndex - 1;
      const lastCh = this.getTotalChapters(prevBookIdx);
      return this.setBookAndChapter(prevBookIdx, lastCh);
    }
    return false;
  }

  getTestament(bookIndex = this.currentBookIndex) {
    return bookIndex < 39 ? 'Antigo Testamento' : 'Novo Testamento';
  }

  // Pesquisa de livros
  searchBooks(query = '') {
    const clean = query.trim().toLowerCase();
    if (!clean) return this.books.map((b, idx) => ({ ...b, originalIndex: idx }));

    return this.books
      .map((b, idx) => ({ ...b, originalIndex: idx }))
      .filter(b => b.name.toLowerCase().includes(clean) || b.abbrev.toLowerCase().includes(clean));
  }

  // Pesquisa no texto do capítulo atual
  searchInCurrentChapter(query = '') {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    const verses = this.getCurrentChapterVerses();
    const results = [];
    verses.forEach((vText, idx) => {
      if (vText.toLowerCase().includes(clean)) {
        results.push({ verseNum: idx + 1, text: vText });
      }
    });
    return results;
  }

  // Seleção e cópia de versículos
  toggleVerseSelection(verseNum) {
    if (this.selectedVerses.has(verseNum)) {
      this.selectedVerses.delete(verseNum);
    } else {
      this.selectedVerses.add(verseNum);
    }
    return Array.from(this.selectedVerses);
  }

  getSelectedVersesFormatted() {
    if (this.selectedVerses.size === 0) return '';
    const book = this.getCurrentBook();
    const sorted = Array.from(this.selectedVerses).sort((a, b) => a - b);
    const verses = this.getCurrentChapterVerses();

    let output = `"${book.name} ${this.currentChapter}:${sorted.join(',')}"\n`;
    sorted.forEach(num => {
      const text = verses[num - 1] || '';
      output += `${num}. ${text}\n`;
    });
    output += `(Bíblia Sagrada - Almeida Atualizada, Domínio Público)`;
    return output;
  }

  // Preferências visuais
  setFontSize(size) {
    this.fontSize = Math.min(Math.max(14, size), 28);
    localStorage.setItem('bstudy_font_size', this.fontSize);
  }

  setFontFamily(family) {
    this.fontFamily = family;
    localStorage.setItem('bstudy_font_family', this.fontFamily);
  }

  setReadingTheme(theme) {
    this.readingTheme = theme;
    localStorage.setItem('bstudy_reading_theme', this.readingTheme);
  }
}

window.BibleEngine = BibleEngine;
