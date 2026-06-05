const STORAGE_KEY = "diamondDeliveryState.v2";
const LEGACY_STORAGE_KEY = "diamondDeliveryState.v1";
const SESSION_KEY = "diamondDeliverySession.v1";
const API_SESSION_KEY = "diamondDeliveryApiSession.v1";
const ENV = window.DIAMOND_DELIVERY_ENV || {};
const API_URL = String(ENV.API_URL || "http://127.0.0.1:8787/api").replace(/\/+$/, "");
const USE_SUPABASE = Boolean(API_URL);
const LOCAL_DEMO_ENABLED = !USE_SUPABASE && (isLocalRuntime() || String(ENV.ALLOW_LOCAL_DEMO || "").toLowerCase() === "true");
const MEAT_POINTS = ["Mal passada", "Ao ponto", "Bem passada"];
const DEMO_USERS = [
  { id: "user-admin", username: "admin", displayName: "Administrador", password: "1234", role: "admin" },
  { id: "user-kitchen", username: "cozinha", displayName: "Cozinha", password: "1234", role: "cozinha" }
];

const seedState = {
  selectedTableId: "table-1",
  activeView: "overview",
  serviceDraft: { tableId: "table-1", customerName: "", items: [] },
  calls: [],
  staffAlerts: [],
  users: [],
  tables: [
    { id: "table-1", number: 1, seats: 4, currentOrderId: "order-1" },
    { id: "table-2", number: 2, seats: 2, currentOrderId: null },
    { id: "table-3", number: 3, seats: 4, currentOrderId: "order-2" },
    { id: "table-4", number: 4, seats: 6, currentOrderId: null },
    { id: "table-5", number: 5, seats: 4, currentOrderId: null },
    { id: "table-6", number: 6, seats: 2, currentOrderId: null }
  ],
  catalog: [
    { id: "prod-1", name: "X-Burger Diamond", category: "Comidas", price: 18.9, stock: 24 },
    { id: "prod-2", name: "Batata cheddar", category: "Comidas", price: 14.5, stock: 18 },
    { id: "prod-3", name: "Coca-Cola lata", category: "Bebidas", price: 6.5, stock: 36 },
    { id: "prod-4", name: "Suco natural", category: "Bebidas", price: 8.0, stock: 20 },
    { id: "prod-5", name: "Combo casal", category: "Combos", price: 49.9, stock: 12 }
  ],
  stock: [
    { id: "stock-1", name: "Pao brioche", qty: 42, min: 12, unit: "un" },
    { id: "stock-2", name: "Hamburguer 120g", qty: 28, min: 10, unit: "un" },
    { id: "stock-3", name: "Queijo cheddar", qty: 5, min: 8, unit: "kg" },
    { id: "stock-4", name: "Refrigerante lata", qty: 36, min: 18, unit: "un" }
  ],
  orders: [
    {
      id: "order-1",
      tableId: "table-1",
      tableNumber: 1,
      status: "preparing",
      createdAt: Date.now() - 1000 * 60 * 18,
      updatedAt: Date.now() - 1000 * 60 * 12,
      customerName: "Cliente balcão",
      attendantId: "user-admin",
      attendantName: "Administrador",
      readyAt: null,
      calledAt: null,
      items: [
        { productId: "prod-1", name: "X-Burger Diamond", qty: 2, price: 18.9, meatPoint: "Ao ponto" },
        { productId: "prod-3", name: "Coca-Cola lata", qty: 2, price: 6.5 }
      ]
    },
    {
      id: "order-2",
      tableId: "table-3",
      tableNumber: 3,
      status: "ready",
      createdAt: Date.now() - 1000 * 60 * 9,
      updatedAt: Date.now() - 1000 * 60 * 2,
      customerName: "Mesa 3",
      attendantId: "user-admin",
      attendantName: "Administrador",
      readyAt: Date.now() - 1000 * 60 * 2,
      calledAt: null,
      items: [
        { productId: "prod-2", name: "Batata cheddar", qty: 1, price: 14.5 },
        { productId: "prod-4", name: "Suco natural", qty: 1, price: 8.0 }
      ]
    }
  ]
};

let activeUser = null;
let apiSession = loadStoredApiSession();
let state = loadState();
let catalogFilter = "Todos";
let serviceCategory = "Todos";
let callSpotlightTimer = null;
let remotePollTimer = null;
let remoteSaveTimer = null;
let isLoadingRemoteState = false;
let lastRemoteUpdatedAt = "";
let lastRemotePayloadJson = "";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindBrowserGuard();
  initApp();
});

function bindBrowserGuard() {
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const blocked =
      event.key === "F12" ||
      (event.ctrlKey && key === "u") ||
      (event.ctrlKey && key === "s") ||
      (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key));

    if (blocked) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

async function initApp() {
  cacheElements();
  bindEvents();
  updateClock();
  setInterval(updateClock, 1000);
  window.addEventListener("hashchange", handleHashChange);
  updateLoginChrome();

  if (USE_SUPABASE) {
    await restoreSupabaseSession();
    if (currentUser()) {
      await loadRemoteUsers();
      await loadRemoteState();
      showApp();
      startRemotePolling();
      return;
    }

    showLogin();
    return;
  }

  if (currentUser()) {
    showApp();
  } else {
    showLogin();
  }
}

function cacheElements() {
  Object.assign(els, {
    loginView: document.getElementById("loginView"),
    appView: document.getElementById("appView"),
    loginForm: document.getElementById("loginForm"),
    loginError: document.getElementById("loginError"),
    loginModeHint: document.getElementById("loginModeHint"),
    logoutBtn: document.getElementById("logoutBtn"),
    adminSettingsBtn: document.getElementById("adminSettingsBtn"),
    currentClock: document.getElementById("currentClock"),
    currentUserLabel: document.getElementById("currentUserLabel"),
    navButtons: Array.from(document.querySelectorAll("[data-view]")),
    panels: Array.from(document.querySelectorAll("[data-panel]")),
    jumpButtons: Array.from(document.querySelectorAll("[data-jump]")),
    metricsGrid: document.getElementById("metricsGrid"),
    overviewTables: document.getElementById("overviewTables"),
    readyCallBoard: document.getElementById("readyCallBoard"),
    quickCallBtn: document.getElementById("quickCallBtn"),
    clearCallsBtn: document.getElementById("clearCallsBtn"),
    tableForm: document.getElementById("tableForm"),
    tablesGrid: document.getElementById("tablesGrid"),
    tableDetail: document.getElementById("tableDetail"),
    kitchenIncoming: document.getElementById("kitchenIncoming"),
    kitchenProduction: document.getElementById("kitchenProduction"),
    readyOrders: document.getElementById("readyOrders"),
    serviceTableSelect: document.getElementById("serviceTableSelect"),
    serviceStatusStrip: document.getElementById("serviceStatusStrip"),
    serviceSearch: document.getElementById("serviceSearch"),
    serviceCategoryButtons: Array.from(document.querySelectorAll("[data-service-category]")),
    serviceProductGrid: document.getElementById("serviceProductGrid"),
    serviceCustomerName: document.getElementById("serviceCustomerName"),
    serviceCartList: document.getElementById("serviceCartList"),
    serviceCartTotal: document.getElementById("serviceCartTotal"),
    serviceSendBtn: document.getElementById("serviceSendBtn"),
    serviceClearBtn: document.getElementById("serviceClearBtn"),
    catalogForm: document.getElementById("catalogForm"),
    catalogId: document.getElementById("catalogId"),
    productName: document.getElementById("productName"),
    productCategory: document.getElementById("productCategory"),
    productPrice: document.getElementById("productPrice"),
    productStock: document.getElementById("productStock"),
    cancelProductEdit: document.getElementById("cancelProductEdit"),
    catalogList: document.getElementById("catalogList"),
    categoryFilters: Array.from(document.querySelectorAll("[data-category-filter]")),
    stockForm: document.getElementById("stockForm"),
    stockId: document.getElementById("stockId"),
    stockName: document.getElementById("stockName"),
    stockQty: document.getElementById("stockQty"),
    stockMin: document.getElementById("stockMin"),
    stockUnit: document.getElementById("stockUnit"),
    cancelStockEdit: document.getElementById("cancelStockEdit"),
    stockList: document.getElementById("stockList"),
    stockAlertCount: document.getElementById("stockAlertCount"),
    toastHost: document.getElementById("toastHost"),
    callSpotlight: document.getElementById("callSpotlight"),
    callSpotlightTable: document.getElementById("callSpotlightTable"),
    callSpotlightMessage: document.getElementById("callSpotlightMessage"),
    callSpotlightClose: document.getElementById("callSpotlightClose"),
    adminModal: document.getElementById("adminModal"),
    adminModalClose: document.getElementById("adminModalClose"),
    adminUserForm: document.getElementById("adminUserForm"),
    adminDisplayName: document.getElementById("adminDisplayName"),
    adminUsername: document.getElementById("adminUsername"),
    adminPassword: document.getElementById("adminPassword"),
    adminRole: document.getElementById("adminRole"),
    adminResetForm: document.getElementById("adminResetForm"),
    adminResetUser: document.getElementById("adminResetUser"),
    adminNewPassword: document.getElementById("adminNewPassword"),
    adminUsersList: document.getElementById("adminUsersList"),
    adminUsersCount: document.getElementById("adminUsersCount"),
    adminSalesSummary: document.getElementById("adminSalesSummary"),
    adminSalesTables: document.getElementById("adminSalesTables"),
    adminSalesProducts: document.getElementById("adminSalesProducts"),
    adminTabButtons: Array.from(document.querySelectorAll("[data-admin-tab]")),
    adminTabPanels: Array.from(document.querySelectorAll("[data-admin-panel]"))
  });
}

function bindEvents() {
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.adminSettingsBtn.addEventListener("click", openAdminModal);
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  els.jumpButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.jump));
  });
  els.quickCallBtn.addEventListener("click", callLastReadyOrder);
  els.clearCallsBtn.addEventListener("click", clearCalls);
  els.tableForm.addEventListener("submit", addTable);
  els.serviceTableSelect.addEventListener("change", () => {
    state.serviceDraft.tableId = els.serviceTableSelect.value;
    state.selectedTableId = els.serviceTableSelect.value;
    saveState();
    render();
  });
  els.serviceSearch.addEventListener("input", renderService);
  els.serviceCustomerName.addEventListener("input", () => {
    serviceDraft().customerName = els.serviceCustomerName.value;
    saveState();
  });
  els.serviceCategoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      serviceCategory = button.dataset.serviceCategory;
      els.serviceCategoryButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      renderService();
    });
  });
  els.serviceSendBtn.addEventListener("click", sendServiceOrder);
  els.serviceClearBtn.addEventListener("click", clearServiceDraft);
  els.callSpotlightClose.addEventListener("click", hideCallSpotlight);
  els.adminModalClose.addEventListener("click", closeAdminModal);
  els.adminModal.addEventListener("click", (event) => {
    if (event.target === els.adminModal) closeAdminModal();
  });
  els.adminTabButtons.forEach((button) => {
    button.addEventListener("click", () => switchAdminTab(button.dataset.adminTab));
  });
  els.adminUserForm.addEventListener("submit", createAdminUser);
  els.adminResetForm.addEventListener("submit", resetAdminPassword);
  els.catalogForm.addEventListener("submit", saveProduct);
  els.cancelProductEdit.addEventListener("click", cancelProductEdit);
  els.categoryFilters.forEach((button) => {
    button.addEventListener("click", () => {
      catalogFilter = button.dataset.categoryFilter;
      els.categoryFilters.forEach((item) => item.classList.toggle("is-active", item === button));
      renderCatalog();
    });
  });
  els.stockForm.addEventListener("submit", saveStockItem);
  els.cancelStockEdit.addEventListener("click", cancelStockEdit);
}

async function handleLogin(event) {
  event.preventDefault();
  const data = new FormData(els.loginForm);
  const username = String(data.get("username") || "").trim();
  const password = String(data.get("password") || "").trim();

  els.loginError.textContent = "";

  if (USE_SUPABASE) {
    try {
      await loginWithSupabase(username, password);
      els.loginForm.reset();
      return;
    } catch (error) {
      console.error("Falha no login Supabase", error);
      els.loginError.textContent = error.message || "Nao foi possivel entrar no Supabase.";
      return;
    }
  }

  if (LOCAL_DEMO_ENABLED) {
    const user = state.users.find((item) => item.username === username && item.password === password);
    if (!user) {
      els.loginError.textContent = "Usuario ou senha incorretos.";
      return;
    }

    activeUser = stripPrivateUserFields(user);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    }));
    els.loginError.textContent = "";
    showApp();
    return;
  }

  els.loginError.textContent = "Configure o Supabase antes de publicar o sistema.";
}

async function handleLogout() {
  if (USE_SUPABASE) {
    try {
      if (apiSession?.token) {
        await apiRequest("/auth/logout", { method: "POST" });
      }
    } catch (error) {
      console.warn("Falha ao encerrar sessao na API", error);
    }
    clearApiSession();
    stopRemotePolling();
  } else {
    activeUser = null;
    localStorage.removeItem(SESSION_KEY);
  }
  showLogin();
}

function showLogin() {
  els.appView.classList.add("is-hidden");
  els.loginView.classList.remove("is-hidden");
  updateLoginChrome();
}

function showApp() {
  els.loginView.classList.add("is-hidden");
  els.appView.classList.remove("is-hidden");
  const user = currentUser();
  const targetView = user?.role === "cozinha" ? "orders" : requestedView() || state.activeView || "overview";
  switchView(targetView);
  render();
}

function switchView(view) {
  const user = currentUser();
  if (user?.role === "cozinha") view = "orders";
  if (!els.panels.some((panel) => panel.dataset.panel === view)) view = "overview";
  state.activeView = view;
  saveState();
  els.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  els.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === view));
  if (window.location.hash !== `#${view}`) {
    window.history.replaceState(null, "", `#${view}`);
  }
}

function handleHashChange() {
  if (els.appView.classList.contains("is-hidden")) return;
  const view = requestedView();
  if (view && view !== state.activeView) switchView(view);
}

function requestedView() {
  const view = window.location.hash.replace("#", "");
  return els.panels.some((panel) => panel.dataset.panel === view) ? view : "";
}

function render() {
  renderUserChrome();
  renderMetrics();
  renderOverviewTables();
  renderCallBoard();
  renderTables();
  renderOrders();
  renderService();
  renderCatalog();
  renderStock();
  renderAdminUsers();
  renderSalesDashboard();
}

function renderUserChrome() {
  const user = currentUser();
  els.appView.classList.toggle("is-role-kitchen", user?.role === "cozinha");
  els.appView.classList.toggle("is-role-admin", user?.role === "admin");
  if (els.currentUserLabel) {
    els.currentUserLabel.textContent = user ? `${user.displayName} - ${roleLabel(user.role)}` : "Atendente";
  }
  if (els.adminSettingsBtn) {
    els.adminSettingsBtn.classList.toggle("is-hidden", user?.role !== "admin");
  }
}

function renderMetrics() {
  const activeOrders = state.orders.filter((order) => !["closed", "delivered"].includes(order.status));
  const readyOrders = activeOrders.filter((order) => order.status === "ready");
  const occupiedTables = state.tables.filter((table) => table.currentOrderId).length;
  const totalOpen = activeOrders.reduce((sum, order) => sum + orderTotal(order), 0);

  const metrics = [
    ["Mesas ocupadas", occupiedTables, `${state.tables.length} mesas cadastradas`],
    ["Pedidos ativos", activeOrders.length, `${readyOrders.length} prontos`],
    ["Venda aberta", money.format(totalOpen), "Total ainda nao fechado"],
    ["Estoque baixo", lowStockItems().length, "Itens abaixo do minimo"]
  ];

  els.metricsGrid.innerHTML = metrics
    .map(([label, value, note]) => `
      <article class="metric-card">
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(String(value))}</div>
        <div class="metric-note">${escapeHtml(note)}</div>
      </article>
    `)
    .join("");
}

function renderOverviewTables() {
  const rows = sortedTables()
    .slice(0, 8)
    .map((table) => {
      const order = currentOrder(table);
      const status = tableStatus(table);
      return `
        <button class="compact-table-row" type="button" data-action="select-table" data-table-id="${table.id}">
          <strong>Mesa ${table.number}</strong>
          <span class="muted">${order ? money.format(orderTotal(order)) : `${table.seats || 0} lugares`}</span>
          <span class="status-pill ${status.className}">${status.label}</span>
        </button>
      `;
    })
    .join("");

  els.overviewTables.innerHTML = rows || emptyState("Nenhuma mesa cadastrada.");
  els.overviewTables.querySelectorAll("[data-action='select-table']").forEach((button) => {
    button.addEventListener("click", () => {
      selectTable(button.dataset.tableId);
      switchView("tables");
    });
  });
}

function renderCallBoard() {
  const latestCall = state.staffAlerts[0] || state.calls[0];
  if (!latestCall) {
    els.readyCallBoard.innerHTML = emptyState("Nenhuma chamada recente.");
    return;
  }

  els.readyCallBoard.innerHTML = `
    <div class="call-card">
      <div>
        <span class="muted">${latestCall.type === "kitchen-ready" ? "Aviso da cozinha" : "Pedido pronto"}</span>
        <strong>Mesa ${latestCall.tableNumber}</strong>
        <span>${escapeHtml(latestCall.message)}</span>
      </div>
    </div>
  `;
}

function renderTables() {
  const tables = sortedTables();
  els.tablesGrid.innerHTML = tables.map(renderTableCard).join("") || emptyState("Adicione a primeira mesa.");

  els.tablesGrid.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleTableAction);
  });

  if (!state.selectedTableId && tables[0]) {
    state.selectedTableId = tables[0].id;
  }
  renderTableDetail();
}

function renderTableCard(table) {
  const order = currentOrder(table);
  const status = tableStatus(table);
  const isSelected = table.id === state.selectedTableId ? "is-selected" : "";
  const readyClass = order?.status === "ready" ? "has-ready" : "";

  return `
    <article class="table-card ${isSelected} ${readyClass}">
      <div class="table-card-header">
        <span class="table-number">Mesa ${table.number}</span>
        <span class="status-pill ${status.className}">${status.label}</span>
      </div>
      <div class="table-meta">
        <span>${table.seats || 0} lugares</span>
        <span>${order ? `${order.items.length} itens` : "Sem pedido"}</span>
      </div>
      <strong>${order ? money.format(orderTotal(order)) : money.format(0)}</strong>
      <div class="table-card-actions">
        <button class="mini-button" type="button" data-action="select" data-table-id="${table.id}">Abrir</button>
        <button class="mini-button" type="button" data-action="edit" data-table-id="${table.id}">Editar</button>
        ${order && order.status === "ready" ? `<button class="mini-button" type="button" data-action="call" data-table-id="${table.id}">Chamar</button>` : ""}
      </div>
    </article>
  `;
}

function renderTableDetail() {
  const table = state.tables.find((item) => item.id === state.selectedTableId);
  if (!table) {
    els.tableDetail.innerHTML = emptyState("Selecione uma mesa.");
    return;
  }

  const order = currentOrder(table);
  const status = tableStatus(table);

  if (!order) {
    els.tableDetail.innerHTML = `
      <h3>Mesa ${table.number}</h3>
      <p class="muted">${table.seats || 0} lugares</p>
      <span class="status-pill ${status.className}">${status.label}</span>
      <div class="detail-actions">
        <button class="primary-action small-action" type="button" data-detail-action="open-order" data-table-id="${table.id}">Abrir pedido</button>
        <button class="mini-button" type="button" data-detail-action="edit-table" data-table-id="${table.id}">Editar mesa</button>
        <button class="mini-button danger-button" type="button" data-detail-action="remove-table" data-table-id="${table.id}">Remover</button>
      </div>
    `;
    bindDetailActions();
    return;
  }

  const canEditItems = ["open", "preparing"].includes(order.status);
  const itemOptions = state.catalog
    .filter((product) => product.stock > 0)
    .map((product) => `<option value="${product.id}">${escapeHtml(product.name)} - ${money.format(product.price)}</option>`)
    .join("");

  els.tableDetail.innerHTML = `
    <h3>Mesa ${table.number}</h3>
    <p class="muted">${table.seats || 0} lugares</p>
    <span class="status-pill ${status.className}">${status.label}</span>
    <div class="order-meta-block">
      <span>Cliente: ${escapeHtml(order.customerName || "Nao informado")}</span>
      <span>Atendente: ${escapeHtml(order.attendantName || "Atendente")}</span>
      <span>Hora: ${formatTime(order.createdAt)}</span>
    </div>

    <div class="order-items">
      ${order.items.map((item) => `
        <div class="order-line">
          <span>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}${item.meatPoint ? ` - ${escapeHtml(item.meatPoint)}` : ""}</span>
          <strong>${money.format(item.qty * item.price)}</strong>
        </div>
      `).join("") || emptyState("Pedido aberto sem itens.")}
    </div>

    <strong>Total: ${money.format(orderTotal(order))}</strong>

    ${canEditItems ? `
      <form class="add-item-form" data-detail-action="add-item" data-table-id="${table.id}">
        <input name="customerName" type="text" placeholder="Cliente" value="${escapeHtml(order.customerName || "")}">
        <select name="productId" required>
          ${itemOptions || `<option value="">Sem produtos em estoque</option>`}
        </select>
        <input name="qty" type="number" min="1" value="1" required>
        <select name="meatPoint">
          ${MEAT_POINTS.map((point) => `<option value="${point}">${point}</option>`).join("")}
        </select>
        <button class="primary-action small-action" type="submit" ${itemOptions ? "" : "disabled"}>Adicionar item</button>
      </form>
    ` : ""}

    <div class="detail-actions">
      ${order.status === "open" ? `<button class="mini-button" type="button" data-detail-action="send-kitchen" data-order-id="${order.id}">Enviar cozinha</button>` : ""}
      ${order.status === "preparing" ? `<button class="mini-button" type="button" data-detail-action="mark-ready" data-order-id="${order.id}">Pedido pronto</button>` : ""}
      ${order.status === "ready" ? `<button class="primary-action small-action" type="button" data-detail-action="call-order" data-order-id="${order.id}">Chamar pedido</button>` : ""}
      <button class="mini-button" type="button" data-detail-action="close-order" data-order-id="${order.id}">Finalizar mesa</button>
      <button class="mini-button" type="button" data-detail-action="edit-table" data-table-id="${table.id}">Editar mesa</button>
    </div>
  `;
  bindDetailActions();
}

function renderOrders() {
  const incoming = state.orders.filter((order) => order.status === "waiting");
  const production = state.orders.filter((order) => ["accepted", "preparing"].includes(order.status));
  const ready = state.orders.filter((order) => order.status === "ready");
  els.kitchenIncoming.innerHTML = incoming.map(renderOrderCard).join("") || emptyState("Nenhum pedido novo.");
  els.kitchenProduction.innerHTML = production.map(renderOrderCard).join("") || emptyState("Nada em producao.");
  els.readyOrders.innerHTML = ready.map(renderOrderCard).join("") || emptyState("Nenhum pedido pronto.");

  document.querySelectorAll("[data-order-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const order = state.orders.find((item) => item.id === button.dataset.orderId);
      if (!order) return;
      if (button.dataset.orderAction === "accept") updateOrderStatus(order.id, "accepted");
      if (button.dataset.orderAction === "produce") updateOrderStatus(order.id, "preparing");
      if (button.dataset.orderAction === "ready") markOrderReady(order.id);
      if (button.dataset.orderAction === "call") callOrder(order.id);
    });
  });
}

function renderOrderCard(order) {
  const table = state.tables.find((item) => item.id === order.tableId);
  const user = currentUser();
  const items = order.items.map((item) => `<li>${escapeHtml(item.qty)}x ${escapeHtml(item.name)}${item.meatPoint ? ` - ${escapeHtml(item.meatPoint)}` : ""}</li>`).join("");
  return `
    <article class="order-card">
      <div class="table-card-header">
        <h4>Mesa ${order.tableNumber || table?.number || "-"}</h4>
        <strong>${money.format(orderTotal(order))}</strong>
      </div>
      <div class="order-meta-block compact-meta">
        <span>Cliente: ${escapeHtml(order.customerName || "Nao informado")}</span>
        <span>Atendente: ${escapeHtml(order.attendantName || "Atendente")}</span>
        <span>Hora: ${formatTime(order.createdAt)}</span>
      </div>
      <ul>${items}</ul>
      <div class="order-actions">
        <span class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</span>
        ${order.status === "waiting" ? `<button class="mini-button" type="button" data-order-action="accept" data-order-id="${order.id}">Aceitar</button>` : ""}
        ${order.status === "accepted" ? `<button class="mini-button" type="button" data-order-action="produce" data-order-id="${order.id}">Iniciar producao</button>` : ""}
        ${order.status === "preparing" ? `<button class="mini-button" type="button" data-order-action="ready" data-order-id="${order.id}">Pedido pronto</button>` : ""}
        ${order.status === "ready" && user?.role !== "cozinha" ? `<button class="mini-button" type="button" data-order-action="call" data-order-id="${order.id}">Chamar</button>` : ""}
        ${order.status === "ready" && user?.role === "cozinha" ? `<span class="status-pill status-free">Atendente avisado</span>` : ""}
      </div>
    </article>
  `;
}

function renderService() {
  const draft = serviceDraft();
  const tables = sortedTables();
  if (!draft.tableId && tables[0]) draft.tableId = tables[0].id;
  if (!state.tables.some((table) => table.id === draft.tableId) && tables[0]) draft.tableId = tables[0].id;

  els.serviceTableSelect.innerHTML = tables
    .map((table) => `<option value="${table.id}">Mesa ${table.number}</option>`)
    .join("");
  els.serviceTableSelect.value = draft.tableId || "";

  const table = state.tables.find((item) => item.id === draft.tableId);
  const order = table ? currentOrder(table) : null;
  const draftQty = draft.items.reduce((sum, item) => sum + item.qty, 0);
  const draftTotalValue = draftTotal(draft);
  const user = currentUser();
  if (document.activeElement !== els.serviceCustomerName) {
    els.serviceCustomerName.value = draft.customerName || "";
  }

  els.serviceStatusStrip.innerHTML = [
    ["Mesa", table ? `Mesa ${table.number}` : "Sem mesa"],
    ["Atendente", user ? user.displayName : "Sem login"],
    ["Comanda atual", order ? money.format(orderTotal(order)) : money.format(0)],
    ["No carrinho", `${draftQty} itens`]
  ].map(([label, value]) => `
    <article class="service-status-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");

  const query = els.serviceSearch.value.trim().toLowerCase();
  const products = state.catalog.filter((product) => {
    const matchesCategory = serviceCategory === "Todos" || product.category === serviceCategory;
    const matchesQuery = !query || product.name.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  els.serviceProductGrid.innerHTML = products.map((product) => {
    const available = productAvailable(product.id);
    const disabled = available <= 0 ? "disabled" : "";
    return `
      <button class="product-card" type="button" data-service-add="${product.id}" ${disabled}>
        <div>
          <h4>${escapeHtml(product.name)}</h4>
          <div class="product-meta">
            <span class="muted">${escapeHtml(product.category)}</span>
            <span class="status-pill ${available <= 3 ? "status-ready" : "status-free"}">${available} un</span>
          </div>
        </div>
        <strong>${money.format(product.price)}</strong>
      </button>
    `;
  }).join("") || emptyState("Nenhum item encontrado.");

  els.serviceProductGrid.querySelectorAll("[data-service-add]").forEach((button) => {
    button.addEventListener("click", () => addServiceProduct(button.dataset.serviceAdd));
  });

  renderServiceCart(draft, draftTotalValue);
}

function renderServiceCart(draft, total) {
  els.serviceCartList.innerHTML = draft.items.map((item) => `
    <article class="service-cart-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${money.format(item.price)} cada</div>
        ${needsMeatPoint(item) ? `
          <select class="meat-select" data-service-meat="${item.productId}">
            ${MEAT_POINTS.map((point) => `<option value="${point}" ${item.meatPoint === point ? "selected" : ""}>${point}</option>`).join("")}
          </select>
        ` : ""}
      </div>
      <div class="cart-stepper">
        <button type="button" data-service-cart="minus" data-product-id="${item.productId}">-</button>
        <strong>${item.qty}</strong>
        <button type="button" data-service-cart="plus" data-product-id="${item.productId}">+</button>
      </div>
    </article>
  `).join("") || emptyState("Carrinho vazio.");

  els.serviceCartTotal.textContent = money.format(total);
  els.serviceSendBtn.disabled = draft.items.length === 0 || !draft.tableId;

  els.serviceCartList.querySelectorAll("[data-service-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = button.dataset.serviceCart === "plus" ? 1 : -1;
      adjustServiceProduct(button.dataset.productId, delta);
    });
  });
  els.serviceCartList.querySelectorAll("[data-service-meat]").forEach((select) => {
    select.addEventListener("change", () => updateServiceMeatPoint(select.dataset.serviceMeat, select.value));
  });
}

function renderCatalog() {
  const products = state.catalog.filter((product) => catalogFilter === "Todos" || product.category === catalogFilter);
  els.catalogList.innerHTML = products.map((product) => `
    <article class="catalog-item">
      <div class="item-main">
        <div>
          <h4>${escapeHtml(product.name)}</h4>
          <span class="muted">${escapeHtml(product.category)} - ${product.stock} un</span>
        </div>
        <span class="price-text">${money.format(product.price)}</span>
      </div>
      <div class="stock-bar" aria-hidden="true">
        <span style="--stock-level: ${Math.min(100, product.stock * 5)}%"></span>
      </div>
      <div class="item-actions">
        <button class="mini-button" type="button" data-product-action="edit" data-product-id="${product.id}">Editar</button>
        <button class="mini-button danger-button" type="button" data-product-action="delete" data-product-id="${product.id}">Remover</button>
      </div>
    </article>
  `).join("") || emptyState("Nenhum produto nesta categoria.");

  els.catalogList.querySelectorAll("[data-product-action]").forEach((button) => {
    button.addEventListener("click", () => handleProductAction(button));
  });
}

function renderStock() {
  const lowItems = lowStockItems();
  els.stockAlertCount.textContent = lowItems.length ? `${lowItems.length} baixo` : "OK";
  els.stockAlertCount.className = `status-pill ${lowItems.length ? "status-ready" : "status-free"}`;

  els.stockList.innerHTML = state.stock.map((item) => {
    const level = item.min > 0 ? Math.min(100, Math.round((item.qty / (item.min * 2)) * 100)) : 100;
    const isLow = item.qty <= item.min;
    return `
      <article class="stock-item">
        <div class="stock-main">
          <div>
            <h4>${escapeHtml(item.name)}</h4>
            <span class="muted">Minimo ${item.min} ${escapeHtml(item.unit)}</span>
          </div>
          <span class="status-pill ${isLow ? "status-ready" : "status-free"}">${item.qty} ${escapeHtml(item.unit)}</span>
        </div>
        <div class="stock-bar" aria-hidden="true">
          <span style="--stock-level: ${level}%"></span>
        </div>
        <div class="stock-actions">
          <button class="mini-button" type="button" data-stock-action="minus" data-stock-id="${item.id}">-1</button>
          <button class="mini-button" type="button" data-stock-action="plus" data-stock-id="${item.id}">+1</button>
          <button class="mini-button" type="button" data-stock-action="edit" data-stock-id="${item.id}">Editar</button>
          <button class="mini-button danger-button" type="button" data-stock-action="delete" data-stock-id="${item.id}">Remover</button>
        </div>
      </article>
    `;
  }).join("") || emptyState("Nenhum item no estoque.");

  els.stockList.querySelectorAll("[data-stock-action]").forEach((button) => {
    button.addEventListener("click", () => handleStockAction(button));
  });
}

function renderAdminUsers() {
  if (!els.adminUsersList) return;
  const users = state.users || [];
  els.adminUsersCount.textContent = USE_SUPABASE ? `${users.length} perfis` : `${users.length} usuarios`;
  if (els.adminResetUser) {
    els.adminResetUser.innerHTML = users
      .map((user) => `<option value="${user.id}">${escapeHtml(user.displayName)} (${escapeHtml(user.username || user.id)})</option>`)
      .join("");
  }
  els.adminUsersList.innerHTML = users.map((user) => `
    <article class="admin-user-row">
      <div>
        <strong>${escapeHtml(user.displayName)}</strong>
        <span class="muted">${escapeHtml(user.username || user.id)} - ${escapeHtml(roleLabel(user.role))}</span>
      </div>
      <span class="status-pill ${user.role === "admin" ? "status-preparing" : "status-free"}">${escapeHtml(roleLabel(user.role))}</span>
    </article>
  `).join("") || emptyState("Nenhum usuario cadastrado.");
}

function renderSalesDashboard() {
  if (!els.adminSalesSummary || !els.adminSalesTables || !els.adminSalesProducts) return;
  const ordersWithItems = state.orders.filter((order) => Array.isArray(order.items) && order.items.length);
  const closedOrders = ordersWithItems.filter((order) => ["closed", "delivered"].includes(order.status));
  const openOrders = ordersWithItems.filter((order) => !["closed", "delivered"].includes(order.status));
  const closedTotal = closedOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const openTotal = openOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const uniqueTables = new Set(ordersWithItems.map((order) => order.tableNumber || state.tables.find((table) => table.id === order.tableId)?.number || "-"));
  const averageTicket = closedOrders.length ? closedTotal / closedOrders.length : 0;

  const summary = [
    ["Vendido", money.format(closedTotal), `${closedOrders.length} comandas finalizadas`],
    ["Em aberto", money.format(openTotal), `${openOrders.length} comandas ativas`],
    ["Mesas com venda", uniqueTables.size, "Com consumo registrado"],
    ["Ticket medio", money.format(averageTicket), "Somente finalizadas"]
  ];

  els.adminSalesSummary.innerHTML = summary.map(([label, value, note]) => `
    <article class="sales-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `).join("");

  const tableRows = Array.from(groupSalesByTable(ordersWithItems).values())
    .sort((a, b) => b.total - a.total)
    .map((row) => `
      <article class="sales-row">
        <div>
          <strong>Mesa ${escapeHtml(row.tableNumber)}</strong>
          <span class="muted">${row.orders} comandas - ${row.items} itens</span>
        </div>
        <span class="price-text">${money.format(row.total)}</span>
      </article>
    `).join("");

  els.adminSalesTables.innerHTML = tableRows || emptyState("Nenhuma venda por mesa ainda.");

  const productRows = Array.from(groupSalesByProduct(ordersWithItems).values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
    .map((row) => `
      <article class="sales-row">
        <div>
          <strong>${escapeHtml(row.name)}</strong>
          <span class="muted">${row.qty} unidades</span>
        </div>
        <span class="price-text">${money.format(row.total)}</span>
      </article>
    `).join("");

  els.adminSalesProducts.innerHTML = productRows || emptyState("Nenhum item vendido ainda.");
}

async function openAdminModal() {
  const user = currentUser();
  if (user?.role !== "admin") {
    showToast("Acesso restrito", "Somente administrador.");
    return;
  }
  if (USE_SUPABASE) await loadRemoteUsers();
  renderAdminUsers();
  renderSalesDashboard();
  switchAdminTab("users");
  document.body.classList.add("modal-open");
  els.adminModal.classList.remove("is-hidden");
  els.adminDisplayName?.focus();
}

function closeAdminModal() {
  els.adminModal.classList.add("is-hidden");
  document.body.classList.remove("modal-open");
}

function switchAdminTab(tab) {
  els.adminTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminTab === tab);
  });
  els.adminTabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.adminPanel === tab);
  });
}

async function createAdminUser(event) {
  event.preventDefault();
  const username = els.adminUsername.value.trim();
  const displayName = els.adminDisplayName.value.trim();
  const password = els.adminPassword.value.trim();
  if (!username || !displayName || !password) return;

  if (USE_SUPABASE) {
    try {
      const createdUser = await apiRequest("/profiles", {
        method: "POST",
        body: {
          email: username,
          displayName,
          password,
          role: els.adminRole.value
        }
      });
      state.users = mergeUsers([createdUser], state.users);
      els.adminUserForm.reset();
      await loadRemoteUsers();
      renderAdminUsers();
      showToast("Usuario criado", displayName);
    } catch (error) {
      console.error("Falha ao criar usuario", error);
      showToast("Erro ao criar usuario", error.message || "Confira o servidor local.");
    }
    return;
  }

  if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    showToast("Usuario ja existe", username);
    return;
  }
  state.users.push({
    id: createId("user"),
    username,
    displayName,
    password,
    role: els.adminRole.value
  });
  els.adminUserForm.reset();
  saveState();
  renderAdminUsers();
  showToast("Usuario criado", displayName);
}

async function resetAdminPassword(event) {
  event.preventDefault();
  const user = state.users.find((item) => item.id === els.adminResetUser.value);
  const password = els.adminNewPassword.value.trim();
  if (!user || !password) return;

  if (USE_SUPABASE) {
    try {
      await apiRequest("/profiles/password", {
        method: "PUT",
        body: {
          userId: user.id,
          password
        }
      });
      els.adminResetForm.reset();
      renderAdminUsers();
      showToast("Senha atualizada", user.displayName);
    } catch (error) {
      console.error("Falha ao atualizar senha", error);
      showToast("Erro ao atualizar senha", error.message || "Confira o servidor local.");
    }
    return;
  }

  user.password = password;
  els.adminResetForm.reset();
  saveState();
  renderAdminUsers();
  showToast("Senha atualizada", user.displayName);
}

function addTable(event) {
  event.preventDefault();
  const number = Number(document.getElementById("tableNumber").value);
  const seats = Number(document.getElementById("tableSeats").value || 4);
  if (!number || state.tables.some((table) => table.number === number)) return;

  const table = { id: createId("table"), number, seats, currentOrderId: null };
  state.tables.push(table);
  state.selectedTableId = table.id;
  els.tableForm.reset();
  persistAndRender();
  showToast("Mesa adicionada", `Mesa ${table.number}`);
}

function handleTableAction(event) {
  const { action, tableId } = event.currentTarget.dataset;
  if (action === "select") selectTable(tableId);
  if (action === "edit") editTable(tableId);
  if (action === "call") {
    const table = state.tables.find((item) => item.id === tableId);
    const order = table ? currentOrder(table) : null;
    if (order) callOrder(order.id);
  }
}

function bindDetailActions() {
  els.tableDetail.querySelectorAll("[data-detail-action]").forEach((element) => {
    if (element.tagName === "FORM") {
      element.addEventListener("submit", addItemToOrder);
      return;
    }
    element.addEventListener("click", handleDetailAction);
  });
}

function handleDetailAction(event) {
  const { detailAction, tableId, orderId } = event.currentTarget.dataset;
  if (detailAction === "open-order") openOrder(tableId);
  if (detailAction === "edit-table") editTable(tableId);
  if (detailAction === "remove-table") removeTable(tableId);
  if (detailAction === "send-kitchen") updateOrderStatus(orderId, "waiting");
  if (detailAction === "mark-ready") markOrderReady(orderId);
  if (detailAction === "call-order") callOrder(orderId);
  if (detailAction === "close-order") closeOrder(orderId);
}

function selectTable(tableId) {
  state.selectedTableId = tableId;
  serviceDraft().tableId = tableId;
  persistAndRender();
}

function editTable(tableId) {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) return;
  const nextNumber = Number(window.prompt("Numero da mesa", table.number));
  if (!nextNumber || state.tables.some((item) => item.id !== tableId && item.number === nextNumber)) return;
  const nextSeats = Number(window.prompt("Quantidade de lugares", table.seats || 4));
  table.number = nextNumber;
  table.seats = nextSeats || table.seats || 4;
  persistAndRender();
}

function removeTable(tableId) {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table || table.currentOrderId) return;
  if (!window.confirm(`Remover mesa ${table.number}?`)) return;
  state.tables = state.tables.filter((item) => item.id !== tableId);
  state.selectedTableId = state.tables[0]?.id || null;
  persistAndRender();
}

function openOrder(tableId) {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table || table.currentOrderId) return;
  const user = currentUser();
  const order = {
    id: createId("order"),
    tableId,
    tableNumber: table.number,
    status: "open",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    customerName: "",
    attendantId: user?.id || "",
    attendantName: user?.displayName || "Atendente",
    readyAt: null,
    calledAt: null,
    items: []
  };
  state.orders.unshift(order);
  table.currentOrderId = order.id;
  persistAndRender();
  showToast("Pedido aberto", `Mesa ${table.number}`);
}

function addItemToOrder(event) {
  event.preventDefault();
  const table = state.tables.find((item) => item.id === event.currentTarget.dataset.tableId);
  const order = table ? currentOrder(table) : null;
  if (!order) return;

  const data = new FormData(event.currentTarget);
  const product = state.catalog.find((item) => item.id === data.get("productId"));
  const qty = Number(data.get("qty") || 1);
  if (!product || qty < 1 || product.stock < qty) return;
  const user = currentUser();
  const customerName = String(data.get("customerName") || "").trim();
  const meatPoint = needsMeatPoint(product) ? String(data.get("meatPoint") || "Ao ponto") : "";

  product.stock -= qty;
  order.updatedAt = Date.now();
  if (customerName) order.customerName = customerName;
  if (user) {
    order.attendantId = user.id;
    order.attendantName = user.displayName;
  }
  const line = order.items.find((item) => item.productId === product.id && (item.meatPoint || "") === meatPoint);
  if (line) {
    line.qty += qty;
  } else {
    order.items.push({ productId: product.id, name: product.name, category: product.category, qty, price: product.price, meatPoint });
  }
  persistAndRender();
}

function addServiceProduct(productId) {
  const product = state.catalog.find((item) => item.id === productId);
  const draft = serviceDraft();
  if (!product || productAvailable(product.id) <= 0) {
    showToast("Estoque indisponivel", "Atualize o catalogo antes de adicionar.");
    return;
  }

  const line = draft.items.find((item) => item.productId === product.id);
  if (line) {
    line.qty += 1;
  } else {
    draft.items.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      qty: 1,
      price: product.price,
      meatPoint: needsMeatPoint(product) ? "Ao ponto" : ""
    });
  }

  saveState();
  renderService();
  showToast("Item adicionado", product.name);
}

function adjustServiceProduct(productId, delta) {
  const draft = serviceDraft();
  const line = draft.items.find((item) => item.productId === productId);
  if (!line) return;

  if (delta > 0 && productAvailable(productId) <= 0) {
    showToast("Limite do estoque", "Quantidade maxima no carrinho.");
    return;
  }

  line.qty += delta;
  if (line.qty <= 0) {
    draft.items = draft.items.filter((item) => item.productId !== productId);
  }
  saveState();
  renderService();
}

function updateServiceMeatPoint(productId, meatPoint) {
  const draft = serviceDraft();
  const line = draft.items.find((item) => item.productId === productId);
  if (!line) return;
  line.meatPoint = meatPoint;
  saveState();
}

function clearServiceDraft() {
  const draft = serviceDraft();
  draft.items = [];
  draft.customerName = "";
  saveState();
  renderService();
}

function sendServiceOrder() {
  const draft = serviceDraft();
  const table = state.tables.find((item) => item.id === draft.tableId);
  if (!table || draft.items.length === 0) return;
  const user = currentUser();
  const customerName = (draft.customerName || "").trim();

  const blocked = draft.items.find((item) => {
    const product = state.catalog.find((catalogItem) => catalogItem.id === item.productId);
    return !product || product.stock < item.qty;
  });
  if (blocked) {
    showToast("Conferir estoque", blocked.name);
    renderService();
    return;
  }

  let order = currentOrder(table);
  if (!order) {
    order = {
      id: createId("order"),
      tableId: table.id,
      tableNumber: table.number,
      status: "waiting",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      customerName,
      attendantId: user?.id || "",
      attendantName: user?.displayName || "Atendente",
      readyAt: null,
      calledAt: null,
      items: []
    };
    state.orders.unshift(order);
    table.currentOrderId = order.id;
  } else {
    order.status = "waiting";
    order.tableNumber = table.number;
    order.readyAt = null;
    order.updatedAt = Date.now();
    if (customerName) order.customerName = customerName;
    if (user) {
      order.attendantId = user.id;
      order.attendantName = user.displayName;
    }
  }

  draft.items.forEach((draftItem) => {
    const product = state.catalog.find((item) => item.id === draftItem.productId);
    product.stock -= draftItem.qty;
    const orderLine = order.items.find((item) => item.productId === draftItem.productId && (item.meatPoint || "") === (draftItem.meatPoint || ""));
    if (orderLine) {
      orderLine.qty += draftItem.qty;
    } else {
      order.items.push({ ...draftItem });
    }
  });

  const sentCount = draft.items.reduce((sum, item) => sum + item.qty, 0);
  draft.items = [];
  draft.customerName = "";
  state.selectedTableId = table.id;
  saveState();
  render();
  showToast("Pedido enviado para cozinha", `Mesa ${table.number} - ${sentCount} itens aguardando aceite`);
}

function updateOrderStatus(orderId, status) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  order.status = status;
  order.updatedAt = Date.now();
  if (status === "accepted") order.acceptedAt = Date.now();
  if (status === "preparing") order.productionAt = Date.now();
  if (status === "ready") {
    order.readyAt = Date.now();
    notifyAttendantReady(order);
  }
  persistAndRender();
  const table = state.tables.find((item) => item.id === order.tableId);
  if (status === "waiting" && table) showToast("Pedido enviado", `Mesa ${table.number}`);
  if (status === "accepted" && table) showToast("Pedido aceito", `Mesa ${table.number}`);
  if (status === "preparing" && table) showToast("Pedido em producao", `Mesa ${table.number}`);
  if (status === "ready" && table) showToast("Pedido pronto", `Mesa ${table.number} - atendente notificado`);
}

function markOrderReady(orderId) {
  updateOrderStatus(orderId, "ready");
}

function notifyAttendantReady(order) {
  const table = state.tables.find((item) => item.id === order.tableId);
  const tableNumber = order.tableNumber || table?.number || "-";
  const message = `Mesa ${tableNumber} pronta para retirada.`;
  state.staffAlerts.unshift({
    id: createId("alert"),
    type: "kitchen-ready",
    orderId: order.id,
    tableNumber,
    customerName: order.customerName || "",
    attendantId: order.attendantId || "",
    attendantName: order.attendantName || "Atendente",
    message,
    createdAt: Date.now()
  });
  state.staffAlerts = state.staffAlerts.slice(0, 12);
  showCallSpotlight(tableNumber, message);
  playReadySound();
}

function callLastReadyOrder() {
  const order = state.orders.find((item) => item.status === "ready");
  if (order) callOrder(order.id);
}

function callOrder(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const table = state.tables.find((item) => item.id === order.tableId);
  if (!table) return;

  order.calledAt = Date.now();
  const message = `Pedido da mesa ${table.number} esta pronto.`;
  state.calls.unshift({
    id: createId("call"),
    orderId: order.id,
    tableNumber: table.number,
    message,
    createdAt: Date.now()
  });
  state.calls = state.calls.slice(0, 8);
  saveState();
  render();
  showCallSpotlight(table.number, message);
  showToast("Chamada enviada", `Mesa ${table.number}`);
  playReadySound();
  speak(message);
}

function closeOrder(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  order.status = "closed";
  order.updatedAt = Date.now();
  const table = state.tables.find((item) => item.id === order.tableId);
  if (table) table.currentOrderId = null;
  persistAndRender();
  if (table) showToast("Mesa finalizada", `Mesa ${table.number}`);
}

function clearCalls() {
  state.calls = [];
  state.staffAlerts = [];
  persistAndRender();
}

function saveProduct(event) {
  event.preventDefault();
  const id = els.catalogId.value;
  const data = {
    name: els.productName.value.trim(),
    category: els.productCategory.value,
    price: Number(els.productPrice.value || 0),
    stock: Number(els.productStock.value || 0)
  };
  if (!data.name) return;

  if (id) {
    const product = state.catalog.find((item) => item.id === id);
    if (product) Object.assign(product, data);
  } else {
    state.catalog.unshift({ id: createId("prod"), ...data });
  }

  cancelProductEdit();
  persistAndRender();
}

function handleProductAction(button) {
  const product = state.catalog.find((item) => item.id === button.dataset.productId);
  if (!product) return;
  if (button.dataset.productAction === "delete") {
    if (!window.confirm(`Remover ${product.name}?`)) return;
    state.catalog = state.catalog.filter((item) => item.id !== product.id);
    persistAndRender();
    return;
  }

  els.catalogId.value = product.id;
  els.productName.value = product.name;
  els.productCategory.value = product.category;
  els.productPrice.value = product.price;
  els.productStock.value = product.stock;
  els.cancelProductEdit.classList.remove("is-hidden");
}

function cancelProductEdit() {
  els.catalogForm.reset();
  els.catalogId.value = "";
  els.cancelProductEdit.classList.add("is-hidden");
}

function saveStockItem(event) {
  event.preventDefault();
  const id = els.stockId.value;
  const data = {
    name: els.stockName.value.trim(),
    qty: Number(els.stockQty.value || 0),
    min: Number(els.stockMin.value || 0),
    unit: els.stockUnit.value
  };
  if (!data.name) return;

  if (id) {
    const item = state.stock.find((stockItem) => stockItem.id === id);
    if (item) Object.assign(item, data);
  } else {
    state.stock.unshift({ id: createId("stock"), ...data });
  }

  cancelStockEdit();
  persistAndRender();
}

function handleStockAction(button) {
  const item = state.stock.find((stockItem) => stockItem.id === button.dataset.stockId);
  if (!item) return;

  if (button.dataset.stockAction === "plus") item.qty += 1;
  if (button.dataset.stockAction === "minus") item.qty = Math.max(0, item.qty - 1);
  if (button.dataset.stockAction === "delete") {
    if (!window.confirm(`Remover ${item.name}?`)) return;
    state.stock = state.stock.filter((stockItem) => stockItem.id !== item.id);
  }
  if (button.dataset.stockAction === "edit") {
    els.stockId.value = item.id;
    els.stockName.value = item.name;
    els.stockQty.value = item.qty;
    els.stockMin.value = item.min;
    els.stockUnit.value = item.unit;
    els.cancelStockEdit.classList.remove("is-hidden");
    return;
  }
  persistAndRender();
}

function cancelStockEdit() {
  els.stockForm.reset();
  els.stockId.value = "";
  els.cancelStockEdit.classList.add("is-hidden");
}

function resetDemo() {
  if (!window.confirm("Restaurar dados de demonstracao?")) return;
  state = structuredClone(seedState);
  saveState();
  render();
}

function currentOrder(table) {
  return state.orders.find((order) => order.id === table.currentOrderId && order.status !== "closed") || null;
}

function tableStatus(table) {
  const order = currentOrder(table);
  if (!order) return { label: "Livre", className: "status-free" };
  return { label: statusLabel(order.status), className: statusClass(order.status) };
}

function statusLabel(status) {
  return {
    open: "Aberta",
    waiting: "Aguardando",
    accepted: "Aceito",
    preparing: "Preparo",
    ready: "Pronto",
    delivered: "Entregue",
    closed: "Fechada"
  }[status] || "Livre";
}

function statusClass(status) {
  return {
    open: "status-open",
    waiting: "status-open",
    accepted: "status-preparing",
    preparing: "status-preparing",
    ready: "status-ready",
    delivered: "status-free",
    closed: "status-free"
  }[status] || "status-free";
}

function currentUser() {
  if (USE_SUPABASE) return activeUser;
  if (activeUser) return activeUser;
  const rawSession = localStorage.getItem(SESSION_KEY);
  if (!rawSession) return null;
  if (rawSession === "ok") {
    const admin = state.users.find((user) => user.username === "admin") || state.users[0];
    if (!admin) return null;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      userId: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      role: admin.role
    }));
    activeUser = stripPrivateUserFields(admin);
    return activeUser;
  }
  try {
    const session = JSON.parse(rawSession);
    const user = state.users.find((item) => item.id === session.userId) || null;
    activeUser = user ? stripPrivateUserFields(user) : null;
    return activeUser;
  } catch (error) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function roleLabel(role) {
  return {
    admin: "Admin",
    atendente: "Atendente",
    cozinha: "Cozinha"
  }[role] || "Atendente";
}

function formatTime(value) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function needsMeatPoint(item) {
  const name = String(item?.name || "").toLowerCase();
  const category = String(item?.category || "").toLowerCase();
  return category === "combos" || name.includes("burger") || name.includes("hamburg") || name.startsWith("x-");
}

function orderTotal(order) {
  return order.items.reduce((sum, item) => sum + item.qty * item.price, 0);
}

function serviceDraft() {
  if (!state.serviceDraft) state.serviceDraft = { tableId: state.selectedTableId || "", customerName: "", items: [] };
  if (!Array.isArray(state.serviceDraft.items)) state.serviceDraft.items = [];
  if (typeof state.serviceDraft.customerName !== "string") state.serviceDraft.customerName = "";
  if (!state.serviceDraft.tableId) state.serviceDraft.tableId = state.selectedTableId || state.tables[0]?.id || "";
  return state.serviceDraft;
}

function draftTotal(draft = serviceDraft()) {
  return draft.items.reduce((sum, item) => sum + item.qty * item.price, 0);
}

function productAvailable(productId) {
  const product = state.catalog.find((item) => item.id === productId);
  if (!product) return 0;
  const draftQty = serviceDraft().items
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.qty, 0);
  return Math.max(0, product.stock - draftQty);
}

function sortedTables() {
  return [...state.tables].sort((a, b) => a.number - b.number);
}

function lowStockItems() {
  return state.stock.filter((item) => item.qty <= item.min);
}

function persistAndRender() {
  saveState();
  render();
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
    if (stored && Array.isArray(stored.tables)) return normalizeState(stored);
  } catch (error) {
    console.warn("Falha ao carregar dados locais", error);
  }
  return normalizeState(structuredClone(seedState));
}

function normalizeState(nextState) {
  const normalized = {
    ...structuredClone(seedState),
    ...nextState
  };
  normalized.tables = Array.isArray(nextState.tables) ? nextState.tables : [];
  normalized.catalog = Array.isArray(nextState.catalog) ? nextState.catalog : [];
  normalized.stock = Array.isArray(nextState.stock) ? nextState.stock : [];
  normalized.orders = Array.isArray(nextState.orders) ? nextState.orders : [];
  normalized.calls = Array.isArray(nextState.calls) ? nextState.calls : [];
  normalized.staffAlerts = Array.isArray(nextState.staffAlerts) ? nextState.staffAlerts : [];
  normalized.users = Array.isArray(nextState.users) ? nextState.users.map(stripPrivateUserFields) : [];
  if (LOCAL_DEMO_ENABLED) {
    normalized.users = Array.isArray(nextState.users) && nextState.users.length ? nextState.users : [];
    DEMO_USERS.forEach((seedUser) => {
      if (!normalized.users.some((user) => user.username === seedUser.username)) {
        normalized.users.push(structuredClone(seedUser));
      }
    });
  }
  if (USE_SUPABASE && activeUser && !normalized.users.some((user) => user.id === activeUser.id)) {
    normalized.users.push(stripPrivateUserFields(activeUser));
  }
  normalized.users = normalized.users.map((user) => (USE_SUPABASE ? stripPrivateUserFields(user) : user));
  if (!USE_SUPABASE && !LOCAL_DEMO_ENABLED && !normalized.users.length) {
    DEMO_USERS.forEach((seedUser) => {
      normalized.users.push(structuredClone(seedUser));
    });
  }
  normalized.serviceDraft = nextState.serviceDraft || { tableId: normalized.selectedTableId || "", customerName: "", items: [] };
  if (!Array.isArray(normalized.serviceDraft.items)) normalized.serviceDraft.items = [];
  if (typeof normalized.serviceDraft.customerName !== "string") normalized.serviceDraft.customerName = "";
  if (!normalized.serviceDraft.tableId) normalized.serviceDraft.tableId = normalized.selectedTableId || normalized.tables[0]?.id || "";
  normalized.orders = normalized.orders.map((order) => ({
    customerName: "",
    attendantId: "",
    attendantName: "Atendente",
    updatedAt: order.createdAt || Date.now(),
    ...order,
    tableNumber: order.tableNumber || normalized.tables.find((table) => table.id === order.tableId)?.number || "",
    items: Array.isArray(order.items) ? order.items : []
  }));
  return normalized;
}

function saveState() {
  saveLocalStateOnly();
  if (!shouldUseRemoteData()) return;
  const nextPayloadJson = JSON.stringify(remoteStatePayload());
  if (nextPayloadJson === lastRemotePayloadJson || isLoadingRemoteState) return;
  lastRemotePayloadJson = nextPayloadJson;
  scheduleRemoteSave();
}

function saveLocalStateOnly() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function shouldUseRemoteData() {
  return USE_SUPABASE && Boolean(apiSession?.token) && Boolean(currentUser());
}

function remoteStatePayload() {
  return {
    tables: state.tables.map((table) => ({ ...table })),
    catalog: state.catalog.map((product) => ({ ...product })),
    stock: state.stock.map((item) => ({ ...item })),
    orders: state.orders.map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })) })),
    calls: state.calls.map((call) => ({ ...call })),
    staffAlerts: state.staffAlerts.map((alert) => ({ ...alert }))
  };
}

function scheduleRemoteSave() {
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(() => {
    writeRemoteState().catch((error) => {
      console.error("Falha ao salvar no Supabase", error);
      showToast("Supabase offline", "Os dados ficaram salvos localmente e tentam sincronizar novamente.");
    });
  }, 650);
}

async function writeRemoteState() {
  if (!shouldUseRemoteData()) return;
  await apiRequest("/state", {
    method: "PUT",
    body: remoteStatePayload()
  });
  lastRemoteUpdatedAt = new Date().toISOString();
}

async function loadRemoteState({ renderAfterLoad = false } = {}) {
  if (!shouldUseRemoteData()) return;
  isLoadingRemoteState = true;
  try {
    const localUiState = {
      activeView: state.activeView,
      selectedTableId: state.selectedTableId,
      serviceDraft: state.serviceDraft,
      users: state.users
    };
    const remoteState = await apiRequest("/state");
    state = normalizeState({ ...remoteState, ...localUiState });
    lastRemotePayloadJson = JSON.stringify(remoteStatePayload());
    saveLocalStateOnly();
    lastRemoteUpdatedAt = new Date().toISOString();
    if (renderAfterLoad && !els.appView.classList.contains("is-hidden")) render();
  } catch (error) {
    console.error("Falha ao carregar Supabase", error);
    if (renderAfterLoad) showToast("Falha ao atualizar", "Confira a conexao com Supabase.");
  } finally {
    isLoadingRemoteState = false;
  }
}

function startRemotePolling() {
  stopRemotePolling();
  if (!shouldUseRemoteData()) return;
  remotePollTimer = window.setInterval(() => {
    if (remoteSaveTimer || document.hidden) return;
    loadRemoteState({ renderAfterLoad: true });
  }, 5000);
}

function stopRemotePolling() {
  window.clearInterval(remotePollTimer);
  remotePollTimer = null;
}

async function loginWithSupabase(email, password) {
  if (!email || !password) throw new Error("Informe email e senha.");
  const authPayload = await apiRequest("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password }
  });
  setApiSession(authPayload);
  activeUser = authPayload.user;
  state.users = mergeUsers([activeUser], state.users);
  await loadRemoteUsers();
  await loadRemoteState();
  showApp();
  startRemotePolling();
}

async function restoreSupabaseSession() {
  if (!apiSession?.token) return;
  try {
    const session = await apiRequest("/auth/session");
    activeUser = session.user;
    state.users = mergeUsers([activeUser], state.users);
    saveLocalStateOnly();
  } catch (error) {
    console.warn("Sessao da API expirada ou invalida", error);
    clearApiSession();
  }
}

async function loadRemoteUsers() {
  if (!shouldUseRemoteData()) return;
  try {
    const user = currentUser();
    const users = await apiRequest("/profiles");
    state.users = mergeUsers(users, [user].filter(Boolean));
    saveLocalStateOnly();
  } catch (error) {
    console.warn("Falha ao carregar perfis", error);
    if (currentUser()) state.users = mergeUsers([currentUser()], state.users);
  }
}

async function apiRequest(path, options = {}) {
  const { auth = true, headers = {}, body, ...fetchOptions } = options;
  if (!API_URL) throw new Error("API local nao configurada.");

  const requestHeaders = {
    Accept: "application/json",
    ...headers
  };
  if (auth && apiSession?.token) {
    requestHeaders.Authorization = `Bearer ${apiSession.token}`;
  }
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers: requestHeaders
    });
  } catch (error) {
    throw new Error(`Servidor local offline ou bloqueado. Ligue o server.py e confira API_URL: ${API_URL}`);
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function readApiError(response) {
  try {
    const error = await response.json();
    return error.message || error.error || `Erro API ${response.status}`;
  } catch (parseError) {
    return `Erro API ${response.status}`;
  }
}

function loadStoredApiSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(API_SESSION_KEY) || "null");
    return stored?.token ? stored : null;
  } catch (error) {
    localStorage.removeItem(API_SESSION_KEY);
    return null;
  }
}

function setApiSession(payload) {
  apiSession = {
    token: payload.token,
    user: payload.user || null
  };
  localStorage.setItem(API_SESSION_KEY, JSON.stringify(apiSession));
}

function clearApiSession() {
  activeUser = null;
  apiSession = null;
  localStorage.removeItem(API_SESSION_KEY);
}

function tableToRemoteRow(table) {
  return {
    id: table.id,
    number: Number(table.number || 0),
    seats: Number(table.seats || 0),
    current_order_id: table.currentOrderId || null,
    updated_at: new Date().toISOString()
  };
}

function productToRemoteRow(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    updated_at: new Date().toISOString()
  };
}

function stockToRemoteRow(item) {
  return {
    id: item.id,
    name: item.name,
    qty: Number(item.qty || 0),
    min_qty: Number(item.min || 0),
    unit: item.unit || "un",
    updated_at: new Date().toISOString()
  };
}

function orderToRemoteRow(order) {
  return {
    id: order.id,
    table_id: order.tableId,
    table_number: Number(order.tableNumber || 0),
    status: order.status,
    customer_name: order.customerName || "",
    attendant_id: order.attendantId || null,
    attendant_name: order.attendantName || "Atendente",
    created_at_ms: Number(order.createdAt || Date.now()),
    updated_at_ms: Number(order.updatedAt || Date.now()),
    accepted_at_ms: order.acceptedAt ? Number(order.acceptedAt) : null,
    production_at_ms: order.productionAt ? Number(order.productionAt) : null,
    ready_at_ms: order.readyAt ? Number(order.readyAt) : null,
    called_at_ms: order.calledAt ? Number(order.calledAt) : null,
    total: orderTotal(order),
    updated_at: new Date().toISOString()
  };
}

function orderItemsToRemoteRows(order) {
  return order.items.map((item, index) => ({
    id: orderItemRowId(order.id, index),
    order_id: order.id,
    line_index: index,
    product_id: item.productId || "",
    name: item.name,
    category: item.category || "",
    qty: Number(item.qty || 0),
    price: Number(item.price || 0),
    meat_point: item.meatPoint || "",
    updated_at: new Date().toISOString()
  }));
}

function callToRemoteRow(call) {
  return {
    id: call.id,
    order_id: call.orderId,
    table_number: Number(call.tableNumber || 0),
    message: call.message || "",
    created_at_ms: Number(call.createdAt || Date.now()),
    updated_at: new Date().toISOString()
  };
}

function alertToRemoteRow(alert) {
  return {
    id: alert.id,
    type: alert.type || "kitchen-ready",
    order_id: alert.orderId,
    table_number: Number(alert.tableNumber || 0),
    customer_name: alert.customerName || "",
    attendant_id: alert.attendantId || null,
    attendant_name: alert.attendantName || "Atendente",
    message: alert.message || "",
    created_at_ms: Number(alert.createdAt || Date.now()),
    updated_at: new Date().toISOString()
  };
}

function remoteRowsToState(rows) {
  const itemsByOrder = new Map();
  rows.orderItemRows
    .sort((a, b) => Number(a.line_index || 0) - Number(b.line_index || 0))
    .forEach((item) => {
      const items = itemsByOrder.get(item.order_id) || [];
      items.push({
        productId: item.product_id,
        name: item.name,
        category: item.category || "",
        qty: Number(item.qty || 0),
        price: Number(item.price || 0),
        meatPoint: item.meat_point || ""
      });
      itemsByOrder.set(item.order_id, items);
    });

  return {
    tables: rows.tableRows.map((row) => ({
      id: row.id,
      number: Number(row.number || 0),
      seats: Number(row.seats || 0),
      currentOrderId: row.current_order_id || null
    })).sort((a, b) => a.number - b.number),
    catalog: rows.catalogRows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      price: Number(row.price || 0),
      stock: Number(row.stock || 0)
    })),
    stock: rows.stockRows.map((row) => ({
      id: row.id,
      name: row.name,
      qty: Number(row.qty || 0),
      min: Number(row.min_qty || 0),
      unit: row.unit || "un"
    })),
    orders: rows.orderRows.map((row) => ({
      id: row.id,
      tableId: row.table_id,
      tableNumber: Number(row.table_number || 0),
      status: row.status,
      createdAt: Number(row.created_at_ms || Date.now()),
      updatedAt: Number(row.updated_at_ms || row.created_at_ms || Date.now()),
      acceptedAt: row.accepted_at_ms ? Number(row.accepted_at_ms) : null,
      productionAt: row.production_at_ms ? Number(row.production_at_ms) : null,
      readyAt: row.ready_at_ms ? Number(row.ready_at_ms) : null,
      calledAt: row.called_at_ms ? Number(row.called_at_ms) : null,
      customerName: row.customer_name || "",
      attendantId: row.attendant_id || "",
      attendantName: row.attendant_name || "Atendente",
      items: itemsByOrder.get(row.id) || []
    })).sort((a, b) => b.createdAt - a.createdAt),
    calls: rows.callRows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      tableNumber: Number(row.table_number || 0),
      message: row.message || "",
      createdAt: Number(row.created_at_ms || Date.now())
    })).sort((a, b) => b.createdAt - a.createdAt),
    staffAlerts: rows.alertRows.map((row) => ({
      id: row.id,
      type: row.type || "kitchen-ready",
      orderId: row.order_id,
      tableNumber: Number(row.table_number || 0),
      customerName: row.customer_name || "",
      attendantId: row.attendant_id || "",
      attendantName: row.attendant_name || "Atendente",
      message: row.message || "",
      createdAt: Number(row.created_at_ms || Date.now())
    })).sort((a, b) => b.createdAt - a.createdAt)
  };
}

function orderItemRowId(orderId, index) {
  return `${orderId}-line-${index}`;
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value).replaceAll(",", ""));
}

function profileRowToUser(row, email = "") {
  return {
    id: row.id,
    username: email || row.id,
    displayName: row.display_name || email || "Atendente",
    role: row.role || "atendente"
  };
}

function mergeUsers(primaryUsers, fallbackUsers = []) {
  const merged = [];
  [...primaryUsers, ...fallbackUsers].filter(Boolean).forEach((user) => {
    if (!merged.some((item) => item.id === user.id)) merged.push(stripPrivateUserFields(user));
  });
  return merged;
}

function stripPrivateUserFields(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username || user.email || "",
    displayName: user.displayName || user.display_name || user.username || "Atendente",
    role: user.role || "atendente",
    ...(USE_SUPABASE ? {} : { password: user.password || "" })
  };
}

function groupSalesByTable(orders) {
  return orders.reduce((acc, order) => {
    const tableNumber = order.tableNumber || state.tables.find((table) => table.id === order.tableId)?.number || "-";
    const key = String(tableNumber);
    const row = acc.get(key) || { tableNumber: key, orders: 0, items: 0, total: 0 };
    row.orders += 1;
    row.items += order.items.reduce((sum, item) => sum + item.qty, 0);
    row.total += orderTotal(order);
    acc.set(key, row);
    return acc;
  }, new Map());
}

function groupSalesByProduct(orders) {
  return orders.reduce((acc, order) => {
    order.items.forEach((item) => {
      const key = item.productId || item.name;
      const row = acc.get(key) || { name: item.name, qty: 0, total: 0 };
      row.qty += Number(item.qty || 0);
      row.total += Number(item.qty || 0) * Number(item.price || 0);
      acc.set(key, row);
    });
    return acc;
  }, new Map());
}

function updateLoginChrome() {
  if (!els.loginModeHint) return;
  els.loginModeHint.textContent = "";
}

function isLocalRuntime() {
  return window.location.protocol === "file:" || ["", "localhost", "127.0.0.1"].includes(window.location.hostname);
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateClock() {
  if (!els.currentClock) return;
  els.currentClock.textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function showToast(title, message = "") {
  if (!els.toastHost) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${message ? `<span class="muted">${escapeHtml(message)}</span>` : ""}
  `;
  els.toastHost.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(18px)";
    window.setTimeout(() => toast.remove(), 180);
  }, 2600);
}

function showCallSpotlight(tableNumber, message) {
  if (!els.callSpotlight) return;
  window.clearTimeout(callSpotlightTimer);
  els.callSpotlightTable.textContent = `Mesa ${tableNumber}`;
  els.callSpotlightMessage.textContent = message;
  els.callSpotlight.classList.remove("is-hidden");
  callSpotlightTimer = window.setTimeout(hideCallSpotlight, 4200);
}

function hideCallSpotlight() {
  window.clearTimeout(callSpotlightTimer);
  els.callSpotlight.classList.add("is-hidden");
}

function playReadySound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioContext();
    const gain = audio.createGain();
    const osc = audio.createOscillator();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.3);
  } catch (error) {
    console.warn("Audio indisponivel", error);
  }
}

function speak(message) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "pt-BR";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
