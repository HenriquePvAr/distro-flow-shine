import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Product {
  id: string;
  name: string;
  sku: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  category: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Sale {
  id: string;
  items: CartItem[];
  total: number;
  profit: number;
  paymentMethod: string;
  date: string;
}

interface StoreState {
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  
  // Product actions
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  adjustStock: (id: string, quantity: number, reason: string) => void;
  
  // Cart actions
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  
  // Sale actions
  processSale: (paymentMethod: string) => Sale | null;
}

const initialProducts: Product[] = [
  { id: '1', name: 'Coca-Cola 2L', sku: 'BEB001', costPrice: 5.50, salePrice: 8.99, stock: 48, category: 'Bebidas' },
  { id: '2', name: 'Água Mineral 500ml', sku: 'BEB002', costPrice: 0.80, salePrice: 2.50, stock: 120, category: 'Bebidas' },
  { id: '3', name: 'Cerveja Lata 350ml', sku: 'BEB003', costPrice: 2.20, salePrice: 4.99, stock: 72, category: 'Bebidas' },
  { id: '4', name: 'Arroz 5kg', sku: 'ALM001', costPrice: 18.00, salePrice: 27.90, stock: 25, category: 'Alimentos' },
  { id: '5', name: 'Feijão 1kg', sku: 'ALM002', costPrice: 6.50, salePrice: 9.99, stock: 40, category: 'Alimentos' },
  { id: '6', name: 'Óleo de Soja 900ml', sku: 'ALM003', costPrice: 5.80, salePrice: 8.49, stock: 35, category: 'Alimentos' },
  { id: '7', name: 'Sabão em Pó 1kg', sku: 'LIM001', costPrice: 8.00, salePrice: 14.90, stock: 3, category: 'Limpeza' },
  { id: '8', name: 'Detergente 500ml', sku: 'LIM002', costPrice: 1.50, salePrice: 3.49, stock: 60, category: 'Limpeza' },
  { id: '9', name: 'Papel Higiênico 12un', sku: 'HIG001', costPrice: 12.00, salePrice: 19.90, stock: 2, category: 'Higiene' },
  { id: '10', name: 'Sabonete 90g', sku: 'HIG002', costPrice: 1.20, salePrice: 2.99, stock: 80, category: 'Higiene' },
];

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      products: initialProducts,
      cart: [],
      sales: [],

      addProduct: (product) =>
        set((state) => ({ products: [...state.products, product] })),

      updateProduct: (id, updates) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      adjustStock: (id, quantity, reason) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, stock: Math.max(0, p.stock + quantity) } : p
          ),
        })),

      addToCart: (product, quantity) =>
        set((state) => {
          const existing = state.cart.find((item) => item.product.id === product.id);
          if (existing) {
            return {
              cart: state.cart.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return { cart: [...state.cart, { product, quantity }] };
        }),

      removeFromCart: (productId) =>
        set((state) => ({
          cart: state.cart.filter((item) => item.product.id !== productId),
        })),

      updateCartQuantity: (productId, quantity) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            item.product.id === productId ? { ...item, quantity } : item
          ),
        })),

      clearCart: () => set({ cart: [] }),

      processSale: (paymentMethod) => {
        const state = get();
        if (state.cart.length === 0) return null;

        const total = state.cart.reduce(
          (sum, item) => sum + item.product.salePrice * item.quantity,
          0
        );
        const profit = state.cart.reduce(
          (sum, item) => sum + (item.product.salePrice - item.product.costPrice) * item.quantity,
          0
        );

        const sale: Sale = {
          id: Date.now().toString(),
          items: [...state.cart],
          total,
          profit,
          paymentMethod,
          date: new Date().toISOString(),
        };

        // Subtract stock
        const updatedProducts = state.products.map((product) => {
          const cartItem = state.cart.find((item) => item.product.id === product.id);
          if (cartItem) {
            return { ...product, stock: Math.max(0, product.stock - cartItem.quantity) };
          }
          return product;
        });

        set({
          products: updatedProducts,
          cart: [],
          sales: [...state.sales, sale],
        });

        return sale;
      },
    }),
    { name: 'distribuidora-store' }
  )
);
