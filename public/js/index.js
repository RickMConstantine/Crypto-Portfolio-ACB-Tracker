(function() {
    'use strict';
    //=======================
    // Query Document
    //=======================
    const tabs = document.querySelectorAll('.tab');
    const contents = {
      assets: document.getElementById('assets-content'),
    //   balances: document.getElementById('balances-content'),
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
        if (tab.dataset.tab === 'tax') {
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

    function renderBlockchainAssets() {
      fetchAndRender('/api/assets/blockchain', 'assets-table', row =>
        `<td>${row.name}</td>
         <td>${row.symbol}</td>
         <td><img src="${row.logo_url}" alt="${row.symbol} logo" width="40" height="40"></td>`
      ).then(() => {
        const rows = document.querySelectorAll('#assets-table tbody tr');
        rows.forEach(tr => {
          const symbol = tr.children[0].textContent;
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
    
    function renderPrices() {
      fetchAndRender('/api/prices', 'prices-table', row =>
        `<td>${new Date(row.unix_timestamp).toISOString()}</td>
         <td>${row.price}</td>
         <td>${row.asset_symbol}</td>
         <td>${row.fiat_symbol}</td>`
      );
    }

    function renderTransactions() {
      fetchAndRender('/api/transactions', 'transactions-table', row =>
        `<td>${row.id}</td><td>${new Date(row.unix_timestamp).toISOString()}</td><td>${row.type}</td>
         <td>${row.send_asset_symbol}</td><td>${row.send_asset_quantity ? row.send_asset_quantity : ''}</td>
         <td>${row.receive_asset_symbol}</td><td>${row.receive_asset_quantity ? row.receive_asset_quantity : ''}</td>
         <td>${row.fee_asset_symbol}</td><td>${row.fee_asset_quantity ? row.fee_asset_quantity : ''}</td>
         <td>${row.is_income ? 'true' : ''}</td><td>${row.notes ? row.notes : ''}</td>`
      ).then(() => {
        const rows = document.querySelectorAll('#transactions-table tbody tr');
        rows.forEach(tr => {
          const id = tr.children[0].textContent;
          tr.onclick = async function () {
            // Fetch transaction details (if not all fields are present)
            let transaction = {
              id: id,
              unix_timestamp: tr.children[1].textContent,
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
            showEditTransactionModal(transaction);
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

    function renderFiatCurrency() {
      fetchAndRender('/api/assets/fiat', 'fiat-currency-table', row =>
        `<td>${row.symbol}</td><td><img src="${row.logo_url}" alt="${row.symbol} logo" width="40" height="40"></td>`
      );
    }

    async function populateAssetDropdowns(selects) {
      const res = await fetch('/api/assets');
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
                <td>${y.acb != null ? y.acb : 'N/A'}</td>
                <td>${y.totalUnits != null ? y.totalUnits : 'N/A'}</td>
                <td>${y.totalProceeds != null ? y.totalProceeds : 'N/A'}</td>
                <td>${y.totalCosts != null ? y.totalCosts : 'N/A'}</td>
                <td>${y.totalOutlays != null ? y.totalOutlays : 'N/A'}</td>
                <td>${y.totalGainLoss != null ? y.totalGainLoss : 'N/A'}</td>
                <td>${y.superficialLosses != null ? y.superficialLosses : 'N/A'}</td>
              </tr>`
            ).join('');
          return `
          <tr>
            <td>${symbol}</td>
            <td>${totals.acb != null ? totals.acb : 'N/A'}</td>
            <td>${totals.totalUnits != null ? totals.totalUnits : 'N/A'}</td>
            <td>${totals.totalProceeds != null ? totals.totalProceeds : 'N/A'}</td>
            <td>${totals.totalCosts != null ? totals.totalCosts : 'N/A'}</td>
            <td>${totals.totalOutlays != null ? totals.totalOutlays : 'N/A'}</td>
            <td>${totals.totalGainLoss != null ? totals.totalGainLoss : 'N/A'}</td>
            <td>${totals.superficialLosses != null ? totals.superficialLosses : 'N/A'}</td>
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
                  superficialLosses: 0
                };
              }
              yearly[year].acb += Number(y.acb) || 0;
              yearly[year].totalProceeds += Number(y.totalProceeds) || 0;
              yearly[year].totalCosts += Number(y.totalCosts) || 0;
              yearly[year].totalOutlays += Number(y.totalOutlays) || 0;
              yearly[year].totalGainLoss += Number(y.totalGainLoss) || 0;
              yearly[year].superficialLosses += Number(y.superficialLosses) || 0;
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
          </tr>`;
        }).join('') || '<tr><td colspan="7">No yearly data</td></tr>';
      } catch (e) {
        acbTbody.innerHTML = '<tr><td colspan="9">Error loading ACB data</td></tr>';
        yearlyTbody.innerHTML = '<tr><td colspan="7">Error loading yearly aggregates</td></tr>';
      }
    }

    //=======================
    // Form + OnSubmit
    //=======================
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

    // Add Price
    document.getElementById('add-price-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      // You may want to select fiat_symbol from the fiat currency table or dropdown
      // For now, fetch fiat asset from API
      const fiatRes = await fetch('/api/fiat-currency');
      const fiat = await fiatRes.json();
      const fiat_symbol = fiat.symbol || (Array.isArray(fiat) && fiat.length ? fiat[0].symbol : '');
      await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unix_timestamp: fd.get('date'),
          price: Number(fd.get('price')),
          asset_symbol: fd.get('asset_symbol'),
          fiat_symbol: fiat_symbol
        })
      });
      renderPrices();
      e.target.reset();
    };

    // Add Transaction
    document.getElementById('add-transaction-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const type = fd.get('type');
      const send_asset_symbol = fd.get('send_asset_symbol');
      const send_asset_quantity = fd.get('send_asset_quantity');
      const receive_asset_symbol = fd.get('receive_asset_symbol');
      const receive_asset_quantity = fd.get('receive_asset_quantity');
      const errorDiv = document.getElementById('add-transaction-error');
      errorDiv.textContent = '';

      // Frontend validation
      if (type === 'Buy' || type === 'Sell' || type === 'Trade') {
        if (!send_asset_symbol || !send_asset_quantity || !receive_asset_symbol || !receive_asset_quantity) {
          errorDiv.textContent = 'Send and Receive asset/symbol and quantity are required for Buy, Sell, or Trade.';
          return;
        }
      } else if (type === 'Send') {
        if (!send_asset_symbol || !send_asset_quantity) {
          errorDiv.textContent = 'Send asset/symbol and quantity are required for Send.';
          return;
        }
      } else if (type === 'Receive') {
        if (!receive_asset_symbol || !receive_asset_quantity) {
          errorDiv.textContent = 'Receive asset/symbol and quantity are required for Receive.';
          return;
        }
      }

      try {
        const resp = await fetch('/api/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unix_timestamp: Date.parse(fd.get('date')),
            type: type,
            send_asset_symbol: send_asset_symbol,
            send_asset_quantity: Number(send_asset_quantity),
            receive_asset_symbol: receive_asset_symbol,
            receive_asset_quantity: Number(receive_asset_quantity),
            fee_asset_symbol: fd.get('fee_asset_symbol'),
            fee_asset_quantity: Number(fd.get('fee_asset_quantity')),
            is_income: fd.get('is_income') === 'on',
            notes: fd.get('notes')
          })
        });
        if (!resp.ok) {
          const msg = await resp.text();
          throw new Error(msg || 'Failed to add transaction');
        }
        renderTransactions();
        e.target.reset();
      } catch (err) {
        errorDiv.textContent = err.message || 'Failed to add transaction';
      }
    };

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

    // Add dynamic validation for transaction form
    const transactionForm = document.getElementById('add-transaction-form');
    const transactionTypeSelect = document.getElementById('transaction-type-select');
    const sendAssetSelect = document.getElementById('send-asset-select');
    const sendAssetQty = document.getElementById('send-asset-quantity');
    const receiveAssetSelect = document.getElementById('receive-asset-select');
    const receiveAssetQty = document.getElementById('receive-asset-quantity');
    const feeAssetSelect = document.getElementById('fee-asset-select');
    const feeAssetQty = transactionForm.querySelector('input[name="fee_asset_quantity"]');
    const transactionSubmitBtn = transactionForm.querySelector('button[type="submit"]');
    const transactionErrorDiv = document.getElementById('add-transaction-error');

    function validateTransactionForm() {
      validateTransactionFields(
        transactionTypeSelect,
        sendAssetSelect,
        sendAssetQty,
        receiveAssetSelect,
        receiveAssetQty,
        feeAssetSelect,
        feeAssetQty,
        transactionSubmitBtn,
        transactionErrorDiv
      );
    }

    // Attach listeners for validation
    [
      transactionTypeSelect,
      sendAssetSelect,
      receiveAssetSelect,
      feeAssetSelect
    ].forEach(el => {
      el.addEventListener('change', validateTransactionForm);
    });

    [        
      sendAssetQty,
      receiveAssetQty,
      feeAssetQty
    ].forEach(el => {
      el.addEventListener('input', validateTransactionForm);
    });

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

    // Edit Transaction Modal
    function showEditTransactionModal(transaction) {
      // Show the static modal
      const modal = document.getElementById('edit-transaction-modal');
      modal.classList.add('active');
      document.getElementById('edit-transaction-title').textContent = `Edit Transaction #${transaction.id}`;
      // Populate dropdowns for type and assets
      populateEditTransactionDropdowns().then(() => {
        // Set field values
        document.getElementById('edit-date').value = new Date(transaction.unix_timestamp).toISOString().slice(0,16);
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
        const form = document.getElementById('edit-transaction-form');
        const saveBtn = form.querySelector('button[type="submit"]');
        const typeSelect = document.getElementById('edit-type-select');
        const sendSelect = document.getElementById('edit-send-asset-select');
        const sendQty = document.getElementById('edit-send-asset-quantity');
        const receiveSelect = document.getElementById('edit-receive-asset-select');
        const receiveQty = document.getElementById('edit-receive-asset-quantity');
        const feeAssetSelect = document.getElementById('edit-fee-asset-select');
        const feeAssetQty = form.querySelector('input[name="fee_asset_quantity"]');
        const errorDiv = document.getElementById('edit-transaction-error');
        function validateEditTransactionForm() {
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
        [typeSelect, sendSelect, receiveSelect, feeAssetSelect].forEach(el => {
          el.addEventListener('change', validateEditTransactionForm);
        });
        [sendQty, receiveQty, feeAssetQty].forEach(el => {
          el.addEventListener('input', validateEditTransactionForm);
        });
        validateEditTransactionForm();
        form.onsubmit = async function(e) {
          e.preventDefault();
          if (saveBtn.disabled) return;
          const fd = new FormData(form);
          errorDiv.textContent = '';
          try {
            const resp = await fetch(`/api/transaction/${transaction.id}`, {
              method: 'PUT',
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
        modal.onclick = function(e) {
          if (e.target === modal) modal.classList.remove('active');
        };
      });
    }

    async function populateAddTransactionDropdowns() {
      // Populate type dropdown
      await populateTransactionTypes(document.getElementById('transaction-type-select'));
      // Populate asset dropdowns using new function
      await populateAssetDropdowns([
        document.getElementById('send-asset-select'),
        document.getElementById('receive-asset-select'),
        document.getElementById('fee-asset-select')
      ]);
    }

    async function populateEditTransactionDropdowns() {
      // Populate type dropdown
      await populateTransactionTypes(document.getElementById('edit-type-select'));
      // Populate asset dropdowns using new function
      await populateAssetDropdowns([
        document.getElementById('edit-send-asset-select'),
        document.getElementById('edit-receive-asset-select'),
        document.getElementById('edit-fee-asset-select')
      ]);
    }

    //=======================
    // CSV/Excel Import for Transactions
    //=======================
    function addTransactionFilePicker() {
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
    }

    //=======================
    // Initial Render
    //=======================
    validateTransactionForm();
    renderBlockchainAssets();
    renderPrices();
    renderTransactions();
    renderFiatCurrency();
    populateAddTransactionDropdowns();
    renderTaxPage();
    addTransactionFilePicker();
})();