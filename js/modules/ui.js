import { qs } from './utils.js';

let modalBack, modalContent, alertsEl, loadingOverlay;

const UI = {
  initUI() {
    modalBack = qs('#modalBack') || document.createElement('div');
    modalContent = qs('#modalContent') || document.createElement('div');
    alertsEl = qs('#alerts') || document.createElement('div');
    loadingOverlay = qs('#loading-overlay');
    
    // Garante que os elementos existam no DOM
    if (!document.body.contains(modalBack)) {
      modalBack.id = 'modalBack';
      modalBack.style.display = 'none';
      modalBack.style.position = 'fixed';
      modalBack.style.top = '0';
      modalBack.style.left = '0';
      modalBack.style.right = '0';
      modalBack.style.bottom = '0';
      modalBack.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      modalBack.style.justifyContent = 'center';
      modalBack.style.alignItems = 'center';
      modalBack.style.zIndex = '1000';
      document.body.appendChild(modalBack);
    }
    
    if (!document.body.contains(modalContent)) {
      modalContent.id = 'modalContent';
      modalContent.style.background = 'white';
      modalContent.style.padding = '20px';
      modalContent.style.borderRadius = '8px';
      modalContent.style.maxWidth = '90%';
      modalContent.style.maxHeight = '90vh';
      modalContent.style.overflow = 'auto';
      modalBack.appendChild(modalContent);
    }
    
    if (!document.body.contains(alertsEl)) {
      alertsEl.id = 'alerts';
      alertsEl.style.position = 'fixed';
      alertsEl.style.top = '20px';
      alertsEl.style.right = '20px';
      alertsEl.style.zIndex = '1001';
      document.body.appendChild(alertsEl);
    }
  },

  openModal(title, contentHTML) {
    if (!modalBack || !modalContent) this.initUI();
    
    // Fecha a modal se já estiver aberta para evitar múltiplos listeners
    this.closeModal();
    
    // Cria o conteúdo da modal
    modalContent.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0">${title}</h2>
        <button id="closeModal" class="btn-ghost" aria-label="Fechar">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div style="margin-top:12px">${contentHTML}</div>
    `;
    
    // Exibe a modal
    modalBack.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Impede rolagem da página
    
    // Adiciona evento de clique no botão de fechar
    const closeButton = qs('#closeModal');
    if (closeButton) {
      closeButton.addEventListener('click', this.closeModal.bind(this));
    }
    
    // Fecha ao clicar fora do conteúdo da modal
    const handleOutsideClick = (e) => {
      if (e.target === modalBack) {
        this.closeModal();
      }
    };
    modalBack.addEventListener('click', handleOutsideClick);
    
    // Fecha ao pressionar ESC
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    };
    document.addEventListener('keydown', handleEsc);
    
    // Remove os event listeners quando a modal for fechada
    const cleanup = () => {
      if (closeButton) closeButton.removeEventListener('click', this.closeModal.bind(this));
      modalBack.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = ''; // Restaura rolagem da página
    };
    
    // Adiciona o cleanup como propriedade para ser chamado pelo closeModal
    modalBack._cleanup = cleanup;
  },

  closeModal() {
    if (!modalBack) return;
    
    // Executa o cleanup se existir
    if (typeof modalBack._cleanup === 'function') {
      modalBack._cleanup();
      delete modalBack._cleanup;
    }
    
    // Esconde a modal e limpa o conteúdo
    modalBack.style.display = 'none';
    if (modalContent) {
      modalContent.innerHTML = '';
    }
    
    // Remove o estado de foco do botão que abriu a modal
    document.activeElement?.blur();
  },

  showLoading(message = 'Carregando...') {
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.style.position = 'fixed';
      loadingOverlay.style.top = '0';
      loadingOverlay.style.left = '0';
      loadingOverlay.style.right = '0';
      loadingOverlay.style.bottom = '0';
      loadingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      loadingOverlay.style.display = 'flex';
      loadingOverlay.style.justifyContent = 'center';
      loadingOverlay.style.alignItems = 'center';
      loadingOverlay.style.flexDirection = 'column';
      loadingOverlay.style.zIndex = '9999';
      loadingOverlay.style.color = 'white';
      
      const spinner = document.createElement('div');
      spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
      spinner.style.borderRadius = '50%';
      spinner.style.borderTop = '4px solid #fff';
      spinner.style.width = '40px';
      spinner.style.height = '40px';
      spinner.style.animation = 'spin 1s linear infinite';
      spinner.style.marginBottom = '1rem';
      
      const text = document.createElement('div');
      text.id = 'loading-text';
      text.textContent = message;
      
      loadingOverlay.appendChild(spinner);
      loadingOverlay.appendChild(text);
      document.body.appendChild(loadingOverlay);
      
      // Adiciona a animação de spin
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    } else {
      const text = loadingOverlay.querySelector('#loading-text');
      if (text) text.textContent = message;
      loadingOverlay.style.display = 'flex';
    }
  },

  hideLoading() {
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  },

  setAlert(text, level = 'info') {
    if (!alertsEl) this.initUI();
    
    const colors = { 
      info: '#134e3a', 
      success: '#2e7d32',
      warn: '#b47c00', 
      error: 'crimson' 
    };
    
    const node = document.createElement('div');
    node.className = 'alert';
    node.setAttribute('role', 'alert');
    node.style.marginTop = '8px';
    node.style.padding = '8px 12px';
    node.style.borderRadius = '4px';
    node.style.background = colors[level] || colors.info;
    node.style.color = 'white';
    node.style.transition = 'opacity 0.3s ease';
    node.textContent = text;
    
    // Adiciona o alerta
    alertsEl.prepend(node);
    
    // Remove o alerta após 5 segundos
    setTimeout(() => {
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 300);
    }, 5000);
  }
};

// Exporta o objeto UI com todas as funções
export { UI };