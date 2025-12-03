// Importa as ferramentas necessárias
import { qs } from './utils.js';
import { openModal, closeModal, setAlert } from './ui.js';

class BarcodeScanner {
  constructor() {
    this.onBarcodeScanned = null;
    this.buffer = '';
    this.lastScannedCode = '';
    this.setupKeyboardListener();
  }

  // Configura o listener do teclado para capturar os códigos
  setupKeyboardListener() {
    document.addEventListener('keypress', (e) => {
      // Se for Enter, processa o código
      if (e.key === 'Enter') {
        if (this.buffer.length > 0) {
          if (this.onBarcodeScanned) {
            this.onBarcodeScanned(this.buffer);
          }
          this.buffer = '';
        }
      } 
      // Se for um dígito ou letra, adiciona ao buffer
      else if (e.key.match(/^[0-9a-zA-Z]$/)) {
        this.buffer += e.key;
      }
    });
  }

  // Método para registrar o callback
  onScan(callback) {
    this.onBarcodeScanned = callback;
  }

  handleBarcodeScanned(code) {
    this.lastScannedCode = code;
    const product = this.findProductByBarcode(code);
    this.showProductInfo(product);
  }

  // Encontra um produto pelo código de barras
  findProductByBarcode(code) {
    return window.inventory?.find(item => item.barcode === code);
  }

  showProductInfo(product = null) {
    let infoHtml = '';

    if (product) {
      // Usa a quantidade original do produto
      const productInfo = this.findProductByBarcode(product.barcode) || product;
      const displayQty = productInfo.qty;

      infoHtml = `
        <div id="productInfo" style="margin-top: 20px;">
          <div style="font-weight: 500; margin-bottom: 8px; color: #333; font-size: 14px;">
            Receita cadastrada
          </div>
          <div style="padding: 12px; border-radius: 4px; 
                     background: #e8f5e9; 
                     border-left: 4px solid #4caf50;">
            ✅ <strong>${product.name}</strong> - ${displayQty} ${product.unit}
          </div>
          <button id="addToInventory" 
                  style="display: block; width: 100%; margin-top: 12px; padding: 10px; 
                         background: #4caf50; color: white; border: none; 
                         border-radius: 4px; cursor: pointer;">
            Adicionar à Dispensa
          </button>
        </div>
      `;
    } else {
      infoHtml = `
        <div id="productInfo" style="margin-top: 20px;">
          <div style="padding: 12px; border-radius: 4px; 
                      background: #ffebee; 
                      border-left: 4px solid #f44336;
                      margin-bottom: 16px;">
            ❌ Código não cadastrado
          </div>
          <div style="margin-bottom: 16px;">
            <div style="font-weight: 500; margin-bottom: 12px; color: #333;">Cadastre seu produto</div>
            <div style="margin-bottom: 12px;">
              <input type="text" 
                     id="newProductName" 
                     placeholder="Nome do produto" 
                     style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="number" 
                     id="newProductQty" 
                     placeholder="Quantidade" 
                     min="0.01" 
                     step="0.01"
                     style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <select id="newProductUnit" 
                      style="padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: white;">
                <option value="un">un</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="L">L</option>
              </select>
            </div>
            <button id="saveProductBtn" 
                    style="margin-top: 12px; width: 100%; padding: 10px; 
                           background: #4caf50; color: white; border: none; 
                           border-radius: 4px; cursor: pointer;">
              Salvar Produto
            </button>
          </div>
        </div>
      `;
    }

    let infoDiv = qs('#productInfo');
    if (infoDiv) {
      infoDiv.outerHTML = infoHtml;
    } else {
      const actionsDiv = qs('.scanner-actions');
      if (actionsDiv) {
        actionsDiv.insertAdjacentHTML('afterend', infoHtml);
      }
    }

    if (!product) {
      qs('#saveProductBtn')?.addEventListener('click', () => this.saveNewProduct());
    } else {
      qs('#addToInventory')?.addEventListener('click', () => this.addToInventory(product));
    }
  }

  addToInventory(product) {
    if (!window.inventory) window.inventory = [];
    
    // Busca o produto original (sem afetar o estoque)
    const originalProduct = this.findProductByBarcode(product.barcode) || product;
    const packageQty = parseFloat(originalProduct.qty);

    // Encontra o item no inventário
    const existingItem = window.inventory.find(item => 
      item.barcode === product.barcode
    );

    if (existingItem) {
      // Soma a quantidade da embalagem ao estoque existente
      const currentQty = parseFloat(existingItem.qty) || 0;
      existingItem.qty = (currentQty + packageQty).toString();
      setAlert(`Adicionado ${packageQty} ${product.unit} à dispensa!`, 'success');
    } else {
      // Se não existe, adiciona o produto com a quantidade da embalagem
      const newItem = {
        ...originalProduct,
        qty: packageQty.toString(),
        originalName: originalProduct.originalName || originalProduct.name,
        normalizedName: (originalProduct.normalizedName || originalProduct.name)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      };
      window.inventory.push(newItem);
      setAlert('Produto adicionado à dispensa!', 'success');
    }

    if (window.saveAll) {
      window.saveAll();
      window.renderList?.();
    }

    // Limpa e reinicia
    const infoDiv = qs('#productInfo');
    if (infoDiv) infoDiv.outerHTML = '';
    
    const input = qs('#barcodeInput');
    if (input) input.value = '';

    this.openScanner();
  }

  saveNewProduct() {
    const name = qs('#newProductName')?.value.trim();
    const qty = parseFloat(qs('#newProductQty')?.value);
    const unit = qs('#newProductUnit')?.value;
    const barcode = this.lastScannedCode;

    if (!name || isNaN(qty) || qty <= 0) {
      setAlert('Preencha todos os campos corretamente', 'error');
      return;
    }

    const newProduct = {
      barcode,
      name,
      qty,
      unit,
      originalName: name,
      normalizedName: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    };

    // Inicializa o inventário se não existir
    if (!window.inventory) window.inventory = [];
    
    // Remove o produto se já existir (para evitar duplicatas)
    window.inventory = window.inventory.filter(item => item.barcode !== barcode);
    
    // Adiciona o novo produto
    window.inventory.push(newProduct);
    
    // Salva os dados
    if (window.saveAll) {
      window.saveAll();
    }
    
    // Atualiza a interface
    this.showProductInfo(newProduct);
    setAlert('Produto cadastrado com sucesso!', 'success');
    
    // Atualiza a lista de itens na tela
    if (window.renderList) {
      window.renderList();
    }
  }

  openScanner() {
    const html = `
      <div class="barcode-scanner-content">
        <div class="scanner-instruction" style="margin-bottom: 16px;">
          Escaneie o código de barras
        </div>
        <div class="scanner-input">
          <input type="text" 
                 id="barcodeInput" 
                 placeholder="Clique aqui e escaneie o código" 
                 class="barcode-input" 
                 style="text-align: center; width: 100%; padding: 12px; font-size: 16px; 
                        border: 1px solid #ddd; border-radius: 4px; margin: 8px 0 16px 0;">
        </div>
        <div id="productInfo"></div>
      </div>
    `;

    openModal('Leitor de Código de Barras', html);
    
    const input = qs('#barcodeInput');
    if (input) {
      input.readOnly = false;
      input.focus();
      input.select();
      
      // Processa automaticamente quando o código for digitado
      input.addEventListener('input', (e) => {
        const code = e.target.value.trim();
        if (code) {
          this.handleBarcodeScanned(code);
        }
      });
    }
  }
}

// Exporta uma única instância do scanner
export const barcodeScanner = new BarcodeScanner();