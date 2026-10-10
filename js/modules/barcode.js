// Importa as ferramentas necessárias
import { qs } from './utils.js';
import { openModal, closeModal, setAlert } from './ui.js';
import { normalizeUnit } from './unitNormalizer.js';

const NOTA_API_URL = 'https://car-da-pio-da-casa.onrender.com/raspar-nota';
const NOTA_TIMEOUT_MS = 90000; // o servidor gratuito do Render pode levar ~1 min para acordar
const SCAN_INTERVAL_MS = 200;
const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

let jsQRPromise = null;

// Carrega o jsQR sob demanda, para navegadores sem BarcodeDetector (iPhone, Firefox, Chrome no Windows)
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);

  if (!jsQRPromise) {
    jsQRPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JSQR_URL;
      script.onload = () => resolve(window.jsQR);
      script.onerror = () => {
        jsQRPromise = null;
        reject(new Error('Não foi possível carregar o leitor de QR Code. Verifique sua internet.'));
      };
      document.head.appendChild(script);
    });
  }

  return jsQRPromise;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

class BarcodeScanner {
  constructor() {
    this.onBarcodeScanned = null;
    this.buffer = '';
    this.lastScannedCode = '';
    this.videoElement = null;
    this.stream = null;
    this.detectQrCode = null;
    this.scanTimer = null;
    this.isScanning = false;
    this.setupKeyboardListener();
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn('⚠️ A API getUserMedia não está disponível neste navegador.');
      this.showScannerStatus('Este navegador não permite usar a câmera. Abra o app pelo navegador do celular (Chrome ou Safari) usando https.');
      setAlert('Este navegador não suporta câmera para leitura de QR Code.', 'error');
      return;
    }

    this.stopCamera();

    this.videoElement = qs('#scanner-video');
    if (!this.videoElement) {
      return;
    }

    try {
      this.detectQrCode = await this.createQrDetector();
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      this.isScanning = true;
      this.showScannerStatus('Aponte a câmera para o QR Code da nota fiscal (fica no rodapé do cupom).');
      this.scanForCodes();
    } catch (error) {
      console.error('❌ Não foi possível iniciar o leitor:', error);
      this.stopCamera();
      let mensagem = 'Não foi possível acessar a câmera. Verifique as permissões e tente novamente.';
      if (error?.name === 'NotAllowedError') {
        mensagem = 'Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador.';
      } else if (error?.message?.includes('leitor de QR Code')) {
        mensagem = error.message;
      }
      this.showScannerStatus(mensagem);
      setAlert(mensagem, 'error');
    }
  }

  // Usa o BarcodeDetector nativo quando existe; senão, cai para o jsQR
  async createQrDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.();
        if (!formats || formats.includes('qr_code')) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          return async (video) => {
            const codes = await detector.detect(video);
            return codes?.[0]?.rawValue || '';
          };
        }
      } catch (error) {
        console.warn('⚠️ BarcodeDetector indisponível, usando jsQR:', error);
      }
    }

    const jsQR = await loadJsQR();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    return async (video) => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return '';

      // Reduz frames muito grandes para não travar celulares mais simples
      const scale = Math.min(1, 1000 / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || '';
    };
  }

  scheduleNextScan() {
    this.scanTimer = setTimeout(() => this.scanForCodes(), SCAN_INTERVAL_MS);
  }

  async scanForCodes() {
    if (!this.isScanning || !this.videoElement || !this.detectQrCode) {
      return;
    }

    const video = this.videoElement;

    // O modal foi fechado: desliga a câmera
    if (!video.isConnected) {
      this.stopCamera();
      return;
    }

    if (video.readyState < 2) {
      this.scheduleNextScan();
      return;
    }

    try {
      const qrCode = (await this.detectQrCode(video))?.trim();

      if (qrCode) {
        const url = this.extractNotaUrl(qrCode);

        if (url) {
          this.lastScannedCode = url;
          await this.processNotaFiscal(url);
          return;
        }

        this.showScannerStatus('Esse QR Code não é de uma nota fiscal (NFC-e). Aponte para o QR Code impresso no cupom fiscal.');
      }
    } catch (error) {
      console.warn('⚠️ Falha ao detectar QR Code:', error);
    }

    if (this.isScanning) {
      this.scheduleNextScan();
    }
  }

  // O QR Code da NFC-e contém a URL de consulta da SEFAZ do estado
  extractNotaUrl(qrCode) {
    let value = String(qrCode || '').trim();

    if (!/^https?:\/\//i.test(value) && /^[\w.-]+\.gov\.br\//i.test(value)) {
      value = `https://${value}`;
    }

    try {
      const parsed = new URL(value);
      return /^https?:$/.test(parsed.protocol) ? value : '';
    } catch {
      return '';
    }
  }

  async processNotaFiscal(url) {
    this.stopCamera();
    this.showScannerStatus('QR Code lido! Processando a nota fiscal... (pode demorar até 1 minuto se o servidor estiver dormindo)');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NOTA_TIMEOUT_MS);

    try {
      let response;
      try {
        response = await fetch(NOTA_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url }),
          signal: controller.signal
        });
      } catch (error) {
        throw new Error(error?.name === 'AbortError'
          ? 'O servidor demorou demais para responder. Tente ler a nota novamente.'
          : 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
      }

      // Enquanto o Render acorda ele pode devolver uma página HTML em vez de JSON
      let data = null;
      try {
        data = await response.json();
      } catch {
        throw new Error('O servidor ainda está iniciando. Aguarde alguns segundos e leia a nota novamente.');
      }

      if (!response.ok || !data?.sucesso) {
        throw new Error(data?.erro || `Erro ao processar a nota (${response.status}).`);
      }

      const produtos = Array.isArray(data.produtos) ? data.produtos : [];

      if (!produtos.length) {
        throw new Error('Nenhum produto foi retornado pela nota fiscal.');
      }

      const adicionados = produtos
        .map((produto) => this.addToInventory(produto, { silent: true }))
        .filter(Boolean);

      if (window.saveAll) window.saveAll();
      if (window.renderList) window.renderList();

      this.showScannerStatus(`${adicionados.length} produto(s) adicionado(s) à despensa.`);
      this.showImportSummary(adicionados);
      setAlert('Todos os produtos da nota foram adicionados à despensa!', 'success');
    } catch (error) {
      const mensagem = error?.message || 'Erro ao processar a nota fiscal.';
      this.showScannerStatus(mensagem);
      this.showRetryButton();
      setAlert(mensagem, 'error');
    } finally {
      clearTimeout(timeout);
    }
  }

  showImportSummary(produtos) {
    const infoDiv = qs('#productInfo');
    if (!infoDiv) return;

    const items = produtos.map((p) => `
      <li style="padding: 6px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; gap: 8px;">
        <span style="text-transform: capitalize;">${escapeHtml(p.name)}</span>
        <span style="white-space: nowrap; color: #555;">${escapeHtml(p.qty)} ${escapeHtml(p.unit)}</span>
      </li>
    `).join('');

    infoDiv.innerHTML = `
      <ul style="list-style: none; padding: 0; margin: 16px 0 0; max-height: 280px; overflow-y: auto;">${items}</ul>
      <button id="scanAnotherNota" class="btn" style="width: 100%; margin-top: 12px;">Ler outra nota</button>
    `;
    qs('#scanAnotherNota')?.addEventListener('click', () => this.openScanner());
  }

  showRetryButton() {
    const infoDiv = qs('#productInfo');
    if (!infoDiv) return;

    infoDiv.innerHTML = '<button id="retryNota" class="btn" style="width: 100%; margin-top: 12px;">Tentar novamente</button>';
    qs('#retryNota')?.addEventListener('click', () => this.openScanner());
  }

  stopCamera() {
    this.isScanning = false;

    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.detectQrCode = null;
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
    // Sem código, não procura: senão casaria com qualquer item adicionado manualmente (sem barcode)
    if (!code) return null;
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
    const rawQty = Number(rawProduct.qty ?? fallback.qty ?? 0);
    // Unidade desconhecida (cx, pct...) é tratada como unidade, mantendo a quantidade
    const normalizedQty = normalizeUnit(rawQty, rawProduct.unit ?? fallback.unit ?? 'un') || { qty: rawQty || 0, unit: 'un' };
    const product = {
      category: this.normalizeCategory(rawProduct.category ?? fallback.category ?? 'outros'),
      name: this.normalizeText(rawProduct.name ?? fallback.name ?? ''),
      brand: this.normalizeText(rawProduct.brand ?? fallback.brand ?? ''),
      qty: normalizedQty.qty,
      unit: normalizedQty.unit,
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

      // Só soma quando a unidade é a mesma (não dá pra somar 500 g com 2 un)
      return existingName === incomingName && existingBrand === incomingBrand && item.unit === product.unit;
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

  // silent: usado na importação da nota, que salva e mostra o resumo uma vez só no final
  addToInventory(product, { silent = false } = {}) {
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

    if (silent) return normalizedProduct;

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