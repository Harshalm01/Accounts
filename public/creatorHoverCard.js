/**
 * 3Folks Media - Executive Creator Master Portfolio Modal with User Mapping & Team Leads Directory
 */
(function () {
  const cache = {};
  let modalOverlayEl = null;
  let currentCreatorData = null;
  let activeTab = 'campaigns'; // 'campaigns' | 'breakdown'
  let breakdownView = 'monthly'; // 'monthly' | 'yearly'

  function createFullPageModalElement() {
    if (document.getElementById('creatorFullPageModal')) return;

    modalOverlayEl = document.createElement('div');
    modalOverlayEl.id = 'creatorFullPageModal';
    modalOverlayEl.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      padding: 20px;
      box-sizing: border-box;
    `;

    modalOverlayEl.innerHTML = `
      <div id="creatorModalCard" style="
        background: #ffffff;
        color: #0f172a;
        width: 100%;
        max-width: 1040px;
        max-height: 90vh;
        overflow-y: auto;
        border-radius: 28px;
        padding: 36px 42px;
        box-shadow: 0 30px 70px rgba(15, 23, 42, 0.28);
        border: 1px solid #e2e8f0;
        transform: scale(0.94);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      ">
        <!-- Top Navigation Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div id="fullAvatar" style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; font-weight: 800; font-size: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(124, 58, 237, 0.35); flex-shrink: 0;">
              C
            </div>
            <div>
              <div style="font-size: 11px; font-weight: 800; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px;">
                Creator Master Portfolio & Team Lead Directory
              </div>
              <h2 id="fullCreatorName" style="margin: 0; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                Creator Name
              </h2>
              <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px; flex-wrap: wrap;">
                <span style="font-size: 13px; color: #64748b; font-weight: 600;">Phone Number: <span id="fullMobile" style="color: #0f172a; font-weight: 700;">—</span></span>
                <span style="font-size: 13px; color: #64748b; font-weight: 600;">Total Invoices Submitted: <span id="fullInvoiceCount" style="color: #16a34a; font-weight: 800;">0</span></span>
                <span style="font-size: 13px; color: #64748b; font-weight: 600;">Tenure: <span id="fullTenure" style="color: #7c3aed; font-weight: 800;">1 Month</span></span>
                <span id="fullGstBadge" style="font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 8px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">
                  Non-GST Exempt
                </span>
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="exportDossierPdfBtn" style="
              background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
              color: #ffffff;
              border: none;
              padding: 9px 18px;
              border-radius: 12px;
              font-size: 12.5px;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 4px 14px rgba(124, 58, 237, 0.25);
              transition: all 0.2s ease;
              display: flex; align-items: center; gap: 6px;
            " type="button">
              📥 Export PDF Dossier
            </button>

            <button id="closeFullModalBtn" style="
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              width: 40px; height: 40px;
              border-radius: 50%;
              font-size: 22px;
              color: #64748b;
              cursor: pointer;
              display: flex; align-items: center; justify-content: center;
              transition: all 0.2s ease;
            " type="button">&times;</button>
          </div>
        </div>

        <!-- 4 Top Metric Cards (Spacious, Exact Gross Payout) -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px 20px; display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #f3e8ff; color: #7c3aed; font-size: 22px; display: flex; align-items: center; justify-content: center;">👥</div>
            <div>
              <div id="fullCampaigns" style="font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.1;">0</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Campaigns Mapped</div>
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px 20px; display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #e0f2fe; color: #0284c7; font-size: 22px; display: flex; align-items: center; justify-content: center;">📈</div>
            <div>
              <div id="fullUsual" style="font-size: 20px; font-weight: 800; color: #0284c7; line-height: 1.1;">₹0</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Exact Payout (Gross)</div>
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px 20px; display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #d1fae5; color: #059669; font-size: 22px; display: flex; align-items: center; justify-content: center;">💰</div>
            <div>
              <div id="fullSettled" style="font-size: 20px; font-weight: 800; color: #059669; line-height: 1.1;">₹0</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Settled (UTR Paid)</div>
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px 20px; display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #fef3c7; color: #d97706; font-size: 22px; display: flex; align-items: center; justify-content: center;">⏳</div>
            <div>
              <div id="fullPending" style="font-size: 20px; font-weight: 800; color: #d97706; line-height: 1.1;">₹0</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">Pending Payout</div>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs: Mapped Campaigns vs Tenure Breakdown -->
        <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
          <button id="tabCampaignsBtn" style="
            background: #7c3aed; color: #ffffff;
            border: none; padding: 8px 18px; border-radius: 10px;
            font-size: 13px; font-weight: 800; cursor: pointer;
            transition: all 0.2s ease;
          " type="button">
            📋 Mapped Campaigns
          </button>
          
          <button id="tabBreakdownBtn" style="
            background: #f1f5f9; color: #64748b;
            border: none; padding: 8px 18px; border-radius: 10px;
            font-size: 13px; font-weight: 800; cursor: pointer;
            transition: all 0.2s ease;
          " type="button">
            📅 Tenure & Period Payout Breakdown
          </button>
        </div>

        <!-- TAB CONTENT 1: Mapped Campaigns Table -->
        <div id="tabCampaignsContent" style="margin-bottom: 28px;">
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                  <th style="padding: 12px 16px;">Campaign Name</th>
                  <th style="padding: 12px 16px;">Code</th>
                  <th style="padding: 12px 16px;">Team</th>
                  <th style="padding: 12px 16px;">Assigned By User</th>
                  <th style="padding: 12px 16px;">Predefined Amt</th>
                  <th style="padding: 12px 16px;">Invoice Status</th>
                  <th style="padding: 12px 16px;">Settlement UTR</th>
                </tr>
              </thead>
              <tbody id="fullCampaignsTableBody">
                <!-- Populated via JS -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- TAB CONTENT 2: Tenure & Period Payout Breakdown -->
        <div id="tabBreakdownContent" style="display: none; margin-bottom: 28px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <div style="font-size: 13px; color: #64748b; font-weight: 600;">
              Total Agency Relationship Tenure: <strong id="breakdownTenureSummary" style="color: #7c3aed; font-weight: 800;">—</strong>
            </div>

            <!-- View Switcher: Monthly vs Yearly -->
            <div style="display: flex; gap: 6px; background: #f1f5f9; padding: 3px; border-radius: 10px;">
              <button id="viewMonthlyBtn" style="
                background: #ffffff; color: #0f172a; border: none; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              " type="button">🗓️ Monthly View</button>
              <button id="viewYearlyBtn" style="
                background: transparent; color: #64748b; border: none; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer;
              " type="button">📆 Yearly View</button>
            </div>
          </div>

          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                  <th style="padding: 12px 16px;">Period</th>
                  <th style="padding: 12px 16px;">Campaigns</th>
                  <th style="padding: 12px 16px;">Gross Predefined Amount</th>
                  <th style="padding: 12px 16px;">Settled (UTR Paid)</th>
                  <th style="padding: 12px 16px;">Pending Amount</th>
                </tr>
              </thead>
              <tbody id="fullBreakdownTableBody">
                <!-- Populated via JS -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 3: Feature #7 - Mapped Team Leads & POC Directory -->
        <div style="margin-bottom: 28px;">
          <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 800; color: #0f172a;">👥 Mapped Team Leads & User Mapping Directory</h4>
          <div id="fullTeamLeadsGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px;">
            <!-- Populated via JS -->
          </div>
        </div>

        <!-- Section 4: Master Bank & Tax Credentials Vault -->
        <div>
          <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 800; color: #0f172a;">🏦 Master Bank & Tax Credentials Vault</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Billing Name</span>
              <strong id="fullBillingName" style="font-size: 13px; font-weight: 800; color: #0f172a;">—</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">PAN Card Number</span>
              <strong id="fullPan" style="font-size: 14px; font-weight: 800; color: #0f172a; font-family: monospace;">—</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">GSTIN Registration</span>
              <strong id="fullGstin" style="font-size: 14px; font-weight: 800; color: #0f172a; font-family: monospace;">—</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Bank Account</span>
              <strong id="fullBank" style="font-size: 13px; font-weight: 800; color: #0f172a;">—</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">IFSC Code & Branch</span>
              <strong id="fullIfsc" style="font-size: 12px; font-weight: 800; color: #0f172a;">—</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">UPI ID</span>
              <strong id="fullUpi" style="font-size: 13px; font-weight: 800; color: #0284c7; font-family: monospace;">—</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlayEl);

    document.getElementById('closeFullModalBtn').addEventListener('click', closeFullPageModal);
    document.getElementById('exportDossierPdfBtn').addEventListener('click', exportDossierPdf);

    // Tab Event Listeners
    document.getElementById('tabCampaignsBtn').addEventListener('click', () => switchTab('campaigns'));
    document.getElementById('tabBreakdownBtn').addEventListener('click', () => switchTab('breakdown'));
    document.getElementById('viewMonthlyBtn').addEventListener('click', () => switchBreakdownView('monthly'));
    document.getElementById('viewYearlyBtn').addEventListener('click', () => switchBreakdownView('yearly'));

    modalOverlayEl.addEventListener('click', (e) => {
      if (e.target === modalOverlayEl) closeFullPageModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFullPageModal();
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    const campBtn = document.getElementById('tabCampaignsBtn');
    const breakBtn = document.getElementById('tabBreakdownBtn');
    const campContent = document.getElementById('tabCampaignsContent');
    const breakContent = document.getElementById('tabBreakdownContent');

    if (tab === 'campaigns') {
      campBtn.style.background = '#7c3aed'; campBtn.style.color = '#ffffff';
      breakBtn.style.background = '#f1f5f9'; breakBtn.style.color = '#64748b';
      campContent.style.display = 'block';
      breakContent.style.display = 'none';
    } else {
      breakBtn.style.background = '#7c3aed'; breakBtn.style.color = '#ffffff';
      campBtn.style.background = '#f1f5f9'; campBtn.style.color = '#64748b';
      breakContent.style.display = 'block';
      campContent.style.display = 'none';
    }
  }

  function switchBreakdownView(view) {
    breakdownView = view;
    const mBtn = document.getElementById('viewMonthlyBtn');
    const yBtn = document.getElementById('viewYearlyBtn');

    if (view === 'monthly') {
      mBtn.style.background = '#ffffff'; mBtn.style.color = '#0f172a'; mBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      yBtn.style.background = 'transparent'; yBtn.style.color = '#64748b'; yBtn.style.boxShadow = 'none';
    } else {
      yBtn.style.background = '#ffffff'; yBtn.style.color = '#0f172a'; yBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      mBtn.style.background = 'transparent'; mBtn.style.color = '#64748b'; mBtn.style.boxShadow = 'none';
    }

    if (currentCreatorData) {
      renderBreakdownTable(currentCreatorData);
    }
  }

  function exportDossierPdf() {
    if (!currentCreatorData) return;
    const url = `/admin/creators/dossier/pdf?name=${encodeURIComponent(currentCreatorData.creatorName)}&mobile=${encodeURIComponent(currentCreatorData.creatorMobile || '')}`;
    window.open(url, '_blank');
  }

  function openFullPageModal() {
    createFullPageModalElement();
    modalOverlayEl.style.display = 'flex';
    requestAnimationFrame(() => {
      modalOverlayEl.style.opacity = '1';
      document.getElementById('creatorModalCard').style.transform = 'scale(1)';
    });
  }

  function closeFullPageModal() {
    if (!modalOverlayEl) return;
    modalOverlayEl.style.opacity = '0';
    document.getElementById('creatorModalCard').style.transform = 'scale(0.94)';
    setTimeout(() => {
      modalOverlayEl.style.display = 'none';
    }, 250);
  }

  function fetchCreatorSummary(name, mobile, callback) {
    let campaignId = null;
    const match = window.location.pathname.match(/\/admin\/campaigns\/(\d+)/);
    if (match) campaignId = match[1];

    const key = name + '|' + (mobile || '') + '|' + (campaignId || '');
    if (cache[key]) {
      return callback(cache[key]);
    }
    let url = '/admin/api/creator-summary?name=' + encodeURIComponent(name);
    if (mobile) url += '&mobile=' + encodeURIComponent(mobile);
    if (campaignId) url += '&campaign_id=' + encodeURIComponent(campaignId);

    fetch(url)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.success) {
          cache[key] = data;
          callback(data);
        }
      })
      .catch(err => console.error('Full Page Modal fetch error:', err));
  }

  function renderBreakdownTable(data) {
    const tbody = document.getElementById('fullBreakdownTableBody');
    if (!tbody) return;

    const list = breakdownView === 'monthly' ? (data.monthlyBreakdown || []) : (data.yearlyBreakdown || []);

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #94a3b8;">No period data available.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(item => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 16px; font-weight: 800; color: #0f172a;">${item.periodLabel}</td>
        <td style="padding: 12px 16px; font-weight: 700; color: #7c3aed;">${item.campaignsCount} Campaign${item.campaignsCount === 1 ? '' : 's'}</td>
        <td style="padding: 12px 16px; font-weight: 800; color: #0284c7;">₹${Number(item.grossAmount || 0).toLocaleString('en-IN')}</td>
        <td style="padding: 12px 16px; font-weight: 800; color: #059669;">₹${Number(item.settledAmount || 0).toLocaleString('en-IN')}</td>
        <td style="padding: 12px 16px; font-weight: 800; color: #d97706;">₹${Number(item.pendingAmount || 0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  }

  function updateModalData(data) {
    currentCreatorData = data;

    document.getElementById('fullCreatorName').textContent = data.creatorName;
    document.getElementById('fullAvatar').textContent = (data.creatorName || 'C').charAt(0).toUpperCase();
    document.getElementById('fullMobile').textContent = data.creatorMobile || '—';
    const invCountEl = document.getElementById('fullInvoiceCount');
    if (invCountEl) {
      invCountEl.textContent = data.totalInvoicesCount !== undefined ? data.totalInvoicesCount : (data.campaignsList ? data.campaignsList.filter(c=>c.invoiceNo).length : 0);
    }
    document.getElementById('fullTenure').textContent = data.tenureText || '1 Month';
    document.getElementById('breakdownTenureSummary').textContent = `${data.creatorName} has been associated for ${data.tenureText || '1 Month'} across ${data.totalCampaigns}`;

    document.getElementById('fullCampaigns').textContent = data.totalCampaigns;
    document.getElementById('fullUsual').textContent = data.usualAmountFormatted;
    document.getElementById('fullSettled').textContent = data.settledPayoutFormatted;
    document.getElementById('fullPending').textContent = data.pendingPayoutFormatted;

    // GST Badge
    const gstBadge = document.getElementById('fullGstBadge');
    if (gstBadge) {
      gstBadge.textContent = data.taxStatus;
      if (data.isGstRegistered) {
        gstBadge.style.background = '#ecfdf5';
        gstBadge.style.color = '#047857';
        gstBadge.style.borderColor = '#a7f3d0';
      } else {
        gstBadge.style.background = '#f1f5f9';
        gstBadge.style.color = '#475569';
        gstBadge.style.borderColor = '#cbd5e1';
      }
    }

    // Populate All Campaigns Table
    const tableBody = document.getElementById('fullCampaignsTableBody');
    if (tableBody) {
      if (!data.campaignsList || data.campaignsList.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="padding: 16px; text-align: center; color: #94a3b8;">No campaigns mapped to this creator yet.</td></tr>';
      } else {
        tableBody.innerHTML = data.campaignsList.map(c => {
          let statusBadge = `<span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: #f1f5f9; color: #64748b;">Not Submitted</span>`;
          if (c.invoiceStatus === 'ACCEPTED') statusBadge = `<span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: #ecfdf5; color: #047857;">ACCEPTED</span>`;
          else if (c.invoiceStatus === 'SUBMITTED') statusBadge = `<span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: #eff6ff; color: #1d4ed8;">SUBMITTED</span>`;
          else if (c.invoiceStatus === 'REGENERATED') statusBadge = `<span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: #f5f3ff; color: #6d28d9;">REGENERATED</span>`;
          else if (c.invoiceStatus === 'REJECTED') statusBadge = `<span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: #fef2f2; color: #b91c1c;">REJECTED</span>`;

          const utrBadge = c.utr ? `<span style="font-size: 11px; font-weight: 800; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 6px;">✨ UTR: ${c.utr}</span>` : '<span style="color: #cbd5e1;">—</span>';

          return `<tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px 16px; font-weight: 700; color: #0f172a;">${c.campaignName}</td>
            <td style="padding: 12px 16px; font-size: 11px; color: #64748b; font-weight: 600;">${c.campaignCode}</td>
            <td style="padding: 12px 16px; font-weight: 600; color: #475569;">${c.teamName}</td>
            <td style="padding: 12px 16px; font-weight: 700; color: #4f46e5;"><span style="background: #e0e7ff; color: #4338ca; padding: 3px 8px; border-radius: 6px; font-size: 11px;">👤 ${c.createdBy || 'Admin'}</span></td>
            <td style="padding: 12px 16px; font-weight: 800; color: #7c3aed;">₹${c.predefinedAmount.toLocaleString('en-IN')}</td>
            <td style="padding: 12px 16px;">${statusBadge}</td>
            <td style="padding: 12px 16px;">${utrBadge}</td>
          </tr>`;
        }).join('');
      }
    }

    renderBreakdownTable(data);

    // Render Mapped Team Leads & User Mapping Directory
    const teamLeadsGrid = document.getElementById('fullTeamLeadsGrid');
    if (teamLeadsGrid) {
      if (!data.teamLeadsDirectory || data.teamLeadsDirectory.length === 0) {
        teamLeadsGrid.innerHTML = '<div style="color: #94a3b8; font-size: 13px;">No mapped Team Leads found.</div>';
      } else {
        teamLeadsGrid.innerHTML = data.teamLeadsDirectory.map(tl => {
          const initial = (tl.pocName || tl.teamName || 'T').charAt(0).toUpperCase();
          const campsText = tl.campaignsList ? tl.campaignsList.join(', ') : '';
          return `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; display: flex; align-items: flex-start; gap: 12px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #0284c7, #2563eb); color: #fff; font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${initial}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${tl.pocName}
                </div>
                <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 1px;">
                  Team: ${tl.teamName} <span style="color: #4f46e5; font-size: 10px;">(by ${tl.createdBy || 'Admin'})</span>
                </div>
                <div style="font-size: 10px; font-weight: 700; color: #7c3aed; margin-top: 4px; background: #f3e8ff; padding: 2px 8px; border-radius: 6px; display: inline-block;">
                  ${tl.campaignsCount} Campaign${tl.campaignsCount === 1 ? '' : 's'} (${campsText})
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Bank & Tax Vault
    document.getElementById('fullBillingName').textContent = data.fullBillingName || data.creatorName;
    document.getElementById('fullPan').textContent = data.pan || '—';
    document.getElementById('fullGstin').textContent = data.isGstRegistered ? (data.gstin || '—') : 'Not Applicable (Non-GST)';
    document.getElementById('fullBank').textContent = data.bankName !== '—' ? (data.bankName + (data.accountNo !== '—' ? (' (' + data.accountNo + ')') : '')) : '—';
    document.getElementById('fullIfsc').textContent = data.ifscCode !== '—' ? (data.ifscCode + (data.branch !== '—' ? (' - ' + data.branch) : '')) : '—';
    document.getElementById('fullUpi').textContent = data.upiId || '—';
  }

  function attachModalListeners() {
    createFullPageModalElement();

    document.addEventListener('click', (e) => {
      const creatorEl = e.target.closest('[data-creator-hover], .creator-avatar, .search-creator-name');
      if (!creatorEl) return;

      let creatorName = creatorEl.getAttribute('data-creator-hover');
      let creatorMobile = creatorEl.getAttribute('data-creator-mobile');

      if (!creatorName) {
        if (creatorEl.dataset && creatorEl.dataset.name) {
          creatorName = creatorEl.dataset.name;
        } else if (creatorEl.textContent) {
          creatorName = creatorEl.textContent.trim();
        }
      }

      if (!creatorMobile) {
        const tr = creatorEl.closest('tr');
        if (tr) {
          const mobCell = tr.querySelector('[data-label="Serial Number"], .search-creator-mobile');
          if (mobCell) creatorMobile = mobCell.textContent.trim();
        }
      }

      if (!creatorName || creatorName.length < 2) return;

      fetchCreatorSummary(creatorName, creatorMobile, (data) => {
        updateModalData(data);
        openFullPageModal();
      });
    });

    let hoverIntentTimer = null;
    document.addEventListener('mouseover', (e) => {
      const creatorEl = e.target.closest('[data-creator-hover], .creator-avatar, .search-creator-name');
      if (!creatorEl) return;

      let creatorName = creatorEl.getAttribute('data-creator-hover');
      let creatorMobile = creatorEl.getAttribute('data-creator-mobile');

      if (!creatorName) {
        if (creatorEl.dataset && creatorEl.dataset.name) {
          creatorName = creatorEl.dataset.name;
        } else if (creatorEl.textContent) {
          creatorName = creatorEl.textContent.trim();
        }
      }

      if (!creatorMobile) {
        const tr = creatorEl.closest('tr');
        if (tr) {
          const mobCell = tr.querySelector('[data-label="Serial Number"], .search-creator-mobile');
          if (mobCell) creatorMobile = mobCell.textContent.trim();
        }
      }

      if (!creatorName || creatorName.length < 2) return;

      clearTimeout(hoverIntentTimer);
      hoverIntentTimer = setTimeout(() => {
        fetchCreatorSummary(creatorName, creatorMobile, (data) => {
          updateModalData(data);
          openFullPageModal();
        });
      }, 450);
    });

    document.addEventListener('mouseout', (e) => {
      const creatorEl = e.target.closest('[data-creator-hover], .creator-avatar, .search-creator-name');
      if (creatorEl) {
        clearTimeout(hoverIntentTimer);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachModalListeners);
  } else {
    attachModalListeners();
  }
})();
