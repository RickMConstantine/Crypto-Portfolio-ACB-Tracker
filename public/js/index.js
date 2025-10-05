(function() {
    'use strict';
    //=======================
    // Query Document
    //=======================
    const tabs = document.querySelectorAll('.tab');
    const contents = {
      assets: document.getElementById('assets-content'),
      prices: document.getElementById('prices-content'),
      transactions: document.getElementById('transactions-content'),
      tax: document.getElementById('tax-content')
    };
    
    //=======================
    // Tabs
    //=======================
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Object.keys(contents).forEach(key => contents[key].style.display = 'none');
        contents[tab.dataset.tab].style.display = '';
        switch (tab.dataset.tab) {
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
    async function fetchAndRender(url, tableId, rowFn, requestInit = {}) {
      const res = await fetch(url, requestInit);
      const data = await res.json();
      const tbody = document.querySelector(`#${tableId} tbody`);
      tbody.innerHTML = '';
      // Populate table rows
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = rowFn(row);
        tbody.appendChild(tr);
      });
    }

    //=======================
    // Assets Page
    //=======================
    function renderAssets() {
      renderBlockchainAssets();
      renderFiatCurrency();
    }
    renderAssets();

    function renderFiatCurrency() {
      fetchAndRender('/api/assets/fiat', 'fiat-currency-table', row =>
        `<td>${row.symbol}</td><td><img src="${row.logo_url}" alt="${row.symbol} logo" width="40" height="40"></td>`
      );
    }

    // Add Fiat Currency
    document.getElementById('fiat-currency-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const symbol = fd.get('symbol');
      const errorDiv = document.getElementById('fiat-currency-error');
      errorDiv.textContent = '';
      try {
        const resp = await fetch('/api/asset-by-symbol-and-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: symbol, asset_type: 'fiat' })
        });
        if (!resp.ok) {
          const msg = await resp.text();
          throw new Error(msg || 'Failed to set fiat currency');
        }
        renderBlockchainAssets();
        renderFiatCurrency();
        renderPrices();
        populateAssetDropdowns([
          document.getElementById('send-asset-select'),
          document.getElementById('receive-asset-select'),
          document.getElementById('fee-asset-select')
        ]);
        e.target.reset();
      } catch (err) {
        errorDiv.textContent = err.message || 'Failed to set fiat currency';
      }
    };

    function renderBlockchainAssets() {
      fetchAndRender('/api/assets/blockchain', 'assets-table', row =>
        `<td>${row.name}</td>
         <td>${row.symbol}</td>
         <td><img src="${row.logo_url}" alt="${row.symbol} logo" width="40" height="40"></td>`
      ).then(() => {
        const rows = document.querySelectorAll('#assets-table tbody tr');
        rows.forEach(tr => {
          const symbol = tr.children[1].textContent;
          tr.onmouseenter = async function () {
            tr.style.background = '#ffe6e6';
            tr.title = 'Click to delete asset';
            tr.onclick = async function () {
              if (confirm('Delete this asset?')) {
                await fetch(`/api/asset/${symbol}`, { method: 'DELETE' });
                renderBlockchainAssets();
                renderPrices();
                populateAssetDropdowns([
                  document.getElementById('send-asset-select'),
                  document.getElementById('receive-asset-select'),
                  document.getElementById('fee-asset-select')
                ]);
              }
            };
          };
          tr.onmouseleave = function () {
            tr.style.background = '';
            tr.title = '';
            tr.onclick = null;
          };
        });
      });
    }

    // Add Blockchain Asset
    document.getElementById('add-asset-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errorDiv = document.getElementById('add-asset-error');
      errorDiv.textContent = '';
      try {
        const resp = await fetch('/api/asset-by-symbol-and-type', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: fd.get('symbol'), asset_type: 'blockchain'})
        });
        if (!resp.ok) {
          const msg = await resp.text();
          throw new Error(msg || 'Failed to add asset');
        }
        renderBlockchainAssets();
        renderPrices(); // In case prices were added with the asset
        populateAssetDropdowns([
          document.getElementById('send-asset-select'),
          document.getElementById('receive-asset-select'),
          document.getElementById('fee-asset-select')
        ]);
        e.target.reset();
      } catch (err) {
        errorDiv.textContent = err.message || 'Failed to add asset';
      }
    };

    async function populateAssetDropdowns(selects, assetType) {
      const res = await fetch(`/api/assets${assetType ? `/${assetType}` : ''}`);
      const assets = await res.json();
      selects.forEach(select => {
        select.innerHTML = '<option value="">Select Asset</option>';
        assets.forEach(asset => {
          const opt = document.createElement('option');
          opt.value = asset.symbol;
          opt.textContent = `${asset.name} (${asset.symbol})`;
          select.appendChild(opt);
        });
      });
    }

    //=======================
    // Prices Page
    //=======================
    function renderPrices(filters = {}) {
      // Setup filters
      const assetSelect = document.getElementById('prices-filter-asset');
      const fiatSelect = document.getElementById('prices-filter-fiat');
      const dateFromInput = document.getElementById('prices-filter-date-from');
      const dateToInput = document.getElementById('prices-filter-date-to');
      const filterBtn = document.getElementById('prices-filter-btn');
      const resetBtn = document.getElementById('prices-filter-reset-btn');
      filterBtn.onclick = function() {
        const filters = {
          asset_symbol: assetSelect.value,
          fiat_symbol: fiatSelect.value,
          date_from: dateFromInput.value ? Date.parse(dateFromInput.value) : undefined,
          date_to: dateToInput.value ? Date.parse(dateToInput.value) + 24*60*60*1000 - 1 : undefined
        };
        renderPrices(filters);
      };
      resetBtn.onclick = function() {
        assetSelect.value = '';
        fiatSelect.value = '';
        dateFromInput.value = '';
        dateToInput.value = '';
        renderPrices();
      };
      populateAssetDropdowns([document.getElementById('prices-filter-asset')], 'blockchain');
      populateAssetDropdowns([document.getElementById('prices-filter-fiat')], 'fiat');
      // Build query string from filters
      const params = new URLSearchParams();
      if (filters.asset_symbol) params.append('asset_symbol', filters.asset_symbol);
      if (filters.fiat_symbol) params.append('fiat_symbol', filters.fiat_symbol);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      const url = '/api/prices' + (params.toString() ? `?${params.toString()}` : '');
      fetchAndRender(url, 'prices-table', row =>
        `<td>${new Date(row.unix_timestamp).toISOString().slice(0,10)}</td>
         <td>${row.price}</td>
         <td>${row.asset_symbol}</td>
         <td>${row.fiat_symbol}</td>`
      ).then(() => {
        // Add edit-on-click logic to each row
        const rows = document.querySelectorAll('#prices-table tbody tr');
        rows.forEach(tr => {
          tr.onclick = function () {
            // Extract price row data
            const price = {
              unix_timestamp: new Date(tr.children[0].textContent).getTime(),
              price: tr.children[1].textContent,
              asset_symbol: tr.children[2].textContent,
              fiat_symbol: tr.children[3].textContent
            };
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
    function showAddEditPriceModal(price) {
      const modal = document.getElementById('edit-price-modal');
      const form = document.getElementById('edit-price-modal-form');
      const title = document.getElementById('edit-price-title');
      const errorDiv = document.getElementById('edit-price-error');
      const assetSelect = document.getElementById('edit-price-asset-symbol');
      const dateInput = document.getElementById('edit-price-date');
      const priceInput = document.getElementById('edit-price-value');
      const cancelBtn = document.getElementById('cancel-edit-price-modal');
      const deleteBtn = document.getElementById('delete-price-btn');
      // Populate asset dropdown
      populateAssetDropdowns([assetSelect], 'blockchain').then(() => {
        // Set form values
        form.reset();
        if (price) {
          title.textContent = 'Edit Price';
          dateInput.value = new Date(price.unix_timestamp).toISOString().slice(0,10);
          priceInput.value = price.price;
          assetSelect.value = price.asset_symbol;
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
      });
      cancelBtn.onclick = function() {
        modal.classList.remove('active');
      };
      // Clicking outside modal-content closes modal
      // modal.onclick = function(e) {
      //   if (e.target === modal) modal.classList.remove('active');
      // };
      form.onsubmit = async function(e) {
        e.preventDefault();
        errorDiv.textContent = '';
        const fd = new FormData(form);
        // Get fiat symbol from API
        const fiatRes = await fetch('/api/assets/fiat');
        const fiat = await fiatRes.json();
        const fiat_symbol = fiat[0]?.symbol || '';
        try {
          let resp;
          if (price) {
            // Edit mode: update price (delete old, insert new)
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
            // Add mode
            resp = await fetch('/api/price', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                unix_timestamp: Date.parse(fd.get('date')),
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
        } catch (err) {
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
        } catch (err) {
          errorDiv.textContent = err.message || 'Failed to delete price';
        }
      };
    }

    // Add Price button logic
    document.getElementById('open-edit-price-modal-btn').onclick = function() {
      showAddEditPriceModal(null);
    };

    //=======================
    // Transactions Page
    //=======================
    async function renderTransactions(filters = {}) {
      // Setup filters
      const assetSelect = document.getElementById('transactions-filter-asset');
      const typeSelect = document.getElementById('transactions-filter-type');
      const dateFromInput = document.getElementById('transactions-filter-date-from');
      const dateToInput = document.getElementById('transactions-filter-date-to');
      const filterBtn = document.getElementById('transactions-filter-btn');
      const resetBtn = document.getElementById('transactions-filter-reset-btn');
      filterBtn.onclick = function() {
        const filters = {
          asset: assetSelect.value,
          type: typeSelect.value,
          date_from: dateFromInput.value ? Date.parse(dateFromInput.value) : undefined,
          date_to: dateToInput.value ? Date.parse(dateToInput.value) + 24*60*60*1000 - 1 : undefined // end of day
        };
        renderTransactions(filters);
      };
      resetBtn.onclick = function() {
        assetSelect.value = '';
        typeSelect.value = '';
        dateFromInput.value = '';
        dateToInput.value = '';
        renderTransactions();
      };
      populateAssetDropdowns([document.getElementById('transactions-filter-asset')]);
      populateTransactionTypes(document.getElementById('transactions-filter-type'));
      // Build query string from filters
      const params = new URLSearchParams();
      if (filters.asset) params.append('asset', filters.asset);
      if (filters.type) params.append('type', filters.type);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      const url = '/api/transactions' + (params.toString() ? `?${params.toString()}` : '');
      await fetchAndRender(url, 'transactions-table', row =>
        `<td>${row.id}</td><td>${new Date(row.unix_timestamp).toLocaleString()}</td><td>${row.type}</td>
         <td>${row.send_asset_symbol}</td><td>${row.send_asset_quantity ? row.send_asset_quantity : ''}</td>
         <td>${row.receive_asset_symbol}</td><td>${row.receive_asset_quantity ? row.receive_asset_quantity : ''}</td>
         <td>${row.fee_asset_symbol}</td><td>${row.fee_asset_quantity ? row.fee_asset_quantity : ''}</td>
         <td>${row.is_income ? 'true' : ''}</td><td>${row.notes ? row.notes : ''}</td>`
      ).then(() => {
        const rows = document.querySelectorAll('#transactions-table tbody tr');
        rows.forEach(tr => {
          const id = tr.children[0].textContent;
          tr.onclick = async function () {
            let transaction = {
              id: id,
              unix_timestamp: new Date(tr.children[1].textContent).getTime(),
              type: tr.children[2].textContent,
              send_asset_symbol: tr.children[3].textContent,
              send_asset_quantity: tr.children[4].textContent,
              receive_asset_symbol: tr.children[5].textContent,
              receive_asset_quantity: tr.children[6].textContent,
              fee_asset_symbol: tr.children[7].textContent,
              fee_asset_quantity: tr.children[8].textContent,
              is_income: tr.children[9].textContent === 'true',
              notes: tr.children[10].textContent
            };
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
    document.getElementById('open-add-import-modal-btn').onclick = function() {
      showAddEditTransactionModal(null);
    };

    document.getElementById('import-transactions-btn').onclick = async function() {
      const fileInput = document.getElementById('import-transactions-file');
      const status = document.getElementById('import-transactions-status');
      status.textContent = '';
      if (!fileInput.files.length) {
        status.textContent = 'Please select a file.';
        return;
      }
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = async function(e) {
        const csvText = e.target.result;
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
        } catch (err) {
          status.style.color = '#d9534f';
          status.textContent = err.message || 'Import failed';
        }
      };
      reader.readAsText(file);
    };

    // Add/Edit Transaction Modal
    function showAddEditTransactionModal(transaction) {
      // Modal Elements
      const modal = document.getElementById('edit-transaction-modal');
      const importContainer = document.getElementById('import-transactions-container');
      const deleteBtn = document.getElementById('delete-transaction-btn');
      const title = document.getElementById('edit-transaction-title');
      const form = document.getElementById('edit-transaction-form');
      const typeSelect = document.getElementById('edit-type-select');
      const sendSelect = document.getElementById('edit-send-asset-select');
      const sendQty = document.getElementById('edit-send-asset-quantity');
      const receiveSelect = document.getElementById('edit-receive-asset-select');
      const receiveQty = document.getElementById('edit-receive-asset-quantity');
      const feeAssetSelect = document.getElementById('edit-fee-asset-select');
      const feeAssetQty = form.querySelector('input[name="fee_asset_quantity"]');
      const saveBtn = form.querySelector('button[type="submit"]');
      const errorDiv = document.getElementById('edit-transaction-error');
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

      let method = null;
      if (!transaction) {
        // Add mode
        method = 'POST';
        title.textContent = 'Add Transaction';
        importContainer.style.display = '';
        deleteBtn.style.display = 'none';
        populateAddEditTransactionDropdowns().then(() => {
          form.reset();
          const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
          document.getElementById('edit-date').value = new Date(Date.now() - tzoffset).toISOString().slice(0,16);
          document.getElementById('edit-transaction-error').textContent = '';
          validateAddEditTransactionForm();
        });
      } else {
        // Edit mode
        method = 'PUT';
        title.textContent = `Edit Transaction #${transaction.id}`;
        importContainer.style.display = 'none';
        deleteBtn.style.display = '';
        populateAddEditTransactionDropdowns().then(() => {
          form.reset();
          const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
          document.getElementById('edit-date').value = new Date(transaction.unix_timestamp - tzoffset).toISOString().slice(0,16);
          document.getElementById('edit-type-select').value = transaction.type || '';
          document.getElementById('edit-send-asset-select').value = transaction.send_asset_symbol || '';
          document.getElementById('edit-send-asset-quantity').value = transaction.send_asset_quantity || '';
          document.getElementById('edit-receive-asset-select').value = transaction.receive_asset_symbol || '';
          document.getElementById('edit-receive-asset-quantity').value = transaction.receive_asset_quantity || '';
          document.getElementById('edit-fee-asset-select').value = transaction.fee_asset_symbol || '';
          document.getElementById('edit-fee-asset-quantity').value = transaction.fee_asset_quantity || '';
          document.getElementById('edit-is-income').checked = !!transaction.is_income;
          document.getElementById('edit-notes').value = transaction.notes || '';
          document.getElementById('edit-transaction-error').textContent = '';
          validateAddEditTransactionForm();
        });
      }
      // Validation
      [typeSelect, sendSelect, receiveSelect, feeAssetSelect].forEach(el => {
        el.addEventListener('change', validateAddEditTransactionForm);
      });
      [sendQty, receiveQty, feeAssetQty].forEach(el => {
        el.addEventListener('input', validateAddEditTransactionForm);
      });
      form.onsubmit = async function(e) {
        e.preventDefault();
        const fd = new FormData(form);
        errorDiv.textContent = '';
        try {
          const resp = await fetch(`/api/transaction/${transaction ? transaction.id : ''}`, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              unix_timestamp: Date.parse(fd.get('date')),
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
        } catch (err) {
          errorDiv.textContent = err.message || 'Failed to update transaction';
        }
      };
      // Delete handler
      document.getElementById('delete-transaction-btn').onclick = async function() {
        if (confirm('Are you sure you want to delete this transaction?')) {
          try {
            await fetch(`/api/transaction/${transaction.id}`, { method: 'DELETE' });
            modal.classList.remove('active');
            renderTransactions();
          } catch (err) {
            document.getElementById('edit-transaction-error').textContent = err.message || 'Failed to delete transaction';
          }
        }
      };
      // Cancel handler
      document.getElementById('close-edit-modal').onclick = function() {
        modal.classList.remove('active');
      };
      // Clicking outside modal-content closes modal
      // modal.onclick = function(e) {
      //   if (e.target === modal) modal.classList.remove('active');
      // };
    }

    async function populateAddEditTransactionDropdowns() {
      // Populate type dropdown
      await populateTransactionTypes(document.getElementById('edit-type-select'));
      // Populate asset dropdowns using new function
      await populateAssetDropdowns([
        document.getElementById('edit-send-asset-select'),
        document.getElementById('edit-receive-asset-select'),
        document.getElementById('edit-fee-asset-select')
      ]);
    }

    async function populateTransactionTypes(select) {
      if (!select) return;
      select.innerHTML = '<option value="">Select Type</option>';
      try {
        const types = await fetch('/api/transaction-types').then(r => r.json());
        types.forEach(type => {
          const opt = document.createElement('option');
          opt.value = type;
          opt.textContent = type;
          select.appendChild(opt);
        });
      } catch (e) {
        // fallback: do nothing
      }
    }

    // Validation helper for transaction forms
    function validateTransactionFields(typeSelect, sendAssetSelect, sendQtyInput, receiveAssetSelect, receiveQtyInput, feeAssetSelect, feeQtyInput, submitBtn, errorDiv) {
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
    async function renderTaxPage() {
      // Populate both the asset-level ACB table and the yearly aggregates table
      const acbTbody = document.querySelector('#tax-acb-table tbody');
      const yearlyTbody = document.querySelector('#tax-yearly-aggregates-table tbody');
      if (!acbTbody || !yearlyTbody) return;
      acbTbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
      yearlyTbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
      try {
        const acbData = await fetch('/api/acb').then(r => r.json());
        if (acbData.error) {
          acbTbody.innerHTML = `<tr><td colspan="9">Error: ${acbData.error}</td></tr>`;
          yearlyTbody.innerHTML = `<tr><td colspan="7">Error: ${acbData.error}</td></tr>`;
          return;
        }
        // Asset-level ACB table
        acbTbody.innerHTML = Object.entries(acbData).map(([symbol, data]) => {
          const totals = data['TOTALS'] || {};
          // Build yearly breakdown table rows (excluding TOTALS)
          const yearRows = Object.entries(data)
            .filter(([year]) => year !== 'TOTALS')
            .map(([year, y]) =>
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
        const yearly = {};
        Object.values(acbData).forEach(assetData => {
          Object.entries(assetData)
            .filter(([year]) => year !== 'TOTALS')
            .forEach(([year, y]) => {
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
})();