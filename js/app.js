console.log('app.js realmente carregou!');
// ================================================
// CARDÁPIO DA CASA - PWA
// Aplicativo para planejamento de refeições
// Versão: 7 corrigido
// Storage: cc_inv_pwa, cc_rec_pwa, cc_plan_pwa
// ================================================

// ================================================
// VARIÁVEIS GLOBAIS E UTILITÁRIOS
// ================================================
const qs = s => document.querySelector(s);

// ================================================
// SEÇÃO: DENSIDADES E CONVERSÕES DE UNIDADES
// Usadas para converter ingredientes entre diferentes unidades
// ================================================
const densities = {
  "água":1,"agua":1,"leite":1,"oleo":0.92,"óleo":0.92,"acucar":0.85,"açúcar":0.85,"farinha":0.53,"farinha de trigo":0.53,
  "arroz":0.85,"feijao":0.7,"carne moida":0.95,"carne moída":0.95,"batata":0.65,"tomate":0.95,"aipim":0.6,"mandioquinha":0.6,
  "óleo vegetal":0.92,"manteiga":0.96,"creme de leite":1.01,"iogurte":1.03,"queijo ralado":0.32,"açúcar cristal":0.85,
  "acucar cristal":0.85,"cafe moido":0.5,"sal":1.2,"cebola":0.64,"alho":0.6,"atum":0.8,"milho":0.72,"ervilha":0.72
};

const defaults = {
  conv: { kg_to_g:1000, g_to_mg:1000, l_to_ml:1000, cup_ml:240, tbsp_ml:15, tsp_ml:5 }
};

// ================================================
// SEÇÃO: FUNÇÕES HELPER - UTILITÁRIOS GERAIS
// Funções auxiliares para processamento de dados
// ================================================

/**
 * Normaliza unidades de medida para formato padrão
 * @param {string} u - Unidade de medida original
 * @return {string} Unidade normalizada
 */
function normalizeUnit(u){
  if(!u) return 'un';
  const key = u.toString().toLowerCase().replace(/\s+/g,'').replace(/[.,]/g,'').trim();
  const map = {'kg':'kg','kilo':'kg','g':'g','grama':'g','gr':'g','l':'l','litro':'l','ml':'ml','xic':'xic','xicara':'xic','xícara':'xic','cs':'cs','colher_sopa':'cs','ch':'ch','colher_cha':'ch','un':'un','lat':'lat','cx':'cx','caixa':'cx','pacote':'pacote'};
  return map[key]||key;
}

/**
 * Processa linha de texto no formato "nome,quantidade,unidade"
 * @param {string} line - Linha a ser processada
 * @return {object|null} Objeto com {name, qty, unit} ou null se inválido
 */
function parseLine(line){
  const parts = line.split(',').map(s=>s.trim()).filter(Boolean);
  if(parts.length===0) return null;
  if(parts.length===1) return {name:parts[0].toLowerCase(), qty:1, unit:'un'};
  const qty = parseFloat(parts[1]) || 0;
  return {name:parts[0].toLowerCase(), qty:qty, unit:normalizeUnit(parts[2]||'un')};
}

/**
 * Retorna densidade para um ingrediente específico
 * @param {string} name - Nome do ingrediente
 * @return {number|null} Densidade ou null se não encontrada
 */
function densityFor(name){
  if(!name) return null;
  const k = name.toLowerCase().trim();
  if(densities[k]!=null) return densities[k];
  const alt = k.replace(/\s+s$/,'');
  if(densities[alt]!=null) return densities[alt];
  return null;
}

/**
 * Converte quantidade para gramas
 * @param {number} qty - Quantidade original
 * @param {string} unit - Unidade original
 * @param {string} name - Nome do ingrediente (para densidade)
 * @return {number|null} Valor em gramas ou null se não conversível
 */
function toGrams(qty, unit, name){ 
  if(qty==null || isNaN(qty)) return null;
  const u = normalizeUnit(unit||'un');
  const c = defaults.conv;
  if(u==='g') return qty;
  if(u==='kg') return qty * c.kg_to_g;
  if(u==='mg') return qty / c.g_to_mg;
  if(u==='ml'){ const d = densityFor(name); return d!=null? qty * d : null; }
  if(u==='l'){ const ml = qty * c.l_to_ml; const d = densityFor(name); return d!=null? ml * d : null; }
  if(u==='xic'){ const ml = qty * c.cup_ml; const d = densityFor(name); return d!=null? ml * d : null; }
  if(u==='cs'){ const ml = qty * c.tbsp_ml; const d = densityFor(name); return d!=null? ml * d : null; }
  if(u==='ch'){ const ml = qty * c.tsp_ml; const d = densityFor(name); return d!=null? ml * d : null; }
  return null;
}

// ================================================
// SEÇÃO: FUNÇÕES DE PLANEJAMENTO E CÁLCULO
// Lógica para verificar disponibilidade e consumir ingredientes
// ================================================

/**
 * Verifica se há ingredientes suficientes para cozinhar
 * @param {object} rec - Receita a ser verificada
 * @param {array} invCopy - Cópia do inventário
 * @param {number} cookingsNeeded - Quantidade de cozimentos necessários
 * @return {boolean} True se possível cozinhar
 */
function canCookForSlots(rec, invCopy, cookingsNeeded){
  for(const ing of rec.ingredients){
    const needTotalQty = ing.qty * cookingsNeeded;
    const needG = toGrams(needTotalQty, ing.unit, ing.name);
    if(needG!=null){
      const found = invCopy.find(x=>x.name.toLowerCase()===ing.name.toLowerCase());
      const haveG = found? toGrams(found.qty, found.unit, found.name) : null;
      if(haveG==null || haveG + 1e-9 < needG) return false;
    } else {
      const found = invCopy.find(x=>x.name.toLowerCase()===ing.name.toLowerCase() && x.unit === ing.unit);
      if(!found || found.qty + 1e-9 < needTotalQty) return false;
    }
  }
  return true;
}

/**
 * Consome ingredientes do inventário após cozimento
 * @param {object} rec - Receita utilizada
 * @param {array} invCopy - Cópia do inventário
 * @param {number} cookingsNeeded - Quantidade de cozimentos
 * @return {array} Inventário atualizado
 */
function consumeCookingsInv(rec, invCopy, cookingsNeeded){
  const copy = invCopy.map(x=>({...x}));
  for(const ing of rec.ingredients){
    const needTotalQty = ing.qty * cookingsNeeded;
    const needG = toGrams(needTotalQty, ing.unit, ing.name);
    if(needG!=null){
      const idx = copy.findIndex(x=>x.name.toLowerCase()===ing.name.toLowerCase());
      if(idx>=0){
        const invItem = copy[idx];
        const invGrams = toGrams(invItem.qty, invItem.unit, invItem.name);
        if(invGrams==null){
          if(invItem.unit===ing.unit) invItem.qty = Math.max(0, invItem.qty - needTotalQty);
        } else {
          let remainingGrams = Math.max(0, invGrams - needG);
          if(invItem.unit==='g') invItem.qty = remainingGrams;
          else if(invItem.unit==='kg') invItem.qty = remainingGrams / defaults.conv.kg_to_g;
          else {
            const d = densityFor(invItem.name);
            if(d!=null){
              const remainingMl = remainingGrams / d;
              if(invItem.unit==='ml') invItem.qty = remainingMl;
              else if(invItem.unit==='l') invItem.qty = remainingMl / defaults.conv.l_to_ml;
              else if(invItem.unit==='xic') invItem.qty = remainingMl / defaults.conv.cup_ml;
              else invItem.qty = 0;
            } else invItem.qty = 0;
          }
        }
      }
    } else {
      const idx = copy.findIndex(x=>x.name.toLowerCase()===ing.name.toLowerCase() && x.unit === ing.unit);
      if(idx>=0) copy[idx].qty = Math.max(0, copy[idx].qty - needTotalQty);
    }
  }
  return copy;
}

// ================================================
// SEÇÃO: VALIDAÇÃO E ARMAZENAMENTO DE DADOS
// Funções para validar e gerenciar dados no localStorage
// ================================================

/**
 * Valida dados JSON do localStorage
 * @param {string} data - Dados a serem validados
 * @param {array} defaultReturn - Valor padrão se inválido
 * @return {array} Dados validados ou valor padrão
 */
function validateJSON(data, defaultReturn = []) {
  try {
    if (!data || data === 'null' || data === 'undefined') return defaultReturn;
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : defaultReturn;
  } catch (e) {
    console.warn('Dados corrompidos no localStorage, usando valores padrão:', e);
    return defaultReturn;
  }
}

// ================================================
// SEÇÃO: INICIALIZAÇÃO E ESTADO DA APLICAÇÃO
// Variáveis globais e configuração inicial
// ================================================

// Dados principais da aplicação
let inventory = validateJSON(localStorage.getItem('cc_inv_pwa'));
let recipes = validateJSON(localStorage.getItem('cc_rec_pwa'));
let plan = validateJSON(localStorage.getItem('cc_plan_pwa'));

// Migrar receitas existentes para ter campo frequency
recipes = recipes.map(r => ({ ...r, frequency: r.frequency || r.priority }));
saveAll();

// Referências DOM
const modalBack = qs('#modalBack');
const modalContent = qs('#modalContent');
const alertsEl = qs('#alerts');

/**
 * Salva todos os dados no localStorage
 */
function saveAll(){
  try {
    localStorage.setItem('cc_inv_pwa', JSON.stringify(inventory));
    localStorage.setItem('cc_rec_pwa', JSON.stringify(recipes));
    localStorage.setItem('cc_plan_pwa', JSON.stringify(plan));
  } catch (e) {
    console.error('Erro ao salvar dados:', e);
    setAlert('Erro ao salvar dados. Verifique o espaço de armazenamento.', 'error');
  }
}

// ================================================
// SEÇÃO: GERENCIAMENTO DE INTERFACE (UI)
// Funções para modais, alertas e interações do usuário
// ================================================

/**
 * Exibe mensagem de alerta para o usuário
 * @param {string} text - Mensagem a ser exibida
 * @param {string} level - Nível do alerta ('info', 'warn', 'error')
 */
function setAlert(text, level='info'){
  const msg = {text, level, time: new Date().toISOString()};
  const node = document.createElement('div'); node.textContent = `${text}`; node.style.marginTop='6px';
  if(level==='error') node.style.color='crimson';
  else if(level==='warn') node.style.color='#b47c00';
  else node.style.color='#134e3a';
  alertsEl.prepend(node);
}

/**
 * Abre modal com título e conteúdo
 * @param {string} title - Título do modal
 * @param {string} contentHTML - Conteúdo HTML do modal
 */
function openModal(title, contentHTML){
  modalContent.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">${title}</h2><button id="closeModal" class="btn-ghost">Fechar</button></div><div style="margin-top:12px">${contentHTML}</div>`;
  modalBack.style.display = 'flex';
  qs('#closeModal').addEventListener('click', ()=> closeModal());
}

/**
 * Fecha modal atual
 */
function closeModal(){ modalBack.style.display='none'; modalContent.innerHTML=''; }

// ================================================
// SEÇÃO: MODAIS DE FUNCIONALIDADES
// Funções para cada área do aplicativo
// ================================================

/**
 * Abre modal de gerenciamento de inventário/dispensa
 */
function showInventory(){
  const html = `
    <div style="display:flex;gap:8px"><input id="m_invLine" placeholder="ex: arroz,2,kg" /><button id="m_addInv" class="btn-ghost">Adicionar</button></div>
    <label style="margin-top:8px">Cole várias linhas</label>
    <textarea id="m_invBulk" rows="6" placeholder="arroz,2,kg\nleite,2,l"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px"><button id="m_paste" class="btn">Adicionar todas</button><button id="m_clearInv" class="btn-ghost">Limpar</button></div>
    <div id="m_invList" class="list" style="margin-top:12px"></div>
  `;
  openModal('Dispensa', html);
  setTimeout(()=> {
    const render = ()=> {
      const el = qs('#m_invList'); el.innerHTML='';
      if(inventory.length===0) el.innerHTML='<div class="small">Sem itens</div>';
      inventory.forEach((it,idx)=>{
        const node = document.createElement('div'); node.className='item';
        node.innerHTML = `<div style="max-width:70%"><strong style="text-transform:capitalize">${it.name}</strong><div class="small">${it.qty} ${it.unit}</div></div><div><button data-idx="${idx}" class="btn-ghost">Remover</button></div>`;
        el.appendChild(node);
      });
      el.querySelectorAll('button[data-idx]').forEach(b=> b.addEventListener('click', ()=> {
        const i = Number(b.dataset.idx);
        const name = inventory[i] ? inventory[i].name : 'item';
        inventory.splice(i,1);
        saveAll();
        render();
        setAlert('Item removido: '+name);
      }));
    };
    qs('#m_addInv').addEventListener('click', ()=> {
      const v = qs('#m_invLine').value.trim(); if(!v) return alert('Digite: nome,quantidade,unidade');
      const p = parseLine(v); if(!p) return alert('linha inválida');
      inventory.push(p); saveAll(); render(); qs('#m_invLine').value=''; setAlert('Item adicionado: '+p.name);
    });
    qs('#m_paste').addEventListener('click', ()=> {
      const text = qs('#m_invBulk').value.trim(); if(!text) return alert('Cole as linhas');
      const lines = text.split('\n').map(l=>l.trim()).filter(Boolean); let added=0;
      lines.forEach(l=>{ const p=parseLine(l); if(p){ inventory.push(p); added++; } });
      saveAll(); render(); qs('#m_invBulk').value=''; setAlert('Adicionados em lote: '+added);
    });
    qs('#m_clearInv').addEventListener('click', ()=> { if(!confirm('Limpar inventário?')) return; inventory=[]; saveAll(); render(); setAlert('Inventário limpo'); });
    render();
  },50);
}

/**
 * Abre modal de gerenciamento de receitas
 */
function showRecipes(){
  const html = `
    <label>Nome</label><input id="m_recName" placeholder="Carne moída e batata" />
    <label>Rende (person-meals)</label><input id="m_recServes" type="number" value="8" />
    <label>Ingredientes (uma por linha: nome,quantidade,unidade)</label><textarea id="m_recIngredients" rows="6" placeholder="carne moida,800,g\nbatata,1.5,kg"></textarea>
    <label>Prioridade (1-10)</label><input id="m_recPriority" type="number" value="7" min="1" max="10" />
    <label>Dias que dura o preparo</label><input id="m_recDays" type="number" value="2" min="1" max="5" />
    <div style="display:flex;gap:8px;margin-top:8px"><button id="m_addRec" class="btn">Adicionar</button><button id="m_clearRec" class="btn-ghost">Limpar receitas</button></div>
    <div id="m_recList" class="list" style="margin-top:12px"></div>
  `;
  openModal('Receitas', html);
  setTimeout(()=> {
    const render = ()=> {
      const el = qs('#m_recList'); el.innerHTML='';
      if(recipes.length===0) el.innerHTML='<div class="small">Sem receitas</div>';
      recipes.forEach((r,idx)=>{
        const node = document.createElement('div'); node.className='item';
        const catIcons = r.categories ? r.categories.map(c => {
          const icons = {proteina: '🥩', carboidrato: '🍞', vegetal1: '🥬', vegetal2: '🥕'};
          return icons[c] || '';
        }).join(' ') : '';
        node.innerHTML = `<div style="max-width:70%"><strong style="text-transform:capitalize">${r.name}</strong><div class="small">${catIcons} Rende ${r.serves} · Dura ${r.days} dia(s) · P${r.priority}</div></div><div><button data-idx="${idx}" data-action="remove" class="btn-ghost">Remover</button><button data-idx="${idx}" data-action="edit" class="btn-ghost">Editar</button></div>`;
        el.appendChild(node);
      });
      el.querySelectorAll('button[data-idx]').forEach(b=> b.addEventListener('click', (e)=> {
        const idx = Number(b.dataset.idx);
        const action = b.dataset.action;
        
        if(action === 'remove') {
          const name = recipes[idx] ? recipes[idx].name : 'receita';
          recipes.splice(idx,1);
          saveAll();
          render();
          setAlert('Receita removida: ' + name);
        } else if(action === 'edit') {
          const recipe = recipes[idx];
          if(recipe) {
            // Preencher formulário com dados da receita
            qs('#m_recName').value = recipe.name;
            qs('#m_recServes').value = recipe.serves;
            qs('#m_recPriority').value = recipe.priority;
            qs('#m_recDays').value = recipe.days;
            
            // Preencher ingredientes
            const ingredientsText = recipe.ingredients.map(ing => 
              `${ing.name},${ing.qty},${ing.unit}`
            ).join('\n');
            qs('#m_recIngredients').value = ingredientsText;
            
            // Remover receita original
            recipes.splice(idx,1);
            saveAll();
            render();
            setAlert('Editando receita: ' + recipe.name);
            
            // Focar no nome para facilitar edição
            qs('#m_recName').focus();
          }
        }
      }));
    };
    qs('#m_addRec').addEventListener('click', ()=> {
      const name = qs('#m_recName').value.trim(); if(!name) return alert('Nome da receita');
      const serves = parseInt(qs('#m_recServes').value)||1;
      const lines = qs('#m_recIngredients').value.split('\n').map(l=>l.trim()).filter(Boolean);
      if(!lines.length) return alert('Adicione ingredientes');
      const priority = Math.max(1, Math.min(10, parseInt(qs('#m_recPriority').value)||5));
      const days = Math.max(1, Math.min(5, parseInt(qs('#m_recDays').value)||2));
      const ingredients = lines.map(l=>{ const p=parseLine(l); return {name:p.name, qty:p.qty, unit:p.unit}; });
      recipes.push({name, serves, ingredients, priority, days, frequency: priority});
      saveAll(); render(); qs('#m_recName').value=''; qs('#m_recIngredients').value=''; setAlert('Receita adicionada: '+name);
    });
    qs('#m_clearRec').addEventListener('click', ()=> { if(!confirm('Limpar receitas?')) return; recipes=[]; saveAll(); render(); setAlert('Receitas limpas'); });
    render();
  },50);
}

/**
 * Abre modal de criação de plano alimentar
 */
function showCreatePlan(){
  const html = `
    <div class="small">Ajuste as configurações e gere um plano automático. O sistema usa prioridades e durações (sobras).</div>
    <label>Pessoas</label><input id="m_people" type="number" value="4" />
    <label>Dias</label><input id="m_days" type="number" value="7" />
    <label>Refeições por dia</label><select id="m_meals"><option value="2">2</option><option value="3">3</option><option value="1">1</option></select>
    <div style="display:flex;gap:8px;margin-top:8px"><button id="m_genPlan" class="btn">Gerar Plano</button><button id="m_sim" class="btn-ghost">Simular (sem consumir estoque)</button></div>
    <div id="m_planPreview" style="margin-top:12px"></div>
  `;
  openModal('Criar Plano', html);
  setTimeout(()=> {
    const renderPreview = (p, people = 4)=> {
      const el = qs('#m_planPreview'); el.innerHTML='';
      if(!p.length){ el.innerHTML='<div class="small">Sem plano</div>'; return; }
      p.forEach((day,idx)=>{
        const node = document.createElement('div'); node.style.borderTop='1px solid rgba(8,20,25,0.04)'; node.style.padding='8px 0';
        node.innerHTML = `<strong>Dia ${idx+1}</strong>`;
        day.forEach((meal,i)=> {
          const m = document.createElement('div'); m.style.marginTop='6px';
          m.innerHTML = `<div style="display:flex;justify-content:space-between"><div>${meal.suggested? `<span style="color:#b47c00">${meal.name}</span>` : meal.name}</div></div>`;
          node.appendChild(m);
        });
        el.appendChild(node);
      });
    };

    qs('#m_genPlan').addEventListener('click', ()=> {
      const people = parseInt(qs('#m_people').value)||1;
      const days = parseInt(qs('#m_days').value)||7;
      const mealsPerDay = parseInt(qs('#m_meals').value)||2;
      if(recipes.length===0) return alert('Adicione receitas primeiro');
      // planner simples
      let workingInv = inventory.map(x=>({...x}));
      const newPlan = [];
      let activePrepared = [];
      for(let d=0; d<days; d++){
        const day = [];
        for(let m=0; m<mealsPerDay; m++){
          let assigned = null;
          if(activePrepared.length){
            for(let i=0;i<activePrepared.length;i++){
              const p = activePrepared[i];
              if(p.remainingSlots>0){ assigned = {name:p.recipe.name, suggested:false, recipe:p.recipe}; p.remainingSlots -=1; break; }
            }
            activePrepared = activePrepared.filter(p=>p.remainingSlots>0);
          }
          if(!assigned){
            // Lógica de frequência: controlar quantas vezes cada receita aparece
            const recipeUsage = {};
            newPlan.forEach(day => day.forEach(meal => {
              if(meal.recipe) {
                recipeUsage[meal.recipe.name] = (recipeUsage[meal.recipe.name] || 0) + 1;
              }
            }));
            
            // Calcular limite máximo por receita baseado na frequência
            const totalMeals = days * mealsPerDay;
            const maxUsagePerRecipe = {};
            recipes.forEach(r => {
              // F10 = pode aparecer até 40% das refeições, F1 = até 10%
              const maxPercentage = 0.1 + (r.frequency / r.priority) * 0.03;
              maxUsagePerRecipe[r.name] = Math.ceil(totalMeals * maxPercentage);
            });
            
            let candidate=null;
            
            // Agrupar receitas por frequência (maior para menor)
            const frequencies = [...new Set(recipes.map(r => r.frequency || r.priority))].sort((a,b) => b-a);
            
            for(const frequency of frequencies){
              // Pegar receitas desta frequência que podem ser feitas E não atingiram limite
              const frequencyRecipes = recipes.filter(r => 
                (r.frequency || r.priority) === frequency && 
                canCookForSlots(r, workingInv, Math.ceil(people * r.days / r.serves)) &&
                (recipeUsage[r.name] || 0) < (maxUsagePerRecipe[r.name] || 1)
              );
              
              if(frequencyRecipes.length > 0){
                // Sortear aleatoriamente entre as receitas disponíveis
                const randomRecipe = frequencyRecipes[Math.floor(Math.random() * frequencyRecipes.length)];
                const cookingsNeeded = Math.ceil(people * randomRecipe.days / randomRecipe.serves);
                candidate = {r: randomRecipe, cookingsNeeded};
                break;
              }
            }
            
            if(candidate){
              workingInv = consumeCookingsInv(candidate.r, workingInv, candidate.cookingsNeeded);
              const remainingSlots = candidate.r.days -1;
              if(remainingSlots>0) activePrepared.push({recipe:candidate.r, remainingSlots});
              assigned = {name:candidate.r.name, suggested:false, recipe:candidate.r};
            } else {
              // fallback: escolha com menor falta (sugestão)
              let best=null; let bestShort=Infinity;
              for(const r of recipes){
                const totalPersonMeals = people * r.days;
                const cookingsNeeded = Math.ceil(totalPersonMeals / r.serves);
                let shortage=0;
                r.ingredients.forEach(ing=>{
                  const needTotalQty = ing.qty * cookingsNeeded;
                  const needG = toGrams(needTotalQty, ing.unit, ing.name);
                  const found = workingInv.find(x=>x.name.toLowerCase()===ing.name.toLowerCase());
                  const have = found? toGrams(found.qty, found.unit, found.name) : null;
                  if(needG!=null && have!=null) shortage += Math.max(0, needG - have);
                  else if(needG!=null && have==null) shortage += needG;
                  else {
                    const haveQty = found?found.qty:0;
                    shortage += Math.max(0, needTotalQty - haveQty);
                  }
                });
                if(shortage < bestShort){ bestShort = shortage; best={r,cookingsNeeded}; }
              }
              if(best){ workingInv = consumeCookingsInv(best.r, workingInv, best.cookingsNeeded); assigned = {name:best.r.name, suggested:true, recipe:best.r}; }
              else assigned = {name:'Sem sugestão', suggested:true};
            }
          }
          day.push(assigned);
        }
        newPlan.push(day);
      }
      // aplica plano e consome estoque
      plan = newPlan;
      inventory = workingInv;
      saveAll();
      renderPreview(plan, people);
      setAlert('Plano gerado e estoque atualizado');
      renderMainAlerts();
      closeModal();
      render();
    });

    qs('#m_sim').addEventListener('click', ()=> {
      // simulação sem consumir estoque
      const people = parseInt(qs('#m_people').value)||1;
      const days = parseInt(qs('#m_days').value)||7;
      const mealsPerDay = parseInt(qs('#m_meals').value)||2;
      if(recipes.length===0) return alert('Adicione receitas primeiro');
      let workingInv = inventory.map(x=>({...x}));
      const newPlan = [];
      let activePrepared = [];
      for(let d=0; d<days; d++){
        const day = [];
        for(let m=0; m<mealsPerDay; m++){
          let assigned = null;
          if(activePrepared.length){
            for(let i=0;i<activePrepared.length;i++){
              const p = activePrepared[i];
              if(p.remainingSlots>0){ assigned = {name:p.recipe.name, suggested:false, recipe:p.recipe}; p.remainingSlots -=1; break; }
            }
            activePrepared = activePrepared.filter(p=>p.remainingSlots>0);
          }
          if(!assigned){
            // Lógica de frequência para simulação (sem consumir estoque)
            const recipeUsage = {};
            newPlan.forEach(day => day.forEach(meal => {
              if(meal.recipe) {
                recipeUsage[meal.recipe.name] = (recipeUsage[meal.recipe.name] || 0) + 1;
              }
            }));
            
            // Calcular limite máximo por receita baseado na frequência
            const totalMeals = days * mealsPerDay;
            const maxUsagePerRecipe = {};
            recipes.forEach(r => {
              const maxPercentage = 0.1 + (r.frequency || r.priority) * 0.03;
              maxUsagePerRecipe[r.name] = Math.ceil(totalMeals * maxPercentage);
            });
            
            let candidate=null;
            
            // Agrupar receitas por frequência (maior para menor)
            const frequencies = [...new Set(recipes.map(r => r.frequency || r.priority))].sort((a,b) => b-a);
            
            for(const frequency of frequencies){
              // Pegar receitas desta frequência que podem ser feitas E não atingiram limite
              const frequencyRecipes = recipes.filter(r => 
                (r.frequency || r.priority) === frequency && 
                canCookForSlots(r, workingInv, Math.ceil(people * r.days / r.serves)) &&
                (recipeUsage[r.name] || 0) < (maxUsagePerRecipe[r.name] || 1)
              );
              
              if(frequencyRecipes.length > 0){
                // Sortear aleatoriamente entre as receitas disponíveis
                const randomRecipe = frequencyRecipes[Math.floor(Math.random() * frequencyRecipes.length)];
                candidate = {r: randomRecipe, cookingsNeeded: Math.ceil(people * randomRecipe.days / randomRecipe.serves)};
                break;
              }
            }
            
            if(candidate){
              const remainingSlots = candidate.r.days -1;
              if(remainingSlots>0) activePrepared.push({recipe:candidate.r, remainingSlots});
              assigned = {name:candidate.r.name, suggested:false, recipe:candidate.r};
            } else {
              assigned = {name:'Sem sugestão', suggested:true};
            }
          }
          day.push(assigned);
        }
        newPlan.push(day);
      }
      renderPreview(newPlan, people);
      setAlert('Simulação pronta (estoque não consumido)');
    });

  },100);
}

/**
 * Abre modal de visualização do plano atual
 */
function showCurrentPlan(){
  const html = `<div id="m_currentList" class="list"></div><div style="display:flex;gap:8px;margin-top:8px"><button id="m_clearPlan" class="btn-ghost">Limpar plano</button><button id="m_exportPlan" class="btn-ghost">Exportar plano</button></div>`;
  openModal('Plano Atual', html);
  setTimeout(()=> {
    const render = ()=> {
      const el = qs('#m_currentList'); el.innerHTML='';
      if(!plan.length) el.innerHTML='<div class="small">Sem plano gerado</div>';
      plan.forEach((day,idx)=>{
        const node = document.createElement('div'); node.style.borderTop='1px solid rgba(8,20,25,0.04)'; node.style.padding='8px 0';
        node.innerHTML = `<strong>Dia ${idx+1}</strong>`;
        day.forEach((meal,i)=> {
          const m = document.createElement('div'); m.style.marginTop='6px';
          const mealId = `day${idx}-meal${i}`;
          m.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div style="flex:1">${meal.suggested? `<span style="color:#b47c00">${meal.name}</span>` : meal.name}</div></div>`;
          node.appendChild(m);
        });
        el.appendChild(node);
      });
    };
    render();
    const el = qs('#m_currentList');
    console.log('Elementos encontrados:', {
      buttonsTrocar: el.querySelectorAll('button[data-day]').length,
      mealsClickable: el.querySelectorAll('[data-meal-id]').length
    });
    // Event listener para o botão "Trocar" de cada dia
    el.querySelectorAll('button[data-day]').forEach(btn => {
      console.log('Adicionando listener ao botão do dia:', btn.dataset.day);
      btn.addEventListener('click', (e) => {
        console.log('Botão Trocar clicado! Dia:', e.target.dataset.day);
        const dayIndex = parseInt(e.target.dataset.day);
        // Mostrar modo de seleção para este dia
        const dayElement = e.target.closest('div').querySelectorAll('[data-meal-id]');
        console.log('Elementos de refeição encontrados:', dayElement.length);
        dayElement.forEach(el => {
          el.style.background = '#f0f9ff';
          el.style.border = '1px dashed #3b82f6';
          el.style.borderRadius = '6px';
          el.style.padding = '4px';
        });
        setAlert('Clique na refeição que deseja trocar');
      });
    });
    // Event listener para clicar nas refeições
    el.querySelectorAll('[data-meal-id]').forEach(mealEl => {
      console.log('Adicionando listener à refeição:', mealEl.dataset.mealId, 'dia:', mealEl.dataset.day);
      mealEl.addEventListener('click', (e) => {
        console.log('Refeição clicada! Dia:', e.target.dataset.day, 'Refeição:', e.target.dataset.meal);
        const dayIndex = parseInt(e.target.dataset.day);
        const mealIndex = parseInt(e.target.dataset.meal);
        showRecipeSelector(dayIndex, mealIndex);
      });
    });

    const showRecipeSelector = (dayIndex, mealIndex) => {
      const currentMeal = plan[dayIndex][mealIndex];
      const recipeOptions = recipes.map((r, idx) =>
        `<option value="${idx}" ${r.name === currentMeal.name ? 'selected' : ''}>${r.name} (rende ${r.serves}, dura ${r.days} dias)</option>`
      ).join('');

      const selectorHTML = `
        <div style="padding:12px;border:1px solid rgba(8,20,25,0.1);border-radius:10px;background:#f9f9f9">
          <h4 style="margin:0 0 8px 0">Trocar Refeição - Dia ${dayIndex+1}, Refeição ${mealIndex+1}</h4>
          <div style="margin-bottom:8px"><strong>Atual:</strong> ${currentMeal.name}</div>
          <label>Escolha nova receita:</label>
          <select id="recipeSelect" style="margin-top:4px">${recipeOptions}</select>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button id="confirmReplace" class="btn">Confirmar Troca</button>
            <button id="cancelReplace" class="btn-ghost">Cancelar</button>
          </div>
        </div>
      `;

      const selectorDiv = document.createElement('div');
      selectorDiv.innerHTML = selectorHTML;
      selectorDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100;background:white;border-radius:12px;box-shadow:0 20px 60px rgba(2,6,23,0.3);max-width:400px;width:90%';
      document.body.appendChild(selectorDiv);

      document.getElementById('confirmReplace').addEventListener('click', () => {
        const selectedIdx = parseInt(document.getElementById('recipeSelect').value);
        const selectedRecipe = recipes[selectedIdx];

        plan[dayIndex][mealIndex] = {
          name: selectedRecipe.name,
          suggested: false,
          recipe: selectedRecipe
        };

        saveAll();
        render();
        setAlert(`Refeição trocada para: ${selectedRecipe.name}`);
        renderMainAlerts();
        document.body.removeChild(selectorDiv);
      });

      document.getElementById('cancelReplace').addEventListener('click', () => {
        document.body.removeChild(selectorDiv);
      });
    };

    qs('#m_clearPlan').addEventListener('click', ()=> { if(!confirm('Limpar plano atual?')) return; plan=[]; saveAll(); render(); setAlert('Plano limpo'); renderMainAlerts(); });
    qs('#m_exportPlan').addEventListener('click', ()=> { const blob = new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='cardapio_plan.json'; a.click(); URL.revokeObjectURL(url); setAlert('Plano exportado'); });
    render();
  },100);
}

// attach block handlers
qs('#b-inv').addEventListener('click', showInventory);
qs('#b-rec').addEventListener('click', showRecipes);
qs('#b-create').addEventListener('click', showCreatePlan);
qs('#b-current').addEventListener('click', showCurrentPlan);

// Suporte a navegação por teclado
document.querySelectorAll('.block').forEach(block => {
  block.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      block.click();
    }
  });
  // Feedback visual ao focar
  block.addEventListener('focus', () => {
    block.style.outline = '2px solid var(--accent)';
    block.style.outlineOffset = '2px';
  });
  block.addEventListener('blur', () => {
    block.style.outline = 'none';
  });
});

// modal close on background
modalBack.addEventListener('click', (e)=>{ if(e.target===modalBack) closeModal(); });

// Main alerts renderer
function renderMainAlerts(){
  const issues = [];
  if(recipes.length===0) issues.push({text:'Nenhuma receita cadastrada', level:'warn'});
  // checar faltas para plano atual
  if(plan && plan.length){
    const missing = {};
    plan.forEach(day=> day.forEach(meal=>{
      if(meal && meal.suggested && meal.recipe){
        const r = meal.recipe;
        // CORREÇÃO: Usar valor padrão ou detectar do plano
        const people = parseInt(qs('#m_people')?.value) || 4;
        const totalPersonMeals = people * r.days;
        const cookingsNeeded = Math.ceil(totalPersonMeals / r.serves);
        r.ingredients.forEach(ing=>{
          const needTotalQty = ing.qty * cookingsNeeded;
          const needG = toGrams(needTotalQty, ing.unit, ing.name);
          if(needG!=null){
            const found = inventory.find(x=>x.name.toLowerCase()===ing.name.toLowerCase());
            const haveG = found? toGrams(found.qty, found.unit, found.name) : 0;
            const short = Math.max(0, needG - haveG);
            if(short>0) missing[ing.name] = (missing[ing.name]||0) + short;
          } else {
            const found = inventory.find(x=>x.name.toLowerCase()===ing.name.toLowerCase());
            const have = found? found.qty : 0;
            const short = Math.max(0, needTotalQty - have);
            if(short>0) missing[ing.name] = (missing[ing.name]||0) + short;
          }
        });
      }
    }));
    if(Object.keys(missing).length) issues.push({text:'Faltam ingredientes para o plano gerado', level:'warn'});
  }
  // atualiza área de avisos
  alertsEl.innerHTML = '';
  if(issues.length===0) alertsEl.innerHTML = '<div class="small">Nenhum aviso por enquanto.</div>';
  else issues.forEach(it=> {
    const n = document.createElement('div'); n.textContent = it.text; n.style.marginTop='6px';
    if(it.level==='warn') n.style.color='#b47c00'; if(it.level==='error') n.style.color='crimson';
    alertsEl.appendChild(n);
  });
}

// render inicial
renderMainAlerts();

// Registrar service worker para PWA
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./cardapio_sw.js').then(()=> console.log('SW registrado')).catch(()=> console.log('SW falhou'));
}