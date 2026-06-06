(function diamondAnotaAiCollector() {
  const SENSITIVE_KEY = /(token|jwt|authorization|cookie|senha|password|secret|refresh|access[_-]?token|id[_-]?token|session|credential|auth)/i;
  const state = window.__DIAMOND_ANOTA_AI_COLLECTOR__ || {
    tables: new Map(),
    products: new Map(),
    captured: 0,
    lastCapture: ""
  };
  window.__DIAMOND_ANOTA_AI_COLLECTOR__ = state;

  function normalizeHeader(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value).replace(/[^\d,.-]/g, "").trim();
    if (!text) return null;
    const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function readFirst(object, keys) {
    if (!object || typeof object !== "object") return "";
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && String(object[key]).trim() !== "") return object[key];
      const normalized = normalizeHeader(key);
      const found = Object.keys(object).find((candidate) => normalizeHeader(candidate) === normalized);
      if (found && object[found] !== undefined && object[found] !== null && String(object[found]).trim() !== "") {
        return object[found];
      }
    }
    return "";
  }

  function productKey(product) {
    return `${normalizeHeader(product.category)}:${normalizeHeader(product.name)}`;
  }

  function tableKey(table) {
    return String(table.number);
  }

  function addTable(table) {
    if (!table || !table.number || table.number === 999) return;
    state.tables.set(tableKey(table), {
      number: Number(table.number),
      seats: Number(table.seats || 4) || 4
    });
  }

  function addProduct(product) {
    if (!product || !product.name || product.price === null || product.price === undefined) return;
    const cleanProduct = {
      name: cleanText(product.name),
      category: cleanText(product.category || "Sem categoria"),
      price: Number(product.price || 0),
      stock: Math.max(0, Math.round(Number(product.stock ?? 999)))
    };
    if (!cleanProduct.name || !Number.isFinite(cleanProduct.price)) return;
    state.products.set(productKey(cleanProduct), cleanProduct);
  }

  function maybeTable(object) {
    const type = String(readFirst(object, ["type", "tipo", "kind", "categoria"]) || "").toLowerCase();
    const label = readFirst(object, ["name", "nome", "title", "titulo", "label", "mesa", "table", "number", "numero"]);
    const numberMatch = String(label || readFirst(object, ["id", "code", "codigo"])).match(/\b([0-9]{1,4})\b/);
    if (!numberMatch) return null;
    const looksLikeTable = type.includes("table") || type.includes("mesa") || /\bmesa\b/i.test(String(label)) || object.table || object.mesa || object.number || object.numero;
    if (!looksLikeTable) return null;
    return {
      number: Number(numberMatch[1]),
      seats: parseNumber(readFirst(object, ["seats", "lugares", "assentos", "capacity", "capacidade"])) || 4
    };
  }

  function maybeProduct(object, fallbackCategory = "") {
    const name = readFirst(object, [
      "name", "nome", "title", "titulo", "productName", "nomeProduto", "description", "descricao", "descrição", "item", "produto"
    ]);
    const price = parseNumber(readFirst(object, [
      "price", "preco", "preço", "value", "valor", "amount", "salePrice", "sellingPrice", "unitPrice", "valorVenda"
    ]));
    if (!name || price === null) return null;
    return {
      name,
      category: readFirst(object, ["category", "categoria", "group", "grupo", "section", "secao", "seção"]) || fallbackCategory || "Sem categoria",
      price,
      stock: parseNumber(readFirst(object, ["stock", "estoque", "quantity", "quantidade", "qtd"])) ?? 999
    };
  }

  function safeWalk(value, visitor, depth = 0, seen = new WeakSet(), fallbackCategory = "") {
    if (depth > 9 || value === null || value === undefined) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => safeWalk(item, visitor, depth + 1, seen, fallbackCategory));
      return;
    }

    visitor(value, fallbackCategory);

    const categoryName = readFirst(value, ["category", "categoria", "group", "grupo", "name", "nome", "title", "titulo"]) || fallbackCategory;
    Object.keys(value).forEach((key) => {
      if (SENSITIVE_KEY.test(key)) return;
      const child = value[key];
      if (child && typeof child === "object") safeWalk(child, visitor, depth + 1, seen, categoryName);
    });
  }

  function ingestJson(payload, source = "json") {
    let found = 0;
    safeWalk(payload, (object, fallbackCategory) => {
      const table = maybeTable(object);
      if (table) {
        addTable(table);
        found += 1;
      }
      const product = maybeProduct(object, fallbackCategory);
      if (product) {
        addProduct(product);
        found += 1;
      }
    });
    if (found) {
      state.captured += found;
      state.lastCapture = source;
      updatePanel();
    }
  }

  function extractPriceFromText(text) {
    const match = String(text).match(/R\$\s*([0-9.]+,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)/i);
    return match ? parseNumber(match[1]) : null;
  }

  function scanDom() {
    let currentCategory = "";
    const selectors = [
      "[role='row']",
      "[class*='product']",
      "[class*='item']",
      "[class*='menu']",
      "[class*='table']",
      "[class*='mesa']",
      "tr",
      "li",
      "article",
      "button"
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(","))).slice(0, 4000);
    nodes.forEach((node) => {
      const text = cleanText(node.innerText || node.textContent || "");
      if (!text || text.length > 260) return;
      const tableMatch = text.match(/\bMesa\s*([0-9]{1,4})\b/i);
      if (tableMatch) addTable({ number: Number(tableMatch[1]), seats: 4 });

      const price = extractPriceFromText(text);
      if (price !== null) {
        const name = cleanText(text.replace(/R\$\s*[0-9.,]+/gi, "").replace(/\b[0-9]+[,.][0-9]{2}\b/g, ""));
        if (name && !/\b(total|subtotal|entrega|taxa|desconto)\b/i.test(name)) {
          addProduct({ name, category: currentCategory || "Sem categoria", price, stock: 999 });
        }
        return;
      }

      if (text.length <= 40 && !/\d{3,}/.test(text) && !/\b(buscar|salvar|editar|excluir|voltar)\b/i.test(text)) {
        currentCategory = text;
      }
    });
    updatePanel();
  }

  function scanScripts() {
    Array.from(document.scripts).forEach((script) => {
      const text = script.textContent || "";
      if (!text || text.length < 20 || SENSITIVE_KEY.test(text.slice(0, 240))) return;
      if (script.id === "__NEXT_DATA__") {
        try {
          ingestJson(JSON.parse(text), "__NEXT_DATA__");
        } catch (error) {}
      }
    });
  }

  function hookFetch() {
    if (window.__DIAMOND_FETCH_HOOKED__) return;
    window.__DIAMOND_FETCH_HOOKED__ = true;
    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = async function patchedFetch() {
        const response = await originalFetch.apply(this, arguments);
        try {
          const url = String(arguments[0]?.url || arguments[0] || "");
          const type = response.headers.get("content-type") || "";
          if (type.includes("json") && !SENSITIVE_KEY.test(url)) {
            response.clone().json().then((json) => ingestJson(json, url)).catch(() => {});
          }
        } catch (error) {}
        return response;
      };
    }

    const OriginalXHR = window.XMLHttpRequest;
    if (OriginalXHR && !OriginalXHR.__DIAMOND_PATCHED__) {
      function PatchedXHR() {
        const xhr = new OriginalXHR();
        let requestUrl = "";
        const originalOpen = xhr.open;
        xhr.open = function patchedOpen(method, url) {
          requestUrl = String(url || "");
          return originalOpen.apply(xhr, arguments);
        };
        xhr.addEventListener("load", () => {
          try {
            const type = xhr.getResponseHeader("content-type") || "";
            if (type.includes("json") && !SENSITIVE_KEY.test(requestUrl)) {
              ingestJson(JSON.parse(xhr.responseText), requestUrl);
            }
          } catch (error) {}
        });
        return xhr;
      }
      PatchedXHR.__DIAMOND_PATCHED__ = true;
      window.XMLHttpRequest = PatchedXHR;
    }
  }

  function exportData() {
    const payload = {
      source: "anota.ai",
      exportedAt: new Date().toISOString(),
      tables: Array.from(state.tables.values()).sort((a, b) => a.number - b.number),
      catalog: Array.from(state.products.values()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    };
    return JSON.stringify(payload, null, 2);
  }

  async function copyData() {
    const json = exportData();
    try {
      await navigator.clipboard.writeText(json);
      setStatus("Copiado. Cole no Diamond > Adm > Importar.");
    } catch (error) {
      downloadData();
    }
  }

  function downloadData() {
    const blob = new Blob([exportData()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "diamond-anota-ai-import.json";
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("Arquivo JSON baixado.");
  }

  function setStatus(message) {
    const status = document.getElementById("diamondCollectorStatus");
    if (status) status.textContent = message;
  }

  function updatePanel() {
    const count = document.getElementById("diamondCollectorCount");
    if (count) {
      count.textContent = `${state.tables.size} mesas / ${state.products.size} produtos`;
    }
    const last = document.getElementById("diamondCollectorLast");
    if (last && state.lastCapture) last.textContent = `Ultima captura: ${state.lastCapture}`;
  }

  function installPanel() {
    let panel = document.getElementById("diamondAnotaCollector");
    if (panel) {
      updatePanel();
      return;
    }
    panel = document.createElement("div");
    panel.id = "diamondAnotaCollector";
    panel.innerHTML = `
      <div style="font-weight:900;font-size:14px;margin-bottom:6px;">Diamond Coletor</div>
      <div id="diamondCollectorCount" style="font-weight:800;color:#9df7ff;">0 mesas / 0 produtos</div>
      <div id="diamondCollectorLast" style="font-size:11px;color:#aeb8c6;margin-top:4px;">Navegue nas telas do Anota AI.</div>
      <div id="diamondCollectorStatus" style="font-size:11px;color:#ffca3a;margin-top:6px;"></div>
      <button id="diamondCollectorScan" type="button">Varrer tela</button>
      <button id="diamondCollectorCopy" type="button">Copiar JSON</button>
      <button id="diamondCollectorDownload" type="button">Baixar JSON</button>
    `;
    panel.style.cssText = [
      "position:fixed",
      "right:14px",
      "bottom:14px",
      "z-index:2147483647",
      "width:260px",
      "padding:12px",
      "border:1px solid #45f0df",
      "border-radius:8px",
      "background:#101218",
      "color:#fff",
      "box-shadow:0 18px 50px rgba(0,0,0,.38)",
      "font-family:Inter,Arial,sans-serif"
    ].join(";");
    const style = document.createElement("style");
    style.textContent = `
      #diamondAnotaCollector button {
        min-height: 34px;
        margin: 8px 6px 0 0;
        border: 0;
        border-radius: 6px;
        padding: 0 9px;
        color: #061014;
        background: linear-gradient(90deg,#ff4d6d,#ffca3a,#31d58a,#26b7ff);
        font-weight: 900;
        cursor: pointer;
      }
    `;
    document.documentElement.appendChild(style);
    document.body.appendChild(panel);
    document.getElementById("diamondCollectorScan").addEventListener("click", () => {
      scanDom();
      scanScripts();
      setStatus("Tela varrida.");
    });
    document.getElementById("diamondCollectorCopy").addEventListener("click", copyData);
    document.getElementById("diamondCollectorDownload").addEventListener("click", downloadData);
    updatePanel();
  }

  hookFetch();
  installPanel();
  scanScripts();
  scanDom();
  setStatus("Coletor ligado. Abra Mesas/Produtos/Cardapio no Anota AI.");
})();
