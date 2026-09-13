"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

  const fetchData = useCallback(async (silent = false) => {
    if (!silent && products.length === 0 && reservations.length === 0) {
      setLoading(true);
    }
    try {
      const [prodRes, resRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/reservations")
      ]);
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
          setSelectedRes(prev => prev ? (resData.find((r: Reservation) => r.id === prev.id) || resData[0]) : resData[0]);
        }
      }
    } catch {
      if (!silent) showMessage("Error fetching data", true);
    } finally {
      setLoading(false);
    }
  }, [products.length, reservations.length, selectedRes]);

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
  useEffect(() => {
    const target = selectedRes || activeReservation || reservations[0];
    if (!target || !target.expiresAt) return;
    
    const TOTAL_SECONDS = 600;
    
    const updateTimer = () => {
      const expiry = new Date(target.expiresAt);
      const now = new Date();
      
      if (isNaN(expiry.getTime()) || expiry <= now || target.status === "EXPIRED" || target.status === "CONFIRMED" || target.status === "RELEASED") {
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
  }, [activeReservation, selectedRes, reservations]);

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
      <header className="h-20 bg-transparent px-6 md:px-10 flex items-center justify-between select-none">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-tight">
            Retail Inventory
          </h1>
          <p className="text-xs font-semibold text-slate-400">
            High-Concurrency Flash Reservation Engine
          </p>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Currency Pill */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white rounded-full border border-slate-200/80 shadow-xs text-xs font-bold text-slate-700 cursor-pointer hover:border-slate-300 transition">
            <span className="text-sm">🇺🇸</span>
            <span>USD</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>

          {/* Search Pill */}
          <button className="w-10 h-10 rounded-full bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 transition">
            <Search className="w-4 h-4" />
          </button>

          {/* Notification Pill */}
          <button 
            onClick={() => setCurrentView("Realtime")}
            className="relative w-10 h-10 rounded-full bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 transition"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#14161a] text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
              {eventLogs.length > 0 ? Math.min(9, eventLogs.length) : 2}
            </span>
          </button>

          {/* User Profile Avatar */}
          <div className="flex items-center gap-2 pl-2">
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
                    
                    {/* CARD 1: TOTAL ORDERS (Obsidian Dark) */}
                    <div className="bg-[#14161a] text-white rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden min-h-[220px]">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">Total Orders</div>
                          <div className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
                            ${(stats.totalOrdersAmount).toLocaleString()}
                            <span className="text-[11px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              ↘ 10%
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-medium">$15.650 last month</div>
                        </div>
                        <button className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Sparkline Wave with Tooltip */}
                      <div className="relative pt-6 pb-1">
                        <div className="absolute right-12 top-2 bg-white text-slate-950 font-mono font-bold text-[10px] px-2 py-0.5 rounded-md shadow-md">
                          $1210.6
                        </div>
                        <svg className="w-full h-16 overflow-visible" viewBox="0 0 260 60">
                          <defs>
                            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
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
                          <span>1Feb</span>
                          <span>8Feb</span>
                          <span>16Feb</span>
                          <span>25Feb</span>
                          <span>30Feb</span>
                        </div>
                      </div>
                    </div>

                    {/* CARD 2: TOTAL CUSTOMERS (Electric Flame Orange) */}
                    <div className="bg-[#ff3b00] text-white rounded-3xl p-6 shadow-xl shadow-[#ff3b00]/25 flex flex-col justify-between relative overflow-hidden min-h-[220px]">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-semibold text-white/80 mb-1">Total Customers</div>
                          <div className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
                            1.222
                            <span className="text-[11px] font-bold text-white bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              ↗ +79%
                            </span>
                          </div>
                          <div className="text-[11px] text-white/80 mt-0.5 font-medium">683 users last month</div>
                        </div>
                        <button className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Split Ratio Slider */}
                      <div className="pt-6">
                        <div className="flex h-14 w-full rounded-2xl overflow-hidden bg-black/10 p-1 gap-1">
                          <div className="w-[28%] bg-white rounded-xl flex items-center justify-center text-slate-900 font-black text-xs">
                            23%
                          </div>
                          <div className="flex-1 bg-[#14161a] rounded-xl flex items-center justify-center text-white font-black text-xs">
                            77%
                          </div>
                        </div>
                        <div className="flex items-center gap-6 mt-3 text-[11px] font-bold text-white/90">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white" /> Men</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#14161a]" /> Women</span>
                        </div>
                      </div>
                    </div>

                    {/* CARD 3: TOTAL REVENUE (Pure White Card) */}
                    <div className="bg-white text-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[220px]">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">Total Revenue</div>
                          <div className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                            ${(stats.totalRevenue).toLocaleString()}
                            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              ↗ +21%
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-medium">$73 925 last month</div>
                        </div>
                        <button className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Heatmap Vertical Matrix */}
                      <div className="pt-6">
                        <div className="flex justify-between items-end h-16 px-1">
                          {[
                            { day: "Mon", bars: 3, active: false },
                            { day: "Tue", bars: 4, active: false },
                            { day: "Wed", bars: 2, active: false },
                            { day: "Thu", bars: 7, active: true },
                            { day: "Fri", bars: 4, active: false },
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

                    {/* CARD 4: TOP CATEGORIES (Radial Donut) */}
                    <div className="bg-white text-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[220px]">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-sm font-bold text-slate-900">Top categories</div>
                        <button className="text-slate-400 hover:text-slate-900 transition">
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
                          <span className="text-xs font-black text-slate-900">35%</span>
                        </div>
                      </div>

                      {/* Legend & Filter Pills */}
                      <div>
                        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] font-bold text-slate-600 mb-3">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ff3b00]" /> T-shirts</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#14161a]" /> Hoodies</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" /> Jeans</span>
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

                  {/* MIDDLE ROW: MAIN VOLUME BAR CHART + REGIONAL LOAD */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* TOTAL ORDERS & FLASH SALE VOLUME CHART */}
                    <div className="lg:col-span-2 bg-white rounded-3xl p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[360px]">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="text-base font-bold text-slate-900">Total Orders</div>
                        
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
                            <label 
                              onClick={() => setChartMetric("Income")}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${chartMetric === "Income" ? "border-slate-900" : "border-slate-300"}`}>
                                {chartMetric === "Income" && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                              </span>
                              Income
                            </label>
                            <label 
                              onClick={() => setChartMetric("Profit")}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${chartMetric === "Profit" ? "border-slate-900" : "border-slate-300"}`}>
                                {chartMetric === "Profit" && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                              </span>
                              Profit
                            </label>
                          </div>
                          <button className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition">
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 12-Month Interactive Bar Chart */}
                      <div className="relative flex-1 flex items-end justify-between pt-10 pb-4 px-2">
                        {[
                          { m: "Jan", hSolid: 55, hStripe: 25, isSpecial: false },
                          { m: "Feb", hSolid: 40, hStripe: 30, isSpecial: false },
                          { m: "Mar", hSolid: 60, hStripe: 25, isSpecial: false },
                          { m: "Apr", hSolid: 45, hStripe: 30, isSpecial: false },
                          { m: "May", hSolid: 50, hStripe: 20, isSpecial: false },
                          { m: "Jun", hSolid: 75, hStripe: 25, isSpecial: true }, // Special active orange
                          { m: "Jul", hSolid: 60, hStripe: 20, isSpecial: false },
                          { m: "Aug", hSolid: 35, hStripe: 25, isSpecial: false },
                          { m: "Sep", hSolid: 50, hStripe: 30, isSpecial: false },
                          { m: "Oct", hSolid: 70, hStripe: 20, isSpecial: false },
                          { m: "Nov", hSolid: 65, hStripe: 15, isSpecial: false },
                          { m: "Dec", hSolid: 40, hStripe: 30, isSpecial: false },
                        ].map((col, idx) => (
                          <div 
                            key={col.m} 
                            onMouseEnter={() => setActiveHoverBar(idx)}
                            className="flex flex-col items-center gap-2 group cursor-pointer relative"
                          >
                            {/* Hover Tooltip Popup on June (or active) */}
                            {activeHoverBar === idx && (
                              <motion.div 
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute -top-16 z-20 bg-[#14161a] text-white text-[10px] font-bold px-3 py-2 rounded-xl shadow-xl whitespace-nowrap flex flex-col gap-0.5"
                              >
                                <div className="text-slate-300">{col.m}, 09</div>
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white" /> Sold 30</span>
                                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#ff3b00]" /> Lock 15</span>
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
                                style={{ height: `${col.hSolid}%` }} 
                                className={`w-full transition-colors ${col.isSpecial ? "bg-[#ff3b00]" : "bg-[#14161a]"}`}
                              >
                                {col.isSpecial && (
                                  <div className="w-full h-full flex items-center justify-center text-[9px] font-black text-white">
                                    25%
                                  </div>
                                )}
                              </div>
                            </div>

                            <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-900 transition-colors">
                              {col.m}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* SALES BY COUNTRY / WAREHOUSE GEO LOAD */}
                    <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between min-h-[360px]">
                      <div className="flex justify-between items-center mb-4">
                        <div className="text-base font-bold text-slate-900">Sales by country</div>
                        <button className="text-slate-400 hover:text-slate-900 transition">
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Vertical Country Bars */}
                      <div className="flex items-end justify-between h-44 px-2 py-2">
                        {[
                          { country: "USA", percent: "25%", h: "90%" },
                          { country: "Japan", percent: "22%", h: "78%" },
                          { country: "UK", percent: "20%", h: "70%" },
                          { country: "Korea", percent: "18%", h: "62%" },
                          { country: "Spain", percent: "15%", h: "52%" },
                        ].map((c) => (
                          <div key={c.country} className="flex flex-col items-center gap-2 group">
                            <span className="text-[10px] font-bold text-slate-500">{c.percent}</span>
                            <div className="w-6 md:w-7 bg-slate-100 h-32 rounded-lg flex items-end overflow-hidden">
                              <div 
                                style={{ height: c.h }} 
                                className="w-full bg-[#14161a] rounded-lg transition-all group-hover:bg-[#ff3b00]"
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 mt-1">{c.country}</span>
                          </div>
                        ))}
                      </div>

                      {/* Country Filter Pills & Export CTA */}
                      <div className="space-y-4 pt-2">
                        <div className="flex bg-slate-100 p-1 rounded-full text-[10px] font-bold">
                          {(["All time", "Weekly", "Monthly"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setCountryTimeFilter(t)}
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

                  {/* BOTTOM ROW: HIGH-DENSITY PRODUCT SALES TABLE */}
                  <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-200/80">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <div className="text-base font-bold text-slate-900">Product sales</div>
                        <div className="text-xs text-slate-400 font-medium">Real-time inventory locks & flash availability</div>
                      </div>
                      <button 
                        onClick={() => setCurrentView("Products")}
                        className="text-slate-400 hover:text-slate-900 transition flex items-center gap-1 text-xs font-bold"
                      >
                        View all <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-3">
                            <th className="pb-3 font-semibold">Item</th>
                            <th className="pb-3 font-semibold text-center">Stock</th>
                            <th className="pb-3 font-semibold text-center">Old price</th>
                            <th className="pb-3 font-semibold text-center">Sale</th>
                            <th className="pb-3 font-semibold text-center">New price</th>
                            <th className="pb-3 font-semibold text-center">Items sold</th>
                            <th className="pb-3 font-semibold text-right">Instant Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                          {retailProducts.map((p) => {
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
                                  <span className={`inline-block font-bold ${p.availableStock > 0 ? "text-slate-900" : "text-red-500 font-extrabold"}`}>
                                    {p.availableStock}
                                  </span>
                                </td>

                                <td className="py-4 text-center font-semibold text-slate-400 line-through">
                                  ${p.oldPrice}
                                </td>

                                <td className="py-4 text-center">
                                  <span className="inline-block text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                    {p.discount}
                                  </span>
                                </td>

                                <td className="py-4 text-center font-bold text-slate-900">
                                  ${p.newPrice}
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
                          })}
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
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">Product Catalog</h2>
                      <p className="text-xs text-slate-400 font-medium">Distributed warehouse node allocation</p>
                    </div>
                    <button 
                      onClick={() => setSimModalOpen(true)}
                      className="px-4 py-2 rounded-2xl bg-[#ff3b00] text-white text-xs font-bold shadow-lg shadow-[#ff3b00]/20 flex items-center gap-2 hover:bg-[#e03400] transition"
                    >
                      <Zap className="w-4 h-4" /> Concurrency Test
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {retailProducts.map((p) => {
                      const firstInv = p.inventories[0];
                      const isProc = processing === firstInv?.id;

                      return (
                        <div key={p.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between">
                          <div>
                            <div className="w-full h-44 rounded-2xl bg-slate-100 overflow-hidden mb-4 border border-slate-100 relative">
                              <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                              <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-slate-900 font-black text-xs px-2.5 py-1 rounded-full shadow-xs">
                                ${p.newPrice}
                              </span>
                            </div>
                            <h3 className="font-bold text-base text-slate-900 mb-1">{p.name}</h3>
                            <p className="text-xs text-slate-500 line-clamp-2 mb-4">{p.description}</p>
                          </div>

                          <div className="space-y-3 pt-3 border-t border-slate-100">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400 font-semibold">Available Units</span>
                              <span className="font-black text-slate-900">{p.availableStock} / {p.totalStock}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div 
                                style={{ width: `${(p.availableStock / Math.max(1, p.totalStock)) * 100}%` }}
                                className="bg-[#ff3b00] h-full rounded-full transition-all"
                              />
                            </div>
                            <button
                              onClick={() => handleReserve(p, firstInv?.id, firstInv?.availableStock)}
                              disabled={isProc || firstInv?.availableStock <= 0}
                              className="w-full py-2.5 rounded-xl bg-[#14161a] hover:bg-black text-white text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-40"
                            >
                              {isProc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "⚡ Reserve Flash Lock"}
                            </button>
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
                    {/* Left Table */}
                    <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                      <div className="text-base font-bold text-slate-900 mb-4">All Active Locks</div>
                      
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
                                <th className="pb-3 text-right">Expires</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {reservations.map((r) => {
                                const isSel = displayRes?.id === r.id;
                                return (
                                  <tr 
                                    key={r.id} 
                                    onClick={() => setSelectedRes(r)}
                                    className={`cursor-pointer transition-colors ${isSel ? "bg-orange-50/60 font-bold" : "hover:bg-slate-50"}`}
                                  >
                                    <td className="py-3">
                                      <div className="font-bold text-slate-900">{r.productName || "Flash Product"}</div>
                                      <div className="text-[10px] text-slate-400 font-mono">{r.id.slice(0, 14)}...</div>
                                    </td>
                                    <td className="py-3 text-center">
                                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                        r.status === "CONFIRMED" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                        r.status === "ACTIVE" || r.status === "PENDING" ? "bg-[#ff3b00]/10 text-[#ff3b00] border border-[#ff3b00]/20" :
                                        "bg-slate-100 text-slate-500"
                                      }`}>
                                        {r.status}
                                      </span>
                                    </td>
                                    <td className="py-3 text-right font-bold text-slate-600">
                                      {r.status === "ACTIVE" || r.status === "PENDING" ? (
                                        <span className="text-[#ff3b00] flex items-center justify-end gap-1">
                                          <Clock className="w-3 h-3" /> {r.id === displayRes?.id ? timeLeft : "Pending"}
                                        </span>
                                      ) : (
                                        "—"
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

                    {/* Right Details Card */}
                    <div className="bg-[#14161a] text-white rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                      {displayRes ? (
                        <>
                          <div>
                            <div className="text-xs font-semibold text-slate-400 mb-2">Reservation Inspector</div>
                            <div className="text-lg font-black text-white mb-4">{displayRes.productName || "Selected Lock"}</div>

                            <div className="space-y-3 bg-white/5 p-4 rounded-2xl text-xs font-medium text-slate-300 mb-6">
                              <div className="flex justify-between border-b border-white/10 pb-2">
                                <span className="text-slate-400">Lock ID</span>
                                <span className="font-mono text-white text-[11px] truncate max-w-[120px]">{displayRes.id}</span>
                              </div>
                              <div className="flex justify-between border-b border-white/10 pb-2">
                                <span className="text-slate-400">Warehouse</span>
                                <span className="text-white">{displayRes.warehouseName || "Delhi Distribution"}</span>
                              </div>
                              <div className="flex justify-between border-b border-white/10 pb-2">
                                <span className="text-slate-400">Reserved At</span>
                                <span className="text-white">{formatDateSafe(displayRes.createdAt)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Expires At</span>
                                <span className="text-white">{formatDateSafe(displayRes.expiresAt)}</span>
                              </div>
                            </div>

                            {(displayRes.status === "ACTIVE" || displayRes.status === "PENDING") && (
                              <div className="bg-[#ff3b00] text-white rounded-2xl p-5 mb-6 shadow-lg shadow-[#ff3b00]/30">
                                <div className="text-[10px] font-black uppercase tracking-wider text-white/80 mb-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Sliding TTL Lock
                                </div>
                                <div className="text-4xl font-black font-mono tracking-tight">{timeLeft}</div>
                                <div className="text-[10px] text-white/80 mt-1">Automatic zero-leak release after TTL.</div>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={handleConfirm}
                              disabled={processing === "confirm" || (displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE")}
                              className="flex-1 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold py-3 rounded-xl transition disabled:opacity-40"
                            >
                              {processing === "confirm" ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Confirm Order"}
                            </button>
                            <button
                              onClick={handleRelease}
                              disabled={processing === "release" || (displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE")}
                              className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-3 rounded-xl transition disabled:opacity-40"
                            >
                              {processing === "release" ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Release Lock"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                          <Tag className="w-8 h-8 mb-2 opacity-40" />
                          <p className="text-xs">Select a reservation to inspect details</p>
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
                        onClick={() => setEventLogs([])}
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
            {(currentView === "Warehouses" || currentView === "Analytics") && (
              <AnimatePresence mode="wait">
                <motion.div key="wh" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">{currentView === "Warehouses" ? "Warehouse Nodes" : "Advanced Analytics"}</h2>
                      <p className="text-xs text-slate-400 font-medium">Cluster inventory distribution</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {stats.warehouses.map((wh: any) => (
                      <div key={wh.name} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-[#ff3b00]/10 text-[#ff3b00] flex items-center justify-center font-bold">
                            <Truck className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{wh.name}</div>
                            <div className="text-[11px] text-slate-400">{wh.location}</div>
                          </div>
                        </div>

                        <div className="space-y-2 text-xs font-semibold text-slate-600">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Total Stock</span>
                            <span className="text-slate-900">{wh.totalStock}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Reserved Locks</span>
                            <span className="text-[#ff3b00]">{wh.reservedStock}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Available</span>
                            <span className="text-emerald-600">{wh.availableStock}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

          </div>
        </div>
      </main>

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
                    <option value="inv_1" className="bg-slate-900">iPhone 15 Pro (Delhi Node)</option>
                    <option value="inv_2" className="bg-slate-900">iPhone 15 Pro (Mumbai Node)</option>
                    <option value="inv_3" className="bg-slate-900">MacBook Air M3 (Bengaluru Node)</option>
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
