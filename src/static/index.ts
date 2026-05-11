import { Asset, Price, Transaction, Wallet, Paginated } from '../types';

//=======================
// Query Document
//=======================
const tabs = document.querySelectorAll<HTMLDivElement>('.tab');
const contents: Record<string, HTMLElement> = {
  assets: document.getElementById('assets-content') as HTMLElement,
  prices: document.getElementById('prices-content') as HTMLElement,
  transactions: document.getElementById('transactions-content') as HTMLElement,
  wallets: document.getElementById('wallets-content') as HTMLElement,
  tax: document.getElementById('tax-content') as HTMLElement
};

//=======================
// Tabs
//=======================
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    Object.keys(contents).forEach(key => contents[key].style.display = 'none');
    contents[(tab as HTMLElement).dataset.tab!].style.display = '';
    switch ((tab as HTMLElement).dataset.tab) {
      case 'assets':
        renderAssets();
        break;
      case 'prices':
        renderPrices();
        break;
      case 'transactions':
        renderTransactions();
        break;
      case 'wallets':
        renderWallets();
        break;
      case 'tax':
        renderTaxPage();
    }
  });
});

//=======================
// Render Tabs + Content
//=======================
async function fetchAndRender<T>(
  url: string,
  tableId: string,
  rowFn: (row: T) => string,
  requestInit: RequestInit = {}
): Promise<void> {
  const res = await fetch(url, requestInit);
  const { items }: Paginated<T> = await res.json();
  const tbody = document.querySelector(`#${tableId} tbody`) as HTMLTableSectionElement;
  tbody.innerHTML = '';
  // Populate table rows
  items.forEach((row: T) => {
    const tr = document.createElement('tr');
    tr.innerHTML = rowFn(row);
    tbody.appendChild(tr);
  });
}

//=======================
// Pagination
//=======================
const paginationState: Record<string, { page: number, pageSize: number }> = {
  'assets-table': { page: 1, pageSize: 25 },
  'prices-table': { page: 1, pageSize: 25 },
  'transactions-table': { page: 1, pageSize: 25 }
};

async function fetchAndRenderPaginated<T>(
  baseUrl: string,
  tableId: string,
  rowFn: (row: T) => string,
  requestInit: RequestInit = {}
): Promise<T[]> {
  const state = paginationState[tableId];
  const offset = (state.page - 1) * state.pageSize;
  const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + `limit=${state.pageSize}&offset=${offset}`;
  const res = await fetch(url, requestInit);
  const { items, total }: Paginated<T> = await res.json();
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  // Clamp current page in case data shrank and re-fetch once
  if (state.page > totalPages) {
    state.page = totalPages;
    return fetchAndRenderPaginated<T>(baseUrl, tableId, rowFn, requestInit);
  }
  const tbody = document.querySelector(`#${tableId} tbody`) as HTMLTableSectionElement;
  tbody.innerHTML = '';
  items.forEach((row: T) => {
    const tr = document.createElement('tr');
    tr.innerHTML = rowFn(row);
    tbody.appendChild(tr);
  });
  const pageInfo = document.getElementById(`${tableId}-page-info`) as HTMLElement;
  const prevBtn = document.getElementById(`${tableId}-prev-page`) as HTMLButtonElement;
  const nextBtn = document.getElementById(`${tableId}-next-page`) as HTMLButtonElement;
  pageInfo.textContent = `Page ${state.page} of ${totalPages} (${total} total)`;
  prevBtn.disabled = state.page <= 1;
  nextBtn.disabled = state.page >= totalPages;
  return items;
}

//=======================
// Assets Page
//=======================
function renderAssets(): void {
  renderBlockchainAssets();
  renderFiatCurrency();
  populateAllAssetDropdowns();
}
renderAssets();

function renderFiatCurrency(): void {
  fetchAndRender<Asset>('/api/assets?asset_types=fiat', 'fiat-currency-table', row =>
    `<td>${row.symbol}</td><td><img src="${row.logo_url}" alt="${row.symbol} logo" width="40" height="40"></td>`
  );
}

// Add Fiat Currency
(document.getElementById('fiat-currency-form') as HTMLFormElement).onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.target as HTMLFormElement);
  const symbol = fd.get('symbol') as string;
  const errorDiv = document.getElementById('fiat-currency-error') as HTMLElement;
  errorDiv.textContent = '';
  try {
    const resp = await fetch('/api/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: symbol, asset_type: 'fiat' })
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg || 'Failed to set fiat currency');
    }
    renderAssets();
    renderPrices();
    (e.target as HTMLFormElement).reset();
  } catch (err: any) {
    errorDiv.textContent = err.message || 'Failed to set fiat currency';
  }
};

function renderBlockchainAssets(): Promise<void> {
  // Wire filter + pagination controls
  const searchInput = document.getElementById('assets-filter-search') as HTMLInputElement;
  const typeSelect = document.getElementById('assets-filter-type') as HTMLSelectElement;
  const filterBtn = document.getElementById('assets-filter-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('assets-filter-reset-btn') as HTMLButtonElement;
  const prevBtn = document.getElementById('assets-table-prev-page') as HTMLButtonElement;
  const nextBtn = document.getElementById('assets-table-next-page') as HTMLButtonElement;
  const pageSizeSelect = document.getElementById('assets-table-page-size') as HTMLSelectElement;
  filterBtn.onclick = function() {
    paginationState['assets-table'].page = 1;
    renderBlockchainAssets();
  };
  resetBtn.onclick = function() {
    searchInput.value = '';
    typeSelect.value = 'blockchain,nft';
    paginationState['assets-table'].page = 1;
    renderBlockchainAssets();
  };
  prevBtn.onclick = function() {
    if (paginationState['assets-table'].page > 1) {
      paginationState['assets-table'].page--;
      renderBlockchainAssets();
    }
  };
  nextBtn.onclick = function() {
    paginationState['assets-table'].page++;
    renderBlockchainAssets();
  };
  pageSizeSelect.onchange = function() {
    paginationState['assets-table'].pageSize = Number(pageSizeSelect.value);
    paginationState['assets-table'].page = 1;
    renderBlockchainAssets();
  };
  // Build query string from filters
  const params = new URLSearchParams();
  params.append('asset_types', typeSelect.value || 'blockchain,nft');
  if (searchInput.value) params.append('search', searchInput.value);
  const url = `/api/assets?${params.toString()}`;
  return fetchAndRenderPaginated<Asset>(url, 'assets-table', row =>
    `<td>${row.name}</td>
     <td>${row.symbol}</td>
     <td>${row.launch_date ? new Date(row.launch_date).toISOString().slice(0, 10) : ''}</td>
     <td><img src="${row.logo_url}" alt="${row.symbol} logo" width="40" height="40"></td>
     <td>${row.asset_type === 'nft' ? '✓' : ''}</td>`
  ).then(() => {
    const rows = document.querySelectorAll<HTMLTableRowElement>('#assets-table tbody tr');
    rows.forEach(tr => {
      const name = tr.children[0].textContent || '';
      const symbol = tr.children[1].textContent || '';
      const launch_date = new Date(tr.children[2].textContent || '').getTime();
      const logo_url = (tr.children[3].querySelector('img') as HTMLImageElement).src;
      const is_nft = tr.children[4].textContent === '✓';
      tr.onmouseenter = function () {
        tr.style.background = '#e6f7ff';
        tr.title = 'Click to edit asset';
      };
      tr.onmouseleave = function () {
        tr.style.background = '';
        tr.title = '';
      };
      tr.onclick = function () {
        const asset_type = is_nft ? 'nft' : 'blockchain'
        console.log(asset_type);
        showAddEditAssetModal({ name, symbol, asset_type, launch_date, logo_url } as Asset);
      };
    });
  });
}

// Add/Edit Asset Modal logic
function showAddEditAssetModal(asset?: Asset) {
  const modal = document.getElementById('edit-asset-modal') as HTMLElement;
  const form = document.getElementById('edit-asset-form') as HTMLFormElement;
  const title = document.getElementById('edit-asset-title') as HTMLElement;
  const errorDiv = document.getElementById('edit-asset-error') as HTMLElement;
  const symbolInput = document.getElementById('edit-asset-symbol') as HTMLInputElement;
  const nameInput = document.getElementById('edit-asset-name') as HTMLInputElement;
  const isNft = document.getElementById('edit-asset-is-nft') as HTMLInputElement;
  const logoInput = document.getElementById('edit-asset-logo-url') as HTMLInputElement;
  const launchDateInput = document.getElementById('edit-asset-launch-date') as HTMLInputElement;
  const saveBtn = document.getElementById('save-asset-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-edit-asset-modal') as HTMLButtonElement;
  const deleteBtn = document.getElementById('delete-asset-btn') as HTMLButtonElement;
  const refreshBtn = document.getElementById('refresh-prices-btn') as HTMLButtonElement;
  form.reset();
  setDisable([symbolInput, nameInput, isNft, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], false);
  errorDiv.textContent = '';
  if (asset) {
    title.textContent = 'Edit Asset';
    symbolInput.disabled = true;
    symbolInput.value = asset.symbol || '';
    nameInput.value = asset.name || '';
    isNft.checked = asset.asset_type === 'nft';
    logoInput.value = asset.logo_url || '';
    launchDateInput.value = asset.launch_date ? new Date(asset.launch_date).toISOString().slice(0,10) : '';
    deleteBtn.style.display = '';
    refreshBtn.style.display = '';
  } else {
    title.textContent = 'Add Asset';
    symbolInput.disabled = false;
    deleteBtn.style.display = 'none';
    refreshBtn.style.display = 'none';
  }
  modal.classList.add('active');
  cancelBtn.onclick = function() {
    modal.classList.remove('active');
  };
  form.onsubmit = async function(e: Event) {
    e.preventDefault();
    errorDiv.textContent = '';
    const fd = new FormData(form);
    try {
      let promise: Promise<Response>;
      const asset_type = fd.get('is_nft') === 'on' ? 'nft' : 'blockchain';
      if (asset) {
        // Edit mode
        promise = fetch(`/api/asset/${asset.symbol}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: fd.get('symbol'),
            name: fd.get('name'),
            asset_type,
            logo_url: fd.get('logo_url'),
            launch_date: fd.get('launch_date') ? new Date(fd.get('launch_date') as string).getTime() : null
          })
        });
      } else {
        // Add mode
        promise = fetch('/api/asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: fd.get('symbol'),
            name: fd.get('name'),
            asset_type,
            logo_url: fd.get('logo_url'),
            launch_date: fd.get('launch_date') ? new Date(fd.get('launch_date') as string).getTime() : null
          })
        });
      }
      setDisable([symbolInput, nameInput, isNft, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], true);
      const response = await promise;
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to save asset');
      }
      modal.classList.remove('active');
      renderAssets();
      renderPrices();
    } catch (err: any) {
      setDisable([symbolInput, nameInput, isNft, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], false);
      errorDiv.textContent = err.message || 'Failed to save asset';
    }
  };
  deleteBtn.onclick = async function() {
    if (!asset) return;
    if (!confirm('Are you sure you want to delete this asset?')) return;
    errorDiv.textContent = '';
    try {
      const resp = await fetch(`/api/asset/${asset.symbol}`, {
        method: 'DELETE'
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to delete asset');
      }
      modal.classList.remove('active');
      renderAssets();
      renderPrices();
    } catch (err: any) {
      errorDiv.textContent = err.message || 'Failed to delete asset';
    }
  };
  refreshBtn.onclick = async function () {
    if (!symbolInput.value.trim()) {
      alert('Asset symbol not found.');
      return;
    }
    setDisable([symbolInput, nameInput, isNft, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], true);
    try {
      const resp = await fetch(`/api/asset/${encodeURIComponent(symbolInput.value.trim())}/refresh-prices`, { method: 'POST' });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to refresh prices');
      }
      modal.classList.remove('active');
      renderPrices();
    } catch (err: any) {
      setDisable([symbolInput, nameInput, isNft, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], false);
      errorDiv.textContent = err.message || 'Error refreshing prices';
    }
  };
}

// Add Asset button logic
document.getElementById('open-edit-asset-modal-btn')?.addEventListener('click', function() {
  showAddEditAssetModal();
});

// Refresh All Prices button: iterates every blockchain asset and calls the single-asset
// refresh endpoint. Processes sequentially to avoid hammering the external price API.
const refreshAllPricesBtn = document.getElementById('refresh-all-prices-btn') as HTMLButtonElement | null;
const refreshAllPricesStatus = document.getElementById('refresh-all-prices-status') as HTMLElement | null;
refreshAllPricesBtn?.addEventListener('click', async function() {
  if (!refreshAllPricesBtn || !refreshAllPricesStatus) return;
  if (!confirm('Refresh prices for all blockchain assets? This may take a while.')) return;
  refreshAllPricesBtn.disabled = true;
  refreshAllPricesStatus.style.color = '';
  refreshAllPricesStatus.textContent = 'Loading assets…';
  try {
    // Fetch all blockchain assets. Use a large limit to avoid paginating.
    const res = await fetch('/api/assets?asset_types=blockchain&limit=10000');
    const { items: assets }: Paginated<Asset> = await res.json();
    const total = assets.length;
    const failures: Array<{ symbol: string; error: string }> = [];
    for (let i = 0; i < total; i++) {
      const { symbol } = assets[i];
      refreshAllPricesStatus.textContent = `Refreshing ${i + 1}/${total}: ${symbol}…`;
      try {
        const resp = await fetch(`/api/asset/${encodeURIComponent(symbol)}/refresh-prices`, { method: 'POST' });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          failures.push({ symbol, error: body.error || resp.statusText });
        }
      } catch (err: any) {
        failures.push({ symbol, error: err.message || String(err) });
      }
    }
    renderPrices();
    if (failures.length) {
      refreshAllPricesStatus.style.color = 'red';
      refreshAllPricesStatus.textContent = `Refreshed ${total - failures.length}/${total}. Failed: ${failures.map(f => `${f.symbol} (${f.error})`).join(', ')}`;
    } else {
      refreshAllPricesStatus.style.color = 'green';
      refreshAllPricesStatus.textContent = `Refreshed prices for ${total} asset(s).`;
    }
  } catch (err: any) {
    refreshAllPricesStatus.style.color = 'red';
    refreshAllPricesStatus.textContent = err.message || 'Failed to refresh prices';
  } finally {
    refreshAllPricesBtn.disabled = false;
  }
});

function setDisable(selects: Array<HTMLInputElement | HTMLButtonElement>, disable = true) {
  selects.forEach(select => {
    if (select) select.disabled = disable;
  });
}

async function populateAssetDropdowns(selects: Array<HTMLSelectElement | null>, assetType?: string) {
  const res = await fetch(`/api/assets${assetType ? `?asset_types=${assetType}` : ''}`);
  const { items: assets }: Paginated<Asset> = await res.json();
  selects.forEach(select => {
    if (!select) return;
    // Preserve the current selection so repopulating doesn't reset it.
    const previous = select.value;
    // Preserve the first (default) option and replace the rest.
    while (select.options.length > 1) select.remove(1);
    assets.forEach(asset => {
      const opt = document.createElement('option');
      opt.value = asset.symbol;
      opt.textContent = `${asset.name} (${asset.symbol})`;
      select.appendChild(opt);
    });
    if (previous && Array.from(select.options).some(o => o.value === previous)) {
      select.value = previous;
    }
  });
}

function populateAllAssetDropdowns() {
  populateAssetDropdowns([
    document.getElementById('prices-filter-fiat') as HTMLSelectElement
  ], 'fiat');
  populateAssetDropdowns([
    document.getElementById('prices-filter-asset') as HTMLSelectElement,
    document.getElementById('edit-price-asset-symbol') as HTMLSelectElement
  ], 'blockchain');
  populateAssetDropdowns([
    document.getElementById('transactions-filter-asset') as HTMLSelectElement,
    document.getElementById('edit-send-asset-select') as HTMLSelectElement,
    document.getElementById('edit-receive-asset-select') as HTMLSelectElement,
    document.getElementById('edit-fee-asset-select') as HTMLSelectElement
  ]);
}

//=======================
// Prices Page
//=======================
function renderPrices(): void {
  // Setup filters
  const assetSelect = document.getElementById('prices-filter-asset') as HTMLSelectElement;
  const fiatSelect = document.getElementById('prices-filter-fiat') as HTMLSelectElement;
  const dateFromInput = document.getElementById('prices-filter-date-from') as HTMLInputElement;
  const dateToInput = document.getElementById('prices-filter-date-to') as HTMLInputElement;
  const filterBtn = document.getElementById('prices-filter-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('prices-filter-reset-btn') as HTMLButtonElement;
  const prevBtn = document.getElementById('prices-table-prev-page') as HTMLButtonElement;
  const nextBtn = document.getElementById('prices-table-next-page') as HTMLButtonElement;
  const pageSizeSelect = document.getElementById('prices-table-page-size') as HTMLSelectElement;
  const filters = {
    asset_symbol: assetSelect.value,
    fiat_symbol: fiatSelect.value,
    date_from: dateFromInput.value ? Date.parse(dateFromInput.value) : undefined,
    date_to: dateToInput.value ? Date.parse(dateToInput.value) + 24*60*60*1000 - 1 : undefined
  };
  filterBtn.onclick = function() {
    paginationState['prices-table'].page = 1;
    renderPrices();
  };
  resetBtn.onclick = function() {
    assetSelect.value = '';
    fiatSelect.value = '';
    dateFromInput.value = '';
    dateToInput.value = '';
    paginationState['prices-table'].page = 1;
  };
  prevBtn.onclick = function() {
    if (paginationState['prices-table'].page > 1) {
      paginationState['prices-table'].page--;
      renderPrices();
    }
  };
  nextBtn.onclick = function() {
    paginationState['prices-table'].page++;
    renderPrices();
  };
  pageSizeSelect.onchange = function() {
    paginationState['prices-table'].pageSize = Number(pageSizeSelect.value);
    paginationState['prices-table'].page = 1;
    renderPrices();
  };
  // Build query string from filters
  const params = new URLSearchParams();
  if (filters.asset_symbol) params.append('asset_symbol', filters.asset_symbol);
  if (filters.fiat_symbol) params.append('fiat_symbol', filters.fiat_symbol);
  if (filters.date_from) params.append('date_from', String(filters.date_from));
  if (filters.date_to) params.append('date_to', String(filters.date_to));
  const url = '/api/prices' + (params.toString() ? `?${params.toString()}` : '');
  fetchAndRenderPaginated<Price>(url, 'prices-table', row =>
    `<td>${new Date(row.unix_timestamp).toISOString().slice(0,10)}</td>
      <td>${row.price}</td>
      <td>${row.asset_symbol}</td>
      <td>${row.fiat_symbol}</td>`
  ).then(() => {
    // Add edit-on-click logic to each row
    const rows = document.querySelectorAll('#prices-table tbody tr') as NodeListOf<HTMLTableRowElement>;
    rows.forEach(tr => {
      tr.onclick = function () {
        // Extract price row data
        const price = {
          unix_timestamp: new Date(tr.children[0].textContent).getTime(),
          price: Number(tr.children[1].textContent || ''),
          asset_symbol: tr.children[2].textContent,
          fiat_symbol: tr.children[3].textContent
        } as Price;
        showAddEditPriceModal(price);
      };
      tr.onmouseenter = function () {
        tr.style.background = '#e6f7ff';
        tr.title = 'Click to edit price';
      };
      tr.onmouseleave = function () {
        tr.style.background = '';
        tr.title = '';
      };
    });
  });
}
renderPrices();

// Add/Edit Price Modal logic
function showAddEditPriceModal(price?: Price) {
  const modal = document.getElementById('edit-price-modal') as HTMLElement;
  const form = document.getElementById('edit-price-modal-form') as HTMLFormElement;
  const title = document.getElementById('edit-price-title') as HTMLElement;
  const errorDiv = document.getElementById('edit-price-error') as HTMLElement;
  const assetSelect = document.getElementById('edit-price-asset-symbol') as HTMLSelectElement;
  const dateInput = document.getElementById('edit-price-date') as HTMLInputElement;
  const priceInput = document.getElementById('edit-price-value') as HTMLInputElement;
  const cancelBtn = document.getElementById('cancel-edit-price-modal') as HTMLButtonElement;
  const deleteBtn = document.getElementById('delete-price-btn') as HTMLButtonElement;
  form.reset();
  if (price) {
    title.textContent = 'Edit Price';
    dateInput.value = price.unix_timestamp ? new Date(price.unix_timestamp).toISOString().slice(0,10) : '';
    priceInput.value = String(price.price) || '';
    assetSelect.value = price.asset_symbol || '';
    assetSelect.disabled = true;
    dateInput.disabled = true;
    deleteBtn.style.display = '';
  } else {
    title.textContent = 'Add Price';
    assetSelect.disabled = false;
    dateInput.disabled = false;
    deleteBtn.style.display = 'none';
  }
  errorDiv.textContent = '';
  modal.classList.add('active');
  cancelBtn.onclick = function() {
    modal.classList.remove('active');
  };
  form.onsubmit = async function(e: Event) {
    e.preventDefault();
    errorDiv.textContent = '';
    const fd = new FormData(form);
    const fiatRes = await fetch('/api/assets?asset_types=fiat');
    const { items: fiat } = await fiatRes.json();
    const fiat_symbol = fiat[0]?.symbol || '';
    try {
      let resp: Response;
      if (price) {
        resp = await fetch('/api/price', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unix_timestamp: price.unix_timestamp,
            price: Number(fd.get('price')),
            asset_symbol: price.asset_symbol,
            fiat_symbol: price.fiat_symbol
          })
        });
      } else {
        resp = await fetch('/api/price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unix_timestamp: Date.parse(fd.get('date') as string),
            price: Number(fd.get('price')),
            asset_symbol: fd.get('asset_symbol'),
            fiat_symbol: fiat_symbol
          })
        });
      }
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to save price');
      }
      modal.classList.remove('active');
      renderPrices();
    } catch (err: any) {
      errorDiv.textContent = err.message || 'Failed to save price';
    }
  };
  deleteBtn.onclick = async function() {
    if (!price) return;
    if (!confirm('Are you sure you want to delete this price?')) return;
    errorDiv.textContent = '';
    try {
      const resp = await fetch('/api/price', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unix_timestamp: price.unix_timestamp,
          asset_symbol: price.asset_symbol,
          fiat_symbol: price.fiat_symbol
        })
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to delete price');
      }
      modal.classList.remove('active');
      renderPrices();
    } catch (err: any) {
      errorDiv.textContent = err.message || 'Failed to delete price';
    }
  };
}

// Add Price button logic
(document.getElementById('open-edit-price-modal-btn') as HTMLButtonElement).onclick = function() {
  showAddEditPriceModal();
};

//=======================
// Transactions Page
//=======================
async function renderTransactions(): Promise<void> {
  // Setup filters
  const assetSelect = document.getElementById('transactions-filter-asset') as HTMLSelectElement;
  const typeSelect = document.getElementById('transactions-filter-type') as HTMLSelectElement;
  const walletSelect = document.getElementById('transactions-filter-wallet') as HTMLSelectElement;
  const dateFromInput = document.getElementById('transactions-filter-date-from') as HTMLInputElement;
  const dateToInput = document.getElementById('transactions-filter-date-to') as HTMLInputElement;
  const filterBtn = document.getElementById('transactions-filter-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('transactions-filter-reset-btn') as HTMLButtonElement;
  const prevBtn = document.getElementById('transactions-table-prev-page') as HTMLButtonElement;
  const nextBtn = document.getElementById('transactions-table-next-page') as HTMLButtonElement;
  const pageSizeSelect = document.getElementById('transactions-table-page-size') as HTMLSelectElement;
  const filters = {
    asset: assetSelect.value,
    type: typeSelect.value,
    wallet_id: walletSelect.value ? Number(walletSelect.value) : undefined,
    date_from: dateFromInput.value ? Date.parse(dateFromInput.value) : undefined,
    date_to: dateToInput.value ? Date.parse(dateToInput.value) + 24*60*60*1000 - 1 : undefined // end of day
  };
  filterBtn.onclick = function(e: Event) {
    e.preventDefault();
    paginationState['transactions-table'].page = 1;
    renderTransactions();
  };
  resetBtn.onclick = function(e: Event) {
    e.preventDefault();
    assetSelect.value = '';
    typeSelect.value = '';
    walletSelect.value = '';
    dateFromInput.value = '';
    dateToInput.value = '';
    paginationState['transactions-table'].page = 1;
  };
  prevBtn.onclick = function() {
    if (paginationState['transactions-table'].page > 1) {
      paginationState['transactions-table'].page--;
      renderTransactions();
    }
  };
  nextBtn.onclick = function() {
    paginationState['transactions-table'].page++;
    renderTransactions();
  };
  pageSizeSelect.onchange = function() {
    paginationState['transactions-table'].pageSize = Number(pageSizeSelect.value);
    paginationState['transactions-table'].page = 1;
    renderTransactions();
  };
  // Build query string from filters
  const params = new URLSearchParams();
  if (filters.asset) params.append('asset', filters.asset);
  if (filters.type) params.append('type', filters.type);
  if (filters.wallet_id) params.append('wallet_id', filters.wallet_id.toString());
  if (filters.date_from) params.append('date_from', filters.date_from.toString());
  if (filters.date_to) params.append('date_to', filters.date_to.toString());
  const url = '/api/transactions' + (params.toString() ? `?${params.toString()}` : '');
  // Fetch wallets for name lookup
  const walletsRes = await fetch('/api/wallets');
  const { items }: Paginated<Wallet> = await walletsRes.json();
  const walletMap = Object.fromEntries(items.map(w => [w.id, w.name]));

  await fetchAndRenderPaginated<Transaction>(url, 'transactions-table', row =>
    `<td><input type="checkbox" class="transaction-select" data-id="${row.id}" data-type="${row.type}"></td>
      <td>${row.id}</td><td>${getDateTimeString(row.unix_timestamp, false)}Z</td><td>${row.type}</td>
      <td>${row.send_asset_symbol ?? ''}</td><td>${row.send_asset_quantity || ''}</td>
      <td>${row.receive_asset_symbol ?? ''}</td><td>${row.receive_asset_quantity || ''}</td>
      <td>${row.fee_asset_symbol ?? ''}</td><td>${row.fee_asset_quantity || ''}</td>
      <td data-wallet-id="${row.from_wallet_id ?? ''}">${row.from_wallet_id ? (walletMap[row.from_wallet_id] || row.from_wallet_id) : ''}</td>
      <td data-wallet-id="${row.to_wallet_id ?? ''}">${row.to_wallet_id ? (walletMap[row.to_wallet_id] || row.to_wallet_id) : ''}</td>
      <td>${row.is_income ? '✓' : ''}</td><td>${row.notes ?? ''}</td>`
  ).then(() => {
    const rows = document.querySelectorAll<HTMLTableRowElement>('#transactions-table tbody tr');
    rows.forEach(tr => {
      const id = tr.children[1].textContent || '';
      const checkbox = tr.children[0].querySelector('input.transaction-select') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = transactionSelection.has(Number(id));
        checkbox.onclick = (e: Event) => {
          e.stopPropagation();
          const txId = Number(checkbox.dataset.id);
          if (checkbox.checked) transactionSelection.set(txId, checkbox.dataset.type || '');
          else transactionSelection.delete(txId);
          updateTransactionSelectionBar();
        };
      }
      tr.onclick = async function () {
        const fromWalletId = (tr.children[10] as HTMLTableCellElement).dataset.walletId;
        const toWalletId = (tr.children[11] as HTMLTableCellElement).dataset.walletId;
        let transaction = {
          id: Number(id),
          unix_timestamp: Date.parse(tr.children[2].textContent || ''),
          type: tr.children[3].textContent || '',
          send_asset_symbol: tr.children[4].textContent || '',
          send_asset_quantity: (tr.children[5].textContent !== '') ? Number(tr.children[5].textContent) : undefined,
          receive_asset_symbol: tr.children[6].textContent || '',
          receive_asset_quantity: (tr.children[7].textContent !== '') ? Number(tr.children[7].textContent) : undefined,
          fee_asset_symbol: tr.children[8].textContent || '',
          fee_asset_quantity: (tr.children[9].textContent !== '') ? Number(tr.children[9].textContent) : undefined,
          from_wallet_id: fromWalletId ? Number(fromWalletId) : undefined,
          to_wallet_id: toWalletId ? Number(toWalletId) : undefined,
          is_income: tr.children[12].textContent === '✓',
          notes: tr.children[13].textContent || ''
        } as Transaction;
        showAddEditTransactionModal(transaction);
      };
      tr.onmouseenter = function () {
        tr.style.background = '#e6f7ff';
        tr.title = 'Click to edit transaction';
      };
      tr.onmouseleave = function () {
        tr.style.background = '';
        tr.title = '';
      };
    });
    updateTransactionSelectionBar();
  });
}
renderTransactions();

//=======================
// Transactions: Selection + Bulk Edit
//=======================
// Map of selected transaction IDs to their type. Tracking the type lets the
// selection bar correctly enable bulk edit even when selected rows are on
// other pages (not present in the DOM).
const transactionSelection = new Map<number, string>();

function updateTransactionSelectionBar() {
  const bar = document.getElementById('transactions-selection-bar') as HTMLElement;
  const countEl = document.getElementById('transactions-selection-count') as HTMLElement;
  const bulkEditBtn = document.getElementById('transactions-bulk-edit-btn') as HTMLButtonElement;
  const bulkEditHint = document.getElementById('transactions-bulk-edit-hint') as HTMLElement;
  const size = transactionSelection.size;
  bar.classList.toggle('active', size > 0);
  const visibleChecked = document.querySelectorAll<HTMLInputElement>(
    '#transactions-table .transaction-select:checked'
  ).length;
  countEl.textContent = size === visibleChecked
    ? `${size} selected`
    : `${size} selected (${visibleChecked} on this page)`;

  // Bulk edit requires that all selected rows share a single type. We read the
  // types directly from the selection state so cross-page selections are
  // evaluated correctly.
  const types = new Set(transactionSelection.values());
  const sameType = types.size === 1;
  bulkEditBtn.disabled = size === 0 || !sameType;
  bulkEditHint.classList.toggle('active', size > 0 && !sameType);
}

// Select-all toggles only the visible rows on the current page.
(document.getElementById('transactions-select-all') as HTMLInputElement).onclick = function(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const rowCheckboxes = document.querySelectorAll<HTMLInputElement>(
    '#transactions-table .transaction-select'
  );
  rowCheckboxes.forEach(cb => {
    cb.checked = checked;
    const id = Number(cb.dataset.id);
    if (checked) transactionSelection.set(id, cb.dataset.type || '');
    else transactionSelection.delete(id);
  });
  updateTransactionSelectionBar();
};

(document.getElementById('transactions-clear-selection-btn') as HTMLButtonElement).onclick = function() {
  transactionSelection.clear();
  const rowCheckboxes = document.querySelectorAll<HTMLInputElement>(
    '#transactions-table .transaction-select'
  );
  rowCheckboxes.forEach(cb => cb.checked = false);
  (document.getElementById('transactions-select-all') as HTMLInputElement).checked = false;
  updateTransactionSelectionBar();
};

(document.getElementById('transactions-bulk-delete-btn') as HTMLButtonElement).onclick = async function() {
  if (!transactionSelection.size) return;
  if (!confirm(`Delete ${transactionSelection.size} transaction(s)? This cannot be undone.`)) return;
  try {
    const resp = await fetch('/api/transactions/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(transactionSelection.keys()) })
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg || 'Failed to bulk delete');
    }
    transactionSelection.clear();
    renderTransactions();
  } catch (err: any) {
    alert(err.message || 'Failed to bulk delete');
  }
};

(document.getElementById('transactions-bulk-edit-btn') as HTMLButtonElement).onclick = function() {
  showBulkEditModal();
};

function showBulkEditModal() {
  const modal = document.getElementById('bulk-edit-transaction-modal') as HTMLElement;
  const form = document.getElementById('bulk-edit-form') as HTMLFormElement;
  const title = document.getElementById('bulk-edit-title') as HTMLElement;
  const errorDiv = document.getElementById('bulk-edit-error') as HTMLElement;
  const cancelBtn = document.getElementById('bulk-edit-cancel-btn') as HTMLButtonElement;

  // Derive the single selected type directly from the selection state (so we
  // correctly handle selections that span multiple pages).
  const types = new Set(transactionSelection.values());
  if (types.size !== 1) return;
  const type = Array.from(types)[0];

  form.reset();
  errorDiv.textContent = '';
  title.textContent = `Bulk Edit ${transactionSelection.size} ${type} Transaction${transactionSelection.size > 1 ? 's' : ''}`;

  // form.reset() clears values but does not restore disabled state. Sync each paired
  // control to its (now unchecked) apply checkbox so controls are disabled by default.
  form.querySelectorAll<HTMLInputElement>('.bulk-apply').forEach(apply => {
    const pairedName = (apply.name || '').replace(/^apply_/, '');
    const paired = form.querySelector(`[name="${pairedName}"]:not(.bulk-apply)`) as HTMLInputElement | HTMLSelectElement | null;
    if (paired) paired.disabled = !apply.checked;
  });

  // Populate asset/wallet dropdowns
  populateAssetDropdowns([
    document.getElementById('bulk-edit-send-asset-select') as HTMLSelectElement,
    document.getElementById('bulk-edit-receive-asset-select') as HTMLSelectElement,
    document.getElementById('bulk-edit-fee-asset-select') as HTMLSelectElement
  ]);
  populateWalletDropdowns([
    document.getElementById('bulk-edit-from-wallet-select') as HTMLSelectElement,
    document.getElementById('bulk-edit-to-wallet-select') as HTMLSelectElement
  ]);

  // Show/hide rows based on type (matching the single-edit modal's rules).
  const dispositionTypes = ['Sell', 'Send', 'Trade'];
  const acquisitionTypes = ['Buy', 'Receive'];
  const visibility: Record<string, boolean> = {
    send_asset_symbol:     type !== 'Receive',
    send_asset_quantity:   type !== 'Receive',
    receive_asset_symbol:  type !== 'Send',
    receive_asset_quantity:type !== 'Send',
    fee_asset_symbol:      type !== 'Receive',
    fee_asset_quantity:    type !== 'Receive',
    from_wallet_id:        dispositionTypes.includes(type) || type === 'Transfer',
    to_wallet_id:          acquisitionTypes.includes(type) || type === 'Transfer',
    is_income:             type === 'Receive',
    notes:                 true
  };
  form.querySelectorAll('label').forEach(label => {
    const control = label.querySelector('[name]:not(.bulk-apply)') as HTMLElement | null;
    if (!control) return;
    const name = control.getAttribute('name') || '';
    (label as HTMLElement).style.display = visibility[name] ? '' : 'none';
  });

  // When an "apply" checkbox toggles, enable/disable the paired control
  form.querySelectorAll<HTMLInputElement>('.bulk-apply').forEach(apply => {
    const pairedName = (apply.name || '').replace(/^apply_/, '');
    const paired = form.querySelector(`[name="${pairedName}"]:not(.bulk-apply)`) as HTMLInputElement | HTMLSelectElement | null;
    apply.onchange = () => {
      if (paired) paired.disabled = !apply.checked;
    };
  });

  modal.classList.add('active');
  cancelBtn.onclick = () => modal.classList.remove('active');

  form.onsubmit = async function(e: Event) {
    e.preventDefault();
    errorDiv.textContent = '';
    const fd = new FormData(form);
    const numericFields = new Set([
      'send_asset_quantity', 'receive_asset_quantity', 'fee_asset_quantity',
      'from_wallet_id', 'to_wallet_id'
    ]);
    const patch: Record<string, any> = {};
    // Only include fields whose "apply" checkbox is ticked
    form.querySelectorAll<HTMLInputElement>('.bulk-apply').forEach(apply => {
      if (!apply.checked) return;
      const fieldName = (apply.name || '').replace(/^apply_/, '');
      const paired = form.querySelector(`[name="${fieldName}"]:not(.bulk-apply)`) as HTMLInputElement | HTMLSelectElement | null;
      if (!paired) return;
      if ((paired as HTMLInputElement).type === 'checkbox') {
        patch[fieldName] = (paired as HTMLInputElement).checked;
        return;
      }
      const raw = fd.get(fieldName);
      if (typeof raw !== 'string' || raw.trim() === '') {
        patch[fieldName] = null;
        return;
      }
      if (numericFields.has(fieldName)) {
        const n = Number(raw);
        patch[fieldName] = Number.isFinite(n) ? n : null;
      } else {
        patch[fieldName] = raw;
      }
    });
    if (!Object.keys(patch).length) {
      errorDiv.textContent = 'Tick at least one field to apply.';
      return;
    }
    try {
      const resp = await fetch('/api/transactions/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(transactionSelection.keys()), patch })
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to bulk edit');
      }
      modal.classList.remove('active');
      transactionSelection.clear();
      renderTransactions();
    } catch (err: any) {
      errorDiv.textContent = err.message || 'Failed to bulk edit';
    }
  };
}

// Add/Import Transaction button logic
(document.getElementById('open-add-import-modal-btn') as HTMLButtonElement).onclick = function() {
  showAddEditTransactionModal();
};

// Download csv
(document.getElementById('download-csv-btn') as HTMLButtonElement).onclick = function() {
  window.location.href = '/transactions.csv';
};

(document.getElementById('import-transactions-btn') as HTMLButtonElement).onclick = async function() {
  const fileInput = document.getElementById('import-transactions-file') as HTMLInputElement;
  const status = document.getElementById('import-transactions-status') as HTMLElement;
  status.textContent = '';
  if (!fileInput.files || !fileInput.files.length) {
    status.textContent = 'Please select a file.';
    return;
  }
  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async function(e: ProgressEvent<FileReader>) {
    const csvText = e.target?.result as string;
    try {
      const resp = await fetch('/api/import-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Import failed');
      status.style.color = 'green';
      status.textContent = `Successfully imported ${result.inserted} txs`;
      renderTransactions();
    } catch (err: any) {
      status.style.color = '#d9534f';
      status.textContent = err.message || 'Import failed';
    }
  };
  reader.readAsText(file);
};

// Add/Edit Transaction Modal
function showAddEditTransactionModal(transaction?: Transaction) {
  console.log(transaction)
  // Modal Elements
  const modal = document.getElementById('edit-transaction-modal') as HTMLElement;
  const importContainer = document.getElementById('import-transactions-container') as HTMLElement;
  const deleteBtn = document.getElementById('delete-transaction-btn') as HTMLButtonElement;
  const title = document.getElementById('edit-transaction-title') as HTMLElement;
  const form = document.getElementById('edit-transaction-form') as HTMLFormElement;
  const dateInput = document.getElementById('edit-date') as HTMLInputElement;
  const typeSelect = document.getElementById('edit-type-select') as HTMLSelectElement;
  const sendSelect = document.getElementById('edit-send-asset-select') as HTMLSelectElement;
  const sendQty = document.getElementById('edit-send-asset-quantity') as HTMLInputElement;
  const receiveSelect = document.getElementById('edit-receive-asset-select') as HTMLSelectElement;
  const receiveQty = document.getElementById('edit-receive-asset-quantity') as HTMLInputElement;
  const feeAssetSelect = document.getElementById('edit-fee-asset-select') as HTMLSelectElement;
  const feeAssetQty = document.getElementById('edit-fee-asset-quantity') as HTMLInputElement;
  const fromWalletSelect = document.getElementById('edit-from-wallet-select') as HTMLSelectElement;
  const toWalletSelect = document.getElementById('edit-to-wallet-select') as HTMLSelectElement;
  const isIncomeInput = document.getElementById('edit-is-income') as HTMLInputElement;
  const notesInput = document.getElementById('edit-notes') as HTMLInputElement;
  const saveBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  const errorDiv = document.getElementById('edit-transaction-error') as HTMLElement;
  // Show modal
  modal.classList.add('active');
  // Validation function
  function validateAddEditTransactionForm() {
    validateTransactionFields(
      typeSelect,
      sendSelect,
      sendQty,
      receiveSelect,
      receiveQty,
      feeAssetSelect,
      feeAssetQty,
      fromWalletSelect,
      toWalletSelect,
      isIncomeInput,
      saveBtn,
      errorDiv
    );
  }

  let method: string | null = null;
  errorDiv.textContent = '';
  if (!transaction) {
    // Add mode
    method = 'POST';
    title.textContent = 'Add Transaction';
    importContainer.style.display = '';
    deleteBtn.style.display = 'none';
    form.reset();
    dateInput.value = getDateTimeString(Date.now(), true);
  } else {
    // Edit mode
    method = 'PUT';
    title.textContent = `Edit Transaction #${transaction.id}`;
    importContainer.style.display = 'none';
    deleteBtn.style.display = '';
    dateInput.value = transaction.unix_timestamp ? getDateTimeString(transaction.unix_timestamp, false) : '';
    typeSelect.value = transaction.type || '';
    sendSelect.value = transaction.send_asset_symbol || '';
    sendQty.value = transaction.send_asset_quantity != null ? String(transaction.send_asset_quantity) : '';
    receiveSelect.value = transaction.receive_asset_symbol || '';
    receiveQty.value = transaction.receive_asset_quantity != null ? String(transaction.receive_asset_quantity) : '';
    feeAssetSelect.value = transaction.fee_asset_symbol || '';
    feeAssetQty.value = transaction.fee_asset_quantity != null ? String(transaction.fee_asset_quantity) : '';
    isIncomeInput.checked = !!transaction.is_income;
    notesInput.value = transaction.notes || '';
    fromWalletSelect.value = transaction.from_wallet_id ? String(transaction.from_wallet_id) : '';
    toWalletSelect.value = transaction.to_wallet_id ? String(transaction.to_wallet_id) : '';
  }
  validateAddEditTransactionForm();
  // Validation
  [typeSelect, sendSelect, receiveSelect, feeAssetSelect, fromWalletSelect, toWalletSelect, isIncomeInput].forEach(el => {
    el.addEventListener('change', validateAddEditTransactionForm);
  });
  [sendQty, receiveQty, feeAssetQty].forEach(el => {
    el.addEventListener('input', validateAddEditTransactionForm);
  });
  form.onsubmit = async function(e: Event) {
    e.preventDefault();
    const fd = new FormData(form);
    errorDiv.textContent = '';
    // Convert form inputs to typed payload fields. Empty selects / inputs become null so
    // FK-constrained columns stay NULL instead of ''.
    //
    // For Transfer, the receive fields are disabled (mirrored from send in the UI), and
    // FormData() skips disabled controls. Read their values directly from the DOM so the
    // mirrored send→receive payload makes it to the server.
    const type = fd.get('type');
    if (type === 'Transfer') {
      fd.set('receive_asset_symbol', receiveSelect.value);
      fd.set('receive_asset_quantity', receiveQty.value);
    }
    const str = (name: string) => {
      const v = fd.get(name);
      return typeof v === 'string' && v.trim() !== '' ? v : null;
    };
    const num = (name: string) => {
      const v = fd.get(name);
      if (typeof v !== 'string' || v.trim() === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    try {
      const resp = await fetch(`/api/transaction/${transaction ? transaction.id : ''}`, {
        method: method!,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unix_timestamp: Date.parse(`${fd.get('date')}Z`),
          type: fd.get('type'),
          send_asset_symbol: str('send_asset_symbol'),
          send_asset_quantity: num('send_asset_quantity'),
          receive_asset_symbol: str('receive_asset_symbol'),
          receive_asset_quantity: num('receive_asset_quantity'),
          fee_asset_symbol: str('fee_asset_symbol'),
          fee_asset_quantity: num('fee_asset_quantity'),
          is_income: fd.get('is_income') === 'on',
          notes: str('notes'),
          from_wallet_id: num('from_wallet_id'),
          to_wallet_id: num('to_wallet_id')
        })
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to update transaction');
      }
      modal.classList.remove('active');
      renderTransactions();
    } catch (err: any) {
      errorDiv.textContent = err.message || 'Failed to update transaction';
    }
  };
  // Delete handler
  (document.getElementById('delete-transaction-btn') as HTMLButtonElement).onclick = async function() {
    if (confirm('Are you sure you want to delete this transaction?')) {
      try {
        if (!transaction) throw new Error('Transaction not found');
        await fetch(`/api/transaction/${transaction.id}`, { method: 'DELETE' });
        modal.classList.remove('active');
        renderTransactions();
      } catch (err: any) {
        (document.getElementById('edit-transaction-error') as HTMLElement).textContent = err.message || 'Failed to delete transaction';
      }
    }
  };
  // Cancel handler
  (document.getElementById('close-edit-modal') as HTMLButtonElement).onclick = function() {
    modal.classList.remove('active');
  };
  // Clicking outside modal-content closes modal
  // modal.onclick = function(e) {
  //   if (e.target === modal) modal.classList.remove('active');
  // };
}

async function populateTransactionTypes(selects: Array<HTMLSelectElement>) {
  const types: string[] = await fetch('/api/transaction-types').then(r => r.json());
  selects.forEach(select => {
    // Preserve the current selection so repopulating doesn't reset it.
    const previous = select.value;
    // Preserve the first (default) option and replace the rest.
    while (select.options.length > 1) select.remove(1);
    types.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      select.appendChild(opt);
    });
    if (previous && Array.from(select.options).some(o => o.value === previous)) {
      select.value = previous;
    }
  });
}

function populateAllTransactionTypeDropdowns() {
  populateTransactionTypes([
    document.getElementById('transactions-filter-type') as HTMLSelectElement,
    document.getElementById('edit-type-select') as HTMLSelectElement
  ]);
}
populateAllTransactionTypeDropdowns();

// Wallet dropdown helper
async function populateWalletDropdowns(selects: Array<HTMLSelectElement | null>) {
  const res = await fetch('/api/wallets');
  const { items: wallets }: Paginated<Wallet> = await res.json();
  selects.forEach(select => {
    if (!select) return;
    // Preserve the current selection so repopulating doesn't reset it.
    const previous = select.value;
    // Preserve the first (default) option and replace the rest.
    while (select.options.length > 1) select.remove(1);
    wallets.forEach(wallet => {
      const opt = document.createElement('option');
      opt.value = String(wallet.id);
      opt.textContent = wallet.name;
      select.appendChild(opt);
    });
    if (previous && Array.from(select.options).some(o => o.value === previous)) {
      select.value = previous;
    }
  });
}

function populateAllWalletDropdowns() {
  populateWalletDropdowns([
    document.getElementById('edit-from-wallet-select') as HTMLSelectElement,
    document.getElementById('edit-to-wallet-select') as HTMLSelectElement,
    document.getElementById('transactions-filter-wallet') as HTMLSelectElement
  ]);
}
populateAllWalletDropdowns();

//=======================
// Wallets Page
//=======================
function renderWallets(): void {
  populateAllWalletDropdowns();
  fetchAndRender<Wallet>('/api/wallets', 'wallets-table', row =>
    `<td>${row.id}</td><td>${row.name}</td><td class="wallet-balances" data-wallet-id="${row.id}">Loading...</td>`
  ).then(async () => {
    // Fetch balances for each wallet and populate the dropdown
    const balanceCells = document.querySelectorAll<HTMLTableCellElement>('#wallets-table .wallet-balances');
    for (const cell of Array.from(balanceCells)) {
      const walletId = cell.dataset.walletId;
      if (!walletId) continue;
      try {
        const res = await fetch(`/api/wallet/${walletId}/balances`);
        const balances: { symbol: string; balance: number }[] = await res.json();
        if (!balances.length) {
          cell.textContent = 'No assets';
        } else {
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = `${balances.length} asset${balances.length > 1 ? 's' : ''}`;
          details.appendChild(summary);
          const list = document.createElement('ul');
          list.style.margin = '0.25em 0';
          list.style.paddingLeft = '1.2em';
          balances.forEach(b => {
            const li = document.createElement('li');
            li.textContent = `${b.symbol}: ${b.balance}`;
            list.appendChild(li);
          });
          details.appendChild(list);
          cell.textContent = '';
          cell.appendChild(details);
        }
      } catch {
        cell.textContent = 'Error';
      }
    }
    // Add click handlers for editing
    const rows = document.querySelectorAll<HTMLTableRowElement>('#wallets-table tbody tr');
    rows.forEach(tr => {
      const id = Number(tr.children[0].textContent);
      const name = tr.children[1].textContent || '';
      tr.onmouseenter = function () {
        tr.style.background = '#e6f7ff';
        tr.title = 'Click to edit wallet';
      };
      tr.onmouseleave = function () {
        tr.style.background = '';
        tr.title = '';
      };
      tr.onclick = function (e) {
        // Don't trigger edit when clicking on the balances details/summary
        if ((e.target as HTMLElement).closest('details')) return;
        showAddEditWalletModal({ id, name } as Wallet);
      };
    });
  });
}
renderWallets();

// Add Wallet button
(document.getElementById('open-edit-wallet-modal-btn') as HTMLButtonElement).onclick = function() {
  showAddEditWalletModal();
};

// Add/Edit Wallet Modal
function showAddEditWalletModal(wallet?: Wallet) {
  const modal = document.getElementById('edit-wallet-modal') as HTMLElement;
  const form = document.getElementById('edit-wallet-form') as HTMLFormElement;
  const title = document.getElementById('edit-wallet-title') as HTMLElement;
  const errorDiv = document.getElementById('edit-wallet-error') as HTMLElement;
  const nameInput = document.getElementById('edit-wallet-name') as HTMLInputElement;
  const saveBtn = document.getElementById('save-wallet-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-edit-wallet-modal') as HTMLButtonElement;
  const deleteBtn = document.getElementById('delete-wallet-btn') as HTMLButtonElement;
  form.reset();
  errorDiv.textContent = '';
  if (wallet) {
    title.textContent = 'Edit Wallet';
    nameInput.value = wallet.name || '';
    deleteBtn.style.display = '';
  } else {
    title.textContent = 'Add Wallet';
    deleteBtn.style.display = 'none';
  }
  modal.classList.add('active');
  cancelBtn.onclick = function() {
    modal.classList.remove('active');
  };
  form.onsubmit = async function(e: Event) {
    e.preventDefault();
    errorDiv.textContent = '';
    const fd = new FormData(form);
    try {
      let resp: Response;
      if (wallet) {
        resp = await fetch(`/api/wallet/${wallet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fd.get('name')
          })
        });
      } else {
        resp = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fd.get('name')
          })
        });
      }
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to save wallet');
      }
      modal.classList.remove('active');
      renderWallets();
    } catch (err: any) {
      errorDiv.textContent = err.message || 'Failed to save wallet';
    }
  };
  deleteBtn.onclick = async function() {
    if (!wallet) return;
    if (!confirm('Are you sure you want to delete this wallet? Transactions referencing it will have their wallet association removed.')) return;
    errorDiv.textContent = '';
    try {
      const resp = await fetch(`/api/wallet/${wallet.id}`, { method: 'DELETE' });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to delete wallet');
      }
      modal.classList.remove('active');
      renderWallets();
    } catch (err: any) {
      errorDiv.textContent = err.message || 'Failed to delete wallet';
    }
  };
}

// Validation helper for transaction forms
function validateTransactionFields(
  typeSelect: HTMLSelectElement,
  sendAssetSelect: HTMLSelectElement,
  sendQtyInput: HTMLInputElement,
  receiveAssetSelect: HTMLSelectElement,
  receiveQtyInput: HTMLInputElement,
  feeAssetSelect: HTMLSelectElement,
  feeQtyInput: HTMLInputElement,
  fromWalletSelect: HTMLSelectElement,
  toWalletSelect: HTMLSelectElement,
  isIncomeInput: HTMLInputElement,
  submitBtn: HTMLButtonElement,
  errorDiv: HTMLElement
): boolean {
  const type = typeSelect.value;
  const sendSymbol = sendAssetSelect.value;
  const sendQty = sendQtyInput.value;
  const receiveSymbol = receiveAssetSelect.value;
  const receiveQty = receiveQtyInput.value;
  const feeAsset = feeAssetSelect.value;
  const feeQty = feeQtyInput.value;
  const fromWallet = fromWalletSelect.value;
  const toWallet = toWalletSelect.value;
  let valid = true;
  if (errorDiv) errorDiv.textContent = '';

  // Show/hide a field (and its <label> wrapper); when hidden, clear its value.
  const toggleField = (el: HTMLInputElement | HTMLSelectElement, show: boolean) => {
    const label = el.closest('label') as HTMLElement | null;
    if (label) label.style.display = show ? '' : 'none';
    if (!show) {
      if ((el as HTMLInputElement).type === 'checkbox') (el as HTMLInputElement).checked = false;
      else el.value = '';
    }
  };

  // Per-type field visibility (matches backend validation)
  const dispositionTypes = ['Sell', 'Send', 'Trade'];
  const acquisitionTypes = ['Buy', 'Receive'];
  const showSend = type !== 'Receive';
  const showReceive = type !== 'Send';
  const showFee = type !== 'Receive';
  const showFromWallet = dispositionTypes.includes(type) || type === 'Transfer';
  const showToWallet = acquisitionTypes.includes(type) || type === 'Transfer';
  const showIsIncome = type === 'Receive';

  toggleField(sendAssetSelect, showSend);
  toggleField(sendQtyInput, showSend);
  toggleField(receiveAssetSelect, showReceive);
  toggleField(receiveQtyInput, showReceive);
  toggleField(feeAssetSelect, showFee);
  toggleField(feeQtyInput, showFee);
  toggleField(fromWalletSelect, showFromWallet);
  toggleField(toWalletSelect, showToWallet);
  toggleField(isIncomeInput, showIsIncome);

  // For Transfer, receive asset/quantity mirrors send and is read-only so the two can't
  // diverge. Keep the receive inputs visible but disabled (the mirror lets the user see
  // what will be submitted).
  if (type === 'Transfer') {
    receiveAssetSelect.value = sendAssetSelect.value;
    receiveQtyInput.value = sendQtyInput.value;
    receiveAssetSelect.disabled = true;
    receiveQtyInput.disabled = true;
  } else {
    receiveAssetSelect.disabled = false;
    receiveQtyInput.disabled = false;
  }

  // Required-field checks by type
  if (type === 'Buy' || type === 'Sell' || type === 'Trade' || type === 'Transfer') {
    if (!sendSymbol || !sendQty || !receiveSymbol || !receiveQty) valid = false;
  } else if (type === 'Send') {
    if (!sendSymbol || !sendQty) valid = false;
  } else if (type === 'Receive') {
    if (!receiveSymbol || !receiveQty) valid = false;
  } else {
    valid = false;
  }
  // Wallet rules
  // Wallets are optional for most types; the server only requires them for Transfer
  // (and rejects them entirely for the opposing direction). For Transfer, both
  // wallets are required and must be different.
  if (type === 'Transfer') {
    if (!fromWallet || !toWallet || fromWallet === toWallet) valid = false;
  }
  // Fee asset and qty must either both be set or both empty
  if ((feeAsset && !feeQty) || (!feeAsset && feeQty)) {
    valid = false;
  }
  submitBtn.disabled = !valid;
  return valid;
}

//=======================
// Tax Page
//=======================
async function renderTaxPage(): Promise<void> {
  // Populate both the asset-level ACB table and the yearly aggregates table
  const acbTbody = document.querySelector('#tax-acb-table tbody') as HTMLElement;
  const yearlyTbody = document.querySelector('#tax-yearly-aggregates-table tbody') as HTMLElement;
  if (!acbTbody || !yearlyTbody) return;
  acbTbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
  yearlyTbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  try {
    const acbData: Record<string, any> = await fetch('/api/acb').then(r => r.json());
    if (acbData.error) {
      acbTbody.innerHTML = `<tr><td colspan="9">Error: ${acbData.error}</td></tr>`;
      yearlyTbody.innerHTML = `<tr><td colspan="7">Error: ${acbData.error}</td></tr>`;
      return;
    }
    // =====================
    // Per-Asset ACB table
    // =====================
    acbTbody.innerHTML = Object.entries(acbData).map(([symbol, data]) => {
      if (data.error) {
        return `<tr><td colspan="9">${symbol} encountered error: ${data.error}</td></tr>`;
      }
      const totals = data['TOTALS'] || {};
      // Build yearly breakdown table rows (excluding TOTALS)
      const yearRows = Object.entries(data)
        .filter(([year]) => year !== 'TOTALS')
        .map(([year, y]: [string, any]) =>
          `<tr>
            <td>${year}</td>
            <td>${y.acb != null ? y.acb.toFixed(2) : 'N/A'}</td>
            <td>${y.totalUnits != null ? y.totalUnits : 'N/A'}</td>
            <td>${y.totalProceeds != null ? y.totalProceeds.toFixed(2) : 'N/A'}</td>
            <td>${y.totalCosts != null ? y.totalCosts.toFixed(2) : 'N/A'}</td>
            <td>${y.totalOutlays != null ? y.totalOutlays.toFixed(2) : 'N/A'}</td>
            <td>${y.totalGainLoss != null ? y.totalGainLoss.toFixed(2) : 'N/A'}</td>
            <td>${y.superficialLosses != null ? y.superficialLosses.toFixed(2) : 'N/A'}</td>
            <td>${y.totalIncome != null ? y.totalIncome.toFixed(2) : 'N/A'}</td>
          </tr>`
        ).join('');
      return `
      <tr>
        <td>${symbol}</td>
        <td>${totals.acb != null ? totals.acb.toFixed(2) : 'N/A'}</td>
        <td>${totals.totalUnits != null ? totals.totalUnits : 'N/A'}</td>
        <td>${totals.totalProceeds != null ? totals.totalProceeds.toFixed(2) : 'N/A'}</td>
        <td>${totals.totalCosts != null ? totals.totalCosts.toFixed(2) : 'N/A'}</td>
        <td>${totals.totalOutlays != null ? totals.totalOutlays.toFixed(2) : 'N/A'}</td>
        <td>${totals.totalGainLoss != null ? totals.totalGainLoss.toFixed(2) : 'N/A'}</td>
        <td>${totals.superficialLosses != null ? totals.superficialLosses.toFixed(2) : 'N/A'}</td>
        <td>${totals.totalIncome != null ? totals.totalIncome.toFixed(2) : 'N/A'}</td>
        <td>
          <details>
            <summary>Yearly breakdown</summary>
            <table border="1" style="margin-top:0.5em; width:100%;">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>ACB</th>
                  <th>Total Units</th>
                  <th>Total Proceeds</th>
                  <th>Total Costs</th>
                  <th>Total Outlays</th>
                  <th>Total Gain/Loss</th>
                  <th>Superficial Losses</th>
                  <th>Total Income</th>
                </tr>
              </thead>
              <tbody>
                ${yearRows}
              </tbody>
            </table>
          </details>
        </td>
      </tr>`;
    }).join('');
    // =====================
    // Per-Year ACB table
    // =====================
    const yearly: Record<string, any> = {};
    Object.values(acbData).forEach((assetData: any) => {
      Object.entries(assetData)
        .filter(([year]) => year !== 'TOTALS')
        .forEach(([year, y]: [string, any]) => {
          if (!yearly[year]) {
            yearly[year] = {
              acb: 0,
              totalProceeds: 0,
              totalCosts: 0,
              totalOutlays: 0,
              totalGainLoss: 0,
              superficialLosses: 0,
              totalIncome: 0
            };
          }
          yearly[year].acb += Number(y.acb) || 0;
          yearly[year].totalProceeds += Number(y.totalProceeds) || 0;
          yearly[year].totalCosts += Number(y.totalCosts) || 0;
          yearly[year].totalOutlays += Number(y.totalOutlays) || 0;
          yearly[year].totalGainLoss += Number(y.totalGainLoss) || 0;
          yearly[year].superficialLosses += Number(y.superficialLosses) || 0;
          yearly[year].totalIncome += Number(y.totalIncome) || 0;
        });
    });
    const years = Object.keys(yearly).sort();
    yearlyTbody.innerHTML = years.map(year => {
      const y = yearly[year];
      return `<tr>
        <td>${year}</td>
        <td>${y.acb.toFixed(2)}</td>
        <td>${y.totalProceeds.toFixed(2)}</td>
        <td>${y.totalCosts.toFixed(2)}</td>
        <td>${y.totalOutlays.toFixed(2)}</td>
        <td>${y.totalGainLoss.toFixed(2)}</td>
        <td>${y.superficialLosses.toFixed(2)}</td>
        <td>${y.totalIncome.toFixed(2)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">No yearly data</td></tr>';
  } catch (e) {
    acbTbody.innerHTML = '<tr><td colspan="9">Error loading ACB data</td></tr>';
    yearlyTbody.innerHTML = '<tr><td colspan="7">Error loading yearly aggregates</td></tr>';
  }
}
renderTaxPage();

// Helpers
function getDateTimeString(unix_timestamp: number, localize: boolean): string {
  const tzoffset = localize ? (new Date()).getTimezoneOffset() * 60000 : 0; //offset in milliseconds
  return new Date(unix_timestamp - tzoffset).toISOString().slice(0,19);
}