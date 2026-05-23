"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ShoppingBag, Clock, CheckCircle2, AlertTriangle, Loader2, Sparkles, X, ChevronRight, Plus, Minus, Timer, RefreshCw, Search, Tag } from "lucide-react";
import { motion, AnimatePresence, Variants } from "framer-motion";

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
};

// Hardcoded categories mapped from product names to avoid DB schema changes on the fly
const CATEGORY_MAP: Record<string, string> = {
  "iPhone 15 Pro": "Smartphones",
  "PlayStation 5 Pro": "Gaming",
  "MacBook Pro M4": "Laptops",
  "DJI Mini 4 Pro": "Drones",
  "Sony Alpha a7 IV": "Photography",
  "Logitech MX Master 3S": "Accessories"
};

const CATEGORIES = ["All", "Smartphones", "Gaming", "Laptops", "Drones", "Photography", "Accessories"];

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariant: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function Store() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  
  const [toast, setToast] = useState<{ msg: string, isError: boolean, id: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [extended, setExtended] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New vibrant features: Search and Categories
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const showMessage = (msg: string, isError: boolean) => {
    setToast({ msg, isError, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        setProducts(await res.json());
      }
    } catch {
      if (!silent) showMessage("Network error fetching products", true);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
    
    const pollInterval = setInterval(() => {
      fetchProducts(true);
    }, 5000);
    
    return () => clearInterval(pollInterval);
  }, [fetchProducts]);

  useEffect(() => {
    if (!reservation) return;
    const interval = setInterval(() => {
      const expiry = new Date(reservation.expiresAt);
      if (expiry <= new Date()) {
        setTimeLeft("Expired");
        clearInterval(interval);
      } else {
        setTimeLeft(formatDistanceToNowStrict(expiry));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reservation]);

  const handleReserve = async (inventoryId: string, maxStock: number) => {
    const quantity = quantities[inventoryId] || 1;
    if (quantity > maxStock) {
      showMessage(`Only ${maxStock} units available`, true);
      return;
    }
    
    setProcessing(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ inventoryId, quantity }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to reserve", true);
        fetchProducts(true);
      } else {
        setReservation(data.reservation);
        setExtended(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      showMessage("Network error during reservation", true);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!reservation) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to confirm", true);
        if (res.status === 410) {
          setReservation(null);
        }
      } else {
        showMessage("Purchase confirmed successfully!", false);
        setReservation(null);
      }
      fetchProducts(true);
    } catch {
      showMessage("Network error during confirmation", true);
    } finally {
      setProcessing(false);
    }
  };

  const handleRelease = async () => {
    if (!reservation) return;
    setProcessing(true);
    try {
      await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      showMessage("Reservation cancelled", false);
      setReservation(null);
      fetchProducts(true);
    } catch {
      showMessage("Network error during cancellation", true);
    } finally {
      setProcessing(false);
    }
  };

  const handleExtend = async () => {
    if (!reservation) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/extend`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to extend", true);
      } else {
        setReservation(data.reservation);
        setExtended(true);
        showMessage("Reservation extended by 5 minutes", false);
      }
    } catch {
      showMessage("Network error extending reservation", true);
    } finally {
      setProcessing(false);
    }
  };

  const updateQuantity = (invId: string, delta: number, max: number) => {
    setQuantities(prev => {
      const current = prev[invId] || 1;
      const next = Math.max(1, Math.min(max, current + delta));
      return { ...prev, [invId]: next };
    });
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const category = CATEGORY_MAP[p.name] || "Uncategorized";
      const matchesCategory = activeCategory === "All" || category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
          <Loader2 className="w-12 h-12 text-pink-500" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 pt-8 md:pt-16 pb-32">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mb-12"
      >
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-6 md:p-8 rounded-3xl shadow-xl shadow-pink-100/50 border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-pink-400 to-orange-400 rounded-full blur-3xl opacity-10 -mr-20 -mt-20"></div>
          
          <div className="flex-1 relative z-10 w-full text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center md:justify-start gap-3">
              <ShoppingBag className="w-10 h-10 text-pink-500" />
              Pulse<span className="text-pink-500">Shop</span>
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Discover vibrant tech and gears.</p>
          </div>

          {!reservation && (
            <div className="flex-1 w-full relative z-10">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-slate-400 group-focus-within:text-pink-500 transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all shadow-inner"
                />
              </div>
            </div>
          )}
          
          {!reservation && (
            <button 
              onClick={() => { setIsRefreshing(true); fetchProducts(false); }}
              disabled={isRefreshing}
              className="hidden md:flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-3.5 rounded-2xl font-bold transition-all shadow-sm hover:shadow-md active:scale-95 whitespace-nowrap z-10"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin text-pink-500" : ""}`} />
              Sync
            </button>
          )}
        </div>

        {!reservation && (
          <div className="mt-8 flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-300 ${
                  activeCategory === cat 
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-105" 
                    : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {reservation ? (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full max-w-2xl mx-auto relative group"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-500 via-orange-400 to-pink-500 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 animate-gradient-xy"></div>
            <div className="relative bg-white/90 backdrop-blur-2xl border border-white rounded-3xl overflow-hidden shadow-2xl">
              <div className="bg-slate-50 border-b border-slate-100 px-8 py-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Secure Checkout</h2>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-sm ${timeLeft === "Expired" ? "bg-red-50 text-red-600 border border-red-100" : "bg-pink-50 text-pink-600 border border-pink-100 shadow-[0_0_15px_rgba(236,72,153,0.15)]"}`}>
                  <Clock className="w-4 h-4" />
                  {timeLeft}
                </div>
              </div>
              <div className="p-8">
                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6 mb-8 text-center">
                  <p className="text-slate-800 text-lg leading-relaxed font-medium">
                    You have securely reserved <span className="text-orange-600 font-extrabold text-xl mx-1">{reservation.quantity} unit(s)</span>. 
                    <br/><span className="text-slate-500 text-sm mt-2 block">Your reservation is active. Please confirm your purchase to secure the items.</span>
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleConfirm}
                    disabled={processing || timeLeft === "Expired"}
                    className="flex-1 bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pay Now"}
                  </button>
                  <button
                    onClick={handleExtend}
                    disabled={processing || extended || timeLeft === "Expired"}
                    className="bg-white text-pink-600 border-2 border-pink-100 font-bold py-4 px-6 rounded-2xl hover:bg-pink-50 hover:border-pink-200 transition-all duration-200 disabled:opacity-50 flex justify-center items-center group shadow-sm active:scale-95"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        <Timer className="w-5 h-5 mr-2" />
                        +5m Time
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleRelease}
                    disabled={processing}
                    className="bg-white text-slate-500 border-2 border-slate-100 font-bold py-4 px-6 rounded-2xl hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all duration-200 disabled:opacity-50 flex justify-center items-center active:scale-95"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Cancel"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {filteredProducts.length === 0 ? (
              <div className="text-center py-20">
                <Search className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-slate-700">No products found</h3>
                <p className="text-slate-500 mt-2">Try adjusting your category or search query.</p>
              </div>
            ) : (
              <motion.div
                key="store"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {filteredProducts.map((product) => {
                  const category = CATEGORY_MAP[product.name] || "Uncategorized";
                  return (
                  <motion.div 
                    variants={itemVariant}
                    key={product.id} 
                    className="group bg-white rounded-3xl overflow-hidden flex flex-col transition-all duration-300 shadow-sm border border-slate-100 hover:shadow-2xl hover:shadow-pink-100 hover:-translate-y-1"
                  >
                    <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                      {product.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image} alt={product.name} className="object-cover w-full h-full absolute inset-0 transform group-hover:scale-105 transition-transform duration-700 ease-out" />
                      )}
                      <div className="absolute top-4 left-4 z-20">
                        <span className="bg-white/90 backdrop-blur-md text-slate-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                          <Tag className="w-3 h-3 text-pink-500" />
                          {category}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
                    </div>
                    
                    <div className="p-6 flex-1 flex flex-col">
                      <h3 className="text-2xl font-extrabold text-slate-900 mb-2">{product.name}</h3>
                      <p className="text-slate-500 text-sm mb-6 line-clamp-2 leading-relaxed">{product.description}</p>
                      
                      <div className="mt-auto space-y-4">
                        {product.inventories.map((inv) => {
                          const isAvailable = inv.availableStock > 0;
                          const isLowStock = isAvailable && inv.availableStock <= 5;
                          const selectedQty = quantities[inv.id] || 1;

                          return (
                            <div key={inv.id} className="flex flex-col gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100 relative overflow-hidden group/inv">
                              {isLowStock && (
                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl -mr-10 -mt-10 animate-pulse pointer-events-none" />
                              )}
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="text-sm font-bold text-slate-800">{inv.warehouse.name}</div>
                                  <div className={`text-xs font-bold mt-1 flex items-center gap-1.5 ${
                                    isLowStock ? "text-orange-500" : isAvailable ? "text-emerald-500" : "text-slate-400"
                                  }`}>
                                    {isAvailable ? (
                                      <>
                                        <div className={`w-1.5 h-1.5 rounded-full ${isLowStock ? "bg-orange-500 animate-pulse" : "bg-emerald-500"}`} />
                                        {inv.availableStock} available {isLowStock && "(Low Stock!)"}
                                      </>
                                    ) : "Out of stock"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                  <button 
                                    onClick={() => updateQuantity(inv.id, -1, inv.availableStock)}
                                    disabled={!isAvailable || selectedQty <= 1 || processing}
                                    className="p-2 text-slate-500 hover:text-pink-600 hover:bg-pink-50 disabled:opacity-30 transition"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <div className="w-10 text-center text-sm font-extrabold text-slate-800">
                                    {isAvailable ? selectedQty : 0}
                                  </div>
                                  <button 
                                    onClick={() => updateQuantity(inv.id, 1, inv.availableStock)}
                                    disabled={!isAvailable || selectedQty >= inv.availableStock || processing}
                                    className="p-2 text-slate-500 hover:text-pink-600 hover:bg-pink-50 disabled:opacity-30 transition"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>

                                <button
                                  onClick={() => handleReserve(inv.id, inv.availableStock)}
                                  disabled={!isAvailable || processing}
                                  className={`flex items-center gap-1 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                                    isAvailable 
                                      ? "bg-slate-900 text-white hover:bg-pink-600 shadow-md hover:shadow-pink-500/30 active:scale-95" 
                                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                  }`}
                                >
                                  {isAvailable ? "Reserve" : "Sold Out"}
                                  {isAvailable && <ChevronRight className="w-4 h-4 -mr-1" />}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </motion.div>
                  )
                })}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`fixed bottom-6 right-6 p-4 rounded-2xl shadow-2xl flex items-center gap-3 max-w-sm border backdrop-blur-xl z-50 ${
              toast.isError 
                ? "bg-white/95 border-red-100 text-red-600 shadow-red-500/10" 
                : "bg-white/95 border-emerald-100 text-emerald-600 shadow-emerald-500/10"
            }`}
          >
            {toast.isError ? (
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            )}
            <p className="font-bold text-sm text-slate-800">{toast.msg}</p>
            <button onClick={() => setToast(null)} className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
