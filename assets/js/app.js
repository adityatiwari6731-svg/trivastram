/**
 * TRIVASTRAM STREETWEAR - APP & UI CONTROLLER
 * Controls Header, Live Search, Slide-Out Bag Drawer, Product Cards, Mobile Nav.
 */

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initCartDrawer();
  initSearch();
  updateHeaderBadges();
  highlightActiveNav();

  // Listen to state changes
  window.addEventListener('trivastram:cart-updated', () => {
    updateHeaderBadges();
    renderCartDrawerContent();
  });

  window.addEventListener('trivastram:wishlist-updated', (e) => {
    updateHeaderBadges();
    updateWishlistIcons(e.detail.productId, e.detail.added);
  });

  window.addEventListener('trivastram:coupon-updated', () => {
    renderCartDrawerContent();
  });
});

// --- Header Badges ---
function updateHeaderBadges() {
  const cartCount = getCartCount();
  const wishlistCount = getWishlist().length;

  document.querySelectorAll('.cart-badge-count').forEach(el => {
    el.textContent = cartCount;
    el.style.display = cartCount > 0 ? 'flex' : 'none';
  });

  document.querySelectorAll('.wishlist-badge-count').forEach(el => {
    el.textContent = wishlistCount;
    el.style.display = wishlistCount > 0 ? 'flex' : 'none';
  });
}

// --- Active Nav Highlighting ---
function highlightActiveNav() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.category-nav-item a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && currentPath.endsWith(href)) {
      link.parentElement.classList.add('active');
    }
  });

  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href && currentPath.endsWith(href)) {
      item.classList.add('active');
    }
  });
}

// --- Live Search Functionality ---
function initSearch() {
  const searchInput = document.getElementById('globalSearchInput');
  const searchDropdown = document.getElementById('searchDropdown');
  const searchForm = document.getElementById('globalSearchForm');

  if (!searchInput || !searchDropdown) return;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.length < 2) {
      searchDropdown.classList.remove('show');
      return;
    }

    const matches = searchProducts(val).slice(0, 6);
    if (matches.length === 0) {
      searchDropdown.innerHTML = `
        <div class="search-dropdown-header">No streetwear drops found</div>
        <div class="search-dropdown-item" style="color: var(--color-charcoal-muted); cursor: default;">
          Try searching "oversized", "hoodie", or "cargo"
        </div>
      `;
    } else {
      let html = `<div class="search-dropdown-header">Matching Streetwear (${matches.length})</div>`;
      matches.forEach(item => {
        html += `
          <a href="product.html?id=${item.id}" class="search-dropdown-item">
            <span><strong>${item.name}</strong> <span style="font-size:0.75rem; color:var(--color-charcoal-muted); margin-left:6px;">${item.categoryLabel}</span></span>
            <span style="font-weight:700; color:var(--color-accent);">${formatPrice(item.price)}</span>
          </a>
        `;
      });
      searchDropdown.innerHTML = html;
    }
    searchDropdown.classList.add('show');
  });

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.classList.remove('show');
    }
  });

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = searchInput.value.trim();
      if (val) {
        window.location.href = `shop.html?search=${encodeURIComponent(val)}`;
      }
    });
  }
}

// --- Cart Slide-Out Drawer ---
function initCartDrawer() {
  // Inject Cart Drawer HTML if not already present
  if (!document.getElementById('cartDrawer')) {
    const drawerHtml = `
      <div id="cartDrawerBackdrop" class="cart-drawer-backdrop" onclick="closeCartDrawer()"></div>
      <aside id="cartDrawer" class="cart-drawer" aria-label="Shopping Bag">
        <div class="cart-drawer-header">
          <div class="cart-drawer-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            <span>MY STREETWEAR BAG (<span class="drawer-items-count">0</span>)</span>
          </div>
          <button class="cart-drawer-close" onclick="closeCartDrawer()" aria-label="Close Bag">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div id="drawerShippingMeter" class="shipping-meter-box">
          <!-- Free shipping progress bar dynamically populated -->
        </div>

        <div id="cartDrawerBody" class="cart-drawer-body">
          <!-- Cart items list dynamically populated -->
        </div>

        <div id="cartDrawerFooter" class="cart-drawer-footer">
          <!-- Subtotal and actions -->
        </div>
      </aside>
    `;
    document.body.insertAdjacentHTML('beforeend', drawerHtml);
  }

  // Trigger buttons
  document.querySelectorAll('.open-cart-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openCartDrawer();
    });
  });

  renderCartDrawerContent();
}

function openCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartDrawerBackdrop');
  if (drawer && backdrop) {
    renderCartDrawerContent();
    drawer.classList.add('open');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartDrawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function renderCartDrawerContent() {
  const body = document.getElementById('cartDrawerBody');
  const footer = document.getElementById('cartDrawerFooter');
  const meter = document.getElementById('drawerShippingMeter');
  const countEl = document.querySelector('.drawer-items-count');
  if (!body || !footer || !meter) return;

  const calcs = getCartCalculations();
  if (countEl) countEl.textContent = getCartCount();

  // Free Shipping Meter
  if (calcs.amountToFreeShipping > 0) {
    meter.innerHTML = `
      <div>Add <strong>${formatPrice(calcs.amountToFreeShipping)}</strong> more to get <strong>FREE SHIPPING</strong>!</div>
      <div class="shipping-progress-bar">
        <div class="shipping-progress-fill" style="width: ${calcs.freeShippingProgress}%;"></div>
      </div>
    `;
  } else {
    meter.innerHTML = `
      <div style="color: var(--color-accent); font-weight: 700; display:flex; align-items:center; gap:6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        YOU UNLOCKED FREE STREETWEAR SHIPPING!
      </div>
    `;
  }

  // Empty state
  if (calcs.items.length === 0) {
    body.innerHTML = `
      <div class="cart-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <path d="M16 10a4 4 0 0 1-8 0"></path>
        </svg>
        <h3>Your Streetwear Bag is Empty</h3>
        <p>Catch the latest drop before sizes run out.</p>
        <a href="shop.html" class="btn btn-primary btn-sm" onclick="closeCartDrawer()">EXPLORE DROPS</a>
      </div>
    `;
    footer.innerHTML = `
      <a href="shop.html" class="btn btn-charcoal btn-block" onclick="closeCartDrawer()">START SHOPPING</a>
    `;
    return;
  }

  // Items List
  let itemsHtml = '';
  calcs.items.forEach(item => {
    itemsHtml += `
      <div class="cart-drawer-item">
        <div class="cart-item-img">
          <img src="${item.product.images[0]}" alt="${item.product.name}" loading="lazy">
        </div>
        <div class="cart-item-info">
          <div>
            <h4 class="cart-item-title">
              <a href="product.html?id=${item.product.id}">${item.product.name}</a>
            </h4>
            <div class="cart-item-meta">
              <span class="meta-chip">Size: <strong>${item.size}</strong></span>
              <span style="text-decoration: line-through; color: var(--color-charcoal-muted);">${formatPrice(item.product.mrp)}</span>
            </div>
          </div>
          <div class="cart-item-controls">
            <div class="qty-stepper">
              <button onclick="updateCartQuantity('${item.id}', '${item.size}', ${item.quantity - 1})">-</button>
              <span>${item.quantity}</span>
              <button onclick="updateCartQuantity('${item.id}', '${item.size}', ${item.quantity + 1})">+</button>
            </div>
            <div class="cart-item-price">${formatPrice(item.subtotalSelling)}</div>
          </div>
        </div>
      </div>
    `;
  });
  body.innerHTML = itemsHtml;

  // Footer / Subtotal
  footer.innerHTML = `
    <div class="cart-summary-row">
      <span>Bag Total (MRP)</span>
      <span>${formatPrice(calcs.totalMrp)}</span>
    </div>
    <div class="cart-summary-row" style="color: var(--color-accent); font-weight:600;">
      <span>Bag Discount</span>
      <span>-${formatPrice(calcs.bagDiscount)}</span>
    </div>
    ${calcs.couponDiscount > 0 ? `
    <div class="cart-summary-row" style="color: var(--color-accent); font-weight:700;">
      <span>Coupon (${calcs.couponCode})</span>
      <span>-${formatPrice(calcs.couponDiscount)}</span>
    </div>
    ` : ''}
    <div class="cart-summary-row">
      <span>Shipping</span>
      <span>${calcs.shippingFee === 0 ? '<strong style="color: var(--color-accent)">FREE</strong>' : formatPrice(calcs.shippingFee)}</span>
    </div>
    <div class="cart-summary-row total-row">
      <span>Grand Total</span>
      <span>${formatPrice(calcs.grandTotal)}</span>
    </div>
    <div class="cart-drawer-actions">
      <a href="checkout.html" class="btn btn-primary btn-block">PROCEED TO CHECKOUT</a>
      <a href="cart.html" class="btn btn-outline btn-block btn-sm" onclick="closeCartDrawer()">VIEW FULL BAG & OFFERS</a>
    </div>
  `;
}

// --- Universal Brutalist Streetwear Product Card Component ---
function renderProductCard(product) {
  const isWished = isInWishlist(product.id);
  const heartClass = isWished ? 'active' : '';

  return `
    <article class="product-card" data-id="${product.id}" data-category="${product.category}">
      <div class="product-card-media card-media">
        <a href="product.html?id=${product.id}">
          <img src="${product.images[0]}" alt="${product.name}" loading="lazy">
        </a>
        <div class="card-top-badges">
          <span class="card-badge ${product.badgeType || 'badge-neon'}">${product.badge || 'COLLECTION'}</span>
        </div>
        <button class="card-wishlist-btn wishlist-btn ${heartClass}" onclick="handleWishlistClick(event, '${product.id}')" aria-label="Save to Wishlist" title="Save to Wishlist">
          <svg viewBox="0 0 24 24" fill="${isWished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
        <div class="card-quick-add">
          ${product.sizes.map(sz => `
            <button class="quick-size-btn" onclick="handleQuickAdd(event, '${product.id}', '${sz}')">${sz}</button>
          `).join('')}
        </div>
      </div>
      <div class="product-card-body card-details">
        <div class="card-category-label">${product.categoryLabel || 'Oversized Tees'} &bull; ${product.color || 'Streetwear'}</div>
        <h3 class="card-title">
          <a href="product.html?id=${product.id}">${product.name}</a>
        </h3>
        <div class="card-price-row">
          <span class="card-current-price price-current">${formatPrice(product.price)}</span>
          <span class="card-mrp price-original">${formatPrice(product.mrp)}</span>
          <span class="card-discount-badge price-discount">${product.discount || ''}</span>
        </div>
      </div>
    </article>
  `;
}

// Quick Add Handler
function handleQuickAdd(e, productId, size) {
  e.preventDefault();
  e.stopPropagation();
  addToCart(productId, size, 1);
}

// Wishlist Click Handler
function handleWishlistClick(e, productId) {
  e.preventDefault();
  e.stopPropagation();
  toggleWishlist(productId);
}

function updateWishlistIcons(productId, isAdded) {
  document.querySelectorAll(`.product-card[data-id="${productId}"] .wishlist-btn`).forEach(btn => {
    if (isAdded) {
      btn.classList.add('active');
      btn.querySelector('svg').setAttribute('fill', 'currentColor');
    } else {
      btn.classList.remove('active');
      btn.querySelector('svg').setAttribute('fill', 'none');
    }
  });
}

function initHeader() {
  // Mobile drawer or extra navigation listeners can hook here
}
