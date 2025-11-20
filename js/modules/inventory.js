// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { openModal, setAlert } from './ui.js';
if (!window.Quagga) {
  console.error('Erro: A biblioteca Quagga não foi carregada corretamente');
}
export function showInventory() {
  const html = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px">
        <input id="m_invLine" placeholder="ex: arroz,2,kg" style="flex:1" />
        <button id="m_addInv" class="btn-ghost">Adicionar</button>
      </div>
      <button id="m_scanBarcode" class="btn" style="width:100%">
        <span style="display:flex;align-items:center;justify-content:center;gap:8px">
          📷 Ler Código de Barras
        </span>
      </button>
    </div>
    <label style="margin-top:8px">Cole várias linhas</label>
    <textarea id="m_invBulk" rows="6" placeholder="arroz,2,kg\nleite,2,l"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="m_paste" class="btn">Adicionar todas</button>
      <button id="m_clearInv" class="btn-ghost">Limpar</button>
    </div>
    <div id="m_invList" class="list" style="margin-top:12px"></div>
  `;
  
  openModal('Dispensa', html);
  renderList();
  
  // Adiciona o evento do botão de escanear
  document.getElementById('m_scanBarcode').addEventListener('click', startBarcodeScanner);
}
function renderList() {
  const el = qs('#m_invList'); 
  el.innerHTML = '';
  
  if (window.inventory.length === 0) {
    el.innerHTML = '<div class="small">Sem itens</div>';
    return;
  }
  
  window.inventory.forEach((item, idx) => {
    const node = document.createElement('div'); 
    node.className = 'item';
    node.innerHTML = `
      <div style="max-width:70%">
        <strong style="text-transform:capitalize">${item.name}</strong>
        <div class="small">${item.qty} ${item.unit}</div>
      </div>
      <div>
        <button data-idx="${idx}" class="btn-ghost">Remover</button>
      </div>
    `;
    el.appendChild(node);
  });

  // Eventos dos botões de remover
  el.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const name = window.inventory[idx]?.name || 'item';
      window.inventory.splice(idx, 1);
      window.saveAll();
      renderList();
      setAlert(`Item removido: ${name}`);
    });
  });
}
// Função para iniciar o scanner de código de barras
function startBarcodeScanner() {
  const modalContent = `
    <div id="barcode-scanner" style="width:100%;height:300px;background:#000;position:relative;margin-bottom:16px">
      <div id="interactive" class="viewport" style="width:100%;height:100%"></div>
      <button id="stopScanner" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.7);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer">×</button>
    </div>
    <div id="productInfo" style="display:none">
      <h3 id="productName"></h3>
      <p id="productBrand"></p>
      <div style="display:flex;gap:8px;margin-top:16px">
        <input type="number" id="productQty" value="1" min="1" style="width:80px" />
        <select id="productUnit" style="flex:1">
          <option value="un">Unidade</option>
          <option value="g">Gramas</option>
          <option value="kg">Quilogramas</option>
          <option value="ml">Mililitros</option>
          <option value="l">Litros</option>
        </select>
        <button id="addScannedProduct" class="btn">Adicionar</button>
      </div>
    </div>
    <div id="scannerError" style="color:red;margin-top:8px;display:none"></div>
  `;

  openModal('Escanear Código de Barras', modalContent);
  
  console.log('Iniciando scanner...');
  console.log('Elemento #interactive encontrado:', !!document.querySelector('#interactive'));
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('Seu navegador não suporta a API de mídia necessária');
    return;
  }

  const config = {
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.querySelector('#interactive'),
      constraints: {
        width: 640,
        height: 480,
        facingMode: "environment"
      },
    },
    locator: {
      patchSize: "large",
      halfSample: true
    },
    decoder: {
      readers: ["ean_reader", "code_128_reader"]
    },
    debug: {
      drawBoundingBox: true,
      showGrid: true,
      showPatches: true,
      showFoundPatches: true,
      showSkeleton: true
    }
  };

  console.log('Inicializando Quagga...');
  Quagga.init(config, function(err) {
    if (err) {
      console.error('Erro ao inicializar Quagga:', err);
      return;
    }
    
    console.log('Quagga inicializado. Iniciando scanner...');
    Quagga.start();
    
    // Contador de frames processados
    let frameCount = 0;
    Quagga.onProcessed(function(result) {
      frameCount++;
      if (frameCount % 10 === 0) {
        console.log('Frames processados:', frameCount);
      }
    });

    // Único manipulador de detecção
    Quagga.onDetected(async function(result) {
      console.log('Código detectado!', result);
      if (!result || !result.codeResult) {
        console.error('Nenhum código válido detectado');
        return;
      }

      const code = result.codeResult.code;
      console.log("Código detectado:", code);
      
      // Para a câmera
      Quagga.stop();
      document.getElementById('interactive').style.display = 'none';
      document.getElementById('stopScanner').style.display = 'none';
      
      try {
        console.log('Buscando produto na API...');
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        console.log('Resposta da API:', response.status);
        const data = await response.json();
        
        if (data.status === 1) {
          const product = data.product;
          document.getElementById('productInfo').style.display = 'block';
          document.getElementById('productName').textContent = product.product_name || 'Produto não identificado';
          document.getElementById('productBrand').textContent = product.brands || '';
          
          // Configura o botão de adicionar
          document.getElementById('addScannedProduct').onclick = () => {
            const qty = document.getElementById('productQty').value;
            const unit = document.getElementById('productUnit').value;
            const name = product.product_name || 'Produto desconhecido';
            
            window.inventory.push({ name, qty: parseFloat(qty), unit });
            localStorage.setItem('inventory', JSON.stringify(window.inventory));
            
            // Fecha o modal e atualiza a lista
            document.querySelector('.modal-back').click();
            showInventory();
            setAlert('Produto adicionado com sucesso!', 'success');
          };
        } else {
          throw new Error('Produto não encontrado');
        }
      } catch (error) {
        console.error('Erro ao buscar produto:', error);
        document.getElementById('scannerError').textContent = 
          'Não foi possível encontrar o produto. Por favor, adicione manualmente.';
        document.getElementById('scannerError').style.display = 'block';
        
        document.getElementById('productInfo').style.display = 'block';
        document.getElementById('productName').textContent = 'Produto não encontrado';
        document.getElementById('productBrand').textContent = 'Adicione as informações manualmente';
        
        document.getElementById('addScannedProduct').onclick = () => {
          const qty = document.getElementById('productQty').value;
          const unit = document.getElementById('productUnit').value;
          const name = prompt('Digite o nome do produto:') || 'Produto desconhecido';
          
          if (name) {
            window.inventory.push({ name, qty: parseFloat(qty), unit });
            localStorage.setItem('inventory', JSON.stringify(window.inventory));
            document.querySelector('.modal-back').click();
            showInventory();
            setAlert('Produto adicionado com sucesso!', 'success');
          }
        };
      }
    });
  });

  // Botão para parar o scanner
  document.getElementById('stopScanner').addEventListener('click', () => {
    Quagga.stop();
    document.querySelector('.modal-back').click();
  });
}

// Adicionar item único
document.addEventListener('click', (e) => {
  if (e.target.id === 'm_addInv') {
    const input = qs('#m_invLine').value.trim();
    if (!input) return alert('Digite: nome,quantidade,unidade');
    
    const item = parseLine(input);
    if (!item) return alert('Formato inválido. Use: nome,quantidade,unidade');
    
    window.inventory.push(item);
    window.saveAll();
    qs('#m_invLine').value = '';
    renderList();
    setAlert(`Item adicionado: ${item.name}`);
  }

  // Adicionar vários itens
  if (e.target.id === 'm_paste') {
    const text = qs('#m_invBulk').value.trim();
    if (!text) return alert('Cole as linhas com os itens');
    
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    
    let added = 0;
    lines.forEach(line => {
      const item = parseLine(line);
      if (item) {
        window.inventory.push(item);
        added++;
      }
    });
    
    window.saveAll();
    qs('#m_invBulk').value = '';
    renderList();
    setAlert(`Adicionados ${added} itens`);
  }

  // Limpar inventário
  if (e.target.id === 'm_clearInv') {
    if (!confirm('Tem certeza que deseja limpar todo o inventário?')) return;
    window.inventory = [];
    window.saveAll();
    renderList();
    setAlert('Inventário limpo');
  }
});