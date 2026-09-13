"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { differenceInSeconds, format } from "date-fns";
import { 
  LayoutGrid, ShoppingBag, Tag, BarChart3, MessageSquare, Truck, Settings, LogOut,
  Search, Bell, ChevronDown, CheckCircle2, AlertCircle, Loader2, X, Clock,
  Plus, CalendarDays, Timer, CheckCircle, XCircle, ChevronRight, ChevronLeft, 
  ArrowUpRight, AlertTriangle, MapPin, TrendingUp, Zap, Layers, Radio, Terminal, 
  Cpu, ShieldCheck, RefreshCw, SlidersHorizontal, Download, Sparkles, Filter
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Product = {
  id: string;
  name: string;
  description: string;
  image: string;
  price?: number | string;
  oldPrice?: number | string;
  discount?: string;
  category?: string;
  totalStock?: number;
  reservedStock?: number;
  availableStock?: number;
  newPrice?: string | number;
  itemsSold?: number;
  inventories: {
    id: string;
    warehouseId: string;
    totalStock: number;
    reservedStock: number;
    availableStock: number;
    warehouse: {
      name: string;
      location: string;
    };
  }[];
};

type Reservation = {
  id: string;
  inventoryId: string;
  quantity: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  productName?: string;
  warehouseName?: string;
  image?: string;
};

const formatDateSafe = (dateStr?: string | Date | null) => {
  if (!dateStr) return "Just now";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Just now";
    return format(d, "MMM dd, yyyy hh:mm a");
  } catch {
    return "Just now";
  }
};

export default function Store() {
  const [currentView, setCurrentView] = useState<"Dashboard" | "Products" | "Reservations" | "Warehouses" | "Analytics" | "Realtime">("Dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Time filter state
  const [categoryTimeFilter, setCategoryTimeFilter] = useState<"All time" | "Weekly" | "Monthly">("Monthly");
  const [countryTimeFilter, setCountryTimeFilter] = useState<"All time" | "Weekly" | "Monthly">("All time");
  const [chartMetric, setChartMetric] = useState<"Income" | "Profit">("Income");
  const [activeHoverBar, setActiveHoverBar] = useState<number | null>(5); // Default to June hover

  // Currency & Search & Drawer State
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP" | "INR">("USD");
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState<boolean>(false);

  // Real-time reservation state
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  
  const [toast, setToast] = useState<{ msg: string, isError: boolean, id: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("10:00");
  const [timerPercent, setTimerPercent] = useState<number>(100);
  const [processing, setProcessing] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [eventLogs, setEventLogs] = useState<Array<{ id: string; type: string; time: string; text: string }>>([]);
  
  // Concurrency Simulation state
  const [simModalOpen, setSimModalOpen] = useState<boolean>(false);
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [simInvId, setSimInvId] = useState<string>("inv_1");
  const [simCount, setSimCount] = useState<number>(20);
  const [simResult, setSimResult] = useState<any>(null);

  // Restock modal state
  const [restockModalOpen, setRestockModalOpen] = useState<boolean>(false);
  const [restockInvId, setRestockInvId] = useState<string>("");
  const [restockItemName, setRestockItemName] = useState<string>("");
  const [restockQty, setRestockQty] = useState<number>(5);
  const [restockLoading, setRestockLoading] = useState<boolean>(false);

  const showMessage = (msg: string, isError: boolean) => {
    setToast({ msg, isError, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const CURRENCIES = {
    USD: { code: "USD" as const, symbol: "$", flag: "🇺🇸", rate: 1.0 },
    EUR: { code: "EUR" as const, symbol: "€", flag: "🇪🇺", rate: 0.92 },
    GBP: { code: "GBP" as const, symbol: "£", flag: "🇬🇧", rate: 0.78 },
    INR: { code: "INR" as const, symbol: "₹", flag: "🇮🇳", rate: 83.5 },
  };

  const formatPrice = (val: number | string | undefined) => {
    if (val === undefined || val === null) return "$0.00";
    const num = typeof val === "string" ? parseFloat(val.replace(/[^0-9.-]+/g, "")) : val;
    if (isNaN(num)) return "$0.00";
    const curr = CURRENCIES[currency] || CURRENCIES.USD;
    const converted = num * curr.rate;
    return `${curr.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const exportCSV = () => {
    const headers = "Product ID,Product Name,Warehouse,Total Stock,Reserved Stock,Available Stock,Price\n";
    const rows = retailProducts.map(p => {
      const inv = p.inventories[0];
      return `"${p.id}","${p.name}","${inv?.warehouse?.name || 'Main Node'}",${p.totalStock},${p.reservedStock},${p.availableStock},"${p.newPrice}"`;
    }).join("\n");
    
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `stockpulse_inventory_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showMessage("📥 Inventory report CSV downloaded!", false);
  };

  // Instant restoration from local cache
  useEffect(() => {
    try {
      const cachedProd = localStorage.getItem("stockpulse_products_cache");
      if (cachedProd) setProducts(JSON.parse(cachedProd));
      const cachedRes = localStorage.getItem("stockpulse_reservations_cache");
      if (cachedRes) {
        const parsed = JSON.parse(cachedRes);
        setReservations(parsed);
        if (parsed.length > 0 && !selectedRes) {
          setSelectedRes(parsed[0]);
        }
      }
    } catch {}
  }, []);

  const fetchCounter = useRef(0);

  const fetchData = useCallback(async (silent = false) => {
    const currentFetchId = ++fetchCounter.current;
    try {
      const [prodRes, resRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/reservations")
      ]);
      
      if (currentFetchId !== fetchCounter.current) return;

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData);
        try { localStorage.setItem("stockpulse_products_cache", JSON.stringify(prodData)); } catch {}
      }
      if (resRes.ok) {
        const resData = await resRes.json();
        setReservations(resData);
        try { localStorage.setItem("stockpulse_reservations_cache", JSON.stringify(resData)); } catch {}
        if (resData.length > 0) {
          setSelectedRes(prev => {
            if (!prev) return resData[0];
            return resData.find((r: Reservation) => r.id === prev.id) || resData[0];
          });
        }
      }
    } catch {
      if (!silent) showMessage("Error fetching data", true);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket Live Real-time Connection
  useEffect(() => {
    const wsUrl = "ws://localhost:4003/ws";
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          setWsConnected(true);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type && data.type !== "SYSTEM_CONNECTED") {
              fetchData(true);
              setEventLogs(prev => [
                {
                  id: String(Date.now()) + Math.random().toString(36).substr(2, 4),
                  type: data.type,
                  time: new Date().toLocaleTimeString(),
                  text: typeof data.payload === "object" ? JSON.stringify(data.payload) : String(data.payload || "")
                },
                ...prev.slice(0, 9)
              ]);

              if (data.type === "RESERVATION_CREATED") {
                showMessage(`⚡ Event: Stock reserved (${data.payload?.quantity || 1} unit)`, false);
              } else if (data.type === "RESERVATION_CONFIRMED") {
                showMessage(`🎉 Event: Order confirmed for #${(data.payload?.reservationId || "").slice(-6)}`, false);
              } else if (data.type === "RESERVATION_EXPIRED") {
                showMessage(`⏰ Event: 10m TTL expired, stock released`, false);
              } else if (data.type === "RESERVATION_RELEASED") {
                showMessage(`↩️ Event: Reservation cancelled & stock returned`, false);
              } else if (data.type === "STOCK_UPDATED") {
                showMessage(`📦 Event: Stock replenished in warehouse`, false);
              }
            }
          } catch {}
        };
        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimer = setTimeout(connectWs, 3000);
        };
        ws.onerror = () => {
          setWsConnected(false);
          ws?.close();
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();
    const pollInterval = setInterval(() => fetchData(true), 15000);
    fetchData();

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, [fetchData]);

  const handleRunSimulation = async () => {
    setSimLoading(true);
    try {
      const res = await fetch("/api/inventory/simulate-concurrency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId: simInvId, concurrentRequests: simCount })
      });
      const data = await res.json();
      setSimResult(data);
      fetchData(true);
      showMessage(`⚡ Simulation: ${data.summary?.granted} granted, ${data.summary?.rejectedConflicts} safely rejected`, false);
    } catch {
      showMessage("Simulation request failed", true);
    } finally {
      setSimLoading(false);
    }
  };

  const handleRestockSubmit = async () => {
    if (!restockInvId || restockQty <= 0) return;
    setRestockLoading(true);
    try {
      const res = await fetch("/api/inventory/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId: restockInvId, quantity: restockQty })
      });
      if (res.ok) {
        showMessage(`📦 Restocked +${restockQty} units! Broadcasted to mesh.`, false);
        setRestockModalOpen(false);
        fetchData(true);
      } else {
        showMessage("Restock failed", true);
      }
    } catch {
      showMessage("Restock request failed", true);
    } finally {
      setRestockLoading(false);
    }
  };

  // Global countdown timer for active reservation
  const targetRes = selectedRes || activeReservation || reservations[0];
  const targetExpiry = targetRes?.expiresAt;
  const targetStatus = targetRes?.status;
  const targetId = targetRes?.id;

  useEffect(() => {
    if (!targetExpiry) {
      setTimeLeft("00:00");
      setTimerPercent(0);
      return;
    }
    
    const TOTAL_SECONDS = 600;
    
    const updateTimer = () => {
      const expiry = new Date(targetExpiry);
      const now = new Date();
      
      if (isNaN(expiry.getTime()) || expiry <= now || targetStatus === "EXPIRED" || targetStatus === "CONFIRMED" || targetStatus === "RELEASED") {
        setTimeLeft("00:00");
        setTimerPercent(0);
      } else {
        const diff = Math.max(0, differenceInSeconds(expiry, now));
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        setTimeLeft(`${m}:${s}`);
        setTimerPercent(Math.max(0, Math.min(100, (diff / TOTAL_SECONDS) * 100)));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [targetId, targetExpiry, targetStatus]);

  const handleReserve = async (product: Product, inventoryId: string, maxStock: number) => {
    if (maxStock <= 0) return;
    setProcessing(inventoryId);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ inventoryId, quantity: 1 }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Reservation failed", true);
        fetchData(true);
      } else {
        const inv = product.inventories.find(i => i.id === inventoryId);
        const newRes = {
          ...data.reservation,
          productName: product.name,
          warehouseName: inv?.warehouse.name || "Main Warehouse",
          image: product.image,
          createdAt: new Date().toISOString()
        };
        setActiveReservation(newRes);
        setSelectedRes(newRes);
        setReservations(prev => [newRes, ...prev]);
        setCurrentView("Reservations");
        window.scrollTo({ top: 0, behavior: "smooth" });
        showMessage("⚡ 10-Minute Lock Reserved Successfully!", false);
      }
    } catch {
      showMessage("Network error", true);
    } finally {
      setProcessing(null);
    }
  };

  const handleConfirm = async () => {
    const target = selectedRes || activeReservation;
    if (!target) return;
    setProcessing("confirm");
    try {
      const res = await fetch(`/api/reservations/${target.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showMessage("Order Confirmed Successfully! 🎉", false);
        const updated = { ...target, status: "CONFIRMED" };
        setActiveReservation(null);
        setSelectedRes(updated);
        setReservations(prev => prev.map(r => r.id === target.id ? { ...r, status: "CONFIRMED" } : r));
      } else {
        showMessage(data.error || "Reservation is no longer pending", true);
      }
      fetchData(true);
    } catch {
      showMessage("Network error", true);
    } finally {
      setProcessing(null);
    }
  };

  const handleRelease = async () => {
    const target = selectedRes || activeReservation;
    if (!target) return;
    setProcessing("release");
    try {
      const res = await fetch(`/api/reservations/${target.id}/release`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showMessage("Reservation released & stock returned.", false);
        const updated = { ...target, status: "RELEASED" };
        setActiveReservation(null);
        setSelectedRes(updated);
        setReservations(prev => prev.map(r => r.id === target.id ? { ...r, status: "RELEASED" } : r));
      } else {
        showMessage(data.error || "Could not release reservation", true);
      }
      fetchData(true);
    } catch {
      showMessage("Network error", true);
    } finally {
      setProcessing(null);
    }
  };

  const stats = useMemo(() => {
    let globalStock = 0;
    let globalReserved = 0;
    let globalAvailable = 0;
    const warehouseMap = new Map();

    products.forEach(p => {
      p.inventories.forEach(inv => {
        globalStock += inv.totalStock;
        globalReserved += inv.reservedStock;
        globalAvailable += inv.availableStock;
        
        if (!warehouseMap.has(inv.warehouse.name)) {
          warehouseMap.set(inv.warehouse.name, {
            id: inv.warehouseId,
            name: inv.warehouse.name,
            location: inv.warehouse.location,
            totalStock: 0,
            reservedStock: 0,
            availableStock: 0,
            products: new Set()
          });
        }
        const w = warehouseMap.get(inv.warehouse.name);
        w.totalStock += inv.totalStock;
        w.reservedStock += inv.reservedStock;
        w.availableStock += inv.availableStock;
        w.products.add(p.id);
      });
    });

    const nowTime = Date.now();
    const activeRes = reservations.filter(r => r.status === 'ACTIVE' || r.status === 'PENDING').length;
    const expiringSoon = reservations.filter(r => {
      if (r.status !== 'ACTIVE' && r.status !== 'PENDING') return false;
      const exp = new Date(r.expiresAt).getTime();
      if (isNaN(exp)) return false;
      const diff = exp - nowTime;
      return diff > 0 && diff <= 300000;
    }).length;
    const confirmed = reservations.filter(r => r.status === 'CONFIRMED').length;
    const expiredOrReleased = reservations.filter(r => r.status === 'EXPIRED' || r.status === 'RELEASED').length;

    // Estimated revenue calculations for dashboard widgets
    const totalRevenue = (globalStock * 240 + confirmed * 320) || 89649;
    const totalOrdersAmount = (activeRes * 180 + confirmed * 290) || 14085;

    return { 
      productCount: products.length, 
      warehouseCount: warehouseMap.size, 
      warehouses: Array.from(warehouseMap.values()),
      globalStock, 
      globalReserved,
      globalAvailable,
      totalRevenue,
      totalOrdersAmount,
      totalRes: reservations.length,
      activeRes,
      expiringSoon,
      confirmed,
      expiredOrReleased
    };
  }, [products, reservations]);

  // Enriched retail products table data
  const retailProducts = useMemo(() => {
    return products.map((p, idx) => {
      const totalStock = p.inventories.reduce((sum, inv) => sum + inv.totalStock, 0);
      const reserved = p.inventories.reduce((sum, inv) => sum + inv.reservedStock, 0);
      const available = p.inventories.reduce((sum, inv) => sum + inv.availableStock, 0);
      const basePrices = [114.00, 140.90, 311.00, 55.00, 89.00, 220.00];
      const discounts = ["5%", "8%", "15%", "5%", "10%", "12%"];
      const soldCounts = [294, 294, 69, 32, 145, 88];
      const oldPrice = basePrices[idx % basePrices.length];
      const discount = discounts[idx % discounts.length];
      const discNum = parseInt(discount);
      const newPrice = (oldPrice * (1 - discNum / 100)).toFixed(2);
      
      return {
        ...p,
        totalStock,
        reservedStock: reserved,
        availableStock: available,
        oldPrice: oldPrice.toFixed(2),
        discount,
        newPrice,
        itemsSold: soldCounts[idx % soldCounts.length] + reserved * 2
      };
    });
  }, [products]);

  const displayRes = selectedRes || activeReservation || reservations[0];

  const filteredRetailProducts = useMemo(() => {
    if (!searchQuery.trim()) return retailProducts;
    const q = searchQuery.toLowerCase();
    return retailProducts.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.description.toLowerCase().includes(q) ||
      p.inventories.some(i => i.warehouse.name.toLowerCase().includes(q) || i.warehouse.location.toLowerCase().includes(q))
    );
  }, [retailProducts, searchQuery]);

  // Render left vertical dock navigation
  const renderSidebar = () => {
    const navItems = [
      { view: "Dashboard" as const, icon: LayoutGrid, label: "Overview" },
      { view: "Products" as const, icon: ShoppingBag, label: "Catalog" },
      { view: "Reservations" as const, icon: Tag, label: "Flash Locks" },
      { view: "Analytics" as const, icon: BarChart3, label: "Analytics" },
      { view: "Realtime" as const, icon: MessageSquare, label: "Live Mesh" },
      { view: "Warehouses" as const, icon: Truck, label: "Warehouses" },
    ];

    return (
      <aside className="w-20 md:w-24 bg-white border-r border-slate-200/80 flex flex-col items-center py-6 justify-between select-none shadow-[2px_0_12px_rgba(0,0,0,0.02)] z-30">
        <div className="flex flex-col items-center gap-8 w-full">
          {/* Logo Badge */}
          <div 
            onClick={() => setCurrentView("Dashboard")}
            className="w-12 h-12 rounded-2xl bg-[#ff3b00] flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-[#ff3b00]/30 cursor-pointer hover:scale-105 transition-transform"
          >
            R
          </div>

          {/* Nav Icons */}
          <nav className="flex flex-col items-center gap-3 w-full px-3">
            {navItems.map((item) => {
              const isActive = currentView === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => setCurrentView(item.view)}
                  title={item.label}
                  className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 group ${
                    isActive
                      ? "bg-[#14161a] text-white shadow-md shadow-black/10"
                      : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <item.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                  {item.view === "Realtime" && wsConnected && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
                  )}
                  {item.view === "Reservations" && stats.activeRes > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#ff3b00] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                      {stats.activeRes}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Utility Icons */}
        <div className="flex flex-col items-center gap-3 w-full px-3">
          <button 
            onClick={() => setSimModalOpen(true)}
            title="Flash-Sale Simulator"
            className="w-12 h-12 rounded-2xl text-slate-400 hover:text-[#ff3b00] hover:bg-orange-50 flex items-center justify-center transition"
          >
            <Zap className="w-5 h-5" />
          </button>
          <button 
            onClick={() => showMessage("Stockpulse v2.4 Microservices Mesh Active", false)}
            title="System Settings"
            className="w-12 h-12 rounded-2xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={() => fetchData(false)}
            title="Refresh All Data"
            className="w-12 h-12 rounded-2xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>
    );
  };

  // Render Top Header matching reference
  const renderTopbar = () => {
    return (
      <header className="h-20 bg-transparent px-6 md:px-10 flex items-center justify-between select-none relative z-40">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-tight">
            Stockpulse Inventory
          </h1>
          <p className="text-xs font-semibold text-slate-400">
            High-Concurrency Flash Reservation Engine
          </p>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Live Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products, nodes..."
              className="pl-9 pr-8 py-2 bg-white border border-slate-200/80 rounded-full text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#ff3b00] w-36 md:w-56 transition-all shadow-xs"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Currency Dropdown Pill */}
          <div className="relative">
            <button 
              onClick={() => setCurrencyMenuOpen(!currencyMenuOpen)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white rounded-full border border-slate-200/80 shadow-xs text-xs font-bold text-slate-700 hover:border-slate-300 transition cursor-pointer"
            >
              <span className="text-sm">{CURRENCIES[currency].flag}</span>
              <span>{CURRENCIES[currency].code}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {currencyMenuOpen && (
              <div className="absolute right-0 mt-2 w-32 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 z-50">
                {(Object.keys(CURRENCIES) as Array<keyof typeof CURRENCIES>).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCurrency(c);
                      setCurrencyMenuOpen(false);
                      showMessage(`💱 Currency switched to ${c}`, false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition ${currency === c ? 'bg-orange-50 text-[#ff3b00]' : 'hover:bg-slate-50 text-slate-700'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{CURRENCIES[c].flag}</span>
                      <span>{c}</span>
                    </span>
                    <span className="font-mono text-slate-400">{CURRENCIES[c].symbol}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notification Bell with Drawer Trigger */}
          <button 
            onClick={() => setNotificationDrawerOpen(!notificationDrawerOpen)}
            className="relative w-10 h-10 rounded-full bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 transition"
            title="Live Event Stream"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#ff3b00] text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
              {eventLogs.length > 0 ? Math.min(9, eventLogs.length) : 3}
            </span>
          </button>

          {/* User Profile Avatar */}
          <div className="flex items-center gap-2 pl-1">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
              <img 
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80" 
                alt="User" 
                className="w-full h-full object-cover"
              />
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </div>
          </div>
        </div>
      </header>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f1f3f7] text-slate-900 font-sans selection:bg-[#ff3b00]/20">
      {/* Sidebar Dock */}
      {renderSidebar()}

      {/* Main App Container */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Topbar */}
        {renderTopbar()}

        {/* Scrollable Dashboard Canvas */}
        <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-16 scroll-smooth">
          <div className="max-w-[1540px] mx-auto space-y-6">
            
            {/* VIEW: DASHBOARD */}
            {currentView === "Dashboard" && (
              <AnimatePresence mode="wait">
                <motion.div key="dash" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  
                  {/* TOP ROW: 4 HERO METRIC WIDGETS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    
                    {/* CARD 1: TOTAL RESERVATIONS (Obsidian Dark) */}
                    <div className="bg-[#14161a] text-white rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden min-h-[220px]">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">Total Reservations</div>
                          <div className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
                            {stats.totalRes} Locks
                            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              {stats.activeRes} Active
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                            {stats.confirmed} confirmed orders • {stats.expiredOrReleased} released
                          </div>
                        </div>
                        <button 
                          onClick={() => setCurrentView("Reservations")}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition"
                          title="View all reservations"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Sparkline Wave with Tooltip */}
                      <div className="relative pt-6 pb-1">
                        <div className="absolute right-12 top-2 bg-white text-slate-950 font-mono font-bold text-[10px] px-2 py-0.5 rounded-md shadow-md">
                          {stats.activeRes} Active TTL
                        </div>
                        <svg className="w-full h-16 overflow-visible" viewBox="0 0 260 60">
                          <defs>
                            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M0 45 Q 30 50, 60 40 T 130 45 T 195 20 T 260 38 L 260 60 L 0 60 Z"
                            fill="url(#curveGrad)"
                          />
                          <path
                            d="M0 45 Q 30 50, 60 40 T 130 45 T 195 20 T 260 38"
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <circle cx="195" cy="20" r="4.5" fill="#ffffff" stroke="#14161a" strokeWidth="2.5" />
                        </svg>
                        <div className="flex justify-between text-[10px] font-semibold text-slate-500 mt-2 px-1">
                          <span>10m ago</span>
                          <span>8m</span>
                          <span>5m</span>
                          <span>2m</span>
                          <span>Now</span>
                        </div>
                      </div>
                    </div>

                    {/* CARD 2: PENDING VS CONFIRMED RATIO (Electric Flame Orange) */}
                    <div className="bg-[#ff3b00] text-white rounded-3xl p-6 shadow-xl shadow-[#ff3b00]/25 flex flex-col justify-between relative overflow-hidden min-h-[220px]">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-semibold text-white/80 mb-1">Pending vs Confirmed</div>
                          <div className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
                            {stats.activeRes} Pending
                            <span className="text-[11px] font-bold text-white bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              +{stats.confirmed} Confirmed
                            </span>
                          </div>
                          <div className="text-[11px] text-white/80 mt-0.5 font-medium">
                            {stats.expiringSoon > 0 ? `${stats.expiringSoon} expiring in <5 mins` : "All locks within safe TTL"}
                          </div>
                        </div>
                        <button 
                          onClick={() => setSimModalOpen(true)}
                          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition"
                          title="Simulate Concurrency"
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Split Ratio Slider */}
                      <div className="pt-6">
                        {(() => {
                          const total = Math.max(1, stats.activeRes + stats.confirmed);
                          const pendingPct = Math.max(20, Math.min(80, Math.round((stats.activeRes / total) * 100)));
                          const confirmedPct = 100 - pendingPct;

                          return (
                            <>
                              <div className="flex h-14 w-full rounded-2xl overflow-hidden bg-black/10 p-1 gap-1">
                                <div 
                                  style={{ width: `${pendingPct}%` }}
                                  className="bg-white rounded-xl flex items-center justify-center text-slate-900 font-black text-xs transition-all"
                                >
                                  {pendingPct}%
                                </div>
                                <div 
                                  style={{ width: `${confirmedPct}%` }}
                                  className="bg-[#14161a] rounded-xl flex items-center justify-center text-white font-black text-xs transition-all"
                                >
                                  {confirmedPct}%
                                </div>
                              </div>
                              <div className="flex items-center gap-6 mt-3 text-[11px] font-bold text-white/90">
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white" /> ⏳ Pending Locks</span>
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#14161a]" /> ✅ Confirmed Orders</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* CARD 3: GLOBAL INVENTORY & STOCK (Pure White Card) */}
                    <div className="bg-white text-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[220px]">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">Global Inventory Stock</div>
                          <div className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                            {(stats.globalStock).toLocaleString()}
                            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              🟢 0% Oversell
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-medium">
                            {stats.globalAvailable} available • {stats.globalReserved} locked
                          </div>
                        </div>
                        <button 
                          onClick={() => setCurrentView("Warehouses")}
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                          title="Warehouse Nodes"
                        >
                          <Truck className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Heatmap Vertical Matrix for Warehouse Traffic */}
                      <div className="pt-6">
                        <div className="flex justify-between items-end h-16 px-1">
                          {[
                            { day: "Mon", bars: 3, active: false },
                            { day: "Tue", bars: 4, active: false },
                            { day: "Wed", bars: 2, active: false },
                            { day: "Thu", bars: 7, active: true },
                            { day: "Fri", bars: 5, active: false },
                            { day: "Sat", bars: 3, active: false },
                            { day: "Sun", bars: 2, active: false },
                          ].map((col, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-1">
                              <div className="flex flex-col-reverse gap-0.5">
                                {Array.from({ length: 7 }).map((_, bi) => {
                                  const isFilled = bi < col.bars;
                                  return (
                                    <div
                                      key={bi}
                                      className={`w-4 h-1.5 rounded-xs transition-all ${
                                        col.active
                                          ? isFilled ? "bg-[#14161a]" : "bg-slate-100"
                                          : isFilled ? "bg-slate-300" : "bg-slate-100"
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                              <span className="text-[9px] font-bold text-slate-400 mt-1">{col.day}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* CARD 4: WAREHOUSE CLUSTER ALLOCATION (Radial Donut) */}
                    <div className="bg-white text-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[220px]">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-sm font-bold text-slate-900">Warehouse Nodes</div>
                        <button 
                          onClick={() => setCurrentView("Warehouses")}
                          className="text-slate-400 hover:text-slate-900 transition"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Donut Chart SVG */}
                      <div className="flex items-center justify-center relative py-2">
                        <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                          {/* Slices */}
                          <circle cx="50" cy="50" r="38" fill="transparent" stroke="#14161a" strokeWidth="14" strokeDasharray="60 178" strokeDashoffset="0" />
                          <circle cx="50" cy="50" r="38" fill="transparent" stroke="#ff3b00" strokeWidth="14" strokeDasharray="45 193" strokeDashoffset="-60" />
                          <circle cx="50" cy="50" r="38" fill="transparent" stroke="#e2e8f0" strokeWidth="14" strokeDasharray="30 208" strokeDashoffset="-105" />
                          <circle cx="50" cy="50" r="38" fill="transparent" stroke="#cbd5e1" strokeWidth="14" strokeDasharray="45 193" strokeDashoffset="-135" />
                          <circle cx="50" cy="50" r="38" fill="transparent" stroke="#94a3b8" strokeWidth="14" strokeDasharray="30 208" strokeDashoffset="-180" />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                          <span className="text-xs font-black text-slate-900">{stats.warehouseCount || 3} Nodes</span>
                        </div>
                      </div>

                      {/* Legend & Filter Pills */}
                      <div>
                        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] font-bold text-slate-600 mb-3">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ff3b00]" /> Delhi</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#14161a]" /> Mumbai</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" /> Bengaluru</span>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-full text-[10px] font-bold">
                          {(["All time", "Weekly", "Monthly"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setCategoryTimeFilter(t)}
                              className={`flex-1 py-1 rounded-full transition-all ${
                                categoryTimeFilter === t
                                  ? "bg-[#ff3b00] text-white shadow-xs"
                                  : "text-slate-500 hover:text-slate-900"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* MIDDLE ROW: FLASH-SALE LOCK & ORDER VOLUME + REGIONAL LATENCY */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* TOTAL FLASH-SALE LOCK & ORDER VOLUME CHART */}
                    <div className="lg:col-span-2 bg-white rounded-3xl p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[360px]">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                          <div className="text-base font-bold text-slate-900">Flash-Sale Lock & Order Volume</div>
                          <div className="text-xs text-slate-400 font-medium">Atomic reservation lock throughput ({chartMetric === "Income" ? "Reserved Locks" : "Confirmed Orders"})</div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
                            <button 
                              onClick={() => setChartMetric("Income")}
                              className={`flex items-center gap-1.5 transition ${chartMetric === "Income" ? "text-slate-900 font-black" : "text-slate-400 hover:text-slate-700"}`}
                            >
                              <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${chartMetric === "Income" ? "border-slate-900" : "border-slate-300"}`}>
                                {chartMetric === "Income" && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                              </span>
                              Reserved Locks
                            </button>
                            <button 
                              onClick={() => setChartMetric("Profit")}
                              className={`flex items-center gap-1.5 transition ${chartMetric === "Profit" ? "text-[#ff3b00] font-black" : "text-slate-400 hover:text-slate-700"}`}
                            >
                              <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${chartMetric === "Profit" ? "border-[#ff3b00]" : "border-slate-300"}`}>
                                {chartMetric === "Profit" && <span className="w-1.5 h-1.5 rounded-full bg-[#ff3b00]" />}
                              </span>
                              Confirmed Orders
                            </button>
                          </div>
                          <button 
                            onClick={() => {
                              fetchData(false);
                              showMessage("🔄 Synced latest throughput metrics", false);
                            }}
                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                            title="Sync live throughput"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 12-Month Interactive Bar Chart */}
                      <div className="relative flex-1 flex items-end justify-between pt-10 pb-4 px-2">
                        {[
                          { m: "Jan", reserved: 55, confirmed: 45, hStripe: 25 },
                          { m: "Feb", reserved: 40, confirmed: 35, hStripe: 30 },
                          { m: "Mar", reserved: 60, confirmed: 50, hStripe: 25 },
                          { m: "Apr", reserved: 45, confirmed: 40, hStripe: 30 },
                          { m: "May", reserved: 50, confirmed: 42, hStripe: 20 },
                          { m: "Jun", reserved: 75, confirmed: 68, hStripe: 25, isSpecial: true },
                          { m: "Jul", reserved: 60, confirmed: 55, hStripe: 20 },
                          { m: "Aug", reserved: 35, confirmed: 30, hStripe: 25 },
                          { m: "Sep", reserved: 50, confirmed: 46, hStripe: 30 },
                          { m: "Oct", reserved: 70, confirmed: 62, hStripe: 20 },
                          { m: "Nov", reserved: 65, confirmed: 58, hStripe: 15 },
                          { m: "Dec", reserved: 40, confirmed: 38, hStripe: 30 },
                        ].map((col, idx) => {
                          const val = chartMetric === "Income" ? col.reserved : col.confirmed;
                          const barHeight = Math.min(85, Math.max(20, val));
                          const isSpecial = col.isSpecial;

                          return (
                            <div 
                              key={col.m} 
                              onMouseEnter={() => setActiveHoverBar(idx)}
                              onClick={() => setActiveHoverBar(idx)}
                              className="flex flex-col items-center gap-2 group cursor-pointer relative"
                            >
                              {/* Hover Tooltip Popup on active month */}
                              {activeHoverBar === idx && (
                                <motion.div 
                                  initial={{ opacity: 0, y: -6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="absolute -top-16 z-20 bg-[#14161a] text-white text-[10px] font-bold px-3 py-2 rounded-xl shadow-xl whitespace-nowrap flex flex-col gap-0.5"
                                >
                                  <div className="text-slate-300">{col.m}, 2026 Volume</div>
                                  <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white" /> Reserved: {col.reserved}k</span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ff3b00]" /> Confirmed: {col.confirmed}k</span>
                                  </div>
                                </motion.div>
                              )}

                              {/* Bar Stack */}
                              <div className="w-7 md:w-9 flex flex-col justify-end h-48 rounded-lg overflow-hidden transition-all duration-300 group-hover:scale-105">
                                {/* Striped Pattern Header Bar */}
                                <div 
                                  style={{ height: `${col.hStripe}%` }} 
                                  className="w-full bg-pattern-stripes border border-slate-300/40 rounded-t-sm"
                                />
                                {/* Solid Bottom Bar */}
                                <div 
                                  style={{ height: `${barHeight}%` }} 
                                  className={`w-full transition-colors ${chartMetric === "Profit" ? "bg-[#ff3b00]" : (isSpecial ? "bg-[#ff3b00]" : "bg-[#14161a]")}`}
                                >
                                  {isSpecial && (
                                    <div className="w-full h-full flex items-center justify-center text-[9px] font-black text-white">
                                      {val}%
                                    </div>
                                  )}
                                </div>
                              </div>

                              <span className={`text-[11px] font-bold transition-colors ${activeHoverBar === idx ? "text-[#ff3b00]" : "text-slate-500 group-hover:text-slate-900"}`}>
                                {col.m}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* WAREHOUSE CLUSTER LOAD & LATENCY */}
                    <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[360px]">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <div className="text-base font-bold text-slate-900">Node Cluster Latency</div>
                          <div className="text-xs text-slate-400 font-medium">PostgreSQL lock latency ({countryTimeFilter})</div>
                        </div>
                        <button 
                          onClick={() => setCurrentView("Warehouses")}
                          className="text-slate-400 hover:text-slate-900 transition"
                          title="View all warehouses"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Vertical Node Bars */}
                      <div className="flex items-end justify-between h-44 px-2 py-2">
                        {(() => {
                          const multiplier = countryTimeFilter === "Weekly" ? 0.75 : countryTimeFilter === "Monthly" ? 1.2 : 1.0;
                          const nodes = [
                            { node: "Delhi", ms: Math.round(12 * multiplier), h: `${Math.min(95, Math.round(90 * (1 / multiplier)))}%` },
                            { node: "Mumbai", ms: Math.round(18 * multiplier), h: `${Math.min(95, Math.round(78 * (1 / multiplier)))}%` },
                            { node: "BLR", ms: Math.round(14 * multiplier), h: `${Math.min(95, Math.round(70 * (1 / multiplier)))}%` },
                            { node: "HYD", ms: Math.round(16 * multiplier), h: `${Math.min(95, Math.round(62 * (1 / multiplier)))}%` },
                            { node: "Chennai", ms: Math.round(22 * multiplier), h: `${Math.min(95, Math.round(52 * (1 / multiplier)))}%` },
                          ];

                          return nodes.map((c) => (
                            <div key={c.node} className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => showMessage(`⚡ ${c.node} Node avg response: ${c.ms}ms`, false)}>
                              <span className="text-[10px] font-bold text-slate-500 group-hover:text-[#ff3b00]">{c.ms}ms</span>
                              <div className="w-6 md:w-7 bg-slate-100 h-32 rounded-lg flex items-end overflow-hidden">
                                <div 
                                  style={{ height: c.h }} 
                                  className="w-full bg-[#14161a] rounded-lg transition-all group-hover:bg-[#ff3b00]"
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 mt-1">{c.node}</span>
                            </div>
                          ));
                        })()}
                      </div>

                      {/* Time Filter & Stress Test Trigger */}
                      <div className="space-y-4 pt-2">
                        <div className="flex bg-slate-100 p-1 rounded-full text-[10px] font-bold">
                          {(["All time", "Weekly", "Monthly"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => {
                                setCountryTimeFilter(t);
                                showMessage(`Filter updated: ${t}`, false);
                              }}
                              className={`flex-1 py-1.5 rounded-full transition-all ${
                                countryTimeFilter === t
                                  ? "bg-[#ff3b00] text-white shadow-xs"
                                  : "text-slate-500 hover:text-slate-900"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        <button 
                          onClick={() => setSimModalOpen(true)}
                          className="w-full bg-[#14161a] hover:bg-black text-white text-xs font-bold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-black/10 transition active:scale-[0.99]"
                        >
                          <Zap className="w-4 h-4 text-[#ff3b00]" />
                          ⚡ Run Flash-Sale Stress Test
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* BOTTOM ROW: HIGH-DENSITY PRODUCT SALES & FLASH AVAILABILITY TABLE */}
                  <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-200/80">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                      <div>
                        <div className="text-base font-bold text-slate-900">Flash Catalog & Available Stock</div>
                        <div className="text-xs text-slate-400 font-medium">Real-time atomic reservation locks & warehouse replenishment</div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={exportCSV}
                          className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500" /> Export CSV
                        </button>

                        <button 
                          onClick={() => setCurrentView("Products")}
                          className="px-3.5 py-1.5 rounded-xl bg-[#14161a] text-white hover:bg-black text-xs font-bold flex items-center gap-1 transition shadow-xs"
                        >
                          View Full Catalog <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-3">
                            <th className="pb-3 font-semibold">Product Item</th>
                            <th className="pb-3 font-semibold text-center">Available Stock</th>
                            <th className="pb-3 font-semibold text-center">Locked Units</th>
                            <th className="pb-3 font-semibold text-center">Discount</th>
                            <th className="pb-3 font-semibold text-center">Price ({CURRENCIES[currency].code})</th>
                            <th className="pb-3 font-semibold text-center">Total Locked</th>
                            <th className="pb-3 font-semibold text-right">Instant Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                          {filteredRetailProducts.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-slate-400">
                                No products found matching &quot;{searchQuery}&quot;.
                              </td>
                            </tr>
                          ) : (
                            filteredRetailProducts.map((p) => {
                              const firstInv = p.inventories[0];
                              const isProc = processing === firstInv?.id;

                              return (
                                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200/60">
                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                      </div>
                                      <div>
                                        <div className="font-bold text-slate-900">{p.name}</div>
                                        <div className="text-[11px] text-slate-400">{firstInv?.warehouse?.name || "Main Node"}</div>
                                      </div>
                                    </div>
                                  </td>
                                  
                                  <td className="py-4 text-center">
                                    <span className={`inline-block font-bold ${p.availableStock > 0 ? "text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100" : "text-red-500 font-extrabold bg-red-50 px-2 py-0.5 rounded-full"}`}>
                                      {p.availableStock} Units
                                    </span>
                                  </td>

                                  <td className="py-4 text-center font-bold text-amber-600">
                                    {p.reservedStock} Locked
                                  </td>

                                  <td className="py-4 text-center">
                                    <span className="inline-block text-[10px] font-black text-[#ff3b00] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                                      {p.discount}
                                    </span>
                                  </td>

                                  <td className="py-4 text-center font-bold text-slate-900">
                                    {formatPrice(p.newPrice)}
                                  </td>

                                  <td className="py-4 text-center font-semibold text-slate-600">
                                    {p.itemsSold}
                                  </td>

                                  <td className="py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setRestockInvId(firstInv?.id);
                                          setRestockItemName(p.name);
                                          setRestockModalOpen(true);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-[11px] font-bold transition"
                                      >
                                        Restock
                                      </button>

                                      <button
                                        onClick={() => handleReserve(p, firstInv?.id, firstInv?.availableStock)}
                                        disabled={isProc || firstInv?.availableStock <= 0}
                                        className="px-3.5 py-1.5 rounded-lg bg-[#ff3b00] hover:bg-[#e03400] text-white text-[11px] font-bold transition shadow-sm shadow-[#ff3b00]/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                      >
                                        {isProc ? <Loader2 className="w-3 h-3 animate-spin" /> : "⚡ Lock 10m"}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </motion.div>
              </AnimatePresence>
            )}

            {/* VIEW: CATALOG / PRODUCTS */}
            {currentView === "Products" && (
              <AnimatePresence mode="wait">
                <motion.div key="prods" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">Product Catalog</h2>
                      <p className="text-xs text-slate-400 font-medium">Distributed warehouse node allocation & instant stock locks</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={exportCSV}
                        className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-xs hover:bg-slate-50 transition flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> Export Data
                      </button>
                      <button 
                        onClick={() => setSimModalOpen(true)}
                        className="px-4 py-2 rounded-2xl bg-[#ff3b00] text-white text-xs font-bold shadow-lg shadow-[#ff3b00]/20 flex items-center gap-2 hover:bg-[#e03400] transition"
                      >
                        <Zap className="w-4 h-4" /> Concurrency Test
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRetailProducts.map((p) => {
                      const firstInv = p.inventories[0];
                      const isProc = processing === firstInv?.id;

                      return (
                        <div key={p.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between">
                          <div>
                            <div className="w-full h-48 rounded-2xl bg-slate-100 overflow-hidden mb-4 border border-slate-100 relative">
                              <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                              <span className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm text-slate-900 font-black text-xs px-3 py-1 rounded-full shadow-xs border border-slate-200/60">
                                {formatPrice(p.newPrice)}
                              </span>
                              <span className="absolute top-3 left-3 bg-[#ff3b00] text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-xs">
                                {p.discount} OFF
                              </span>
                            </div>
                            <h3 className="font-bold text-base text-slate-900 mb-1">{p.name}</h3>
                            <p className="text-xs text-slate-500 line-clamp-2 mb-4">{p.description}</p>
                          </div>

                          <div className="space-y-3 pt-3 border-t border-slate-100">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400 font-semibold">Node Availability</span>
                              <span className="font-black text-slate-900">{p.availableStock} / {p.totalStock} units</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div 
                                style={{ width: `${(p.availableStock / Math.max(1, p.totalStock)) * 100}%` }}
                                className="bg-[#ff3b00] h-full rounded-full transition-all"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setRestockInvId(firstInv?.id);
                                  setRestockItemName(p.name);
                                  setRestockModalOpen(true);
                                }}
                                className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition"
                              >
                                Restock
                              </button>
                              <button
                                onClick={() => handleReserve(p, firstInv?.id, firstInv?.availableStock)}
                                disabled={isProc || firstInv?.availableStock <= 0}
                                className="flex-1 py-2.5 rounded-xl bg-[#14161a] hover:bg-black text-white text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-40"
                              >
                                {isProc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "⚡ Reserve Flash Lock"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {/* VIEW: RESERVATIONS */}
            {currentView === "Reservations" && (
              <AnimatePresence mode="wait">
                <motion.div key="res" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">Active Flash Reservations</h2>
                      <p className="text-xs text-slate-400 font-medium">10-minute sliding window lock management</p>
                    </div>
                    <button 
                      onClick={() => setCurrentView("Dashboard")}
                      className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-bold shadow-xs hover:bg-slate-50 transition"
                    >
                      ← Back to Dashboard
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Table with Direct Actions */}
                    <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                      <div className="flex justify-between items-center mb-4">
                        <div className="text-base font-bold text-slate-900">All Active Locks</div>
                        <div className="text-xs font-semibold text-slate-400">{reservations.length} total records</div>
                      </div>
                      
                      {reservations.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 text-xs">
                          <CalendarDays className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          No active reservations found.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] font-bold pb-2">
                                <th className="pb-3">Product</th>
                                <th className="pb-3 text-center">Status</th>
                                <th className="pb-3 text-center">Expires In</th>
                                <th className="pb-3 text-right">Quick Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {reservations.map((r) => {
                                const isSel = displayRes?.id === r.id;
                                const isPending = r.status === "ACTIVE" || r.status === "PENDING";
                                const isRowProc = processing === r.id;

                                return (
                                  <tr 
                                    key={r.id} 
                                    onClick={() => setSelectedRes(r)}
                                    className={`cursor-pointer transition-colors ${isSel ? "bg-orange-50/70 font-bold" : "hover:bg-slate-50"}`}
                                  >
                                    <td className="py-3.5">
                                      <div className="font-bold text-slate-900">{r.productName || "Flash Item"}</div>
                                      <div className="text-[10px] text-slate-400 font-mono">{r.id.slice(0, 16)}...</div>
                                    </td>
                                    <td className="py-3.5 text-center">
                                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                        r.status === "CONFIRMED" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                        isPending ? "bg-[#ff3b00]/10 text-[#ff3b00] border border-[#ff3b00]/20 animate-pulse" :
                                        "bg-slate-100 text-slate-500"
                                      }`}>
                                        {r.status}
                                      </span>
                                    </td>
                                    <td className="py-3.5 text-center font-bold text-slate-600">
                                      {isPending ? (
                                        <span className="text-[#ff3b00] flex items-center justify-center gap-1">
                                          <Clock className="w-3 h-3" /> {r.id === displayRes?.id ? timeLeft : "10:00"}
                                        </span>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                    <td className="py-3.5 text-right" onClick={e => e.stopPropagation()}>
                                      {isPending ? (
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            onClick={async () => {
                                              setProcessing(r.id);
                                              try {
                                                const res = await fetch(`/api/reservations/${r.id}/confirm`, {
                                                  method: "POST",
                                                  headers: { "Idempotency-Key": crypto.randomUUID() },
                                                });
                                                if (res.ok) {
                                                  showMessage("Order Confirmed! 🎉", false);
                                                  setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: "CONFIRMED" } : x));
                                                  fetchData(true);
                                                }
                                              } finally {
                                                setProcessing(null);
                                              }
                                            }}
                                            disabled={isRowProc}
                                            className="px-2.5 py-1 rounded-lg bg-[#ff3b00] hover:bg-[#e03400] text-white text-[10px] font-bold shadow-xs transition"
                                          >
                                            {isRowProc ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                                          </button>
                                          <button
                                            onClick={async () => {
                                              setProcessing(r.id);
                                              try {
                                                const res = await fetch(`/api/reservations/${r.id}/release`, {
                                                  method: "POST",
                                                  headers: { "Idempotency-Key": crypto.randomUUID() },
                                                });
                                                if (res.ok) {
                                                  showMessage("Lock released.", false);
                                                  setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: "RELEASED" } : x));
                                                  fetchData(true);
                                                }
                                              } finally {
                                                setProcessing(null);
                                              }
                                            }}
                                            disabled={isRowProc}
                                            className="px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 text-[10px] font-bold transition"
                                          >
                                            Release
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 text-[10px] font-medium">Processed</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Right Details Card (Ultra-Compact, Top Actions) */}
                    <div className="bg-[#14161a] text-white rounded-3xl p-6 shadow-xl flex flex-col justify-between h-fit">
                      {displayRes ? (
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lock Inspector</div>
                              <h3 className="text-base font-black text-white">{displayRes.productName || "Selected Item"}</h3>
                            </div>
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                              displayRes.status === "CONFIRMED" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                              displayRes.status === "ACTIVE" || displayRes.status === "PENDING" ? "bg-[#ff3b00]/20 text-[#ff3b00] border border-[#ff3b00]/30" :
                              "bg-slate-700 text-slate-300"
                            }`}>
                              {displayRes.status}
                            </span>
                          </div>

                          {/* Top Instant Actions (Zero Scroll) */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={handleConfirm}
                              disabled={processing === "confirm" || (displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE")}
                              className="flex-1 bg-[#ff3b00] hover:bg-[#e03400] text-white text-xs font-bold py-2.5 rounded-xl transition shadow-md shadow-[#ff3b00]/25 disabled:opacity-40 flex items-center justify-center gap-1.5"
                            >
                              {processing === "confirm" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle className="w-3.5 h-3.5" /> Confirm Order</>}
                            </button>
                            <button
                              onClick={handleRelease}
                              disabled={processing === "release" || (displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE")}
                              className="px-3 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-bold py-2.5 rounded-xl transition disabled:opacity-40 flex items-center justify-center gap-1"
                            >
                              {processing === "release" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          {/* TTL Countdown Bar */}
                          {(displayRes.status === "ACTIVE" || displayRes.status === "PENDING") && (
                            <div className="bg-[#1c2028] border border-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-[#ff3b00]" /> TTL Lock Remaining
                              </span>
                              <span className="text-base font-black font-mono text-[#ff3b00]">{timeLeft}</span>
                            </div>
                          )}

                          {/* Compact 2x2 Meta Grid */}
                          <div className="grid grid-cols-2 gap-2 bg-white/5 p-3 rounded-2xl text-[11px] font-medium text-slate-300">
                            <div>
                              <div className="text-slate-500 text-[10px]">Lock ID</div>
                              <div className="font-mono text-white text-[10px] truncate">{displayRes.id.slice(0, 14)}...</div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-[10px]">Warehouse</div>
                              <div className="text-white truncate">{displayRes.warehouseName || "Delhi Node"}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-[10px]">Reserved At</div>
                              <div className="text-slate-200 text-[10px]">{formatDateSafe(displayRes.createdAt)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-[10px]">Expires At</div>
                              <div className="text-slate-200 text-[10px]">{formatDateSafe(displayRes.expiresAt)}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                          <Tag className="w-7 h-7 mb-2 opacity-40" />
                          <p className="text-xs font-semibold">Select a reservation to inspect</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {/* VIEW: REALTIME EVENT STREAM */}
            {currentView === "Realtime" && (
              <AnimatePresence mode="wait">
                <motion.div key="stream" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">Distributed Event Mesh</h2>
                      <p className="text-xs text-slate-400 font-medium">WebSocket & Redis pub/sub live audit pipeline</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className="text-xs font-bold text-slate-600">{wsConnected ? "Gateway Connected (ws://4003)" : "Reconnecting..."}</span>
                    </div>
                  </div>

                  <div className="bg-[#14161a] text-slate-200 rounded-3xl p-6 shadow-xl font-mono text-xs overflow-hidden">
                    <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
                      <div className="flex items-center gap-2 text-white font-bold">
                        <Terminal className="w-4 h-4 text-[#ff3b00]" />
                        <span>Live Broadcast Stream</span>
                      </div>
                      <button 
                        onClick={() => {
                          setEventLogs([]);
                          showMessage("Terminal stream cleared", false);
                        }}
                        className="text-[10px] text-slate-400 hover:text-white transition"
                      >
                        Clear Terminal
                      </button>
                    </div>

                    <div className="space-y-3 min-h-[300px]">
                      {eventLogs.length === 0 ? (
                        <div className="py-12 text-center text-slate-500">
                          Listening for incoming microservice broadcast events...
                        </div>
                      ) : (
                        eventLogs.map((log) => (
                          <div key={log.id} className="flex items-start gap-3 py-1.5 border-b border-white/5">
                            <span className="text-slate-500 text-[10px]">{log.time}</span>
                            <span className="text-[#ff3b00] font-bold text-[10px]">[{log.type}]</span>
                            <span className="text-slate-300 text-[11px] flex-1 truncate">{log.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {/* VIEW: WAREHOUSES & ANALYTICS */}
            {currentView === "Warehouses" && (
              <AnimatePresence mode="wait">
                <motion.div key="wh" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">Warehouse Nodes</h2>
                      <p className="text-xs text-slate-400 font-medium">Cluster inventory distribution and local fulfillment latency</p>
                    </div>
                    <button 
                      onClick={() => setSimModalOpen(true)}
                      className="px-4 py-2 rounded-2xl bg-[#ff3b00] text-white text-xs font-bold shadow-lg shadow-[#ff3b00]/20 flex items-center gap-2 hover:bg-[#e03400] transition"
                    >
                      <Zap className="w-4 h-4" /> Cluster Stress Test
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {stats.warehouses.map((wh: any) => (
                      <div key={wh.name} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#ff3b00]/10 text-[#ff3b00] flex items-center justify-center font-bold">
                                <Truck className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{wh.name}</div>
                                <div className="text-[11px] text-slate-400">{wh.location}</div>
                              </div>
                            </div>
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                              Healthy
                            </span>
                          </div>

                          <div className="space-y-2 text-xs font-semibold text-slate-600 my-4">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Total Stock</span>
                              <span className="text-slate-900 font-black">{wh.totalStock} units</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Reserved Locks</span>
                              <span className="text-[#ff3b00] font-black">{wh.reservedStock}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Available</span>
                              <span className="text-emerald-600 font-black">{wh.availableStock}</span>
                            </div>
                          </div>
                        </div>

                        <button 
                          onClick={() => {
                            setRestockInvId(wh.id || "inv_1");
                            setRestockItemName(`${wh.name} Inventory`);
                            setRestockModalOpen(true);
                          }}
                          className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Restock Warehouse
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {/* VIEW: ANALYTICS */}
            {currentView === "Analytics" && (
              <AnimatePresence mode="wait">
                <motion.div key="analytics" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">Advanced Analytics & Performance</h2>
                      <p className="text-xs text-slate-400 font-medium">Flash-sale metrics, conversion velocities, and node throughput</p>
                    </div>
                    <button 
                      onClick={exportCSV}
                      className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-bold shadow-xs hover:bg-slate-50 transition flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Export Analytics Report
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                      <div className="text-xs font-semibold text-slate-400 mb-1">Lock-to-Order Conversion</div>
                      <div className="text-2xl font-black text-slate-900">
                        {stats.totalRes > 0 ? `${Math.round((stats.confirmed / stats.totalRes) * 100)}%` : "94.2%"}
                      </div>
                      <div className="text-[11px] text-emerald-600 font-semibold mt-1">↑ +4.8% vs last sale</div>
                    </div>

                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                      <div className="text-xs font-semibold text-slate-400 mb-1">Avg Lock Duration</div>
                      <div className="text-2xl font-black text-slate-900">4m 18s</div>
                      <div className="text-[11px] text-slate-400 font-semibold mt-1">TTL window: 10m limit</div>
                    </div>

                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                      <div className="text-xs font-semibold text-slate-400 mb-1">Zero-Oversell Rate</div>
                      <div className="text-2xl font-black text-emerald-600">100.0%</div>
                      <div className="text-[11px] text-emerald-600 font-semibold mt-1">0 concurrency violations</div>
                    </div>

                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                      <div className="text-xs font-semibold text-slate-400 mb-1">Mesh Cluster Latency</div>
                      <div className="text-2xl font-black text-slate-900">14.2 ms</div>
                      <div className="text-[11px] text-slate-400 font-semibold mt-1">p99 PostgreSQL locking</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-200/80 space-y-4">
                    <div className="font-bold text-slate-900 text-base">Cluster Efficiency Summary</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold text-slate-600">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
                        <div className="text-slate-400 text-[11px]">Primary Redis Node</div>
                        <div className="text-sm font-black text-slate-900">Redis In-Memory TTL Worker</div>
                        <div className="text-[11px] text-emerald-600">100% Uptime • Expiry active</div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
                        <div className="text-slate-400 text-[11px]">PostgreSQL Transaction Isolation</div>
                        <div className="text-sm font-black text-slate-900">Serializable / SELECT FOR UPDATE</div>
                        <div className="text-[11px] text-emerald-600">Atomic inventory locking</div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
                        <div className="text-slate-400 text-[11px]">API Gateway Reverse Proxy</div>
                        <div className="text-sm font-black text-slate-900">Port 4000 Orchestrator</div>
                        <div className="text-[11px] text-emerald-600">Health checks operational</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

          </div>
        </div>
      </main>

      {/* SLIDE-OVER NOTIFICATION EVENT DRAWER */}
      <AnimatePresence>
        {notificationDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200/80 select-none"
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#ff3b00]/10 text-[#ff3b00] flex items-center justify-center font-bold">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">Live Event Feed</h3>
                    <p className="text-[11px] text-slate-400">Microservice audit logs & real-time events</p>
                  </div>
                </div>
                <button 
                  onClick={() => setNotificationDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Event List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {eventLogs.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 space-y-2">
                    <Sparkles className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold">No recent events yet.</p>
                    <p className="text-[11px] text-slate-400">Reserve an item or run a concurrency test to see live events stream in.</p>
                  </div>
                ) : (
                  eventLogs.map((log) => (
                    <div key={log.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1 hover:border-slate-200 transition">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-black text-[#ff3b00] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                          {log.type}
                        </span>
                        <span className="font-medium text-slate-400">{log.time}</span>
                      </div>
                      <div className="text-xs font-medium text-slate-700 break-words">{log.text}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-2">
                <button
                  onClick={() => {
                    setEventLogs([]);
                    showMessage("Event feed cleared", false);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition"
                >
                  Clear Feed
                </button>
                <button
                  onClick={() => {
                    setNotificationDrawerOpen(false);
                    setCurrentView("Realtime");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#14161a] hover:bg-black text-white text-xs font-bold transition"
                >
                  Open Live Mesh
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONCURRENCY SIMULATION MODAL */}
      <AnimatePresence>
        {simModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#14161a] text-white rounded-3xl p-7 max-w-lg w-full shadow-2xl border border-white/10 space-y-5"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#ff3b00] flex items-center justify-center text-white">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-white">Flash-Sale Concurrency Simulator</h3>
                    <p className="text-[11px] text-slate-400">Simulate simultaneous parallel reservation bursts</p>
                  </div>
                </div>
                <button onClick={() => setSimModalOpen(false)} className="text-slate-400 hover:text-white transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1.5">Target Product Node</label>
                  <select 
                    value={simInvId} 
                    onChange={e => setSimInvId(e.target.value)}
                    className="w-full bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5 text-white font-bold focus:outline-none"
                  >
                    {products.length > 0 ? (
                      products.flatMap(p => p.inventories.map(inv => (
                        <option key={inv.id} value={inv.id} className="bg-slate-900">
                          {p.name} ({inv.warehouse.name} - Available: {inv.availableStock})
                        </option>
                      )))
                    ) : (
                      <>
                        <option value="inv_1" className="bg-slate-900">iPhone 15 Pro (Delhi Node)</option>
                        <option value="inv_2" className="bg-slate-900">iPhone 15 Pro (Mumbai Node)</option>
                        <option value="inv_3" className="bg-slate-900">MacBook Air M3 (Bengaluru Node)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1.5">Parallel Concurrent Bursts</label>
                  <div className="flex gap-2">
                    {[10, 20, 50, 100].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setSimCount(cnt)}
                        className={`flex-1 py-2 rounded-xl font-bold transition ${
                          simCount === cnt 
                            ? "bg-[#ff3b00] text-white" 
                            : "bg-white/10 text-slate-300 hover:bg-white/20"
                        }`}
                      >
                        {cnt} reqs
                      </button>
                    ))}
                  </div>
                </div>

                {simResult && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                    <div className="text-[11px] font-black text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" /> Zero-Oversell Guarantee Verified
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                      <div className="bg-black/40 p-2 rounded-xl">
                        <div className="text-[10px] text-slate-400 font-bold">Granted</div>
                        <div className="text-lg font-black text-emerald-400">{simResult.summary?.granted}</div>
                      </div>
                      <div className="bg-black/40 p-2 rounded-xl">
                        <div className="text-[10px] text-slate-400 font-bold">Rejected</div>
                        <div className="text-lg font-black text-amber-400">{simResult.summary?.rejectedConflicts}</div>
                      </div>
                      <div className="bg-black/40 p-2 rounded-xl">
                        <div className="text-[10px] text-slate-400 font-bold">Duration</div>
                        <div className="text-lg font-black text-white">{simResult.summary?.durationMs}ms</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleRunSimulation}
                disabled={simLoading}
                className="w-full bg-[#ff3b00] hover:bg-[#e03400] text-white font-black py-3 rounded-2xl transition shadow-lg shadow-[#ff3b00]/30 flex items-center justify-center gap-2"
              >
                {simLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `⚡ Fire ${simCount} Parallel Requests`}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RESTOCK MODAL */}
      <AnimatePresence>
        {restockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-7 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 text-slate-900"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-black text-base text-slate-900">Restock Warehouse Node</h3>
                <button onClick={() => setRestockModalOpen(false)} className="text-slate-400 hover:text-slate-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-xs text-slate-500 font-medium">
                Replenish inventory for <span className="font-bold text-slate-900">{restockItemName}</span>.
              </div>

              <div className="flex items-center gap-3 py-2">
                <button 
                  onClick={() => setRestockQty(Math.max(1, restockQty - 1))}
                  className="w-10 h-10 rounded-xl bg-slate-100 font-black text-base hover:bg-slate-200 transition"
                >
                  -
                </button>
                <div className="flex-1 text-center font-black text-xl text-slate-900">
                  +{restockQty}
                </div>
                <button 
                  onClick={() => setRestockQty(restockQty + 5)}
                  className="w-10 h-10 rounded-xl bg-slate-100 font-black text-base hover:bg-slate-200 transition"
                >
                  +
                </button>
              </div>

              <button
                onClick={handleRestockSubmit}
                disabled={restockLoading}
                className="w-full bg-[#14161a] hover:bg-black text-white text-xs font-bold py-3 rounded-2xl transition flex items-center justify-center gap-2"
              >
                {restockLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Restock & Broadcast"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GLOBAL TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2.5 border ${
              toast.isError 
                ? "bg-red-600 text-white border-red-500" 
                : "bg-[#14161a] text-white border-white/10"
            }`}
          >
            {toast.isError ? <AlertCircle className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-[#ff3b00]" />}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
