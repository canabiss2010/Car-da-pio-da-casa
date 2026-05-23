const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function cleanText(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/\s+/g, ' ')
        .replace(/\u00A0/g, ' ')
        .trim();
}

function normalizeUnit(value) {
    const unit = cleanText(value).toLowerCase();
    if (!unit) return '';

    const map = {
        'un': 'un',
        'unidade': 'un',
        'unidades': 'un',
        'pc': 'un',
        'peca': 'un',
        'peça': 'un',
        'pecas': 'un',
        'peças': 'un',
        'kg': 'kg',
        'kilograma': 'kg',
        'kilogramas': 'kg',
        'g': 'g',
        'grama': 'g',
        'gramas': 'g',
        'mg': 'g',
        'm': 'm',
        'metro': 'm',
        'metros': 'm',
        'cm': 'cm',
        'mm': 'mm',
        'l': 'l',
        'litro': 'l',
        'litros': 'l',
        'ml': 'ml',
        'mililitro': 'ml',
        'mililitros': 'ml',
        'cx': 'cx',
        'caixa': 'cx',
        'caixas': 'cx',
        'pct': 'pct',
        'pacote': 'pct',
        'pacotes': 'pct'
    };

    return map[unit] || unit;
}

function parseQty(value) {
    const cleaned = cleanText(value)
        .replace(/[,]/g, '.')
        .replace(/[^0-9.]/g, '');

    if (!cleaned) return 0;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getHeaderIndex(headers, keywords) {
    return headers.findIndex((header) => {
        const normalized = cleanText(header).toLowerCase();
        return keywords.some((keyword) => normalized.includes(keyword));
    });
}

function extractProductsFromHtml(html) {
    const $ = cheerio.load(html);
    const produtos = [];

    $('table').each((_, table) => {
        const rows = $(table).find('tr');
        if (!rows.length) return;

        const headerCells = $(rows[0]).find('th, td').toArray().map((cell) => cleanText($(cell).text()));
        const hasHeader = headerCells.length >= 2;

        let nameIndex = -1;
        let qtyIndex = -1;
        let unitIndex = -1;

        if (hasHeader) {
            nameIndex = getHeaderIndex(headerCells, ['descricao', 'produto', 'item', 'mercadoria', 'artigo']);
            qtyIndex = getHeaderIndex(headerCells, ['quantidade', 'qtd', 'qtde', 'qt.', 'qt']);
            unitIndex = getHeaderIndex(headerCells, ['unidade', 'medida', 'und', 'uom']);
        }

        $(rows).slice(hasHeader ? 1 : 0).each((_, row) => {
            const cells = $(row).find('td').toArray().map((cell) => cleanText($(cell).text()));
            if (!cells.length) return;

            let name = '';
            let qty = 0;
            let unit = '';

            if (nameIndex >= 0 && qtyIndex >= 0 && unitIndex >= 0) {
                name = cells[nameIndex] || '';
                qty = parseQty(cells[qtyIndex]);
                unit = normalizeUnit(cells[unitIndex]);
            } else {
                const first = cells[0] || '';
                const second = cells[1] || '';
                const third = cells[2] || '';

                if (cells.length >= 3) {
                    name = first;
                    qty = parseQty(second);
                    unit = normalizeUnit(third);
                } else if (cells.length >= 2) {
                    name = first;
                    qty = parseQty(second);
                    unit = '';
                }
            }

            if (!name) return;

            const normalizedQty = typeof qty === 'number' && Number.isFinite(qty) ? qty : 0;
            if (normalizedQty === 0 && !unit) {
                return;
            }

            produtos.push({
                name,
                qty: normalizedQty,
                unit: unit || 'un'
            });
        });
    });

    return produtos;
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

        const response = await axios.get(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; NotaFiscalScraper/1.0; +https://example.com)'
            },
            maxRedirects: 5
        });

        const html = response.data;
        if (!html || typeof html !== 'string') {
            return res.status(502).json({
                sucesso: false,
                erro: 'Não foi possível obter o HTML da nota fiscal.'
            });
        }

        const produtos = extractProductsFromHtml(html)
            .map((item) => ({
                name: cleanText(item.name),
                qty: item.qty,
                unit: normalizeUnit(item.unit)
            }))
            .filter((item) => item.name);

        if (!produtos.length) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Não foi possível localizar a tabela de itens da nota fiscal.'
            });
        }

        return res.json({
            sucesso: true,
            produtos
        });
    } catch (error) {
        const mensagem = error?.response?.status
            ? `Falha ao acessar a URL informada (${error.response.status}).`
            : 'Erro ao processar a nota fiscal. O site pode estar indisponível ou a URL está inválida.';

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

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
