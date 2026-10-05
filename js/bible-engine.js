/**
 * BStudy - Motor Bíblico em Português com Múltiplas Traduções
 * Suporte a:
 * 1. BPT  - Bíblia Para Todos (Linguagem contemporânea)
 * 2. NTLH - Nova Tradução na Linguagem de Hoje
 * 3. AA   - Almeida Atualizada (Clássica em domínio público)
 */

class BibleEngine {
  constructor() {
    this.translations = {
      bpt: { id: 'bpt', name: 'Bíblia Para Todos (BPT)', data: null },
      ntlh: { id: 'ntlh', name: 'Nova Linguagem de Hoje (NTLH)', data: null },
      aa: { id: 'aa', name: 'Almeida Atualizada (AA)', data: null }
    };

    this.currentTranslation = localStorage.getItem('bstudy_translation') || 'bpt';
    this.books = [];
    this.currentBookIndex = 42; // Livro de João por defeito
    this.currentChapter = 1;
    this.isLoaded = false;
    this.onChapterChangeCallback = null;

    // Configurações de leitura e tamanho de texto
    this.fontSize = parseInt(localStorage.getItem('bstudy_font_size') || '19', 10);
    this.fontFamily = localStorage.getItem('bstudy_font_family') || 'serif';
    this.readingTheme = localStorage.getItem('bstudy_reading_theme') || 'claro';
    this.selectedVerses = new Set();
  }

  async loadBibleData() {
    // 1. Carregar BPT
    if (window.BIBLE_BPT_DATA && Array.isArray(window.BIBLE_BPT_DATA)) {
      this.translations.bpt.data = window.BIBLE_BPT_DATA;
    }
    // 2. Carregar NTLH
    if (window.BIBLE_NTLH_DATA && Array.isArray(window.BIBLE_NTLH_DATA)) {
      this.translations.ntlh.data = window.BIBLE_NTLH_DATA;
    }
    // 3. Carregar AA
    if (window.BIBLE_AA_DATA && Array.isArray(window.BIBLE_AA_DATA)) {
      this.translations.aa.data = window.BIBLE_AA_DATA;
    }

    // Definir a tradução ativa
    this.updateActiveBooks();
    this.isLoaded = this.books.length > 0;
    return this.isLoaded;
  }

  updateActiveBooks() {
    const trans = this.translations[this.currentTranslation];
    if (trans && trans.data && trans.data.length === 66) {
      this.books = trans.data;
    } else if (this.translations.bpt.data) {
      this.books = this.translations.bpt.data;
      this.currentTranslation = 'bpt';
    } else if (this.translations.aa.data) {
      this.books = this.translations.aa.data;
      this.currentTranslation = 'aa';
    }
  }

  setTranslation(transId) {
    if (this.translations[transId] && this.translations[transId].data) {
      this.currentTranslation = transId;
      localStorage.setItem('bstudy_translation', transId);
      this.updateActiveBooks();
      if (this.onChapterChangeCallback) {
        this.onChapterChangeCallback(this.getCurrentChapterInfo());
      }
      return true;
    }
    return false;
  }

  getCurrentTranslationName() {
    return this.translations[this.currentTranslation]?.name || 'Bíblia';
  }

  getCurrentChapterInfo() {
    const book = this.getCurrentBook();
    return {
      bookIndex: this.currentBookIndex,
      chapterNumber: this.currentChapter,
      chapterKey: this.getChapterKey(),
      bookName: book ? book.name : '',
      translationId: this.currentTranslation,
      translationName: this.getCurrentTranslationName()
    };
  }

  getCurrentBook() {
    if (!this.books || !this.books[this.currentBookIndex]) return null;
    return this.books[this.currentBookIndex];
  }

  getChapterKey(bookIdx = this.currentBookIndex, chNum = this.currentChapter) {
    const book = this.books[bookIdx];
    const abbrev = book ? book.abbrev : 'b';
    return `${this.currentTranslation}_${abbrev}_${chNum}`;
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
        this.onChapterChangeCallback(this.getCurrentChapterInfo());
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
      return this.setBookAndChapter(this.currentBookIndex + 1, 1);
    }
    return false;
  }

  prevChapter() {
    if (this.currentChapter > 1) {
      return this.setBookAndChapter(this.currentBookIndex, this.currentChapter - 1);
    } else if (this.currentBookIndex > 0) {
      const prevBookIdx = this.currentBookIndex - 1;
      const lastCh = this.getTotalChapters(prevBookIdx);
      return this.setBookAndChapter(prevBookIdx, lastCh);
    }
    return false;
  }

  getTestament(bookIndex = this.currentBookIndex) {
    return bookIndex < 39 ? 'Antigo Testamento' : 'Novo Testamento';
  }

  searchBooks(query = '') {
    const clean = query.trim().toLowerCase();
    if (!clean) return this.books.map((b, idx) => ({ ...b, originalIndex: idx }));

    return this.books
      .map((b, idx) => ({ ...b, originalIndex: idx }))
      .filter(b => b.name.toLowerCase().includes(clean) || b.abbrev.toLowerCase().includes(clean));
  }

  // Controlo de tamanho de letra
  setFontSize(size) {
    this.fontSize = Math.max(12, Math.min(parseInt(size, 10) || 18, 36));
    localStorage.setItem('bstudy_font_size', this.fontSize);
    return this.fontSize;
  }

  increaseFontSize() {
    this.fontSize = Math.min(this.fontSize + 2, 34);
    localStorage.setItem('bstudy_font_size', this.fontSize);
    return this.fontSize;
  }

  decreaseFontSize() {
    this.fontSize = Math.max(this.fontSize - 2, 14);
    localStorage.setItem('bstudy_font_size', this.fontSize);
    return this.fontSize;
  }

  toggleVerseSelection(verseNum) {
    if (this.selectedVerses.has(verseNum)) {
      this.selectedVerses.delete(verseNum);
    } else {
      this.selectedVerses.add(verseNum);
    }
    return Array.from(this.selectedVerses);
  }

  getSelectedVersesText() {
    if (this.selectedVerses.size === 0) return '';
    const book = this.getCurrentBook();
    const sorted = Array.from(this.selectedVerses).sort((a, b) => a - b);
    const verses = this.getCurrentChapterVerses();

    let output = `${book.name} ${this.currentChapter}:${sorted.join(',')}\n`;
    sorted.forEach(num => {
      const text = verses[num - 1] || '';
      output += `${num} ${text}\n`;
    });
    output += `(${this.getCurrentTranslationName()})`;
    return output;
  }

  setReadingTheme(theme) {
    this.readingTheme = theme;
    localStorage.setItem('bstudy_reading_theme', this.readingTheme);
  }

  setFontFamily(family) {
    this.fontFamily = family || 'serif';
    localStorage.setItem('bstudy_font_family', this.fontFamily);
    return this.fontFamily;
  }
}

window.BibleEngine = BibleEngine;
