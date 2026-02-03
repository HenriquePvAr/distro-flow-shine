import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  category: string;
  supplier: string;
  imageUrl?: string;
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

export type SaleStatus = 'active' | 'cancelled';

export interface PaymentEntry {
  method: string;
  amount: number;
}

export interface Sale {
  id: string;
  items: CartItem[];
  total: number;
  profit: number;
  payments: PaymentEntry[];
  /** @deprecated Use payments array instead */
  paymentMethod: string;
  customer: Customer | null;
  seller: Seller | null;
  date: string;
  status: SaleStatus;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
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
  processSale: (payments: PaymentEntry[], customer: Customer | null, seller: Seller | null) => Sale | null;
  cancelSale: (saleId: string, reason: string, operator: string) => void;
  
  // Expense actions
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
}

export const productCategories = ['Bebidas', 'Alimentos', 'Limpeza', 'Higiene', 'Outros'] as const;
export const productSuppliers = ['Distribuidora Central', 'Atacado Brasil', 'Fornecedor Direto', 'Outros'] as const;

const initialProducts: Product[] = [
  { id: '1', name: 'Coca-Cola 2L', sku: 'BEB001', description: 'Refrigerante Coca-Cola 2 litros', costPrice: 5.50, salePrice: 8.99, stock: 48, minStock: 10, category: 'Bebidas', supplier: 'Distribuidora Central' },
  { id: '2', name: 'Água Mineral 500ml', sku: 'BEB002', description: 'Água mineral sem gás', costPrice: 0.80, salePrice: 2.50, stock: 120, minStock: 20, category: 'Bebidas', supplier: 'Distribuidora Central' },
  { id: '3', name: 'Cerveja Lata 350ml', sku: 'BEB003', description: 'Cerveja pilsen lata', costPrice: 2.20, salePrice: 4.99, stock: 72, minStock: 24, category: 'Bebidas', supplier: 'Atacado Brasil' },
  { id: '4', name: 'Arroz 5kg', sku: 'ALM001', description: 'Arroz tipo 1 pacote 5kg', costPrice: 18.00, salePrice: 27.90, stock: 25, minStock: 10, category: 'Alimentos', supplier: 'Atacado Brasil' },
  { id: '5', name: 'Feijão 1kg', sku: 'ALM002', description: 'Feijão carioca tipo 1', costPrice: 6.50, salePrice: 9.99, stock: 40, minStock: 15, category: 'Alimentos', supplier: 'Atacado Brasil' },
  { id: '6', name: 'Óleo de Soja 900ml', sku: 'ALM003', description: 'Óleo de soja refinado', costPrice: 5.80, salePrice: 8.49, stock: 35, minStock: 10, category: 'Alimentos', supplier: 'Fornecedor Direto' },
  { id: '7', name: 'Sabão em Pó 1kg', sku: 'LIM001', description: 'Sabão em pó multiuso', costPrice: 8.00, salePrice: 14.90, stock: 3, minStock: 5, category: 'Limpeza', supplier: 'Distribuidora Central' },
  { id: '8', name: 'Detergente 500ml', sku: 'LIM002', description: 'Detergente líquido neutro', costPrice: 1.50, salePrice: 3.49, stock: 60, minStock: 20, category: 'Limpeza', supplier: 'Distribuidora Central' },
  { id: '9', name: 'Papel Higiênico 12un', sku: 'HIG001', description: 'Papel higiênico folha dupla 12 rolos', costPrice: 12.00, salePrice: 19.90, stock: 2, minStock: 5, category: 'Higiene', supplier: 'Fornecedor Direto' },
  { id: '10', name: 'Sabonete 90g', sku: 'HIG002', description: 'Sabonete em barra perfumado', costPrice: 1.20, salePrice: 2.99, stock: 80, minStock: 30, category: 'Higiene', supplier: 'Fornecedor Direto' },
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

      processSale: (payments, customer, seller) => {
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

        // Legacy: keep paymentMethod for backwards compatibility
        const primaryMethod = payments.length > 0 ? payments[0].method : 'Dinheiro';

        const sale: Sale = {
          id: Date.now().toString(),
          items: [...state.cart],
          total,
          profit,
          payments,
          paymentMethod: primaryMethod,
          customer,
          seller,
          date: new Date().toISOString(),
          status: 'active',
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

      cancelSale: (saleId, reason, operator) => {
        const state = get();
        const sale = state.sales.find((s) => s.id === saleId);
        if (!sale || sale.status === 'cancelled') return;

        // Create stock movements to return items
        const returnMovements: StockMovement[] = sale.items.map((item) => {
          const product = state.products.find((p) => p.id === item.product.id)!;
          return {
            id: `${Date.now()}-return-${item.product.id}`,
            productId: item.product.id,
            type: 'entrada' as MovementType,
            quantity: item.quantity,
            previousStock: product.stock,
            newStock: product.stock + item.quantity,
            reason: 'outros' as AdjustmentReason,
            notes: `Estorno da venda #${sale.id} - ${reason}`,
            operator,
            date: new Date().toISOString(),
          };
        });

        // Return items to stock
        const updatedProducts = state.products.map((product) => {
          const saleItem = sale.items.find((item) => item.product.id === product.id);
          if (saleItem) {
            return { ...product, stock: product.stock + saleItem.quantity };
          }
          return product;
        });

        // Update sale status
        const updatedSales = state.sales.map((s) =>
          s.id === saleId
            ? {
                ...s,
                status: 'cancelled' as SaleStatus,
                cancelledAt: new Date().toISOString(),
                cancelledBy: operator,
                cancelReason: reason,
              }
            : s
        );

        set({
          products: updatedProducts,
          sales: updatedSales,
          stockMovements: [...state.stockMovements, ...returnMovements],
        });
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
