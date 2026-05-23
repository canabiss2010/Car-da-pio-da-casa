// Importa as ferramentas necessárias
import { qs } from './utils.js';
import { openModal, closeModal, setAlert } from './ui.js';
import { normalizeUnit } from './unitNormalizer.js';

class BarcodeScanner {
  constructor() {
    this.onBarcodeScanned = null;
    this.buffer = '';
    this.lastScannedCode = '';
    this.videoElement = null;
    this.stream = null;
    this.barcodeDetector = null;
    this.scanAnimationFrame = null;
    this.isScanning = false;
    this.setupKeyboardListener();
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('⚠️ A API getUserMedia não está disponível neste navegador.');
      setAlert('Este navegador não suporta câmera nativa para leitura de QR Code.', 'error');
      return;
    }

    if (!('BarcodeDetector' in window)) {
      console.warn('⚠️ A API BarcodeDetector não está disponível neste navegador.');
      setAlert('Seu navegador não suporta leitura de QR Code com câmera nativa.', 'error');
      return;
    }

    this.stopCamera();

    this.videoElement = qs('#scanner-video');
    if (!this.videoElement) {
      return;
    }

    try {
      this.barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      this.isScanning = true;
      this.showScannerStatus('Aponte a câmera para o QR Code da nota fiscal.');
      this.scanForCodes();
    } catch (error) {
      console.error('❌ Não foi possível acessar a câmera:', error);
      this.stopCamera();
      setAlert('Não foi possível acessar a câmera. Verifique as permissões e tente novamente.', 'error');
    }
  }

  async scanForCodes() {
    if (!this.isScanning || !this.videoElement || !this.barcodeDetector) {
      return;
    }

    const video = this.videoElement;

    if (video.readyState < 2) {
      this.scanAnimationFrame = requestAnimationFrame(() => this.scanForCodes());
      return;
    }

    try {
      const detectedCodes = await this.barcodeDetector.detect(video);
      const qrCode = detectedCodes?.[0]?.rawValue?.trim();

      if (qrCode) {
        this.lastScannedCode = qrCode;
        this.stopCamera();
        this.showScannerStatus('Nota Fiscal detectada com sucesso!');
        setAlert('Nota Fiscal detectada com sucesso!', 'success');
        return;
      }
    } catch (error) {
      console.warn('⚠️ Falha ao detectar QR Code:', error);
    }

    this.scanAnimationFrame = requestAnimationFrame(() => this.scanForCodes());
  }

  stopCamera() {
    this.isScanning = false;

    if (this.scanAnimationFrame) {
      cancelAnimationFrame(this.scanAnimationFrame);
      this.scanAnimationFrame = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.barcodeDetector = null;
  }

  showScannerStatus(message) {
    const statusNode = qs('#scanner-status');
    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  // Configura o listener do teclado para capturar os códigos
  setupKeyboardListener() {
    document.addEventListener('keypress', (e) => {
      // Só processa se barcodeInput está focado ou se outro input NÃO está focado
      const focusedElement = document.activeElement;
      const isBarcodeInput = focusedElement?.id === 'barcodeInput';
      const isFormInput = focusedElement?.id &&
        (focusedElement.id.startsWith('newProduct') ||
          focusedElement.tagName === 'TEXTAREA');

      // Se está focado em outro input do formulário, ignora
      if (isFormInput && !isBarcodeInput) {
        return;
      }

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
    if (product) {
      this.addToInventory(product);  // Produto encontrado: adiciona direto ao estoque
    } else {
      this.showProductInfo();  // Produto não encontrado: mostra formulário
    }
  }

  // Encontra um produto pelo código de barras
  findProductByBarcode(code) {
    return window.inventory?.find(item => item.barcode === code);
  }

  normalizeText(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  normalizeCategory(value) {
    const normalized = this.normalizeText(value);
    return normalized || 'outros';
  }

  buildNormalizedProduct(rawProduct = {}, fallback = {}) {
    const normalizedQty = normalizeUnit(Number(rawProduct.qty ?? fallback.qty ?? 0), rawProduct.unit ?? fallback.unit ?? 'un');
    const product = {
      category: this.normalizeCategory(rawProduct.category ?? fallback.category ?? 'outros'),
      name: this.normalizeText(rawProduct.name ?? fallback.name ?? ''),
      brand: this.normalizeText(rawProduct.brand ?? fallback.brand ?? ''),
      qty: normalizedQty?.qty ?? 0,
      unit: normalizedQty?.unit ?? 'un',
      barcode: String(rawProduct.barcode ?? fallback.barcode ?? '')
    };

    return product;
  }

  findExistingInventoryItem(product) {
    if (!Array.isArray(window.inventory)) return null;

    return window.inventory.find(item => {
      const existingName = this.normalizeText(item.name);
      const existingBrand = this.normalizeText(item.brand || '');
      const incomingName = this.normalizeText(product.name);
      const incomingBrand = this.normalizeText(product.brand || '');

      return existingName === incomingName && existingBrand === incomingBrand;
    });
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
            <div style="margin-bottom: 12px;">
              <input type="text" 
                     id="newProductBrand" 
                     placeholder="Marca (opcional)" 
                     style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 12px;">
              <input type="text" 
                     id="newProductCategory" 
                     placeholder="Categoria (ex: laticinios)" 
                     style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="text" 
                     id="newProductQty" 
                     placeholder="Ex: 2.5 ou 3" 
                     inputmode="decimal"
                     style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <select id="newProductUnit" 
                      style="padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: white;">
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="un" selected>un</option>
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

      // Valida o campo de quantidade para aceitar apenas números, ponto e vírgula
      setTimeout(() => {
        const qtyInput = qs('#newProductQty');
        if (qtyInput) {
          qtyInput.addEventListener('keypress', (e) => {
            const char = String.fromCharCode(e.which);
            // Aceita apenas números, ponto (.) e vírgula (,)
            if (!/[0-9.,]/.test(char)) {
              e.preventDefault();
            }
          });
        }
      }, 50);
    } else {
      qs('#addToInventory')?.addEventListener('click', () => this.addToInventory(product));
    }
  }

  showProductForm() {
    const formHtml = `
    <div id="productInfo" style="margin-top: 20px;">
      <div style="padding: 8px; background: #ffebee; color: #d32f2f; 
                 border-radius: 4px; margin-bottom: 16px; font-size: 14px;">
        ❌ Produto não cadastrado
      </div>
      <div style="margin-bottom: 16px;">
        <div style="font-weight: 500; margin-bottom: 12px; color: #333;">Cadastre seu produto</div>
        <div style="margin-bottom: 12px;">
          <input type="text" 
                 id="newProductName" 
                 placeholder="Nome do produto" 
                 style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div style="margin-bottom: 12px;">
          <input type="text" 
                 id="newProductBrand" 
                 placeholder="Marca (opcional)" 
                 style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div style="margin-bottom: 12px;">
          <input type="text" 
                 id="newProductCategory" 
                 placeholder="Categoria (ex: laticinios)" 
                 style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" 
                 id="newProductQty" 
                 placeholder="Ex: 2.5 ou 3" 
                 inputmode="decimal"
                 style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          <select id="newProductUnit" 
                 style="padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: white;">
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="un" selected>un</option>
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

    const infoDiv = qs('#productInfo') || qs('.scanner-actions')?.nextElementSibling;
    if (infoDiv) {
      infoDiv.outerHTML = formHtml;
      qs('#saveProductBtn')?.addEventListener('click', () => this.saveNewProduct());

      setTimeout(() => {
        const qtyInput = qs('#newProductQty');
        if (qtyInput) {
          qtyInput.addEventListener('keypress', (e) => {
            const char = String.fromCharCode(e.which);
            if (!/[0-9.,]/.test(char)) {
              e.preventDefault();
            }
          });
        }
      }, 50);
    }
  }

  addToInventory(product) {
    if (!window.inventory) window.inventory = [];

    const originalProduct = this.findProductByBarcode(product.barcode) || product;
    const normalizedProduct = this.buildNormalizedProduct(originalProduct, {
      name: product.name,
      qty: product.qty,
      unit: product.unit,
      barcode: product.barcode
    });

    const existingItem = this.findExistingInventoryItem(normalizedProduct);

    if (existingItem) {
      const currentQty = Number(existingItem.qty) || 0;
      existingItem.qty = currentQty + Number(normalizedProduct.qty || 0);
      existingItem.unit = normalizedProduct.unit;
      existingItem.category = normalizedProduct.category || existingItem.category || 'outros';
      existingItem.brand = normalizedProduct.brand || existingItem.brand || '';
    } else {
      window.inventory.push(normalizedProduct);
    }

    const successHtml = `
    <div id="productInfo" style="margin-top: 20px;">
      <div style="padding: 8px; background: #e8f5e9; color: #2e7d32; 
                 border-radius: 4px; margin-bottom: 16px; font-size: 14px;">
        ✅ ${normalizedProduct.name} ${normalizedProduct.qty}${normalizedProduct.unit} adicionado com sucesso
      </div>
    </div>
  `;

    const infoDiv = qs('#productInfo');
    if (infoDiv) {
      infoDiv.outerHTML = successHtml;
    } else {
      const actionsDiv = qs('.scanner-actions');
      if (actionsDiv) {
        actionsDiv.insertAdjacentHTML('afterend', successHtml);
      }
    }

    const input = qs('#barcodeInput');
    if (input) {
      input.value = '';
      input.focus();
    }

    if (window.saveAll) window.saveAll();
    if (window.renderList) window.renderList();
  }

  saveNewProduct() {
    const name = qs('#newProductName')?.value.trim();
    const brand = qs('#newProductBrand')?.value.trim();
    const category = qs('#newProductCategory')?.value.trim();
    let qtyValue = qs('#newProductQty')?.value.trim() || '';
    qtyValue = qtyValue.replace(',', '.');
    const qty = parseFloat(qtyValue);
    const unit = qs('#newProductUnit')?.value;
    const barcode = this.lastScannedCode;

    if (!name || isNaN(qty) || qty <= 0) {
      setAlert('Preencha todos os campos corretamente', 'error');
      return;
    }

    if (!window.inventory) window.inventory = [];

    const newProduct = this.buildNormalizedProduct(
      {
        name,
        brand,
        category,
        qty,
        unit,
        barcode
      },
      { name, brand, category, barcode }
    );

    const existingItem = this.findExistingInventoryItem(newProduct);

    if (existingItem) {
      existingItem.qty = Number(existingItem.qty || 0) + Number(newProduct.qty || 0);
      existingItem.unit = newProduct.unit;
      existingItem.brand = newProduct.brand || existingItem.brand || '';
      existingItem.category = newProduct.category || existingItem.category || 'outros';
    } else {
      window.inventory.push(newProduct);
    }

    if (window.saveAll) {
      window.saveAll();
    }

    this.showProductInfo(newProduct);
    setAlert('Produto cadastrado com sucesso!', 'success');

    if (window.renderList) {
      window.renderList();
    }
  }

  openScanner() {
    const html = `
      <div class="barcode-scanner-content">
        <div class="scanner-instruction" style="margin-bottom: 16px;">
          Aponte a câmera para o QR Code da nota fiscal
        </div>
        <div style="display: flex; justify-content: center; margin-bottom: 16px;">
          <video id="scanner-video" autoplay playsinline style="width: 100%; max-width: 400px; border-radius: 8px; background: #000;"></video>
        </div>
        <div id="scanner-status" style="padding: 12px; border-radius: 8px; background: #f5f5f5; color: #333; font-size: 14px; line-height: 1.4;">
          Inicializando câmera...
        </div>
        <div id="productInfo"></div>
      </div>
    `;

    openModal('Leitor de QR Code', html);
    this.stopCamera();
    this.startCamera();
  }
}

// Exporta uma única instância do scanner
export const barcodeScanner = new BarcodeScanner();