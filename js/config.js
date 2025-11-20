// Constantes de armazenamento
export const STORAGE_KEYS = {
  INVENTORY: 'cc_inv_pwa',
  RECIPES: 'cc_rec_pwa',
  PLAN: 'cc_plan_pwa'
};

// Densidades para conversão de unidades
export const DENSITIES = {
  "água": 1, "agua": 1, "leite": 1, "oleo": 0.92, "óleo": 0.92, 
  "acucar": 0.85, "açúcar": 0.85, "farinha": 0.53, "farinha de trigo": 0.53,
  "arroz": 0.85, "feijao": 0.7, "carne moida": 0.95, "carne moída": 0.95,
  "batata": 0.65, "tomate": 0.95, "aipim": 0.6, "mandioquinha": 0.6,
  "óleo vegetal": 0.92, "manteiga": 0.96, "creme de leite": 1.01,
  "iogurte": 1.03, "queijo ralado": 0.32, "açúcar cristal": 0.85,
  "acucar cristal": 0.85, "cafe moido": 0.5, "sal": 1.2,
  "cebola": 0.64, "alho": 0.6, "atum": 0.8, "milho": 0.72, "ervilha": 0.72
};

// Conversões padrão
export const DEFAULTS = {
  conv: { 
    kg_to_g: 1000, 
    g_to_mg: 1000, 
    l_to_ml: 1000, 
    cup_ml: 240, 
    tbsp_ml: 15, 
    tsp_ml: 5 
  }
};