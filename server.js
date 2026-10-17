const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Fotos de receita chegam em base64 (até 3 fotos já reduzidas pelo app)
app.use(express.json({ limit: '10mb' }));

function cleanText(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/ /g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripAccents(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

// Unidades que aparecem nas notas fiscais -> kg | g | l | ml | dz | un
function normalizeUnit(value) {
    const unit = stripAccents(cleanText(value)).replace(/[^a-z]/g, '');
    if (!unit) return 'un';

    const map = {
        kg: 'kg', kgs: 'kg', kilo: 'kg', quilo: 'kg', kilograma: 'kg', quilograma: 'kg',
        g: 'g', gr: 'g', grs: 'g', grama: 'g', gramas: 'g',
        l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
        ml: 'ml', mililitro: 'ml', mililitros: 'ml',
        dz: 'dz', duzia: 'dz'
    };

    // Qualquer outra (UN, CX, PCT, FD, BD, PC, SC...) é tratada como unidade
    return map[unit] || 'un';
}

// Converte números no formato brasileiro ("1.234,56", "0,454", "1.0000")
function parseNumber(value) {
    const match = cleanText(String(value ?? '')).match(/\d[\d.,]*/);
    if (!match) return 0;

    let num = match[0].replace(/[.,]$/, '');
    if (num.includes(',')) {
        num = num.replace(/\./g, '').replace(',', '.');
    }

    const parsed = Number(num);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

// Procura o tamanho da embalagem no nome do produto (ex: "ARROZ 5KG", "CERVEJA 12X350ML", "OVOS C/12")
function extractPackageSize(name) {
    const sizeUnit = '(kgs?|gramas|grs?|g|ml|litros?|lts?|lt|l)';
    const multiPack = new RegExp(`(\\d+)\\s*x\\s*(\\d+(?:[.,]\\d+)?)\\s*${sizeUnit}\\b`, 'i');
    const singlePack = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${sizeUnit}\\b`, 'i');
    const unitsPack = /(?:\bc\/\s*(\d+)\b|\b(\d+)\s*(?:un|und|unid|unidades)\b)/i;
    const dozen = /\b(dz|duzia)\b/i;

    let match = name.match(multiPack);
    if (match) {
        return {
            amount: parseNumber(match[1]) * parseNumber(match[2]),
            unit: normalizeUnit(match[3]),
            token: match[0]
        };
    }

    match = name.match(singlePack);
    if (match) {
        return { amount: parseNumber(match[1]), unit: normalizeUnit(match[2]), token: match[0] };
    }

    match = name.match(unitsPack);
    if (match) {
        return { amount: parseNumber(match[1] || match[2]), unit: 'un', token: match[0] };
    }

    match = name.match(dozen);
    if (match) {
        return { amount: 12, unit: 'un', token: match[0] };
    }

    return null;
}

// Abreviações comuns nas notas fiscais (chave sem acento, minúscula).
// Só entram abreviações sem ambiguidade; o resto o usuário corrige na tela de revisão do app.
const ABBREVIATIONS = {
    // padaria, lanches e doces
    bisc: 'biscoito', biscoit: 'biscoito', bolach: 'bolacha', choc: 'chocolate', chocol: 'chocolate',
    achoc: 'achocolatado', bisn: 'bisnaguinha', recheado: 'recheado', rech: 'recheado', wafe: 'wafer',
    salg: 'salgadinho', pip: 'pipoca', amend: 'amendoim', cast: 'castanha',
    // laticínios e frios
    lte: 'leite', leit: 'leite', cond: 'condensado', qjo: 'queijo', qj: 'queijo', queij: 'queijo',
    muss: 'mussarela', mussar: 'mussarela', mucar: 'mussarela', mussa: 'mussarela', pres: 'presunto', presu: 'presunto',
    req: 'requeijão', requeij: 'requeijão', iog: 'iogurte', iogur: 'iogurte', mant: 'manteiga', mantei: 'manteiga',
    marg: 'margarina', cr: 'creme', desn: 'desnatado', semidesn: 'semidesnatado', semid: 'semidesnatado',
    integ: 'integral', parm: 'parmesão', mort: 'mortadela', ralad: 'ralado', fatiad: 'fatiado', fat: 'fatiado',
    // carnes
    ling: 'linguiça', lingui: 'linguiça', linguic: 'linguiça', calab: 'calabresa', calabr: 'calabresa',
    fgo: 'frango', frgo: 'frango', frang: 'frango', bov: 'bovina', sui: 'suína', suin: 'suína',
    peit: 'peito', cox: 'coxa', sobrecox: 'sobrecoxa', hamb: 'hambúrguer', salsich: 'salsicha',
    cong: 'congelado', congel: 'congelado', resf: 'resfriado', moid: 'moído', bife: 'bife',
    // mercearia
    feij: 'feijão', feijao: 'feijão', carioc: 'carioca', arr: 'arroz', macarr: 'macarrão', mac: 'macarrão',
    espag: 'espaguete', far: 'farinha', farin: 'farinha', trig: 'trigo', mand: 'mandioca', fub: 'fubá',
    acuc: 'açúcar', acucar: 'açúcar', refin: 'refinado', crist: 'cristal', torr: 'torrado', soluv: 'solúvel',
    temp: 'tempero', extr: 'extrato', ext: 'extrato', mol: 'molho', tom: 'tomate', maion: 'maionese',
    vin: 'vinagre', azeit: 'azeite', sard: 'sardinha', palm: 'palmito', azeiton: 'azeitona', milh: 'milho',
    ervil: 'ervilha', gelat: 'gelatina', ferm: 'fermento', trad: 'tradicional', nat: 'natural',
    // bebidas
    refrig: 'refrigerante', refri: 'refrigerante', refr: 'refrigerante', cerv: 'cerveja', ag: 'água',
    agua: 'água', min: 'mineral', gaseif: 'gaseificada', energ: 'energético',
    // hortifruti
    bat: 'batata', cebol: 'cebola', cenour: 'cenoura', banan: 'banana', mor: 'morango', laranj: 'laranja',
    // limpeza e higiene
    deterg: 'detergente', amac: 'amaciante', desinf: 'desinfetante', sabon: 'sabonete', pap: 'papel',
    hig: 'higiênico', dent: 'dental'
};

// "BISC OREO" -> "biscoito oreo", "S/GLUTEN" -> "sem gluten"
function expandAbbreviations(name) {
    return cleanText(name)
        .split(' ')
        .map((word) => {
            const prefix = word.match(/^([cs])\/(.*)$/i);
            if (prefix) {
                const rest = prefix[2] ? ` ${expandAbbreviations(prefix[2])}` : '';
                return (prefix[1].toLowerCase() === 'c' ? 'com' : 'sem') + rest;
            }

            const key = stripAccents(word).replace(/\.+$/, '');
            return ABBREVIATIONS[key] || word.toLowerCase();
        })
        .join(' ');
}

// Ordem importa: o primeiro padrão que bater define a categoria
const CATEGORY_RULES = [
    ['acucares', /\b(leite cond|lte cond|leite em po|farinha de trigo|farinha trigo|far trigo|fermento|amido|maisena|cacau|chocolate em po|choc po|gelatina|acucar|acuc|adocante|mel\b|essencia|coco ralado)/],
    ['laticinios', /\b(creme de leite|cr leite|peito de peru|leite|lte|queijo|qjo|mussarela|mucarela|muss|presunto|iogurte|iog|manteiga|requeijao|req|nata|ricota|parmesao|mortadela|salame|coalhada|bebida lactea)/],
    ['carnes', /\b(carne|frango|fgo|peito|coxa|sobrecoxa|asa|file|bife|alcatra|patinho|acem|musculo|picanha|costela|maminha|fraldinha|cupim|linguica|lingui|bacon|porco|suino|lombo|pernil|tilapia|salmao|merluza|peixe|camarao|ovo|ovos|moida|hamburguer|salsicha|calabresa)/],
    ['enlatados', /\b(atum|sardinha|milho verde|ervilha|seleta|palmito|azeitona|conserva)\b/],
    ['molhos', /\b(molho|ketchup|catchup|maionese|mostarda|vinagre|shoyu|extrato|polpa de tomate|passata)/],
    ['oleos', /\b(oleo|azeite|gordura|margarina|banha)/],
    ['temperos', /\b(sal|pimenta|oregano|colorau|paprica|cominho|tempero|caldo|louro|canela|noz moscada|curry|acafrao|alho em po)\b/],
    ['oleaginosas', /\b(castanha|amendoim|nozes|amendoa|chia|linhaca|gergelim|pistache)/],
    ['graos', /\b(arroz|feijao|feij|lentilha|grao de bico|aveia|quinoa|macarrao|macarr|espaguete|penne|parafuso|farinha|fuba|cuscuz|tapioca|milho)/],
    ['bebidas', /\b(refrigerante|refrig|refri|coca|guarana|suco|agua|cerveja|cerv|vinho|energetico|isotonico|cha gelado)/],
    ['padaria', /\b(pao|paes|bisnaguinha|torrada|bolo|cafe|achocolatado|cereal|granola|sucrilhos|cha)\b/],
    ['lanches', /\b(biscoito|bisc|bolacha|salgadinho|chocolate|choc|bala|chiclete|pipoca|wafer|snack|batata palha)/],
    ['hortifruti', /\b(banana|maca|laranja|limao|tomate|cebola|alho|batata|cenoura|alface|abobora|abobrinha|pepino|pimentao|mamao|manga|uva|morango|abacaxi|melancia|melao|couve|brocolis|repolho|mandioca|aipim|chuchu|berinjela|beterraba|cheiro verde|salsa|coentro|cebolinha|hortela|gengibre|abacate|kiwi|pera|maracuja)/]
];

function guessCategory(name) {
    const normalized = stripAccents(name);
    const rule = CATEGORY_RULES.find(([, regex]) => regex.test(normalized));
    return rule ? rule[0] : 'outros';
}

// Converte um item cru da nota para o formato aceito pelo app: { name, qty, unit, category }
function toAppFormat({ name, qty, unit }) {
    let cleanName = cleanText(String(name).replace(/\(\s*c[óo]d(igo)?\.?\s*:.*?\)/gi, ''));
    let quantity = qty > 0 ? qty : 1;
    let finalUnit = normalizeUnit(unit);

    if (finalUnit === 'dz') {
        quantity *= 12;
        finalUnit = 'un';
    }

    // Produto vendido por unidade/caixa/pacote: tenta usar o peso/volume da embalagem
    if (finalUnit === 'un') {
        const pack = extractPackageSize(cleanName);
        if (pack && pack.amount > 0) {
            quantity *= pack.amount;
            finalUnit = pack.unit;
            cleanName = cleanText(cleanName.replace(pack.token, ' ').replace(/\s[-/]\s*$/, ''));
        }
    }

    // "PAO FRANCES KG" -> "PAO FRANCES"
    cleanName = cleanName.replace(/\s+(kg|un|und)$/i, '') || cleanText(name);

    const expandedName = expandAbbreviations(cleanName);
    const category = guessCategory(expandedName);

    return {
        name: expandedName,
        qty: round(quantity),
        unit: finalUnit,
        category: category !== 'outros' ? category : guessCategory(cleanName),
        // Nome como veio na nota: o app usa para mostrar e para lembrar as correções do usuário
        original: cleanText(name),
        key: stripAccents(cleanName)
    };
}

// Layout padrão do Portal da NFC-e (SP, RJ, RS, PR, BA, ...):
// <tr id="Item + 1"><span class="txtTit2">NOME</span><span class="Rqtd">Qtde.:1</span><span class="RUN">UN: KG</span>
function extractFromPortalLayout($) {
    let rows = $('tr[id^="Item"]');
    if (!rows.length) rows = $('#tabResult tr');

    const produtos = [];
    rows.each((_, row) => {
        const $row = $(row);
        const name = cleanText($row.find('.txtTit2, span.txtTit').first().text());
        const qtyText = cleanText($row.find('.Rqtd').first().text());
        const unitText = cleanText($row.find('.RUN').first().text()).replace(/^UN\s*:?\s*/i, '');

        if (!name) return;
        produtos.push({ name, qty: parseNumber(qtyText), unit: unitText });
    });

    return produtos;
}

// Outros layouts (ex: MG): procura linhas com "Qtde: X" e "UN: Y" no texto
function extractFromRowText($) {
    const produtos = [];

    $('tr').each((_, row) => {
        const $row = $(row);
        if ($row.find('tr').length) return; // ignora linhas que contêm tabelas internas

        // Junta as células com espaço para o texto de uma não grudar na outra
        const cells = $row.find('td, th').toArray().map((cell) => $(cell).text());
        const text = cleanText(cells.length ? cells.join(' ') : $row.text());
        const qtyMatch = text.match(/Qt(?:de|d)?\.?(?:\s*total\s*de\s*[ií]tens)?\s*:\s*([\d.,]+)/i);
        if (!qtyMatch) return;

        const unitMatch = text.match(/\bUN(?:ID)?\.?\s*:\s*([A-Za-z]+)/i);
        const name = cleanText(text.split(/\(\s*C[óo]d|Qt(?:de|d)?\.?\s*(?:total|:)/i)[0]);
        if (!name) return;

        produtos.push({ name, qty: parseNumber(qtyMatch[1]), unit: unitMatch?.[1] || 'un' });
    });

    return produtos;
}

// Último recurso: tabelas com cabeçalho "Descrição / Quantidade / Unidade"
function extractFromHeaderTables($) {
    const produtos = [];

    $('table').each((_, table) => {
        const rows = $(table).find('tr');
        if (rows.length < 2) return;

        const headers = $(rows[0]).find('th, td').toArray().map((cell) => stripAccents(cleanText($(cell).text())));
        const findIndex = (keywords) => headers.findIndex((h) => keywords.some((k) => h.includes(k)));

        const nameIndex = findIndex(['descricao', 'produto', 'mercadoria']);
        const qtyIndex = findIndex(['quantidade', 'qtde', 'qtd']);
        const unitIndex = findIndex(['unidade', 'medida', 'und']);
        if (nameIndex < 0 || qtyIndex < 0) return;

        rows.slice(1).each((_, row) => {
            const cells = $(row).find('td').toArray().map((cell) => cleanText($(cell).text()));
            const name = cells[nameIndex];
            if (!name) return;

            produtos.push({
                name,
                qty: parseNumber(cells[qtyIndex]),
                unit: unitIndex >= 0 ? cells[unitIndex] : 'un'
            });
        });
    });

    return produtos;
}

function extractProductsFromHtml(html) {
    const $ = cheerio.load(html);

    const extractors = [extractFromPortalLayout, extractFromRowText, extractFromHeaderTables];
    for (const extract of extractors) {
        const produtos = extract($);
        if (produtos.length) return produtos;
    }

    return [];
}

// As páginas da SEFAZ às vezes vêm em ISO-8859-1; sem isso os acentos quebram
function decodeHtml(data, contentType) {
    const buffer = Buffer.from(data);
    const charset =
        /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1] ||
        /<meta[^>]+charset=["']?([\w-]+)/i.exec(buffer.toString('latin1', 0, 4096))?.[1] ||
        'utf-8';

    try {
        return new TextDecoder(charset).decode(buffer);
    } catch {
        return buffer.toString('utf8');
    }
}

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9'
};

const TLS_ERRORS = ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED'];

async function fetchNotaHtml(url) {
    const options = {
        timeout: 30000,
        headers: BROWSER_HEADERS,
        maxRedirects: 5,
        responseType: 'arraybuffer'
    };

    try {
        const response = await axios.get(url, options);
        return decodeHtml(response.data, response.headers['content-type']);
    } catch (error) {
        // Alguns portais da SEFAZ usam certificados ICP-Brasil que o Node não reconhece.
        // Só nesses casos (e só para domínios .gov.br) tentamos de novo sem validar o certificado.
        const isGovBr = new URL(url).hostname.endsWith('.gov.br');
        if (!isGovBr || !TLS_ERRORS.includes(error?.code)) throw error;

        const response = await axios.get(url, {
            ...options,
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        return decodeHtml(response.data, response.headers['content-type']);
    }
}

// ---------- IA (Google Gemini, plano gratuito) ----------

const AI_UNITS = ['g', 'kg', 'ml', 'l', 'un'];
const AI_CATEGORIES = [
    'hortifruti', 'carnes', 'laticinios', 'graos', 'padaria', 'bebidas', 'enlatados',
    'oleaginosas', 'temperos', 'oleos', 'acucares', 'molhos', 'lanches', 'outros'
];
// O primeiro é o padrão; os outros são tentados se o modelo não existir mais (Google aposenta modelos antigos)
const AI_MODELS = [process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'].filter(Boolean);

function formatKnownIngredients(knownIngredients) {
    return (Array.isArray(knownIngredients) ? knownIngredients : [])
        .filter((item) => item && typeof item.name === 'string' && item.name.trim())
        .slice(0, 500)
        .map((item) => `- ${cleanText(item.name).slice(0, 60)} (${cleanText(String(item.unit || 'un')).slice(0, 5)})`)
        .join('\n');
}

function buildAIPrompt(produtos, knownIngredients) {
    const known = formatKnownIngredients(knownIngredients);

    const itens = produtos
        .map((p, i) => `${i}. "${p.original}" | qtd: ${p.qty} ${p.unit}`)
        .join('\n');

    return `Você organiza a despensa digital de um app de receitas brasileiro.
Abaixo estão os itens de uma nota fiscal de supermercado, com nomes abreviados como o mercado imprime.
A quantidade já foi calculada pelo sistema (peso/volume da embalagem vezes a quantidade comprada).

Para cada item, devolva:
- "nome": o nome do INGREDIENTE, genérico, em português, minúsculo, SEM marca e SEM tamanho da embalagem.
  Ex: "BISC OREO" -> "biscoito recheado"; "LING C CERRATI" -> "linguiça calabresa"; "LTE ITALAC INTEG" -> "leite integral".
  IMPORTANTE: se o item for o mesmo ingrediente de algum da lista "INGREDIENTES QUE O APP JÁ CONHECE", use EXATAMENTE aquele nome.
- "qtd" e "unidade": mantenha a quantidade recebida. Unidade só pode ser: g, kg, ml, l, un.
  Se o ingrediente conhecido usa outra unidade, converta com uma estimativa razoável (ex: 1 kg de tomate ≈ 8 un).
- "categoria": uma destas: ${AI_CATEGORIES.join(', ')}.
- "comida": false para o que não é comida nem bebida (limpeza, higiene, sacola, utensílios, pet), senão true.

INGREDIENTES QUE O APP JÁ CONHECE (nome e unidade):
${known || '(nenhum)'}

ITENS DA NOTA:
${itens}

Responda só com JSON neste formato, um objeto por item, na mesma ordem:
{"itens":[{"i":0,"nome":"...","qtd":0,"unidade":"g","categoria":"...","comida":true}]}`;
}

// images: [{ data: base64, mimeType }] (opcional, para ler fotos)
async function callGemini(prompt, images = [], timeout = 25000) {
    let lastError = null;
    const parts = [
        { text: prompt },
        ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))
    ];

    for (const model of AI_MODELS) {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    contents: [{ parts }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
                },
                {
                    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
                    timeout
                }
            );

            const text = response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
            return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        } catch (error) {
            lastError = error;
            // Modelo inexistente/aposentado: tenta o próximo. Outros erros: desiste.
            if (error?.response?.status !== 404) break;
        }
    }

    throw lastError;
}

async function refineWithAI(produtos, knownIngredients) {
    const result = await callGemini(buildAIPrompt(produtos, knownIngredients));
    const itens = Array.isArray(result?.itens) ? result.itens : [];

    return produtos.map((produto, index) => {
        const ai = itens.find((item) => Number(item?.i) === index) || itens[index];
        if (!ai || typeof ai.nome !== 'string' || !ai.nome.trim()) return produto;

        const unit = String(ai.unidade || '').toLowerCase();
        const qty = Number(ai.qtd);
        const validQty = AI_UNITS.includes(unit) && Number.isFinite(qty) && qty > 0;

        return {
            ...produto,
            name: cleanText(ai.nome).toLowerCase(),
            qty: validQty ? round(qty) : produto.qty,
            unit: validQty ? unit : produto.unit,
            category: AI_CATEGORIES.includes(ai.categoria) ? ai.categoria : produto.category,
            food: ai.comida !== false
        };
    });
}

app.post('/raspar-nota', async (req, res) => {
    try {
        const { url } = req.body || {};

        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Informe uma URL válida da nota fiscal.'
            });
        }

        const html = await fetchNotaHtml(url);
        if (!html) {
            return res.status(502).json({
                sucesso: false,
                erro: 'Não foi possível obter o HTML da nota fiscal.'
            });
        }

        let produtos = extractProductsFromHtml(html)
            .filter((item) => cleanText(item.name))
            .map(toAppFormat);

        // Se a IA estiver configurada, ela troca os nomes abreviados pelos ingredientes do app.
        // Se falhar por qualquer motivo, fica o resultado do dicionário.
        if (produtos.length && process.env.GEMINI_API_KEY) {
            try {
                produtos = await refineWithAI(produtos, req.body?.knownIngredients);
            } catch (error) {
                console.error('IA indisponível, usando dicionário:', error?.response?.status || '', error?.message);
            }
        }

        if (!produtos.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Não foi possível localizar os itens da nota fiscal. O portal da SEFAZ do seu estado pode estar usando um formato diferente.'
            });
        }

        return res.json({
            sucesso: true,
            produtos
        });
    } catch (error) {
        console.error('Erro ao raspar nota:', error?.code || '', error?.message);

        const mensagem = error?.response?.status
            ? `Falha ao acessar o site da SEFAZ (${error.response.status}).`
            : 'Erro ao processar a nota fiscal. O site da SEFAZ pode estar indisponível.';

        return res.status(502).json({
            sucesso: false,
            erro: mensagem
        });
    }
});

// ---------- Receita por foto ou texto ----------

const RECIPE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const RECIPE_MACROS = ['proteina', 'carbo', 'vegetais', 'gordura'];
const MAX_RECIPE_IMAGES = 3;
const MAX_IMAGE_BASE64 = 4 * 1024 * 1024;
const MAX_RECIPE_TEXT = 8000;

function buildRecipePrompt(knownIngredients, texto) {
    const fonte = texto
        ? `O texto abaixo foi colado ou ditado (falado) por uma pessoa. Pode ter conversa, repetições e coisas que não fazem parte da receita: ignore tudo que não for nome, rendimento ou ingrediente.

TEXTO:
"""
${texto}
"""`
        : 'A(s) foto(s) mostram uma receita (livro, caderno escrito à mão, print). Se forem várias, são partes da mesma receita.';

    return `Você cadastra receitas num app brasileiro de cardápio da família.
${fonte}

Extraia SOMENTE o que está na receita. NUNCA invente ingrediente, quantidade ou rendimento que não esteja escrito.

Devolva:
- "receita": false se não houver uma receita (ex: foto de outra coisa, texto sem ingredientes). Senão true.
- "nome": nome da receita, ou null se não aparecer.
- "porcoes": número de porções/pessoas que rende, ou null se não estiver escrito.
- "ingredientes": um por ingrediente, com:
  - "nome": o ingrediente, genérico, em português, minúsculo, sem marca (ex: "farinha de trigo", "ovo", "leite").
    Se for o mesmo ingrediente de algum da lista "INGREDIENTES QUE O APP JÁ CONHECE", use EXATAMENTE aquele nome e aquela unidade.
  - "alternativas": lista de outros ingredientes que a receita aceita no lugar (ex: "penne ou parafuso" -> nome "penne", alternativas ["parafuso"]). Senão [].
  - "qtd" e "unidade": unidade só pode ser g, ml ou un. Converta medidas caseiras com estimativa razoável:
    1 xícara de líquido = 240 ml; 1 xícara de farinha = 120 g; 1 xícara de açúcar = 180 g; 1 xícara de arroz = 185 g;
    1 colher de sopa = 15 ml (líquido) ou cerca de 10 a 15 g (sólido); 1 colher de chá = 5 ml ou cerca de 4 g;
    1 lata de leite condensado = 395 g; 1 caixinha de creme de leite = 200 g; 1 dente de alho = 1 un; ovos, cebolas, tomates = un.
    Se a quantidade não estiver escrita, ou for "a gosto"/"quanto baste", use qtd null e unidade null.
  - "original": o trecho do ingrediente exatamente como está escrito (ex: "2 xícaras de farinha de trigo").
- "macros": quais destes grupos a receita tem em quantidade relevante: ${RECIPE_MACROS.join(', ')} (carbo = arroz, massa, pão, batata, farinha...).
- "observacao": se algo estiver ilegível, cortado na foto ou faltando, explique em uma frase curta para a pessoa. Senão null.

INGREDIENTES QUE O APP JÁ CONHECE (nome e unidade):
${formatKnownIngredients(knownIngredients) || '(nenhum)'}

Responda só com JSON neste formato:
{"receita":true,"nome":"...","porcoes":4,"ingredientes":[{"nome":"...","alternativas":[],"qtd":200,"unidade":"g","original":"..."}],"macros":["carbo"],"observacao":null}`;
}

function sanitizeRecipe(result) {
    const toText = (value, max) => cleanText(typeof value === 'string' ? value : '').slice(0, max);
    const servings = Math.round(Number(result?.porcoes));

    const ingredientes = (Array.isArray(result?.ingredientes) ? result.ingredientes : [])
        .slice(0, 60)
        .map((item) => {
            const unit = String(item?.unidade || '').toLowerCase();
            const qty = Number(item?.qtd);
            const hasQty = ['g', 'ml', 'un', 'kg', 'l'].includes(unit) && Number.isFinite(qty) && qty > 0;

            return {
                nome: toText(item?.nome, 60).toLowerCase(),
                alternativas: (Array.isArray(item?.alternativas) ? item.alternativas : [])
                    .map((alt) => toText(alt, 60).toLowerCase())
                    .filter(Boolean)
                    .slice(0, 3),
                qtd: hasQty ? round(qty) : null,
                unidade: hasQty ? unit : null,
                original: toText(item?.original, 120)
            };
        })
        .filter((item) => item.nome);

    return {
        receita: result?.receita !== false,
        nome: toText(result?.nome, 80) || null,
        porcoes: Number.isFinite(servings) && servings > 0 && servings <= 100 ? servings : null,
        ingredientes,
        macros: (Array.isArray(result?.macros) ? result.macros : []).filter((m) => RECIPE_MACROS.includes(m)),
        observacao: toText(result?.observacao, 300) || null
    };
}

app.post('/ler-receita', async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(503).json({ sucesso: false, erro: 'A leitura de receitas não está disponível no momento.' });
        }

        const { imagens, texto, knownIngredients } = req.body || {};
        const images = (Array.isArray(imagens) ? imagens : [])
            .slice(0, MAX_RECIPE_IMAGES)
            .filter((img) => img && RECIPE_IMAGE_TYPES.includes(img.mimeType) &&
                typeof img.data === 'string' && img.data.length > 0 && img.data.length <= MAX_IMAGE_BASE64)
            .map((img) => ({ mimeType: img.mimeType, data: img.data }));
        const text = typeof texto === 'string' ? texto.trim().slice(0, MAX_RECIPE_TEXT) : '';

        if (!images.length && !text) {
            return res.status(400).json({ sucesso: false, erro: 'Envie uma foto ou o texto da receita.' });
        }

        const result = await callGemini(buildRecipePrompt(knownIngredients, images.length ? '' : text), images, 60000);
        const receita = sanitizeRecipe(result);

        if (!receita.receita || !receita.ingredientes.length) {
            return res.status(422).json({
                sucesso: false,
                erro: images.length
                    ? 'Não consegui encontrar os ingredientes nessa foto. Tente uma foto mais de perto, com boa luz e sem cortar a lista.'
                    : 'Não encontrei ingredientes nesse texto. Diga ou escreva cada ingrediente com a quantidade.'
            });
        }

        return res.json({ sucesso: true, receita });
    } catch (error) {
        console.error('Erro ao ler receita:', error?.response?.status || '', error?.message);
        const status = error?.response?.status;

        return res.status(502).json({
            sucesso: false,
            erro: status === 429
                ? 'Muitas leituras seguidas. Espere um minuto e tente de novo.'
                : 'Não foi possível ler a receita agora. Tente de novo em instantes.'
        });
    }
});

app.use((req, res) => {
    res.status(404).json({
        sucesso: false,
        erro: 'Rota não encontrada.'
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}

module.exports = { extractProductsFromHtml, toAppFormat };
