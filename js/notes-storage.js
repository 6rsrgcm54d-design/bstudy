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
        elements: meta.elements || [],
        hasContent: !!((dataUrl && dataUrl.length > 500) || (meta.elements && meta.elements.length > 0)),
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

  // =========================================================================
  // SISTEMA DE CÓPIA DE SEGURANÇA (BACKUP & RESTAURO INTEGRAL)
  // =========================================================================

  // Obter TODAS as notas guardadas sem filtros (para backup integral)
  async getAllNotes() {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes'], 'readonly');
      const store = tx.objectStore('notes');
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        resolve(records);
      };
      request.onerror = (e) => reject(e);
    });
  }

  // Guardar múltiplas notas de uma só vez (durante o restauro de backup)
  async saveMultipleNotes(notesList) {
    await this.initPromise;
    if (!Array.isArray(notesList) || notesList.length === 0) return 0;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['notes'], 'readwrite');
      const store = tx.objectStore('notes');
      let count = 0;

      notesList.forEach(note => {
        if (note && note.id) {
          store.put(note);
          count++;
        }
      });

      tx.oncomplete = () => resolve(count);
      tx.onerror = (e) => reject(e);
      tx.onabort = (e) => reject(e);
    });
  }

  // Gerar objeto estruturado com todos os dados e metadados para backup
  async createBackupData() {
    const allNotes = await this.getAllNotes();
    const settings = {};
    const settingKeys = [
      'bstudy_theme',
      'bstudy_orientation',
      'bstudy_text_side',
      'bstudy_paper_type',
      'bstudy_last_book',
      'bstudy_last_chapter',
      'bstudy_bible_version',
      'bstudy_font_size',
      'bstudy_font_family'
    ];
    settingKeys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) settings[k] = v;
    });

    return {
      app: 'BStudy',
      appName: 'BStudy - Bíblia & Caderno Apple Pencil',
      version: '1.0',
      createdAt: new Date().toISOString(),
      notesCount: allNotes.length,
      settings: settings,
      notes: allNotes
    };
  }

  // Descarregar ficheiro .json de backup para o computador/iPad
  async exportBackupFile() {
    const backupData = await this.createBackupData();
    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
    const fileName = `BStudy_Backup_Notas_${dateStr}_${timeStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    return {
      fileName,
      notesCount: backupData.notesCount,
      sizeBytes: blob.size
    };
  }

  // Restaurar dados a partir de objeto JSON
  async restoreFromBackupData(backup) {
    if (!backup || backup.app !== 'BStudy' || !Array.isArray(backup.notes)) {
      throw new Error('Ficheiro inválido. O ficheiro selecionado não é um backup compatível do BStudy.');
    }

    const count = await this.saveMultipleNotes(backup.notes);

    if (backup.settings && typeof backup.settings === 'object') {
      Object.entries(backup.settings).forEach(([key, val]) => {
        if (val !== null && val !== undefined) {
          try { localStorage.setItem(key, val); } catch (e) {}
        }
      });
    }

    return {
      restoredNotesCount: count,
      backupDate: backup.createdAt
    };
  }

  // Ler ficheiro .json selecionado pelo utilizador e restaurar
  async importBackupFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject(new Error('Nenhum ficheiro selecionado.'));
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          const json = JSON.parse(content);
          const result = await this.restoreFromBackupData(json);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler o ficheiro no dispositivo.'));
      reader.readAsText(file);
    });
  }
}

// Instância global disponível
window.notesStorage = new NotesStorage();
