// Importa as ferramentas que vamos usar
import { qs } from './utils.js';
import { setAlert } from './ui.js';

// Verifica se o ZXing está disponível
function getZXing() {
  if (window.ZXing) {
    return Promise.resolve(window.ZXing);
  }
  
  return new Promise((resolve, reject) => {
    const checkZXing = () => {
      if (window.ZXing) {
        resolve(window.ZXing);
      } else {
        setTimeout(checkZXing, 100);
      }
    };
    checkZXing();
  });
}

// Cria a classe do leitor de códigos de barras
class BarcodeScanner {
  constructor() {
    this.modal = null;
    this.stream = null;
    this.codeReader = null;
    this.scanning = false;
    this.ready = this.initialize(); // Inicializa e armazena a promessa
  }

  async initialize() {
    try {
      const ZXing = await getZXing();
      this.codeReader = new ZXing.BrowserMultiFormatReader();
      console.log('Leitor de código de barras pronto!');
      this.init(); // Chama o init() original
      return this; // Retorna a instância quando estiver pronto
    } catch (error) {
      console.error('Erro ao carregar o ZXing:', error);
      setAlert('Erro ao carregar o leitor de códigos de barras', 'error');
      throw error; // Propaga o erro para quem chamou
    }
  }
  // Inicializa o leitor
  init() {
    this.createModal();       // Cria a janelinha
    this.setupEventListeners();  // Configura os botões
  }

  // Cria a janelinha do leitor
  createModal() {
    const modalHTML = `
      <div id="barcodeModal" class="modal-back">
        <div class="modal" style="max-width: 500px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0; color: var(--accent);">Ler Código de Barras</h3>
            <button id="closeBarcode" class="btn-ghost" style="padding: 4px 8px;">
              Fechar
            </button>
          </div>
          
          <div id="barcodeScanner" style="
            width: 100%;
            height: 300px;
            background: #f8f9fa;
            border-radius: 8px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--muted);
            border: 2px dashed #e0e0e0;
            overflow: hidden;
          ">
            <div style="text-align: center; padding: 16px;">
              <div style="font-size: 48px; margin-bottom: 8px;">📷</div>
              <p style="margin: 0;">Aguardando permissão da câmera...</p>
            </div>
          </div>
          
          <div style="display: flex; gap: 12px;">
            <button id="toggleCamera" class="btn" style="flex: 1;">
              Iniciar Câmera
            </button>
            <button id="scanButton" class="btn" style="flex: 1;" disabled>
              Ler Código
            </button>
          </div>
          
          <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; display: none;" id="resultContainer">
            <p style="margin: 0 0 8px 0; font-weight: 500;">Código lido:</p>
            <div id="barcodeResult" style="
              padding: 8px;
              background: white;
              border-radius: 4px;
              font-family: monospace;
              word-break: break-all;
            "></div>
          </div>
        </div>
      </div>
    `;

    // Adiciona a janelinha ao final da página
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = qs('#barcodeModal');
  }

  // Configura os botões
  setupEventListeners() {
    const closeBtn = qs('#closeBarcode', this.modal);
    const toggleCameraBtn = qs('#toggleCamera', this.modal);
    const videoElement = document.createElement('video');
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'cover';
    
    // Quando clicar em Fechar
    closeBtn.addEventListener('click', () => this.close());
    
    // Quando clicar em Iniciar/Parar Câmera
    toggleCameraBtn.addEventListener('click', async () => {
      try {
        if (this.stream) {
          await this.stopCamera();
          toggleCameraBtn.textContent = 'Iniciar Câmera';
          qs('#scanButton').disabled = true;
        } else {
          await this.startCamera(videoElement);
          toggleCameraBtn.textContent = 'Parar Câmera';
          qs('#scanButton').disabled = false;
        }
      } catch (error) {
        console.error('Erro na câmera:', error);
        setAlert(`Erro: ${error.message}`, 'error');
      }
    });
    
    // Quando clicar em Ler Código
    qs('#scanButton').addEventListener('click', () => {
      this.simulateBarcodeRead();
    });
  }

  // Inicia a câmera
  async startCamera(videoElement) {
    try {
      // Pede permissão para usar a câmera
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',  // Usa a câmera traseira
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      // Mostra o vídeo na tela
      const scannerElement = qs('#barcodeScanner');
      scannerElement.innerHTML = '';
      scannerElement.appendChild(videoElement);
      
      // Inicia o vídeo
      videoElement.srcObject = this.stream;
      await videoElement.play();
      
      // Começa a ler códigos
      this.startScanning(videoElement);
      
    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      throw new Error('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  }

  // Para a câmera
  async stopCamera() {
    this.stopScanning();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.updateScannerUI('Câmera desativada');
  }

  // Atualiza a mensagem na tela
  updateScannerUI(message) {
    const scannerElement = qs('#barcodeScanner');
    if (scannerElement) {
      scannerElement.innerHTML = `
        <div style="text-align: center; padding: 16px;">
          <div style="font-size: 48px; margin-bottom: 8px;">📷</div>
          <p style="margin: 0;">${message}</p>
        </div>
      `;
    }
  }

  // Inicia a leitura do código
  async startScanning(videoElement) {
    if (this.scanning) return;
    this.scanning = true;
    
    try {
      // Tenta ler o código de barras
      this.codeReader.decodeFromVideoElement(videoElement, (result, error) => {
        if (result) {
          // Se achou um código
          this.handleBarcode(result.text);
        }
        if (error && !(error.name === 'NotFoundException')) {
          console.error('Erro na leitura:', error);
        }
      });
    } catch (error) {
      console.error('Erro ao iniciar scanner:', error);
      setAlert('Erro ao iniciar o scanner de código de barras', 'error');
    }
  }

  // Para de ler códigos
  stopScanning() {
    this.scanning = false;
    this.codeReader.reset();
  }

  // Quando um código é lido
  handleBarcode(barcode) {
    console.log('Código de barras lido:', barcode);
    this.stopScanning();
    this.showResult(barcode);
    setAlert(`Código lido: ${barcode}`, 'success');
  }

  // Mostra o resultado na tela
  showResult(barcode) {
    const resultContainer = qs('#resultContainer', this.modal);
    const barcodeResult = qs('#barcodeResult', this.modal);
    
    barcodeResult.textContent = barcode;
    resultContainer.style.display = 'block';
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Função de simulação (para teste)
  simulateBarcodeRead() {
    const barcode = '7891234567890';  // Código de teste
    this.handleBarcode(barcode);
  }

  // Abre a janelinha
  open() {
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  // Fecha a janelinha
  close() {
    this.stopCamera();
    this.modal.style.display = 'none';
    document.body.style.overflow = '';
    
    // Limpa os resultados
    const resultContainer = qs('#resultContainer', this.modal);
    const barcodeResult = qs('#barcodeResult', this.modal);
    if (resultContainer) resultContainer.style.display = 'none';
    if (barcodeResult) barcodeResult.textContent = '';
  }
}

// Cria uma única instância do leitor
export const barcodeScanner = new BarcodeScanner();