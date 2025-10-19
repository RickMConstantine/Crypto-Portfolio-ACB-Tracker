import { Asset, Price, Transaction } from '../types';

//=======================
// Query Document
//=======================
const tabs = document.querySelectorAll<HTMLDivElement>('.tab');
const contents: Record<string, HTMLElement> = {
  assets: document.getElementById('assets-content') as HTMLElement,
  prices: document.getElementById('prices-content') as HTMLElement,
  transactions: document.getElementById('transactions-content') as HTMLElement,
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
      // case 'assets':
      //   renderAssets();
      //   break;
      // case 'prices':
      //   renderPrices();
      //   break;
      // case 'transactions':
      //   renderTransactions();
      //   break;
      case 'tax':
        renderTaxPage();
    }
  });
});

//=======================
// Render Tabs + Content
//=======================
async function fetchAndRender(
  url: string,
  tableId: string,
  rowFn: (row: any) => string,
  requestInit: RequestInit = {}
): Promise<void> {
  const res = await fetch(url, requestInit);
  const data: any[] = await res.json();
  const tbody = document.querySelector(`#${tableId} tbody`) as HTMLTableSectionElement;
  tbody.innerHTML = '';
  // Populate table rows
  data.forEach((row: any) => {
    const tr = document.createElement('tr');
    tr.innerHTML = rowFn(row);
    tbody.appendChild(tr);
  });
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
  fetchAndRender('/api/assets?asset_type=fiat', 'fiat-currency-table', row =>
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
  return fetchAndRender('/api/assets?asset_type=blockchain', 'assets-table', row =>
    `<td>${row.name}</td>
      <td>${row.symbol}</td>
      <td>${row.launch_date ? new Date(row.launch_date).toISOString().slice(0, 10) : ''}</td>
      <td><img src="${row.logo_url}" alt="${row.symbol} logo" width="40" height="40"></td>`
  ).then(() => {
    const rows = document.querySelectorAll<HTMLTableRowElement>('#assets-table tbody tr');
    rows.forEach(tr => {
      const name = tr.children[0].textContent || '';
      const symbol = tr.children[1].textContent || '';
      const launch_date = new Date(tr.children[2].textContent || '').getTime();
      const logo_url = (tr.children[3].querySelector('img') as HTMLImageElement).src;
      tr.onmouseenter = function () {
        tr.style.background = '#e6f7ff';
        tr.title = 'Click to edit asset';
      };
      tr.onmouseleave = function () {
        tr.style.background = '';
        tr.title = '';
      };
      tr.onclick = function () {
        showAddEditAssetModal({ name, symbol, launch_date, logo_url } as Asset);
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
  // const typeInput = document.getElementById('edit-asset-type') as HTMLSelectElement;
  const logoInput = document.getElementById('edit-asset-logo-url') as HTMLInputElement;
  const launchDateInput = document.getElementById('edit-asset-launch-date') as HTMLInputElement;
  const saveBtn = document.getElementById('save-asset-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-edit-asset-modal') as HTMLButtonElement;
  const deleteBtn = document.getElementById('delete-asset-btn') as HTMLButtonElement;
  const refreshBtn = document.getElementById('refresh-prices-btn') as HTMLButtonElement;
  form.reset();
  setDisable([symbolInput, nameInput, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], false);
  errorDiv.textContent = '';
  if (asset) {
    title.textContent = 'Edit Asset';
    symbolInput.disabled = true;
    symbolInput.value = asset.symbol || '';
    nameInput.value = asset.name || '';
    // typeInput.value = asset.type;
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
      if (asset) {
        // Edit mode
        promise = fetch(`/api/asset/${asset.symbol}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: fd.get('symbol'),
            name: fd.get('name'),
            asset_type: 'blockchain',
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
            asset_type: 'blockchain',
            logo_url: fd.get('logo_url'),
            launch_date: fd.get('launch_date') ? new Date(fd.get('launch_date') as string).getTime() : null
          })
        });
      }
      setDisable([symbolInput, nameInput, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], true);
      const response = await promise;
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || 'Failed to save asset');
      }
      modal.classList.remove('active');
      renderAssets();
      renderPrices();
    } catch (err: any) {
      setDisable([symbolInput, nameInput, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], false);
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
    setDisable([symbolInput, nameInput, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], true);
    try {
      const resp = await fetch(`/api/asset/${encodeURIComponent(symbolInput.value.trim())}/refresh-prices`, { method: 'POST' });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to refresh prices');
      }
      modal.classList.remove('active');
      renderPrices();
    } catch (err: any) {
      setDisable([symbolInput, nameInput, logoInput, saveBtn, cancelBtn, deleteBtn, refreshBtn], false);
      errorDiv.textContent = err.message || 'Error refreshing prices';
    }
  };
}

// Add Asset button logic
document.getElementById('open-edit-asset-modal-btn')?.addEventListener('click', function() {
  showAddEditAssetModal();
});

function setDisable(selects: Array<HTMLInputElement | HTMLButtonElement>, disable = true) {
  selects.forEach(select => {
    if (select) select.disabled = disable;
  });
}

async function populateAssetDropdowns(selects: Array<HTMLSelectElement | null>, assetType?: string) {
  const res = await fetch(`/api/assets${assetType ? `?asset_type=${assetType}` : ''}`);
  const assets: any[] = await res.json();
  selects.forEach(select => {
    if (!select) return;
    select.innerHTML = '<option value="">Select Asset</option>';
    assets.forEach(asset => {
      const opt = document.createElement('option');
      opt.value = asset.symbol;
      opt.textContent = `${asset.name} (${asset.symbol})`;
      select.appendChild(opt);
    });
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
  const filters = {
    asset_symbol: assetSelect.value,
    fiat_symbol: fiatSelect.value,
    date_from: dateFromInput.value ? Date.parse(dateFromInput.value) : undefined,
    date_to: dateToInput.value ? Date.parse(dateToInput.value) + 24*60*60*1000 - 1 : undefined
  };
  filterBtn.onclick = function() {
    renderPrices();
  };
  resetBtn.onclick = function() {
    assetSelect.value = '';
    fiatSelect.value = '';
    dateFromInput.value = '';
    dateToInput.value = '';
  };
  // Build query string from filters
  const params = new URLSearchParams();
  if (filters.asset_symbol) params.append('asset_symbol', filters.asset_symbol);
  if (filters.fiat_symbol) params.append('fiat_symbol', filters.fiat_symbol);
  if (filters.date_from) params.append('date_from', String(filters.date_from));
  if (filters.date_to) params.append('date_to', String(filters.date_to));
  const url = '/api/prices' + (params.toString() ? `?${params.toString()}` : '');
  fetchAndRender(url, 'prices-table', row =>
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
    const fiatRes = await fetch('/api/assets?asset_type=fiat');
    const fiat = await fiatRes.json();
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
  const dateFromInput = document.getElementById('transactions-filter-date-from') as HTMLInputElement;
  const dateToInput = document.getElementById('transactions-filter-date-to') as HTMLInputElement;
  const filterBtn = document.getElementById('transactions-filter-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('transactions-filter-reset-btn') as HTMLButtonElement;
  const filters = {
    asset: assetSelect.value,
    type: typeSelect.value,
    date_from: dateFromInput.value ? Date.parse(dateFromInput.value) : undefined,
    date_to: dateToInput.value ? Date.parse(dateToInput.value) + 24*60*60*1000 - 1 : undefined // end of day
  };
  filterBtn.onclick = function(e: Event) {
    e.preventDefault();
    renderTransactions();
  };
  resetBtn.onclick = function(e: Event) {
    e.preventDefault();
    assetSelect.value = '';
    typeSelect.value = '';
    dateFromInput.value = '';
    dateToInput.value = '';
  };
  // Build query string from filters
  const params = new URLSearchParams();
  if (filters.asset) params.append('asset', filters.asset);
  if (filters.type) params.append('type', filters.type);
  if (filters.date_from) params.append('date_from', filters.date_from.toString());
  if (filters.date_to) params.append('date_to', filters.date_to.toString());
  const url = '/api/transactions' + (params.toString() ? `?${params.toString()}` : '');
  await fetchAndRender(url, 'transactions-table', row =>
    `<td>${row.id}</td><td>${getLocalDateTimeString(row.unix_timestamp)}</td><td>${row.type}</td>
      <td>${row.send_asset_symbol}</td><td>${row.send_asset_quantity ? row.send_asset_quantity : ''}</td>
      <td>${row.receive_asset_symbol}</td><td>${row.receive_asset_quantity ? row.receive_asset_quantity : ''}</td>
      <td>${row.fee_asset_symbol}</td><td>${row.fee_asset_quantity ? row.fee_asset_quantity : ''}</td>
      <td>${row.is_income ? 'true' : ''}</td><td>${row.notes ? row.notes : ''}</td>`
  ).then(() => {
    const rows = document.querySelectorAll<HTMLTableRowElement>('#transactions-table tbody tr');
    rows.forEach(tr => {
      const id = tr.children[0].textContent || '';
      tr.onclick = async function () {
        let transaction = {
          id: Number(id),
          unix_timestamp: new Date(tr.children[1].textContent || '').getTime(),
          type: tr.children[2].textContent || '',
          send_asset_symbol: tr.children[3].textContent || '',
          send_asset_quantity: (tr.children[4].textContent !== '') ? Number(tr.children[4].textContent) : undefined,
          receive_asset_symbol: tr.children[5].textContent || '',
          receive_asset_quantity: (tr.children[6].textContent !== '') ? Number(tr.children[6].textContent) : undefined,
          fee_asset_symbol: tr.children[7].textContent || '',
          fee_asset_quantity: (tr.children[8].textContent !== '') ? Number(tr.children[8].textContent) : undefined,
          is_income: tr.children[9].textContent === 'true',
          notes: tr.children[10].textContent || ''
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
  });
}
renderTransactions();

// Add/Import Transaction button logic
(document.getElementById('open-add-import-modal-btn') as HTMLButtonElement).onclick = function() {
  showAddEditTransactionModal();
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
      status.textContent = 'Import successful!';
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
  const typeSelect = document.getElementById('edit-type-select') as HTMLSelectElement;
  const sendSelect = document.getElementById('edit-send-asset-select') as HTMLSelectElement;
  const sendQty = document.getElementById('edit-send-asset-quantity') as HTMLInputElement;
  const receiveSelect = document.getElementById('edit-receive-asset-select') as HTMLSelectElement;
  const receiveQty = document.getElementById('edit-receive-asset-quantity') as HTMLInputElement;
  const feeAssetSelect = document.getElementById('edit-fee-asset-select') as HTMLSelectElement;
  const feeAssetQty = form.querySelector('input[name="fee_asset_quantity"]') as HTMLInputElement;
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
      saveBtn,
      errorDiv
    );
  }

  let method: string | null = null;
  if (!transaction) {
    // Add mode
    method = 'POST';
    title.textContent = 'Add Transaction';
    importContainer.style.display = '';
    deleteBtn.style.display = 'none';
    form.reset();
    (document.getElementById('edit-date') as HTMLInputElement).value = getLocalDateTimeString(Date.now());
    (document.getElementById('edit-transaction-error') as HTMLElement).textContent = '';
    validateAddEditTransactionForm();
  } else {
    // Edit mode
    method = 'PUT';
    title.textContent = `Edit Transaction #${transaction.id}`;
    importContainer.style.display = 'none';
    deleteBtn.style.display = '';
    (document.getElementById('edit-date') as HTMLInputElement).value = transaction.unix_timestamp ? getLocalDateTimeString(transaction.unix_timestamp) : '';
    (document.getElementById('edit-type-select') as HTMLSelectElement).value = transaction.type || '';
    (document.getElementById('edit-send-asset-select') as HTMLSelectElement).value = transaction.send_asset_symbol || '';
    (document.getElementById('edit-send-asset-quantity') as HTMLInputElement).value = String(transaction.send_asset_quantity) || '';
    (document.getElementById('edit-receive-asset-select') as HTMLSelectElement).value = transaction.receive_asset_symbol || '';
    (document.getElementById('edit-receive-asset-quantity') as HTMLInputElement).value = String(transaction.receive_asset_quantity) || '';
    (document.getElementById('edit-fee-asset-select') as HTMLSelectElement).value = transaction.fee_asset_symbol || '';
    (document.getElementById('edit-fee-asset-quantity') as HTMLInputElement).value = String(transaction.fee_asset_quantity) || '';
    (document.getElementById('edit-is-income') as HTMLInputElement).checked = !!transaction.is_income;
    (document.getElementById('edit-notes') as HTMLInputElement).value = transaction.notes || '';
    (document.getElementById('edit-transaction-error') as HTMLElement).textContent = '';
    validateAddEditTransactionForm();
  }
  // Validation
  [typeSelect, sendSelect, receiveSelect, feeAssetSelect].forEach(el => {
    el.addEventListener('change', validateAddEditTransactionForm);
  });
  [sendQty, receiveQty, feeAssetQty].forEach(el => {
    el.addEventListener('input', validateAddEditTransactionForm);
  });
  form.onsubmit = async function(e: Event) {
    e.preventDefault();
    const fd = new FormData(form);
    errorDiv.textContent = '';
    try {
      const resp = await fetch(`/api/transaction/${transaction ? transaction.id : ''}`, {
        method: method!,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unix_timestamp: Date.parse(fd.get('date') as string),
          type: fd.get('type'),
          send_asset_symbol: fd.get('send_asset_symbol'),
          send_asset_quantity: Number(fd.get('send_asset_quantity')),
          receive_asset_symbol: fd.get('receive_asset_symbol'),
          receive_asset_quantity: Number(fd.get('receive_asset_quantity')),
          fee_asset_symbol: fd.get('fee_asset_symbol'),
          fee_asset_quantity: Number(fd.get('fee_asset_quantity')),
          is_income: fd.get('is_income') === 'on',
          notes: fd.get('notes')
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
    select.innerHTML = '<option value="">Select Asset</option>';
    types.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      select.appendChild(opt);
    });
  });
}

function populateAllTransactionTypeDropdowns() {
  populateTransactionTypes([
    document.getElementById('transactions-filter-type') as HTMLSelectElement,
    document.getElementById('edit-type-select') as HTMLSelectElement
  ]);
}
populateAllTransactionTypeDropdowns();

// Validation helper for transaction forms
function validateTransactionFields(
  typeSelect: HTMLSelectElement,
  sendAssetSelect: HTMLSelectElement,
  sendQtyInput: HTMLInputElement,
  receiveAssetSelect: HTMLSelectElement,
  receiveQtyInput: HTMLInputElement,
  feeAssetSelect: HTMLSelectElement,
  feeQtyInput: HTMLInputElement,
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
  let valid = true;
  if (errorDiv) errorDiv.textContent = '';
  if (type === 'Buy' || type === 'Sell' || type === 'Trade') {
    if (!sendSymbol || !sendQty || !receiveSymbol || !receiveQty) {
      valid = false;
    }
  } else if (type === 'Send') {
    if (!sendSymbol || !sendQty) {
      valid = false;
    }
  } else if (type === 'Receive') {
    if (!receiveSymbol || !receiveQty) {
      valid = false;
    }
  } else {
    valid = false;
  }
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
    // Asset-level ACB table
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
    // Yearly aggregates table
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
function getLocalDateTimeString(unix_timestamp: number): string {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
  return new Date(unix_timestamp - tzoffset).toISOString().slice(0,19);
}