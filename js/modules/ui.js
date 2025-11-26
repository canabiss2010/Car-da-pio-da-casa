import { qs } from './utils.js';

let modalBack, modalContent, alertsEl, loadingElement;

export function initUI() {
  modalBack = qs('#modalBack');
  modalContent = qs('#modalContent');
  alertsEl = qs('#alerts');
}

export function openModal(title, contentHTML) {
  if (!modalBack || !modalContent) initUI();

  closeModal();
  
  modalContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2 style="margin:0">${title}</h2>
      <button id="closeModal" class="btn-ghost">Fechar</button>
    </div>
    <div style="margin-top:12px">${contentHTML}</div>
  `;
  
  modalBack.style.display = 'flex';
  qs('#closeModal')?.addEventListener('click', closeModal);
}

export function closeModal() {
  if (modalBack) modalBack.style.display = 'none';
  if (modalContent) modalContent.innerHTML = '';
}

export function setAlert(text, level = 'info') {
  if (!alertsEl) initUI();
  const colors = { info: '#134e3a', warn: '#b47c00', error: 'crimson' };
  const node = document.createElement('div');
  node.textContent = text;
  node.style.marginTop = '6px';
  node.style.color = colors[level] || colors.info;
  alertsEl.prepend(node);
}

export function showLoading() {
  if (!loadingElement) {
    loadingElement = document.createElement('div');
    loadingElement.id = 'loading';
    loadingElement.style.position = 'fixed';
    loadingElement.style.top = '50%';
    loadingElement.style.left = '50%';
    loadingElement.style.transform = 'translate(-50%, -50%)';
    loadingElement.style.padding = '20px';
    loadingElement.style.background = 'rgba(0,0,0,0.7)';
    loadingElement.style.color = 'white';
    loadingElement.style.borderRadius = '5px';
    loadingElement.style.zIndex = '1000';
    loadingElement.textContent = 'Carregando...';
    document.body.appendChild(loadingElement);
  } else {
    loadingElement.style.display = 'block';
  }
}

export function hideLoading() {
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
}