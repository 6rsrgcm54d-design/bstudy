# ✝ BStudy — Bíblia Sagrada & Caderno Apple Pencil para iPad

Aplicação progressiva (PWA) de alta performance concebida especialmente para o **iPad** com suporte nativo ao **Apple Pencil**, com rejeição de palma da mão predefinida, caderno de caligrafia digital lado a lado com a Bíblia Sagrada em português e exportação completa.

---

## 🌟 Funcionalidades Principais

### 1. Bíblia Sagrada em Português (Domínio Público Completo)
* **Versão:** Almeida Atualizada (AA) — a mais recente e consagrada tradução clássica em domínio público (sem restrições de royalties).
* **66 Livros Completos:** 39 do Antigo Testamento e 27 do Novo Testamento (1.189 capítulos, 31.102 versículos).
* **Navegador Rápido de Livros:** Filtro por Testamento, pesquisa instantânea de livros e grade de capítulos.
* **Leitura Confortável:** Tipografia serifada clássica (*New York / Georgia*), temas de leitura (*Claro, Marfim, Sépia, Noturno*) e seleção de versículos para referência.

### 2. Apple Pencil com Rejeição da Palma da Mão (Predefinida)
* **Rejeição da Palma Ativa:** O motor de desenho aceita exclusivamente eventos de caneta stylus (`pointerType === 'pen'`). Toques acidentais da palma da mão ou dos pulsos pousados no ecrã do iPad **não riscam nem mancham o papel**.
* **Modo Alternativo:** Possibilidade de alternar no botão de status para modo de desenho com dedo (`Modo Toque`).
* **Caligrafia Natural:** Sensibilidade dinâmica à pressão do Apple Pencil (`e.pressure`) e suavização por curvas quadráticas de Bézier.

### 3. Ferramentas de Escrita & Caligrafia
* **3 Cores de Canetas Oficiais:**
  * ⬛ **Preto** (`#1a1a1a` — grafite profundo de tinta clássica)
  * 🟦 **Azul Escuro** (`#0c356a` — azul nobre de caneta de aparo)
  * 🟥 **Vermelho** (`#ba181b` — vermelho marcante de anotação editorial)
* **Seleção de Espessura:**
  * Presets rápidos: **Fina** (1.5px), **Média** (3.5px), **Grossa** (7.0px), **Extra** (12.0px).
  * Slider contínuo de calibração milimétrica (1px a 24px) com pré-visualização.
* **3 Highlighters / Marca-Textos Translúcidos:**
  * 🟨 **Amarelo** (`#facc15`)
  * 🟩 **Verde** (`#4ade80`)
  * 🟥 **Vermelho Claro / Rosa Coral** (`#fb7185`)
  * Efeito de **multiplicação óptica** (`multiply`): os traços de caneta e o texto por baixo mantêm-se 100% visíveis e legíveis!
* **Borracha Precisa:** Apaga os traços desenhados sem apagar as linhas nem os pontos do papel de fundo.
* **Histórico:** Desfazer (`Cmd+Z`), Refazer (`Cmd+Shift+Z`) e Limpar Página.

### 4. Tipos de Papel de Estudo
* ≡ **Linhas (Pautado):** Espaçamento de 32px com linha guia de margem vertical suave.
* ▦ **Quadriculado (Grid):** Grade de 26px ideal para esquemas, tabelas e esboços exegéticos.
* ⁖ **Pontilhado (Dot Grid):** Matriz de pontos sutis estilo *bullet journal* / Leuchtturm.
* ◻ **Em Branco (Liso):** Espaço livre para diagramas e desenhos livres.
* **Tonalidades:** Marfim / Creme natural, Branco Puro, Sépia Livro e Modo Escuro.

### 5. Armazenamento Inteligente por Capítulo
* Todas as suas notas são **gravadas automaticamente por capítulo** no armazenamento local seguro do iPad (`IndexedDB`).
* Ao navegar para *João 3*, as suas notas de *João 3* aparecem; ao mudar para *Romanos 8*, o caderno sincroniza de imediato.
* Na lista de capítulos, os capítulos onde já tomou notas são identificados com um ponto dourado.

### 6. Exportação de Alta Resolução (Imagem PNG & Documento PDF)
* **Composição Lado a Lado:**
  * **Lado Esquerdo:** O texto do capítulo da Bíblia formatado com cabeçalho solene, data, livro e versículos.
  * **Lado Direito:** As suas notas manuscritas com o Apple Pencil sobre o papel escolhido.
* **Formatos de Saída:**
  * 🖼️ **Imagem PNG:** Renderizada em 2400×1700 pixels (alta resolução Retina).
  * 📄 **Documento PDF:** Documento vetorial pronto para arquivamento no app *Ficheiros*, *Apple Books* ou impressão.
* **Partilha Nativa no iPad:** Aciona o menu de partilha do iPadOS (*AirDrop, Guardar Imagem em Fotografias, Partilhar por Mail, etc.*).

---

## 🚀 Como Usar no iPad

### Passo 1: Iniciar o Servidor no PC
1. Dê duplo clique em `iniciar_bstudy.bat` (ou execute `node server.js` no terminal da pasta `BStudy`).
2. O terminal mostrará o endereço da sua rede local (ex: `http://192.168.1.214:8080`).

### Passo 2: Abrir no iPad
1. Certifique-se de que o iPad está ligado à mesma rede Wi-Fi.
2. Abra o **Safari** no iPad e digite o endereço (ex: `http://192.168.1.214:8080`).

### Passo 3: Adicionar ao Ecrã Principal (Modo App Nativa)
1. No Safari do iPad, toque no botão de **Partilha** (ícone do quadrado com a seta para cima, no canto superior direito).
2. Selecione **"Adicionar ao Ecrã Principal"** (*Add to Home Screen*).
3. Toque em **Adicionar**.
4. Um novo ícone **BStudy** aparecerá no ecrã principal do seu iPad. Ao abrir, funcionará em **Ecrã Inteiro Standalone**, sem barras de navegação do browser, com funcionamento 100% offline!
