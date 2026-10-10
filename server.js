const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
    cleanName = cleanName.replace(/\s+(kg|un|und)$/i, '');

    return {
        name: cleanName || cleanText(name),
        qty: round(quantity),
        unit: finalUnit,
        category: guessCategory(cleanName)
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

        const produtos = extractProductsFromHtml(html)
            .filter((item) => cleanText(item.name))
            .map(toAppFormat);

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
