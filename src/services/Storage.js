/**
 * StorageService - Centraliza todas as operações de localStorage
 * Responsável por salvar, carregar e validar dados do aplicativo
 */
export class StorageService {
  // Chaves do localStorage
  static KEYS = {
    INVENTORY: 'cc_inv_pwa',
    RECIPES: 'cc_rec_pwa',
    PLAN: 'cc_plan_pwa'
  };

  /**
   * Valida dados JSON recuperados do localStorage
   * @param {string} data - Dados string do localStorage
   * @param {Array} defaultReturn - Valor padrão caso dados sejam inválidos
   * @returns {Array} Dados validados ou valor padrão
   */
  static validateJSON(data, defaultReturn = []) {
    try {
      if (!data || data === 'null' || data === 'undefined') return defaultReturn;
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : defaultReturn;
    } catch (e) {
      console.warn('Dados corrompidos no localStorage, usando valores padrão:', e);
      return defaultReturn;
    }
  }

  /**
   * Carrega todos os dados do localStorage
   * @returns {Object} Objeto com inventory, recipes e plan
   */
  static loadAll() {
    return {
      inventory: this.validateJSON(localStorage.getItem(this.KEYS.INVENTORY)),
      recipes: this.validateJSON(localStorage.getItem(this.KEYS.RECIPES)),
      plan: this.validateJSON(localStorage.getItem(this.KEYS.PLAN))
    };
  }

  /**
   * Salva todos os dados no localStorage
   * @param {Object} data - Objeto com inventory, recipes e plan
   * @returns {boolean} True se sucesso, false se erro
   */
  static saveAll(data) {
    try {
      localStorage.setItem(this.KEYS.INVENTORY, JSON.stringify(data.inventory || []));
      localStorage.setItem(this.KEYS.RECIPES, JSON.stringify(data.recipes || []));
      localStorage.setItem(this.KEYS.PLAN, JSON.stringify(data.plan || []));
      return true;
    } catch (e) {
      console.error('Erro ao salvar dados:', e);
      return false;
    }
  }

  /**
   * Salva apenas o inventário
   * @param {Array} inventory - Array de itens do inventário
   */
  static saveInventory(inventory) {
    try {
      localStorage.setItem(this.KEYS.INVENTORY, JSON.stringify(inventory));
      return true;
    } catch (e) {
      console.error('Erro ao salvar inventário:', e);
      return false;
    }
  }

  /**
   * Salva apenas as receitas
   * @param {Array} recipes - Array de receitas
   */
  static saveRecipes(recipes) {
    try {
      localStorage.setItem(this.KEYS.RECIPES, JSON.stringify(recipes));
      return true;
    } catch (e) {
      console.error('Erro ao salvar receitas:', e);
      return false;
    }
  }

  /**
   * Salva apenas o plano
   * @param {Array} plan - Array do plano de refeições
   */
  static savePlan(plan) {
    try {
      localStorage.setItem(this.KEYS.PLAN, JSON.stringify(plan));
      return true;
    } catch (e) {
      console.error('Erro ao salvar plano:', e);
      return false;
    }
  }

  /**
   * Limpa todos os dados do localStorage
   */
  static clearAll() {
    Object.values(this.KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }

  /**
   * Verifica o espaço disponível no localStorage
   * @returns {boolean} True se há espaço disponível
   */
  static getAvailableSpace() {
    try {
      const test = 'test';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }
}