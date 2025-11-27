// Importa as ferramentas necessárias
import { qs } from './utils.js';
import { setAlert } from './ui.js';

class BarcodeScanner {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.modal = null;
  }

  // Método principal para abrir o leitor
  async open() {
    try {
      // Verifica se já tem permissão ou solicita
      const hasPermission = await this.checkCameraPermission();
      if (!hasPermission) {
        setAlert('Permissão para o uso da câmera negada, tente novamente', 'error');
        return;
      }

      // Cria o modal se não existir
      if (!this.modal) {
        this.createModal();
      } else {
        this.modal.style.display = 'flex';
      }

      // Inicia a câmera
      await this.startCamera();

      // Ajusta a qualidade após 2 segundos
      setTimeout(() => {
        this.improveCameraQuality();
      }, 2000);

    } catch (error) {
      console.error('Erro ao abrir o leitor:', error);
      setAlert('Não foi possível acessar a câmera', 'error');
    }
  }

  // Verifica ou solicita permissão da câmera
  async checkCameraPermission() {
    try {
      const permissionResult = await navigator.permissions.query({ name: 'camera' });
      if (permissionResult.state === 'denied') {
        return false;
      }
      return true;
    } catch (error) {
      // Se a API de permissões não estiver disponível, tenta acessar a câmera diretamente
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch {
        return false;
      }
    }
  }

  // Cria a estrutura do modal
  createModal() {
    const modalHTML = `
      <div id="barcodeModal" class="modal-back" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center;">
        <div style="background: white; border-radius: 12px; width: 90%; max-width: 500px; padding: 20px; position: relative;">
          <button id="closeBarcode" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 20px; cursor: pointer;">✕</button>
          
          <h3 style="margin: 0 0 15px 0; color: #333;">Ler Código de Barras</h3>
          
          <div id="barcodeViewport" style="width: 100%; height: 300px; background: #000; border-radius: 8px; overflow: hidden; margin-bottom: 15px; position: relative;">
            <video id="barcodeVideo" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
            <div id="barcodeOverlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); color: white; font-size: 18px;">
              Iniciando câmera...
            </div>
          </div>
          
          <button id="captureBtn" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <span>Ler Código</span> 📷
          </button>
          
          <div id="resultArea" style="margin-top: 15px; padding: 10px; border-radius: 6px; background: #f5f5f5; min-height: 24px; display: none;">
            <!-- Aqui será exibido o resultado -->
          </div>
        </div>
      </div>
    `;

    // Adiciona o modal ao final do body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('barcodeModal');
    
    // Configura os eventos
    this.setupModalEvents();
  }

  // Configura os eventos do modal
  setupModalEvents() {
    // Fechar modal
    document.getElementById('closeBarcode').addEventListener('click', () => this.close());
    
    // Capturar código
    document.getElementById('captureBtn').addEventListener('click', () => this.captureAndDecode());
    
    // Fechar ao clicar fora
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });
  }

  // Inicia a câmera
  async startCamera() {
    try {
      this.videoElement = document.getElementById('barcodeVideo');
      const overlay = document.getElementById('barcodeOverlay');
      
      // Para a câmera se já estiver ativa
      if (this.stream) {
        this.stopCamera();
      }

      // Inicia a câmera traseira
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      // Mostra o vídeo
      this.videoElement.srcObject = this.stream;
      overlay.textContent = 'Ajustando câmera...';

      // Quando o vídeo estiver pronto
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play().then(resolve);
        };
      });

      // Esconde o overlay quando o vídeo estiver rodando
      overlay.style.display = 'none';

    } catch (error) {
      console.error('Erro ao iniciar a câmera:', error);
      throw error;
    }
  }

  // Melhora a qualidade da câmera após iniciar
  async improveCameraQuality() {
    if (!this.stream) return;
    
    try {
      const track = this.stream.getVideoTracks()[0];
      if (!track) return;

      // Tenta ajustar o foco
      if (track.getCapabilities().focusMode) {
        await track.applyConstraints({
          advanced: [{
            focusMode: 'continuous',
            exposureMode: 'continuous'
          }]
        });
      }

      // Ajusta o zoom para melhorar a leitura
      if (track.getCapabilities().zoom) {
        const zoom = Math.min(2, track.getCapabilities().zoom.max || 2);
        await track.applyConstraints({
          advanced: [{ zoom }]
        });
      }

    } catch (error) {
      console.warn('Não foi possível ajustar a qualidade da câmera:', error);
    }
  }

  // Captura e decodifica a imagem
  async captureAndDecode() {
    const resultArea = document.getElementById('resultArea');
    const captureBtn = document.getElementById('captureBtn');
    const overlay = document.getElementById('barcodeOverlay');
    const originalText = captureBtn.innerHTML;
    
    try {
      // Mostra feedback visual
      captureBtn.disabled = true;
      captureBtn.innerHTML = '<span>Processando...</span> 🔄';
      resultArea.style.display = 'none';

      // Mostra o loader
      overlay.innerHTML = `
        <div class="coffee" style="margin-bottom: 10px;">
          <div></div>
          <div></div>
          <div></div>
        </div>
        <div>Processando código de barras...</div>
      `;
      overlay.style.display = 'flex';

      // Cria um canvas para capturar o frame
      const canvas = document.createElement('canvas');
      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

      // Tenta decodificar o código de barras
      const code = await this.decodeBarcode(canvas);
      
      if (code) {
        // Sucesso
        console.log('Código lido com sucesso:', code);
        resultArea.textContent = `Código: ${code}`;
        resultArea.style.color = 'green';
      } else {
        // Falha
        console.log('Não foi possível ler o código');
        resultArea.textContent = 'Tente novamente';
        resultArea.style.color = 'red';
      }

      resultArea.style.display = 'block';

    } catch (error) {
      console.error('Erro ao processar a imagem:', error);
      resultArea.textContent = 'Erro ao processar a imagem';
      resultArea.style.color = 'red';
      resultArea.style.display = 'block';
    } finally {
      // Esconde o loader e restaura o botão
      overlay.style.display = 'none';
      captureBtn.disabled = false;
      captureBtn.innerHTML = originalText;
    }
  }

async decodeBarcode(canvas, attempt = 1, maxAttempts = 3) {
  try {
    // Tenta carregar o ZXing se não estiver disponível
    if (!window.ZXing) {
      await this.loadZXing();
      await new Promise(resolve => setTimeout(resolve, 500)); // Aumentei o tempo de espera
    }

    if (typeof window.ZXing === 'undefined') {
      throw new Error('ZXing não foi carregado corretamente');
    }

    // Cria uma cópia do canvas para manipulação
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    
    // Aplica um filtro de contraste melhorado
    tempCtx.drawImage(canvas, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    
    // Aumenta o contraste
    const contrast = 1.5; // Ajuste este valor conforme necessário
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      // Ajusta o contraste
      data[i] = factor * (data[i] - 128) + 128;
      data[i + 1] = factor * (data[i + 1] - 128) + 128;
      data[i + 2] = factor * (data[i + 2] - 128) + 128;
      
      // Converte para escala de cinza
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = data[i + 1] = data[i + 2] = avg;
    }
    
    tempCtx.putImageData(imageData, 0, 0);

    // Tenta decodificar
    try {
      const zxing = window.ZXing.BrowserQRCodeReader ? window.ZXing : await window.ZXing();
      const reader = new zxing.BrowserQRCodeReader();
      
      // Usa o canvas temporário para a leitura
      const result = await reader.decodeFromImage(
        null,
        tempCanvas.toDataURL('image/png', 1.0) // Qualidade máxima
      );
      
      if (result?.text) {
        return result.text;
      }
      throw new Error('Nenhum código de barras encontrado');
      
    } catch (decodeError) {
      // Se falhar e ainda tiver tentativas, tenta novamente
      if (attempt < maxAttempts) {
        console.log(`Tentativa ${attempt} falhou, tentando novamente...`);
        await new Promise(resolve => setTimeout(resolve, 300)); // Aumentei o tempo entre tentativas
        return this.decodeBarcode(canvas, attempt + 1, maxAttempts);
      }
      throw new Error('Não foi possível ler o código de barras. Tente aproximar mais o código da câmera e garantir boa iluminação.');
    }

  } catch (error) {
    console.error('Erro ao decodificar:', error);
    const overlay = document.getElementById('barcodeOverlay');
    if (overlay) {
      overlay.innerHTML = `
        <div style="text-align: center; color: white;">
          <div>${error.message.includes('Nenhum código') ? 'Nenhum código de barras encontrado' : 'Erro ao processar o código'}</div>
          <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; background: var(--accent); color: white; font-weight: bold;">
            Tentar Novamente
          </button>
        </div>
      `;
    }
    return null;
  }
}

async loadZXing() {
  return new Promise((resolve, reject) => {
    if (window.ZXing) return resolve();
    
    const script = document.createElement('script');
    script.src = './js/lib/zxing.min.js';
    script.onload = () => {
      setTimeout(() => {
        if (window.ZXing) {
          resolve();
        } else {
          reject(new Error('ZXing não foi carregado corretamente'));
        }
      }, 100);
    };
    script.onerror = () => {
      console.error('Falha ao carregar o ZXing local');
      reject(new Error('Não foi possível carregar o leitor de código de barras'));
    };
    document.body.appendChild(script);
  });
}

  // Para a câmera e limpa os recursos
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  // Fecha o modal
  close() {
    this.stopCamera();
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }
}

// Exporta uma única instância do scanner
export const barcodeScanner = new BarcodeScanner();