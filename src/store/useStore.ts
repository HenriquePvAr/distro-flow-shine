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

export type MovementType = 'entrada' | 'saida' | 'ajuste' | 'venda';
export type AdjustmentReason = 'erro_contagem' | 'avaria' | 'bonificacao' | 'perda' | 'entrada_fornecedor' | 'outros';

export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: AdjustmentReason | null;
  notes: string;
  operator: string;
  date: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
}

export interface Seller {
  id: string;
  name: string;
}

export interface Sale {
  id: string;
  items: CartItem[];
  total: number;
  profit: number;
  paymentMethod: string;
  customer: Customer | null;
  seller: Seller | null;
  date: string;
}

export type ExpenseCategory = 'Salários' | 'Combustível' | 'Aluguel' | 'Mercadoria' | 'Outros';

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  value: number;
  date: string;
}

export const expenseCategories: ExpenseCategory[] = [
  'Salários',
  'Combustível',
  'Aluguel',
  'Mercadoria',
  'Outros',
];

export const customers: Customer[] = [
  { id: '1', name: 'Cliente Avulso', phone: '' },
  { id: '2', name: 'João Silva', phone: '11999990001' },
  { id: '3', name: 'Maria Oliveira', phone: '11999990002' },
  { id: '4', name: 'Pedro Santos', phone: '11999990003' },
];

export const sellers: Seller[] = [
  { id: '1', name: 'Carlos' },
  { id: '2', name: 'Ana' },
  { id: '3', name: 'Roberto' },
];

interface StoreState {
  products: Product[];
  cart: CartItem[];
  sales: Sale[];
  expenses: Expense[];
  stockMovements: StockMovement[];
  
  // Product actions
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  adjustStock: (id: string, quantity: number, reason: AdjustmentReason, notes: string, operator: string, type?: MovementType) => void;
  addStockEntry: (id: string, quantity: number, notes: string, operator: string) => void;
  
  // Cart actions
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  
  // Sale actions
  processSale: (paymentMethod: string, customer: Customer | null, seller: Seller | null) => Sale | null;
  
  // Expense actions
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
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
      expenses: [],
      stockMovements: [],

      addProduct: (product) =>
        set((state) => ({ products: [...state.products, product] })),

      updateProduct: (id, updates) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      adjustStock: (id, quantity, reason, notes, operator, type = 'ajuste') => {
        const state = get();
        const product = state.products.find((p) => p.id === id);
        if (!product) return;

        const newStock = Math.max(0, product.stock + quantity);
        const movement: StockMovement = {
          id: Date.now().toString(),
          productId: id,
          type,
          quantity,
          previousStock: product.stock,
          newStock,
          reason,
          notes,
          operator,
          date: new Date().toISOString(),
        };

        set({
          products: state.products.map((p) =>
            p.id === id ? { ...p, stock: newStock } : p
          ),
          stockMovements: [...state.stockMovements, movement],
        });
      },

      addStockEntry: (id, quantity, notes, operator) => {
        const state = get();
        const product = state.products.find((p) => p.id === id);
        if (!product) return;

        const newStock = product.stock + quantity;
        const movement: StockMovement = {
          id: Date.now().toString(),
          productId: id,
          type: 'entrada',
          quantity,
          previousStock: product.stock,
          newStock,
          reason: 'entrada_fornecedor',
          notes,
          operator,
          date: new Date().toISOString(),
        };

        set({
          products: state.products.map((p) =>
            p.id === id ? { ...p, stock: newStock } : p
          ),
          stockMovements: [...state.stockMovements, movement],
        });
      },

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

      processSale: (paymentMethod, customer, seller) => {
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
          customer,
          seller,
          date: new Date().toISOString(),
        };

        // Create stock movements for each sold item
        const saleMovements: StockMovement[] = state.cart.map((item) => {
          const product = state.products.find((p) => p.id === item.product.id)!;
          return {
            id: `${Date.now()}-${item.product.id}`,
            productId: item.product.id,
            type: 'venda' as MovementType,
            quantity: -item.quantity,
            previousStock: product.stock,
            newStock: Math.max(0, product.stock - item.quantity),
            reason: null,
            notes: `Venda #${sale.id}`,
            operator: seller?.name || 'Sistema',
            date: new Date().toISOString(),
          };
        });

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
          stockMovements: [...state.stockMovements, ...saleMovements],
        });

        return sale;
      },

      addExpense: (expense) =>
        set((state) => ({
          expenses: [...state.expenses, { ...expense, id: Date.now().toString() }],
        })),

      updateExpense: (id, updates) =>
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),

      deleteExpense: (id) =>
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
        })),
    }),
    { name: 'distribuidora-store' }
  )
);
