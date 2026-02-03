import { Sale } from "@/store/useStore";

const DISTRIBUTOR_NAME = "Distribuidora XYZ";

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const generateWhatsAppReceipt = (sale: Sale): string => {
  const date = new Date(sale.date);
  const formattedDate = date.toLocaleDateString("pt-BR");
  const formattedTime = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let message = `🏪 *${DISTRIBUTOR_NAME}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `🧾 *COMPROVANTE DE VENDA*\n`;
  message += `📅 Data: ${formattedDate}\n`;
  message += `⏰ Hora: ${formattedTime}\n`;
  message += `🆔 Pedido: #${sale.id.slice(-6)}\n\n`;

  if (sale.customer && sale.customer.name !== "Cliente Avulso") {
    message += `👤 *Cliente:* ${sale.customer.name}\n`;
  }
  if (sale.seller) {
    message += `🧑‍💼 *Vendedor:* ${sale.seller.name}\n`;
  }
  message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📦 *ITENS DO PEDIDO*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  sale.items.forEach((item, index) => {
    message += `${index + 1}. *${item.product.name}*\n`;
    message += `   Qtd: ${item.quantity} x ${formatCurrency(item.product.salePrice)}\n`;
    message += `   Subtotal: ${formatCurrency(item.product.salePrice * item.quantity)}\n\n`;
  });

  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (sale.payments && sale.payments.length > 0) {
    if (sale.payments.length === 1) {
      message += `💳 *Forma de Pagamento:* ${sale.payments[0].method}\n`;
    } else {
      message += `💳 *Formas de Pagamento:*\n`;
      sale.payments.forEach((payment) => {
        message += `   • ${payment.method}: ${formatCurrency(payment.amount)}\n`;
      });
    }
  } else {
    message += `💳 *Forma de Pagamento:* ${sale.paymentMethod}\n`;
  }
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `💰 *TOTAL: ${formatCurrency(sale.total)}*\n\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `✨ *Obrigado pela preferência!*\n`;
  message += `🙏 Agradecemos por escolher a ${DISTRIBUTOR_NAME}.\n`;
  message += `📞 Dúvidas? Entre em contato conosco!\n\n`;
  message += `_Volte sempre!_ 💙`;

  return encodeURIComponent(message);
};

export const openWhatsApp = (phone: string, message: string) => {
  const cleanPhone = phone.replace(/\D/g, "");
  window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
};
