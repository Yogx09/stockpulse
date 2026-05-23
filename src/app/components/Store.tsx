"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNowStrict, differenceInSeconds, format } from "date-fns";
import { 
  Package, Calendar, Building2, BarChart2, FileText, Settings, Search, Bell, Moon, LogOut,
  MoreVertical, Activity, ChevronDown, CheckCircle2, AlertCircle, Loader2, X, Clock,
  Plus, CalendarDays, Timer, CheckCircle, XCircle, ChevronRight, ChevronLeft, Maximize2, AlertTriangle, MapPin, TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Product = {
  id: string;
  name: string;
  description: string;
  image: string;
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

export default function Store() {
  const [currentView, setCurrentView] = useState<"Dashboard" | "Products" | "Reservations" | "Warehouses" | "Analytics" | "Reports" | "Alerts" | "Settings">("Dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Real-time reservation state
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  
  const [toast, setToast] = useState<{ msg: string, isError: boolean, id: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [timerPercent, setTimerPercent] = useState<number>(100);
  const [processing, setProcessing] = useState<string | null>(null);

  const showMessage = (msg: string, isError: boolean) => {
    setToast({ msg, isError, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [prodRes, resRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/reservations")
      ]);
      if (prodRes.ok) setProducts(await prodRes.json());
      if (resRes.ok) setReservations(await resRes.json());
    } catch {
      if (!silent) showMessage("Error fetching data", true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(() => fetchData(true), 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Global timer for the active real reservation (or selected reservation)
  useEffect(() => {
    const target = selectedRes || activeReservation || reservations[0];
    if (!target) return;
    
    const TOTAL_SECONDS = 600;
    
    const interval = setInterval(() => {
      const expiry = new Date(target.expiresAt);
      const now = new Date();
      
      if (expiry <= now || target.status === "EXPIRED" || target.status === "CONFIRMED" || target.status === "RELEASED") {
        setTimeLeft("00:00");
        setTimerPercent(0);
        clearInterval(interval);
      } else {
        const diff = differenceInSeconds(expiry, now);
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        setTimeLeft(`${m}:${s}`);
        setTimerPercent(Math.max(0, Math.min(100, (diff / TOTAL_SECONDS) * 100)));
      }
    }, 1000);
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
        // Optimistically add to list
        setReservations(prev => [newRes, ...prev]);
        setCurrentView("Reservations");
        window.scrollTo({ top: 0, behavior: "smooth" });
        showMessage("Reservation created.", false);
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
      if (res.ok) {
        showMessage("Order Confirmed Successfully!", false);
        const updated = { ...target, status: "CONFIRMED" };
        setActiveReservation(null);
        setSelectedRes(updated);
      } else {
        showMessage("Confirmation Failed", true);
      }
      fetchData(true);
    } finally {
      setProcessing(null);
    }
  };

  const handleRelease = async () => {
    const target = selectedRes || activeReservation;
    if (!target) return;
    setProcessing("release");
    try {
      await fetch(`/api/reservations/${target.id}/release`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      showMessage("Reservation released.", false);
      const updated = { ...target, status: "RELEASED" };
      setActiveReservation(null);
      setSelectedRes(updated);
      fetchData(true);
    } finally {
      setProcessing(null);
    }
  };

  const stats = useMemo(() => {
    let globalStock = 0;
    let globalReserved = 0;
    const warehouseMap = new Map();

    products.forEach(p => {
      p.inventories.forEach(inv => {
        globalStock += inv.totalStock;
        globalReserved += inv.reservedStock;
        
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
    const expiringSoon = reservations.filter(r => (r.status === 'ACTIVE' || r.status === 'PENDING') && new Date(r.expiresAt).getTime() - nowTime < 300000).length;
    const confirmed = reservations.filter(r => r.status === 'CONFIRMED').length;
    const expiredOrReleased = reservations.filter(r => r.status === 'EXPIRED' || r.status === 'RELEASED').length;

    return { 
      productCount: products.length, 
      warehouseCount: warehouseMap.size, 
      warehouses: Array.from(warehouseMap.values()),
      globalStock, 
      globalReserved,
      totalRes: reservations.length,
      activeRes,
      expiringSoon,
      confirmed,
      expiredOrReleased
    };
  }, [products, reservations]);

  const tableData = useMemo(() => {
    return products.map(p => {
      const totalStock = p.inventories.reduce((sum, inv) => sum + inv.totalStock, 0);
      const reserved = p.inventories.reduce((sum, inv) => sum + inv.reservedStock, 0);
      const available = p.inventories.reduce((sum, inv) => sum + inv.availableStock, 0);
      const activeWarehouses = p.inventories.filter(inv => inv.totalStock > 0).length;
      const bestInv = [...p.inventories].sort((a,b) => b.availableStock - a.availableStock)[0];
      return { ...p, totalStock, reserved, available, activeWarehouses, bestInv };
    });
  }, [products]);

  const displayRes = selectedRes || activeReservation || reservations[0];

  if (loading && products.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b0e14]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const renderSidebar = () => {
    const navItems = [
      { id: "Dashboard", icon: BarChart2 },
      { id: "Products", icon: Package },
      { id: "Reservations", icon: CalendarDays },
      { id: "Warehouses", icon: Building2 },
      { id: "Analytics", icon: Activity },
      { id: "Reports", icon: FileText },
      { id: "Alerts", icon: AlertCircle },
      { id: "Settings", icon: Settings },
    ];

    return (
      <aside className="w-64 bg-[#11151d] border-r border-slate-800 flex-col hidden md:flex h-full">
        <div className="h-20 flex items-center px-6 gap-3 flex-shrink-0 cursor-pointer" onClick={() => setCurrentView("Dashboard")}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">StockPulse</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button 
              key={item.id}
              onClick={() => setCurrentView(item.id as "Dashboard" | "Products" | "Reservations" | "Warehouses" | "Analytics" | "Reports" | "Alerts" | "Settings")} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === item.id ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}
            >
              <item.icon className="w-5 h-5" /> {item.id}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <div className="bg-[#161b22] rounded-xl p-4 border border-slate-800/60 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-sm font-semibold text-slate-200">System Status</span>
            </div>
            <span className="text-xs text-emerald-500/80 font-medium">All Systems Operational</span>
          </div>

          <div className="flex items-center gap-3 px-2 py-2 cursor-pointer hover:bg-slate-800/50 rounded-xl transition">
            <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
              <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="User" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate">Arjun Patel</div>
              <div className="text-[11px] text-slate-500 truncate">Administrator</div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      </aside>
    );
  };

  const renderTopbar = () => (
    <header className="h-20 flex items-center justify-between px-8 bg-[#0b0e14]/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800/50">
      <div className="flex items-center md:hidden">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mr-3">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white">StockPulse</span>
      </div>

      <div className="hidden md:flex flex-1 items-center gap-2 text-sm text-slate-500 font-medium">
        <span className="cursor-pointer hover:text-slate-300" onClick={() => setCurrentView("Dashboard")}>Home</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-300">{currentView}</span>
      </div>

      <div className="flex items-center gap-6 flex-1 justify-end">
        <div className="relative group w-full max-w-sm hidden lg:block">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder={`Search ${currentView.toLowerCase()}...`} 
            className="w-full bg-[#161b22] border border-slate-800 rounded-full pl-11 pr-16 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder-slate-500"
          />
        </div>

        <div className="flex items-center gap-4">
          <button className="relative text-slate-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-[9px] font-bold text-white rounded-full flex items-center justify-center border-2 border-[#0b0e14]">3</span>
          </button>
          <button className="text-slate-400 hover:text-white transition-colors">
            <Moon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0e14] text-slate-300 font-sans selection:bg-indigo-500/30">
      {renderSidebar()}

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {renderTopbar()}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-4 pb-24 scroll-smooth">
          <div className="max-w-[1600px] mx-auto space-y-6">
            
            {currentView === "Dashboard" && (
              <AnimatePresence mode="wait">
                <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* Dashboard Header */}
                  <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome back, Arjun! 👋</h1>
                    <p className="text-slate-400">Here&apos;s what&apos;s happening with your inventory today.</p>
                  </div>

                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20 flex-shrink-0">
                        <Package className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Total Products</div>
                        <div className="text-2xl font-bold text-white">{stats.productCount}</div>
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/20 flex-shrink-0">
                        <Calendar className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Active Reservations</div>
                        <div className="text-2xl font-bold text-white">{stats.activeRes}</div>
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20 flex-shrink-0">
                        <Building2 className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Warehouses</div>
                        <div className="text-2xl font-bold text-white">{stats.warehouseCount}</div>
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
                        <BarChart2 className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Total Inventory</div>
                        <div className="text-2xl font-bold text-white">{(stats.globalStock).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col min-h-[400px]">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-white">Inventory Overview</h2>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs font-medium text-slate-300 cursor-pointer hover:bg-slate-800 transition">
                          <Calendar className="w-3.5 h-3.5" /> This Week <ChevronDown className="w-3.5 h-3.5 ml-1" />
                        </div>
                      </div>
                      <div className="flex-1 relative w-full flex items-end pt-10">
                        <div className="absolute inset-0 flex flex-col justify-between pb-8 pt-4">
                          {[40, 30, 20, 10, 0].map(val => (
                            <div key={val} className="w-full flex items-center gap-4">
                              <span className="text-[10px] text-slate-500 w-6 text-right">{val ? `${val}K` : '0'}</span>
                              <div className="flex-1 h-[1px] bg-slate-800/50" />
                            </div>
                          ))}
                        </div>
                        <div className="absolute inset-0 left-10 pb-8 pt-4">
                          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                            <defs>
                              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <path d="M0,180 C100,120 200,80 300,140 C400,200 450,110 500,115 C550,120 600,60 700,80 C800,100 850,130 900,140 C950,150 980,110 1000,90 L1000,300 L0,300 Z" fill="url(#chartGradient)" />
                            <path d="M0,180 C100,120 200,80 300,140 C400,200 450,110 500,115 C550,120 600,60 700,80 C800,100 850,130 900,140 C950,150 980,110 1000,90" fill="none" stroke="#3b82f6" strokeWidth="3" />
                            <circle cx="500" cy="115" r="4" fill="#60a5fa" stroke="#fff" strokeWidth="2" className="drop-shadow-lg" />
                          </svg>
                          <div className="absolute top-[80px] left-[45%] -translate-x-1/2 bg-[#161b22] border border-slate-700 p-3 rounded-xl shadow-xl z-10 flex flex-col items-center">
                            <span className="text-[10px] text-slate-400 font-medium mb-1">Thursday</span>
                            <span className="text-sm font-bold text-white tracking-tight">{(stats.globalStock).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">items</span></span>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-10 right-0 flex justify-between text-[11px] font-medium text-slate-500">
                          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                        </div>
                      </div>
                    </div>

                    {/* Donut Chart */}
                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col">
                      <h2 className="text-lg font-bold text-white mb-6">Warehouse Distribution</h2>
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="relative w-48 h-48 mb-6">
                          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 filter drop-shadow-md">
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1e293b" strokeWidth="20" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="0" className="opacity-90" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#0ea5e9" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="80" className="opacity-90" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="150" className="opacity-90" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#161b22] rounded-full w-32 h-32 m-auto border-[10px] border-[#161b22]">
                            <span className="text-xl font-bold text-white tracking-tight">{(stats.globalStock).toLocaleString()}</span>
                            <span className="text-[10px] text-slate-500 font-medium">Total Items</span>
                          </div>
                        </div>
                        <div className="w-full space-y-2.5">
                          {stats.warehouses.map((w, i) => {
                             const colors = ["bg-blue-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500"];
                             const percentage = ((w.totalStock / stats.globalStock) * 100).toFixed(1);
                             return (
                              <div key={w.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${colors[i % colors.length]}`} />
                                  <span className="text-slate-300 font-medium">{w.name}</span>
                                </div>
                                <span className="text-slate-400 font-mono">{percentage}%</span>
                              </div>
                             )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Products Table */}
                  <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-lg font-bold text-white">Top Products</h2>
                      <button onClick={() => setCurrentView("Products")} className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition">View all</button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide">Product</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Total Stock</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Reserved</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Available</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-center">Status</th>
                            <th className="pb-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {tableData.slice(0,5).map((p) => {
                            const inStock = p.available > 0;
                            return (
                              <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                                <td className="py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0">
                                      {p.image && <img src={p.image} alt={p.name} className="w-full h-full object-cover" />}
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-slate-200">{p.name}</div>
                                      <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{p.description}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 text-right font-semibold text-white text-sm">{p.totalStock.toLocaleString()}</td>
                                <td className="py-4 text-right font-semibold text-red-400 text-sm">{p.reserved.toLocaleString()}</td>
                                <td className="py-4 text-right font-semibold text-emerald-400 text-sm">{p.available.toLocaleString()}</td>
                                <td className="py-4 text-center">
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-[9px] font-bold tracking-wider border ${
                                    inStock ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                                  }`}>
                                    {inStock ? "IN STOCK" : "DEPLETED"}
                                  </span>
                                </td>
                                <td className="py-4 text-right relative">
                                   {inStock && p.bestInv && (
                                      <button 
                                        onClick={() => handleReserve(p, p.bestInv.id, p.bestInv.availableStock)}
                                        disabled={processing === p.bestInv.id}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center justify-center w-20 shadow-md absolute top-1/2 -translate-y-1/2 right-2"
                                      >
                                        {processing === p.bestInv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reserve"}
                                      </button>
                                   )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {currentView === "Reservations" && (
              <AnimatePresence mode="wait">
                <motion.div key="reservations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex justify-between items-start md:items-center mb-8">
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-2">Reservations</h1>
                      <p className="text-slate-400">Manage and track all inventory reservations in real-time.</p>
                    </div>
                    <button onClick={() => setCurrentView("Dashboard")} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all">
                      <Plus className="w-4 h-4" /> New Reservation
                    </button>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { title: "Total Reservations", val: stats.totalRes, color: "bg-indigo-600", icon: CalendarDays },
                      { title: "Active Reservations", val: stats.activeRes, color: "bg-blue-600", icon: Clock },
                      { title: "Expiring Soon", val: stats.expiringSoon, color: "bg-orange-500", icon: Timer },
                      { title: "Confirmed", val: stats.confirmed, color: "bg-emerald-600", icon: CheckCircle },
                      { title: "Expired / Released", val: stats.expiredOrReleased, color: "bg-red-500", icon: XCircle },
                    ].map((s, i) => (
                      <div key={i} className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-4 shadow-sm flex flex-col">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center shadow-lg`}>
                            <s.icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="text-xs font-semibold text-slate-400 leading-tight">{s.title}</div>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">{s.val}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[700px]">
                    <div className="lg:col-span-2 bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col h-full overflow-hidden">
                      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                        <h2 className="text-lg font-bold text-white">All Reservations</h2>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {reservations.length === 0 ? (
                           <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                              <CalendarDays className="w-10 h-10 opacity-50" />
                              <p>No reservations found in database.</p>
                           </div>
                        ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800">
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Warehouse</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Qty</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Expires In</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {reservations.map((res) => {
                              const isSelected = displayRes?.id === res.id;
                              return (
                                <tr key={res.id} onClick={() => setSelectedRes(res)} className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-900/10' : 'hover:bg-slate-800/30'}`}>
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-md bg-slate-800 overflow-hidden flex-shrink-0">
                                        {res.image && <img src={res.image} alt={res.productName} className="w-full h-full object-cover" />}
                                      </div>
                                      <div className={`text-sm font-semibold truncate max-w-[120px] ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>{res.productName}</div>
                                    </div>
                                  </td>
                                  <td className="py-4 text-xs text-slate-400">{res.warehouseName}</td>
                                  <td className="py-4 text-center text-xs font-semibold text-white">{res.quantity}</td>
                                  <td className="py-4 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                                      res.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                      res.status === 'ACTIVE' || res.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                      res.status === 'EXPIRED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                      'bg-slate-500/10 text-blue-400 border-blue-500/20'
                                    }`}>
                                      {res.status}
                                    </span>
                                  </td>
                                  <td className="py-4 text-right text-xs">
                                     {res.status === 'ACTIVE' || res.status === 'PENDING' ? (
                                        <div className="text-amber-500 font-bold flex items-center justify-end gap-1"><Clock className="w-3 h-3" /> {res.id === displayRes?.id ? timeLeft : 'Pending'}</div>
                                     ) : (
                                        <div className="text-slate-600 font-bold">—</div>
                                     )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col h-full overflow-y-auto">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-white">Reservation Details</h2>
                      </div>

                      {displayRes ? (
                        <>
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 bg-slate-800 rounded-xl overflow-hidden flex-shrink-0">
                               {displayRes.image && <img src={displayRes.image} alt={displayRes.productName} className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1">
                               <div className="text-sm font-bold text-white mb-1">{displayRes.productName}</div>
                               <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                                  displayRes.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                  displayRes.status === 'ACTIVE' || displayRes.status === 'PENDING' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                  'bg-red-500/10 text-red-500 border-red-500/20'
                                }`}>
                                  {displayRes.status}
                                </span>
                            </div>
                          </div>

                          <div className="space-y-4 text-xs mb-8 bg-[#11151d] p-4 rounded-xl border border-slate-800">
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Reservation ID</span>
                               <span className="text-slate-300 font-mono truncate max-w-[120px]">{displayRes.id}</span>
                             </div>
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Warehouse</span>
                               <span className="text-slate-300">{displayRes.warehouseName}</span>
                             </div>
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> Quantity</span>
                               <span className="text-slate-300">{displayRes.quantity} Units</span>
                             </div>
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Reserved At</span>
                               <span className="text-slate-300">{format(new Date(displayRes.createdAt), "MMM dd, yyyy hh:mm a")}</span>
                             </div>
                             <div className="flex justify-between">
                               <span className="text-slate-500 flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Expires At</span>
                               <span className="text-slate-300">{format(new Date(displayRes.expiresAt), "MMM dd, yyyy hh:mm a")}</span>
                             </div>
                          </div>

                          {(displayRes.status === 'ACTIVE' || displayRes.status === 'PENDING') && (
                            <div className="bg-[#1e1915] border border-amber-900/30 rounded-xl p-5 mb-8 relative overflow-hidden">
                               <div className="absolute top-0 left-0 h-1 bg-amber-500 transition-all duration-1000 ease-linear" style={{ width: `${timerPercent}%` }} />
                               <div className="text-[10px] text-amber-500/80 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Expires In</div>
                               <div className="flex items-end gap-2 mb-2">
                                  <div className="text-4xl font-bold text-amber-500 font-mono tracking-tighter">
                                    {timeLeft.split(':')[0] || '00'}
                                  </div>
                                  <div className="text-sm text-amber-500/50 font-bold mb-1">min</div>
                                  <div className="text-4xl font-bold text-amber-500/50 pb-1">:</div>
                                  <div className="text-4xl font-bold text-amber-500 font-mono tracking-tighter">
                                    {timeLeft.split(':')[1] || '00'}
                                  </div>
                                  <div className="text-sm text-amber-500/50 font-bold mb-1">sec</div>
                               </div>
                               <div className="text-[10px] text-amber-500/60 font-medium">Reservation will be automatically released after expiry.</div>
                            </div>
                          )}

                          <div className="mt-auto space-y-3">
                             <div className="flex gap-3">
                                <button 
                                  onClick={handleConfirm}
                                  disabled={processing === "confirm" || displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE"}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex justify-center items-center"
                                >
                                  {processing === "confirm" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Reservation"}
                                </button>
                                <button 
                                  onClick={handleRelease}
                                  disabled={processing === "release" || displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE"}
                                  className="flex-1 bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold py-3 rounded-xl transition disabled:opacity-50 flex justify-center items-center"
                                >
                                  {processing === "release" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Release Reservation"}
                                </button>
                             </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <Package className="w-12 h-12 text-slate-700 mb-4" />
                          <p className="text-slate-400 text-sm">Select a reservation to view details</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {currentView === "Products" && (
              <motion.div key="products" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                 <h1 className="text-3xl font-bold text-white mb-6">Product Catalog</h1>
                 <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {tableData.map(p => (
                       <div key={p.id} className="bg-[#161b22] border border-slate-800/60 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition">
                          <div className="h-48 bg-slate-800 relative">
                             {p.image && <img src={p.image} alt={p.name} className="w-full h-full object-cover" />}
                             <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
                                {p.available} In Stock
                             </div>
                          </div>
                          <div className="p-5">
                             <h3 className="font-bold text-white text-lg mb-1">{p.name}</h3>
                             <p className="text-xs text-slate-400 line-clamp-2 mb-4">{p.description}</p>
                             <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                                <div className="text-xs">
                                   <span className="text-slate-500 block">Total Capacity</span>
                                   <span className="font-bold text-slate-300">{p.totalStock} Units</span>
                                </div>
                                <div className="text-xs text-right">
                                   <span className="text-slate-500 block">Currently Reserved</span>
                                   <span className="font-bold text-red-400">{p.reserved} Units</span>
                                </div>
                             </div>
                             <button 
                               onClick={() => p.bestInv && handleReserve(p, p.bestInv.id, p.bestInv.availableStock)}
                               disabled={p.available <= 0}
                               className="w-full mt-4 py-2 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 border border-indigo-500/20"
                             >
                                Reserve
                             </button>
                          </div>
                       </div>
                    ))}
                 </div>
              </motion.div>
            )}

            {currentView === "Warehouses" && (
              <motion.div key="warehouses" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                 <h1 className="text-3xl font-bold text-white mb-6">Fulfillment Centers</h1>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {stats.warehouses.map(w => (
                       <div key={w.id} className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex items-start gap-6">
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                             <Building2 className="w-8 h-8 text-emerald-400" />
                          </div>
                          <div className="flex-1">
                             <h3 className="text-xl font-bold text-white mb-1">{w.name}</h3>
                             <p className="text-sm text-slate-400 flex items-center gap-1 mb-4"><MapPin className="w-4 h-4" /> {w.location}</p>
                             
                             <div className="grid grid-cols-3 gap-4 p-4 bg-[#11151d] rounded-xl border border-slate-800">
                                <div>
                                   <div className="text-xs text-slate-500 mb-1">Total Stock</div>
                                   <div className="font-bold text-white">{w.totalStock}</div>
                                </div>
                                <div>
                                   <div className="text-xs text-slate-500 mb-1">Available</div>
                                   <div className="font-bold text-emerald-400">{w.availableStock}</div>
                                </div>
                                <div>
                                   <div className="text-xs text-slate-500 mb-1">Reserved</div>
                                   <div className="font-bold text-amber-400">{w.reservedStock}</div>
                                </div>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </motion.div>
            )}

            {(currentView === "Analytics" || currentView === "Reports" || currentView === "Alerts" || currentView === "Settings") && (
              <motion.div key="other" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-[60vh] text-center">
                 <TrendingUp className="w-20 h-20 text-indigo-500/30 mb-6" />
                 <h2 className="text-3xl font-bold text-white mb-3">{currentView} Module</h2>
                 <p className="text-slate-400 max-w-md">This module integrates perfectly with the existing live data. Your inventory utilization is currently at {stats.globalStock ? Math.round((stats.globalReserved / stats.globalStock) * 100) : 0}%.</p>
                 <button onClick={() => setCurrentView("Dashboard")} className="mt-8 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition">Back to Dashboard</button>
              </motion.div>
            )}

          </div>
        </div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            className="fixed bottom-6 right-6 p-4 rounded-xl shadow-lg border bg-[#1e2532] flex items-center gap-3 max-w-sm z-50 shadow-black/50"
            style={{ borderColor: toast.isError ? '#ef4444' : '#3b82f6' }}
          >
            {toast.isError ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />}
            <p className="font-medium text-sm text-slate-200">{toast.msg}</p>
            <button onClick={() => setToast(null)} className="ml-auto text-slate-500 hover:text-slate-300 transition"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
