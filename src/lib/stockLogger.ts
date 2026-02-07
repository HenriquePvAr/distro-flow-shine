import { supabase } from "@/integrations/supabase/client";

export interface StockLogEntry {
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason?: string;
  notes?: string;
  operator: string;
  cost_price?: number;
}

export async function logStockMovement(entry: StockLogEntry) {
  try {
    const { error } = await supabase.from("stock_logs").insert({
      product_id: entry.product_id,
      product_name: entry.product_name,
      movement_type: entry.movement_type,
      quantity: entry.quantity,
      previous_stock: entry.previous_stock,
      new_stock: entry.new_stock,
      reason: entry.reason || null,
      notes: entry.notes || null,
      operator: entry.operator,
      cost_price: entry.cost_price || null,
    });
    if (error) {
      console.error("Erro ao salvar log de estoque:", error);
    }
  } catch (err) {
    console.error("Erro ao conectar para salvar log:", err);
  }
}

export async function logStockMovements(entries: StockLogEntry[]) {
  if (entries.length === 0) return;
  try {
    const { error } = await supabase.from("stock_logs").insert(
      entries.map((entry) => ({
        product_id: entry.product_id,
        product_name: entry.product_name,
        movement_type: entry.movement_type,
        quantity: entry.quantity,
        previous_stock: entry.previous_stock,
        new_stock: entry.new_stock,
        reason: entry.reason || null,
        notes: entry.notes || null,
        operator: entry.operator,
        cost_price: entry.cost_price || null,
      }))
    );
    if (error) {
      console.error("Erro ao salvar logs de estoque:", error);
    }
  } catch (err) {
    console.error("Erro ao conectar para salvar logs:", err);
  }
}

export interface StockLogRow {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  notes: string | null;
  operator: string;
  cost_price: number | null;
  created_at: string;
}

export async function fetchStockLogs(limit = 100): Promise<StockLogRow[]> {
  const { data, error } = await supabase
    .from("stock_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Erro ao buscar logs de estoque:", error);
    return [];
  }
  return (data as StockLogRow[]) || [];
}

export async function fetchProductStockLogs(productId: string): Promise<StockLogRow[]> {
  const { data, error } = await supabase
    .from("stock_logs")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar logs do produto:", error);
    return [];
  }
  return (data as StockLogRow[]) || [];
}
