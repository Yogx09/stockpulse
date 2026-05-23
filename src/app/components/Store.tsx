"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNowStrict, differenceInSeconds } from "date-fns";
import { 
  Package, Calendar, Building2, BarChart2, FileText, Settings, Search, Bell, Moon, LogOut,
  MoreVertical, Activity, ChevronDown, CheckCircle2, AlertCircle, Loader2, X, Clock
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
  productName?: string;
  warehouseName?: string;
};

// Mock past reservations for UI completeness
const MOCK_RESERVATIONS = [
  { id: "mock-1", productName: "MacBook Air M2", warehouseName: "Hyderabad Warehouse", quantity: 1, status: "CONFIRMED", time: "—" },
  { id: "mock-2", productName: "Sony WH-1000XM5", warehouseName: "Mumbai Warehouse", quantity: 1, status: "PENDING", time: "02:15" },
  { id: "mock-3", productName: "Apple Watch Series 9", warehouseName: "Delhi Warehouse", quantity: 1, status: "EXPIRED", time: "—" },
];

export default function Store() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  
  const [toast, setToast] = useState<{ msg: string, isError: boolean, id: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [processing, setProcessing] = useState<string | null>(null); // holds inventoryId being processed

  const showMessage = (msg: string, isError: boolean) => {
    setToast({ msg, isError, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) setProducts(await res.json());
    } catch {
      if (!silent) showMessage("Error fetching data", true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
    const interval = setInterval(() => fetchProducts(true), 5000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  useEffect(() => {
    if (!activeReservation) return;
    const interval = setInterval(() => {
      const expiry = new Date(activeReservation.expiresAt);
      if (expiry <= new Date()) {
        setTimeLeft("00:00");
        clearInterval(interval);
      } else {
        const diff = differenceInSeconds(expiry, new Date());
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        setTimeLeft(`${m}:${s}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeReservation]);

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
        fetchProducts(true);
      } else {
        const inv = product.inventories.find(i => i.id === inventoryId);
        setActiveReservation({
          ...data.reservation,
          productName: product.name,
          warehouseName: inv?.warehouse.name || "Main Warehouse"
        });
        showMessage("Asset Reserved. Please confirm in the Reservations panel.", false);
      }
    } catch {
      showMessage("Network error", true);
    } finally {
      setProcessing(null);
    }
  };

  const handleConfirm = async () => {
    if (!activeReservation) return;
    setProcessing("confirm");
    try {
      const res = await fetch(`/api/reservations/${activeReservation.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      if (res.ok) {
        showMessage("Order Confirmed Successfully!", false);
        setActiveReservation(null);
      } else {
        showMessage("Confirmation Failed", true);
      }
      fetchProducts(true);
    } finally {
      setProcessing(null);
    }
  };

  const stats = useMemo(() => {
    let globalStock = 0;
    let globalReserved = 0;
    const warehouses = new Set<string>();

    products.forEach(p => {
      p.inventories.forEach(inv => {
        globalStock += inv.totalStock;
        globalReserved += inv.reservedStock;
        warehouses.add(inv.warehouseId);
      });
    });

    return {
      productCount: products.length,
      warehouseCount: warehouses.size,
      globalStock,
      activeRes: globalReserved,
    };
  }, [products]);

  // Transform products for the table
  const tableData = useMemo(() => {
    return products.map(p => {
      const totalStock = p.inventories.reduce((sum, inv) => sum + inv.totalStock, 0);
      const reserved = p.inventories.reduce((sum, inv) => sum + inv.reservedStock, 0);
      const available = p.inventories.reduce((sum, inv) => sum + inv.availableStock, 0);
      const activeWarehouses = p.inventories.filter(inv => inv.totalStock > 0).length;
      
      // Pick best inventory to reserve from
      const bestInv = p.inventories.sort((a,b) => b.availableStock - a.availableStock)[0];

      return {
        ...p,
        totalStock,
        reserved,
        available,
        activeWarehouses,
        bestInv
      };
    });
  }, [products]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b0e14]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0e14] text-slate-300 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-[#11151d] border-r border-slate-800 flex flex-col hidden md:flex">
        <div className="h-20 flex items-center px-6 gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">StockPulse</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600 text-white font-medium shadow-md shadow-blue-500/10">
            <BarChart2 className="w-5 h-5" /> Dashboard
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
            <Package className="w-5 h-5" /> Products
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
            <Calendar className="w-5 h-5" /> Reservations
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
            <Building2 className="w-5 h-5" /> Warehouses
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
            <Activity className="w-5 h-5" /> Analytics
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
            <FileText className="w-5 h-5" /> Reports
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
            <Settings className="w-5 h-5" /> Settings
          </a>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-[#161b22] rounded-xl p-4 border border-slate-800/60 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
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
              <div className="text-xs text-slate-500 truncate">Admin</div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-20 flex items-center justify-between px-8 bg-[#0b0e14]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center md:hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mr-3">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">StockPulse</span>
          </div>

          <div className="hidden md:flex flex-1"></div>

          <div className="flex items-center gap-6 flex-1 justify-end">
            <div className="relative group w-full max-w-sm hidden lg:block">
              <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search products, warehouses..." 
                className="w-full bg-[#161b22] border border-slate-800 rounded-full pl-11 pr-16 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder-slate-500"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">Ctrl</kbd>
                <kbd className="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">K</kbd>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button className="relative text-slate-400 hover:text-white transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-[9px] font-bold text-white rounded-full flex items-center justify-center border-2 border-[#0b0e14]">3</span>
              </button>
              <button className="text-slate-400 hover:text-white transition-colors">
                <Moon className="w-5 h-5" />
              </button>
              <button className="text-slate-400 hover:text-white transition-colors ml-2">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-4 pb-24 scroll-smooth">
          <div className="max-w-[1600px] mx-auto space-y-6">
            
            {/* Greeting */}
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
                  <div className="text-xs text-emerald-500 font-medium mt-1">↑ 12.5% <span className="text-slate-500 font-normal">from last month</span></div>
                </div>
              </div>

              <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                <div className="w-14 h-14 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/20 flex-shrink-0">
                  <Calendar className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-400 mb-1">Active Reservations</div>
                  <div className="text-2xl font-bold text-white">{stats.activeRes}</div>
                  <div className="text-xs text-emerald-500 font-medium mt-1">↑ 18.2% <span className="text-slate-500 font-normal">from last month</span></div>
                </div>
              </div>

              <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20 flex-shrink-0">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-400 mb-1">Warehouses</div>
                  <div className="text-2xl font-bold text-white">{stats.warehouseCount}</div>
                  <div className="text-xs text-slate-500 font-normal mt-1">No change from last month</div>
                </div>
              </div>

              <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                <div className="w-14 h-14 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
                  <BarChart2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-400 mb-1">Total Inventory</div>
                  <div className="text-2xl font-bold text-white">{(stats.globalStock).toLocaleString()}</div>
                  <div className="text-xs text-emerald-500 font-medium mt-1">↑ 8.4% <span className="text-slate-500 font-normal">from last month</span></div>
                </div>
              </div>
            </div>

            {/* Middle Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart */}
              <div className="lg:col-span-2 bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col min-h-[400px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-white">Inventory Overview</h2>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs font-medium text-slate-300 cursor-pointer hover:bg-slate-800 transition">
                    <Calendar className="w-3.5 h-3.5" /> This Week <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </div>
                </div>
                
                <div className="flex-1 relative w-full flex items-end pt-10">
                  {/* Mock Chart Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pb-8 pt-4">
                    {[40, 30, 20, 10, 0].map(val => (
                      <div key={val} className="w-full flex items-center gap-4">
                        <span className="text-[10px] text-slate-500 w-6 text-right">{val ? `${val}K` : '0'}</span>
                        <div className="flex-1 h-[1px] bg-slate-800/50" />
                      </div>
                    ))}
                  </div>
                  
                  {/* Mock Area Chart SVG */}
                  <div className="absolute inset-0 left-10 pb-8 pt-4">
                    <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                      <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                        </linearGradient>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                      </defs>
                      <path d="M0,180 C100,120 200,80 300,140 C400,200 450,110 500,115 C550,120 600,60 700,80 C800,100 850,130 900,140 C950,150 980,110 1000,90 L1000,300 L0,300 Z" fill="url(#chartGradient)" />
                      <path d="M0,180 C100,120 200,80 300,140 C400,200 450,110 500,115 C550,120 600,60 700,80 C800,100 850,130 900,140 C950,150 980,110 1000,90" fill="none" stroke="#3b82f6" strokeWidth="3" filter="url(#glow)" />
                      {/* Dots */}
                      <circle cx="0" cy="180" r="4" fill="#3b82f6" stroke="#161b22" strokeWidth="2" />
                      <circle cx="150" cy="100" r="4" fill="#3b82f6" stroke="#161b22" strokeWidth="2" />
                      <circle cx="300" cy="140" r="4" fill="#3b82f6" stroke="#161b22" strokeWidth="2" />
                      <circle cx="450" cy="110" r="4" fill="#3b82f6" stroke="#161b22" strokeWidth="2" />
                      <circle cx="500" cy="115" r="4" fill="#60a5fa" stroke="#fff" strokeWidth="2" className="drop-shadow-lg" />
                      <circle cx="650" cy="70" r="4" fill="#3b82f6" stroke="#161b22" strokeWidth="2" />
                      <circle cx="850" cy="130" r="4" fill="#3b82f6" stroke="#161b22" strokeWidth="2" />
                      <circle cx="1000" cy="90" r="4" fill="#3b82f6" stroke="#161b22" strokeWidth="2" />
                    </svg>

                    {/* Tooltip */}
                    <div className="absolute top-[80px] left-[45%] -translate-x-1/2 bg-[#161b22] border border-slate-700 p-3 rounded-xl shadow-xl z-10 flex flex-col items-center">
                      <span className="text-[10px] text-slate-400 font-medium mb-1">Thursday</span>
                      <span className="text-sm font-bold text-white tracking-tight">{(stats.globalStock).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">items</span></span>
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#161b22] border-b border-r border-slate-700 rotate-45"></div>
                    </div>
                  </div>

                  {/* X Axis labels */}
                  <div className="absolute bottom-0 left-10 right-0 flex justify-between text-[11px] font-medium text-slate-500">
                    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                  </div>
                </div>
              </div>

              {/* Reservations List */}
              <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col h-full min-h-[400px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-white">Reservations</h2>
                  <button className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition">View all</button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                  {/* Active Reservation if exists */}
                  {activeReservation && (
                    <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-blue-500/30 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-blue-500/5 -translate-x-full animate-[shimmer_2s_infinite]" />
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center shadow-inner">
                          <Package className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white truncate max-w-[120px]">{activeReservation.productName}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" /> {activeReservation.warehouseName}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 relative z-10">
                        <span className="px-2 py-0.5 rounded flex items-center gap-1 bg-amber-500/10 text-amber-500 text-[10px] font-bold tracking-wider border border-amber-500/20">PENDING</span>
                        <div className="text-xs font-bold text-amber-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {timeLeft}</div>
                        <div className="flex gap-1 mt-1">
                          <button onClick={handleConfirm} disabled={processing === "confirm"} className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-500 disabled:opacity-50">Confirm</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mock Reservations */}
                  {MOCK_RESERVATIONS.map((res) => (
                    <div key={res.id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-center justify-center p-1.5">
                           <div className="w-full h-full bg-slate-700 rounded opacity-50" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-200 truncate max-w-[120px] group-hover:text-white transition-colors">{res.productName}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" /> {res.warehouseName}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                          res.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          res.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                          'bg-red-500/10 text-red-500 border-red-500/20'
                        }`}>
                          {res.status}
                        </span>
                        <div className={`text-[10px] font-bold ${res.status === 'PENDING' ? 'text-amber-500' : 'text-slate-600'}`}>
                          Qty: {res.quantity} <span className="ml-1 opacity-60 font-mono">{res.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top Products Table */}
              <div className="lg:col-span-2 bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-white">Top Products</h2>
                  <button className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition">View all products</button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide">Product</th>
                        <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Total Stock</th>
                        <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Reserved</th>
                        <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Available</th>
                        <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-center">Warehouses</th>
                        <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-center">Status</th>
                        <th className="pb-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {tableData.slice(0,4).map((p) => {
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
                                  <div className="text-[11px] text-slate-500 truncate max-w-[150px]">{p.description}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 text-right font-semibold text-white text-sm">{p.totalStock.toLocaleString()}</td>
                            <td className="py-4 text-right font-semibold text-red-400 text-sm">{p.reserved.toLocaleString()}</td>
                            <td className="py-4 text-right font-semibold text-emerald-400 text-sm">{p.available.toLocaleString()}</td>
                            <td className="py-4 text-center font-medium text-slate-300 text-sm">{p.activeWarehouses}</td>
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
                                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center justify-center w-20 shadow-md absolute top-1/2 -translate-y-1/2 right-2"
                                  >
                                    {processing === p.bestInv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reserve"}
                                  </button>
                               )}
                              <button className={`text-slate-500 hover:text-white p-1 rounded-md hover:bg-slate-700 transition ${inStock ? 'group-hover:opacity-0' : ''}`}>
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Warehouse Distribution */}
              <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col">
                <h2 className="text-lg font-bold text-white mb-6">Warehouse Distribution</h2>
                
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="relative w-48 h-48 mb-6">
                    {/* Mock SVG Donut Chart */}
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 filter drop-shadow-md">
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1e293b" strokeWidth="20" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="0" className="opacity-90" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#0ea5e9" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="65" className="opacity-90" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="120" className="opacity-90" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f59e0b" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="170" className="opacity-90" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ef4444" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="210" className="opacity-90" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#8b5cf6" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="240" className="opacity-90" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#161b22] rounded-full w-32 h-32 m-auto border-[10px] border-[#161b22] shadow-inner">
                       <span className="text-xl font-bold text-white tracking-tight">{(stats.globalStock).toLocaleString()}</span>
                       <span className="text-[10px] text-slate-500 font-medium">Total Items</span>
                    </div>
                  </div>
                  
                  <div className="w-full space-y-2.5">
                    {[
                      { name: "Bangalore", val: "6,520 (26.6%)", color: "bg-blue-500" },
                      { name: "Hyderabad", val: "5,320 (21.7%)", color: "bg-sky-500" },
                      { name: "Mumbai", val: "4,850 (19.8%)", color: "bg-emerald-500" },
                      { name: "Delhi", val: "4,120 (16.8%)", color: "bg-amber-500" },
                      { name: "Chennai", val: "2,450 (10.0%)", color: "bg-red-500" },
                      { name: "Others", val: "1,272 (5.1%)", color: "bg-purple-500" }
                    ].map(w => (
                      <div key={w.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${w.color}`} />
                          <span className="text-slate-300 font-medium">{w.name}</span>
                        </div>
                        <span className="text-slate-400 font-mono">{w.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <button className="mt-6 w-full py-2.5 bg-slate-800/30 hover:bg-slate-800 text-xs text-slate-300 hover:text-white font-medium rounded-xl border border-slate-700/50 transition flex justify-center items-center gap-2">
                  View warehouse analytics →
                </button>
              </div>
            </div>
            
          </div>
        </div>

      </main>

      {/* Toast Notification */}
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
            {toast.isError ? (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
            )}
            <p className="font-medium text-sm text-slate-200">{toast.msg}</p>
            <button onClick={() => setToast(null)} className="ml-auto text-slate-500 hover:text-slate-300 transition">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
