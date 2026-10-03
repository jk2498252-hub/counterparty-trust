export const economics = {
  hourlyCost: Number(process.env.HOURLY_COST_KES ?? 1500),
  prices: {
    DIGITAL: Number(process.env.PRICE_DIGITAL_KES ?? 12000),
    ENHANCED: Number(process.env.PRICE_ENHANCED_KES ?? 25000),
    EXTENDED: Number(process.env.PRICE_EXTENDED_KES ?? 65000),
  } as Record<string, number>,
};

export const paymentApprovalsRequired = Math.max(2, Number(process.env.PAYMENT_APPROVALS_REQUIRED ?? 2));
