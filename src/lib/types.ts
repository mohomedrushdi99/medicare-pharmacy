export type MedicineStatus = "active" | "inactive";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "other";
export type SaleStatus = "completed" | "cancelled";
export type StockAdjustmentType = "add" | "remove" | "sale" | "correction";
export type ThemePreference = "light" | "dark" | "system";
export type SidebarAppearance = "expanded" | "compact";
export type LayoutDensity = "comfortable" | "compact";

export type PharmacySettings = {
  userId: string;
  pharmacyName: string;
  subtitle: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxVatNumber: string;
  logoData: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  currency: string;
  currencySymbol: string;
  defaultTaxPercent: number;
  defaultDiscount: number;
  invoiceFooter: string;
  termsAndConditions: string;
  accentColor: string;
  theme: ThemePreference;
  sidebarAppearance: SidebarAppearance;
  layoutDensity: LayoutDensity;
  appName: string;
  showTodaySales: boolean;
  showTodayInvoices: boolean;
  showTotalMedicines: boolean;
  showTotalStock: boolean;
  showLowStock: boolean;
  showStockValue: boolean;
  showSalesChart: boolean;
};

export type Medicine = {
  id: number;
  code: string;
  name: string;
  genericName: string;
  category: string;
  unit: string;
  purchasePriceCents: number;
  sellingPriceCents: number;
  currentStock: number;
  minStock: number;
  status: MedicineStatus;
  createdAt: string;
  updatedAt: string;
  isLowStock: boolean;
};

export type StockMovement = {
  id: number;
  medicineId: number;
  medicineCode: string;
  medicineName: string;
  adjustmentType: StockAdjustmentType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  saleId: number | null;
  createdAt: string;
};

export type SaleItem = {
  id: number;
  medicineId: number;
  medicineCode: string;
  medicineName: string;
  quantity: number;
  /** Free units given with this line (not charged). */
  bonus: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type Sale = {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  grandTotalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  notes: string;
  customerName: string;
  itemCount: number;
  createdAt: string;
  items?: SaleItem[];
};

export type DashboardStats = {
  totalMedicines: number;
  totalStock: number;
  lowStock: number;
  todaySalesCents: number;
  todayInvoices: number;
  stockValueCents: number;
  dailySales: { date: string; totalCents: number; invoices: number }[];
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

export const MEDICINE_CATEGORIES = [
  "Antibiotic",
  "Analgesic",
  "Antipyretic",
  "Antihistamine",
  "Antacid",
  "Antidiabetic",
  "Cardiovascular",
  "Respiratory",
  "Vitamin & Supplement",
  "Dermatology",
  "Gastrointestinal",
  "Other",
] as const;

export const MEDICINE_UNITS = [
  "Box",
  "Strip",
  "Bottle",
  "Vial",
  "Tube",
  "Pack",
  "Sachet",
  "Unit",
] as const;

export const ACCENT_PRESETS = [
  { name: "Teal", value: "#0F766E" },
  { name: "Emerald", value: "#047857" },
  { name: "Forest", value: "#3F6F5B" },
  { name: "Ocean", value: "#0E7490" },
  { name: "Slate", value: "#334155" },
  { name: "Ink", value: "#1E293B" },
  { name: "Copper", value: "#9A6240" },
] as const;
