'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createRestaurantOrderAction } from '@/actions/restaurant';
import { formatCurrency } from '@/lib/utils';
import {
  Utensils,
  ShoppingBag,
  BedDouble,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface POSCategory {
  id: string;
  name: string;
  items: POSItem[];
}

export interface POSItem {
  id: string;
  name: string;
  code: string;
  price: number;
  taxRate: number;
  isVegetarian: boolean;
  isAvailable: boolean;
  kitchenStation?: string | null;
  description?: string | null;
}

export interface POSTableSession {
  id: string;
  sessionCode: string;
  guestName?: string | null;
  paxCount: number;
  tableNumbers: string[];
}

export interface POSActiveStay {
  id: string;
  stayNumber: string;
  guestName: string;
  roomNumber: string;
  roomId: string;
}

export interface CartItem {
  menuItemId: string;
  name: string;
  code: string;
  price: number;
  taxRate: number;
  quantity: number;
  notes?: string;
}

export function POSTerminal({
  restaurantId,
  categories,
  activeSessions,
  activeStays,
  initialTableSessionId,
}: {
  restaurantId: string;
  categories: POSCategory[];
  activeSessions: POSTableSession[];
  activeStays: POSActiveStay[];
  initialTableSessionId?: string;
}) {
  const router = useRouter();
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKE_AWAY' | 'ROOM_SERVICE'>('DINE_IN');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialTableSessionId || (activeSessions[0]?.id ?? '')
  );
  const [selectedStayId, setSelectedStayId] = useState<string>(activeStays[0]?.id ?? '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [fireKOTImmediately, setFireKOTImmediately] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter items
  const allItems = categories.flatMap((c) => c.items);
  const visibleItems = (selectedCategoryId === 'ALL'
    ? allItems
    : categories.find((c) => c.id === selectedCategoryId)?.items ?? []
  ).filter((i) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
  });

  const addToCart = (item: POSItem) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.menuItemId === item.id);
      if (existing) {
        return prev.map((ci) =>
          ci.menuItemId === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          code: item.code,
          price: item.price,
          taxRate: item.taxRate,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) => {
          if (ci.menuItemId === menuItemId) {
            const newQty = ci.quantity + delta;
            return newQty > 0 ? { ...ci, quantity: newQty } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const updateItemNotes = (menuItemId: string, notes: string) => {
    setCart((prev) =>
      prev.map((ci) => (ci.menuItemId === menuItemId ? { ...ci, notes } : ci))
    );
  };

  const removeFromCart = (menuItemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.menuItemId !== menuItemId));
  };

  // Cart financial summary
  const subtotal = cart.reduce((sum, ci) => sum + ci.price * ci.quantity, 0);
  const taxTotal = cart.reduce(
    (sum, ci) => sum + ci.price * ci.quantity * (ci.taxRate / 100),
    0
  );
  const grandTotal = subtotal + taxTotal;

  const handleSubmitOrder = async () => {
    if (!cart.length) {
      alert('Your order cart is empty.');
      return;
    }

    if (orderType === 'DINE_IN' && !selectedSessionId) {
      alert('Please select an active dining table session.');
      return;
    }

    if (orderType === 'ROOM_SERVICE') {
      if (!selectedStayId) {
        alert('Please select an active in-house stay for room service.');
        return;
      }
    }

    const currentStay = activeStays.find((s) => s.id === selectedStayId);

    const payload = {
      restaurantId,
      orderType,
      tableSessionId: orderType === 'DINE_IN' ? selectedSessionId : null,
      stayId: orderType === 'ROOM_SERVICE' ? selectedStayId : null,
      roomId: orderType === 'ROOM_SERVICE' ? currentStay?.roomId : null,
      notes: orderNotes || null,
      fireKOTImmediately,
      kitchenNote: kitchenNotes || null,
      items: cart.map((ci) => ({
        menuItemId: ci.menuItemId,
        quantity: ci.quantity,
        notes: ci.notes || null,
      })),
    };

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await createRestaurantOrderAction(payload);
    setIsSubmitting(false);

    if (res.success && res.data) {
      const data = res.data as { order: { id: string; orderNumber: string } };
      setSuccessMessage(`Order ${data.order.orderNumber} created successfully!`);
      setCart([]);
      setOrderNotes('');
      setKitchenNotes('');
      setTimeout(() => {
        router.push(`/admin/restaurant/orders/${data.order.id}`);
      }, 1200);
    } else {
      setErrorMessage(res.error || 'Failed to place order.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT 8 COLS: Order Context + Menu Catalog */}
      <div className="lg:col-span-8 space-y-4">
        {/* Order Type & Context Banner */}
        <div className="bg-white p-4 rounded-lg border border-resort-sand space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setOrderType('DINE_IN')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold border transition-colors',
                orderType === 'DINE_IN'
                  ? 'bg-resort-forest text-resort-ivory border-resort-forest'
                  : 'bg-white border-resort-sand text-resort-charcoal hover:bg-resort-sand/30'
              )}
            >
              <Utensils className="w-4 h-4" /> Dine-In Table
            </button>
            <button
              type="button"
              onClick={() => setOrderType('TAKE_AWAY')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold border transition-colors',
                orderType === 'TAKE_AWAY'
                  ? 'bg-resort-forest text-resort-ivory border-resort-forest'
                  : 'bg-white border-resort-sand text-resort-charcoal hover:bg-resort-sand/30'
              )}
            >
              <ShoppingBag className="w-4 h-4" /> Take-Away
            </button>
            <button
              type="button"
              onClick={() => setOrderType('ROOM_SERVICE')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold border transition-colors',
                orderType === 'ROOM_SERVICE'
                  ? 'bg-resort-forest text-resort-ivory border-resort-forest'
                  : 'bg-white border-resort-sand text-resort-charcoal hover:bg-resort-sand/30'
              )}
            >
              <BedDouble className="w-4 h-4" /> Room Service (PMS)
            </button>
          </div>

          {/* Context Selector */}
          {orderType === 'DINE_IN' && (
            <div className="flex items-center gap-3 text-xs bg-resort-sand/20 p-3 rounded border border-resort-sand">
              <label className="font-semibold text-resort-charcoal whitespace-nowrap">
                Select Table Session:
              </label>
              {activeSessions.length > 0 ? (
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-resort-sand rounded text-xs font-medium focus:ring-1 focus:ring-resort-forest focus:outline-none flex-1 max-w-sm"
                >
                  {activeSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tableNumbers.join(', ')} — {s.guestName || 'Guests'} ({s.sessionCode})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-amber-800 font-medium">
                  No active table sessions. Please open a table in Tables & Floor view.
                </span>
              )}
            </div>
          )}

          {orderType === 'ROOM_SERVICE' && (
            <div className="flex items-center gap-3 text-xs bg-indigo-50/50 p-3 rounded border border-indigo-200">
              <label className="font-semibold text-indigo-950 whitespace-nowrap">
                Select In-House Room / Stay:
              </label>
              {activeStays.length > 0 ? (
                <select
                  value={selectedStayId}
                  onChange={(e) => setSelectedStayId(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-indigo-200 rounded text-xs font-medium focus:ring-1 focus:ring-resort-forest focus:outline-none flex-1 max-w-sm"
                >
                  {activeStays.map((st) => (
                    <option key={st.id} value={st.id}>
                      Room {st.roomNumber} — {st.guestName} ({st.stayNumber})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-amber-800 font-medium">
                  No active in-house stays available for room service delivery.
                </span>
              )}
            </div>
          )}
        </div>

        {/* Menu Search & Categories */}
        <div className="bg-white p-4 rounded-lg border border-resort-sand space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-resort-stone" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search menu items by name or code..."
                className="w-full pl-9 pr-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('ALL')}
              className={cn(
                'px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors',
                selectedCategoryId === 'ALL'
                  ? 'bg-resort-forest text-resort-ivory font-semibold'
                  : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
              )}
            >
              All Categories ({allItems.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategoryId(c.id)}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors',
                  selectedCategoryId === c.id
                    ? 'bg-resort-forest text-resort-ivory font-semibold'
                    : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
                )}
              >
                {c.name} ({c.items.length})
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              onClick={() => addToCart(item)}
              className="p-3 bg-white rounded-lg border border-resort-sand hover:border-resort-forest/80 cursor-pointer shadow-sm hover:shadow transition-all flex flex-col justify-between select-none"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      'w-2.5 h-2.5 rounded-full inline-block shrink-0',
                      item.isVegetarian ? 'bg-emerald-600' : 'bg-red-600'
                    )}
                    title={item.isVegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
                  />
                  <span className="text-[10px] text-resort-stone font-mono uppercase">
                    {item.code}
                  </span>
                </div>
                <h4 className="font-serif font-bold text-xs text-resort-charcoal leading-snug line-clamp-2">
                  {item.name}
                </h4>
                {item.description && (
                  <p className="text-[10px] text-resort-stone line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>

              <div className="pt-2 mt-2 border-t border-resort-sand/60 flex items-center justify-between">
                <span className="font-bold text-xs text-resort-forest">
                  {formatCurrency(item.price)}
                </span>
                <span className="text-[10px] text-resort-stone bg-resort-sand/30 px-1.5 py-0.5 rounded">
                  +5% GST
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT 4 COLS: Order Cart Panel */}
      <div className="lg:col-span-4 bg-white rounded-lg border border-resort-sand p-4 space-y-4 sticky top-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-resort-sand pb-3">
          <div>
            <h3 className="font-serif font-bold text-base text-resort-charcoal">Current Order</h3>
            <span className="text-[11px] text-resort-stone">
              Mode: <strong className="text-resort-forest">{orderType.replace('_', ' ')}</strong>
            </span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="text-[11px] text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="p-2.5 bg-red-50 text-red-800 border border-red-200 rounded text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Cart Item List */}
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {cart.length === 0 ? (
            <div className="py-12 text-center text-xs text-resort-stone space-y-1">
              <ShoppingBag className="w-8 h-8 mx-auto text-resort-sand/80" />
              <p>No items in cart.</p>
              <p className="text-[10px]">Click menu cards on the left to add items.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.menuItemId}
                className="p-2.5 bg-resort-sand/20 rounded border border-resort-sand/60 text-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-semibold text-resort-charcoal">{item.name}</div>
                    <div className="text-[11px] text-resort-stone">
                      {formatCurrency(item.price)} each
                    </div>
                  </div>
                  <span className="font-bold text-resort-charcoal">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={item.notes || ''}
                    onChange={(e) => updateItemNotes(item.menuItemId, e.target.value)}
                    placeholder="Instructions (e.g., less spicy)"
                    className="flex-1 px-2 py-1 bg-white border border-resort-sand rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-resort-forest"
                  />

                  <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-resort-sand shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.menuItemId, -1)}
                      className="text-resort-stone hover:text-resort-charcoal"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.menuItemId, 1)}
                      className="text-resort-stone hover:text-resort-charcoal"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order Notes & KOT Option */}
        {cart.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-resort-sand text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-resort-charcoal">Kitchen Ticket Instructions</label>
              <input
                type="text"
                value={kitchenNotes}
                onChange={(e) => setKitchenNotes(e.target.value)}
                placeholder="Kitchen note (e.g., Serve starters first)"
                className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="fireKot"
                checked={fireKOTImmediately}
                onChange={(e) => setFireKOTImmediately(e.target.checked)}
                className="rounded border-resort-sand text-resort-forest focus:ring-resort-forest"
              />
              <label htmlFor="fireKot" className="text-[11px] font-medium text-resort-charcoal">
                Fire KOT immediately to Kitchen Display System (KDS)
              </label>
            </div>

            {/* Financial Ledger Calculation */}
            <div className="bg-resort-sand/30 p-3 rounded space-y-1.5 text-xs">
              <div className="flex justify-between text-resort-stone">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-resort-stone">
                <span>Estimated GST (5%)</span>
                <span>{formatCurrency(taxTotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-resort-charcoal border-t border-resort-sand pt-1.5">
                <span>Estimated Total</span>
                <span className="text-resort-forest">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <Button
              className="w-full text-xs"
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {isSubmitting ? 'Placing Order...' : 'Place Order & Send KOT'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
