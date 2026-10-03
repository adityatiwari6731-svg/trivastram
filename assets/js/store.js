/**
 * TRIVASTRAM STREETWEAR - GLOBAL STATE & LOCALSTORAGE MANAGER
 * Manages Cart, Wishlist, Coupons, and UI synchronization.
 */

const STORAGE_KEYS = {
  CART: 'kraal_cart_items',
  WISHLIST: 'kraal_wishlist_ids',
  COUPON: 'kraal_applied_coupon',
  RECENT_SEARCH: 'kraal_recent_searches'
};

const FREE_SHIPPING_THRESHOLD = 999;
const STANDARD_SHIPPING_FEE = 99;

// Available Promotional Coupons
const AVAILABLE_COUPONS = {
  'FIRSTDROP': { type: 'percent', value: 15, minOrder: 1499, description: '15% OFF for new streetwear fans' }
};

// --- Wishlist Management ---
function getWishlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WISHLIST);
    let list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      const cleaned = list.filter(id => !String(id).startsWith('trivastram-'));
      if (cleaned.length !== list.length) {
        localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(cleaned));
        return cleaned;
      }
    }
    return list;
  } catch (e) {
    return [];
  }
}

function isInWishlist(productId) {
  const list = getWishlist();
  return list.includes(productId);
}

function toggleWishlist(productId) {
  let list = getWishlist();
  let added = false;
  if (list.includes(productId)) {
    list = list.filter(id => id !== productId);
    added = false;
  } else {
    list.push(productId);
    added = true;
  }
  localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('trivastram:wishlist-updated', { detail: { list, added, productId } }));
  
  const product = getProductById(productId);
  const title = product ? product.name : 'Item';
  if (added) {
    showToast(`Added "${title}" to Wishlist!`, 'success');
  } else {
    showToast(`Removed from Wishlist`, 'info');
  }
  return added;
}

// --- Cart Management ---
function getCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CART);
    let cart = raw ? JSON.parse(raw) : [];
    if (Array.isArray(cart)) {
      const cleaned = cart.filter(item => item && !String(item.id).startsWith('trivastram-'));
      if (cleaned.length !== cart.length) {
        localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cleaned));
        return cleaned;
      }
    }
    return cart;
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('trivastram:cart-updated', { detail: { cart } }));
}

function addToCart(productId, size = 'M', quantity = 1) {
  const product = getProductById(productId);
  if (!product) return false;

  let cart = getCart();
  const existingIndex = cart.findIndex(item => item.id === productId && item.size === size);

  if (existingIndex > -1) {
    cart[existingIndex].quantity += quantity;
    cart[existingIndex].product = product;
  } else {
    cart.push({
      id: productId,
      size: size,
      quantity: quantity,
      product: product,
      addedAt: Date.now()
    });
  }

  saveCart(cart);
  showToast(`Added ${quantity}x "${product.name}" (${size}) to Bag!`, 'success');
  openCartDrawer();
  return true;
}

function updateCartQuantity(productId, size, quantity) {
  let cart = getCart();
  if (quantity <= 0) {
    cart = cart.filter(item => !(item.id === productId && item.size === size));
  } else {
    const item = cart.find(item => item.id === productId && item.size === size);
    if (item) item.quantity = quantity;
  }
  saveCart(cart);
}

function removeFromCart(productId, size) {
  let cart = getCart();
  cart = cart.filter(item => !(item.id === productId && item.size === size));
  saveCart(cart);
  showToast('Item removed from Bag', 'info');
}

function clearCart() {
  saveCart([]);
}

function getCartCount() {
  const cart = getCart();
  return cart.reduce((total, item) => total + item.quantity, 0);
}

// Detailed cart calculations
function getCartCalculations() {
  const cart = getCart();
  let totalMrp = 0;
  let totalSellingPrice = 0;
  let itemsDetailed = [];

  cart.forEach(cartItem => {
    const product = getProductById(cartItem.id) || cartItem.product;
    if (product) {
      const price = Number(product.price) || 0;
      const mrp = Number(product.mrp || product.price) || price;
      const qty = Number(cartItem.quantity) || 1;
      const itemMrp = mrp * qty;
      const itemSelling = price * qty;
      totalMrp += itemMrp;
      totalSellingPrice += itemSelling;
      itemsDetailed.push({
        ...cartItem,
        product,
        subtotalMrp: itemMrp,
        subtotalSelling: itemSelling
      });
    }
  });

  const bagDiscount = totalMrp - totalSellingPrice;
  const appliedCoupon = getAppliedCoupon();
  let couponDiscount = 0;

  if (appliedCoupon && AVAILABLE_COUPONS[appliedCoupon]) {
    const coupon = AVAILABLE_COUPONS[appliedCoupon];
    if (totalSellingPrice >= coupon.minOrder) {
      if (coupon.type === 'percent') {
        couponDiscount = Math.round((totalSellingPrice * coupon.value) / 100);
      } else if (coupon.type === 'flat') {
        couponDiscount = coupon.value;
      }
    }
  }

  const shippingFee = (totalSellingPrice >= FREE_SHIPPING_THRESHOLD || totalSellingPrice === 0) ? 0 : STANDARD_SHIPPING_FEE;
  const grandTotal = Math.max(0, totalSellingPrice - couponDiscount + shippingFee);
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - totalSellingPrice);
  const freeShippingProgress = Math.min(100, Math.round((totalSellingPrice / FREE_SHIPPING_THRESHOLD) * 100));

  return {
    items: itemsDetailed,
    totalMrp,
    totalSellingPrice,
    bagDiscount,
    couponCode: appliedCoupon,
    couponDiscount,
    shippingFee,
    grandTotal,
    amountToFreeShipping,
    freeShippingProgress
  };
}

// --- Coupon Management ---
function getAppliedCoupon() {
  return localStorage.getItem(STORAGE_KEYS.COUPON) || null;
}

function applyCoupon(code) {
  const cleanCode = code.toUpperCase().trim();
  if (!AVAILABLE_COUPONS[cleanCode]) {
    return { success: false, message: 'Invalid coupon code. Try FIRSTDROP.' };
  }

  const coupon = AVAILABLE_COUPONS[cleanCode];
  const { totalSellingPrice } = getCartCalculations();

  if (totalSellingPrice < coupon.minOrder) {
    return {
      success: false,
      message: `Add items worth ₹${coupon.minOrder - totalSellingPrice} more to use ${cleanCode}!`
    };
  }

  localStorage.setItem(STORAGE_KEYS.COUPON, cleanCode);
  window.dispatchEvent(new CustomEvent('trivastram:coupon-updated', { detail: { code: cleanCode } }));
  return { success: true, message: `Coupon ${cleanCode} applied successfully!` };
}

function removeCoupon() {
  localStorage.removeItem(STORAGE_KEYS.COUPON);
  window.dispatchEvent(new CustomEvent('trivastram:coupon-updated', { detail: { code: null } }));
  showToast('Coupon removed', 'info');
}

// --- Currency Formatter ---
function formatPrice(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

// --- Toast Notifications System ---
function showToast(message, type = 'default') {
  let container = document.getElementById('kraalToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'kraalToastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CC5500" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CC5500" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  }

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// --- Place Order Checkout Pipeline ---
async function placeOrder(customer, paymentMethod) {
  const calcs = getCartCalculations();
  const orderNumber = `KR_${Math.floor(100000 + Math.random() * 900000)}`;

  const orderData = {
    order_number: orderNumber,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email || 'orders@trivastramstreetwear.com',
    shipping_address: customer.address,
    landmark: customer.landmark || '',
    city: customer.city,
    pincode: customer.pincode,
    payment_method: paymentMethod || 'cod',
    subtotal: calcs.totalSellingPrice,
    discount: calcs.couponDiscount || 0,
    shipping_fee: calcs.shippingFee,
    grand_total: calcs.grandTotal,
    status: 'placed'
  };

  let result = null;
  try {
    if (window.kraalSupabase && window.kraalSupabase.placeOrderWithBackend) {
      result = await window.kraalSupabase.placeOrderWithBackend(orderData, calcs.items);
    }
  } catch (backendErr) {
    console.warn("Backend order submission error, falling back to local order:", backendErr);
  }

  if (!result) {
    result = {
      success: true,
      mode: 'mock',
      orderNumber: orderNumber,
      orderId: 'ord_' + Date.now()
    };
  }

  // Store in localStorage local order history so track.html can display it immediately
  try {
    const localOrders = JSON.parse(localStorage.getItem('trivastram_local_orders') || localStorage.getItem('kraal_local_orders') || '[]');
    localOrders.unshift({
      ...orderData,
      id: result.orderId || orderNumber,
      created_at: new Date().toISOString(),
      order_items: calcs.items.map(item => ({
        product_name: item.product ? item.product.name : 'TRIVASTRAM Streetwear Piece',
        size: item.size || 'M',
        quantity: item.quantity || 1,
        unit_price: item.product ? item.product.price : 699,
        subtotal: item.subtotalSelling || (item.product ? item.product.price * item.quantity : 699)
      }))
    });
    localStorage.setItem('trivastram_local_orders', JSON.stringify(localOrders.slice(0, 30)));
    localStorage.setItem('kraal_local_orders', JSON.stringify(localOrders.slice(0, 30)));
  } catch (storageErr) {
    console.warn("Could not cache order to localStorage:", storageErr);
  }


  return {
    ...result,
    orderNumber: result.orderNumber || orderNumber,
    grandTotal: calcs.grandTotal
  };
}

