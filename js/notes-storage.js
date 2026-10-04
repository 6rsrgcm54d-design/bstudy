/**
 * BStudy - Armazenamento Local IndexedDB para Notas Manuscritas
 * Suporta múltiplas páginas por capítulo, persistência instantânea e histórico de estudos.
 */

class NotesStorage {
  constructor() {
    this.dbName = 'BStudy_Notes_DB';
    this.dbVersion = 1;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('notes')) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('chapterKey', 'chapterKey', { unique: false });
          notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('Erro ao abrir IndexedDB:', e);
        reject(e);
      };
    });
  }

  // Chave identificadora única por capítulo e página: ex: "aa_jo_3_p1"
  makeKey(chapterKey, pageIndex = 0) {
    return `${chapterKey}_p${pageIndex}`;
  }

  async saveNote(chapterKey, pageIndex, dataUrl, meta = {}) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes'], 'readwrite');
      const store = tx.objectStore('notes');

      const id = this.makeKey(chapterKey, pageIndex);
      const record = {
        id,
        chapterKey,
        pageIndex,
        dataUrl,
        bookName: meta.bookName || '',
        chapterNum: meta.chapterNum || 1,
        paperType: meta.paperType || 'linhas',
        hasContent: !!(dataUrl && dataUrl.length > 500),
        updatedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = (e) => reject(e);
    });
  }

  async getNote(chapterKey, pageIndex = 0) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes'], 'readonly');
      const store = tx.objectStore('notes');
      const id = this.makeKey(chapterKey, pageIndex);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e);
    });
  }

  async deleteNote(chapterKey, pageIndex = 0) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes'], 'readwrite');
      const store = tx.objectStore('notes');
      const id = this.makeKey(chapterKey, pageIndex);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e);
    });
  }

  async getAllNotesSummary() {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes'], 'readonly');
      const store = tx.objectStore('notes');
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        // Filtrar apenas notas que realmente tenham conteúdo desenhado
        const valid = records.filter(r => r.hasContent);
        // Ordenar da mais recente para a mais antiga
        valid.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(valid);
      };
      request.onerror = (e) => reject(e);
    });
  }

  async getChaptersWithNotesSet() {
    const list = await this.getAllNotesSummary();
    const set = new Set();
    list.forEach(item => {
      if (item.hasContent) set.add(item.chapterKey);
    });
    return set;
  }
}

// Instância global disponível
window.notesStorage = new NotesStorage();
