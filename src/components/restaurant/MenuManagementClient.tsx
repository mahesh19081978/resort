'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  saveMenuCategoryAction,
  saveMenuItemAction,
  updateMenuItemPriceAction,
  setMenuItemAvailabilityAction,
  deleteOrArchiveMenuItemAction,
} from '@/actions/restaurant';
import { formatCurrency } from '@/lib/utils';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChefHat,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MenuCategoryData {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  items: MenuItemData[];
}

export interface MenuItemData {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  description?: string | null;
  price: number;
  taxRate: number;
  taxCode?: string | null;
  isVegetarian: boolean;
  isAvailable: boolean;
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'SEASONAL_UNAVAILABLE';
  prepTimeMinutes?: number | null;
  isArchived: boolean;
  kitchenStation: string;
  imageUrl?: string | null;
  recipe?: {
    id: string;
    yieldCount: number;
    ingredients: {
      id: string;
      quantity: string | number;
      inventoryItem: {
        id: string;
        name: string;
        baseUnit: { code: string };
      };
    }[];
  } | null;
}

export function MenuManagementClient({
  restaurantId,
  categories,
}: {
  restaurantId: string;
  categories: MenuCategoryData[];
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'dishes' | 'categories'>('dishes');

  // Modal States
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategoryData | null>(null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemData | null>(null);

  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceItem, setPriceItem] = useState<MenuItemData | null>(null);
  const [newPrice, setNewPrice] = useState<string>('');

  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [availabilityItem, setAvailabilityItem] = useState<MenuItemData | null>(null);
  const [newAvailability, setNewAvailability] = useState<'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'SEASONAL_UNAVAILABLE'>('AVAILABLE');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MenuItemData | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form states for item
  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemTaxRate, setItemTaxRate] = useState('5.0');
  const [itemDescription, setItemDescription] = useState('');
  const [itemIsVeg, setItemIsVeg] = useState(true);
  const [itemStation, setItemStation] = useState('MAIN_KITCHEN');
  const [itemPrepTime, setItemPrepTime] = useState('');

  // Form states for category
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState('0');
  const [catActive, setCatActive] = useState(true);

  // Filter items
  const allItems = categories.flatMap((c) => c.items);
  const filteredItems = allItems.filter((item) => {
    if (selectedCategoryId !== 'ALL' && item.categoryId !== selectedCategoryId) return false;
    if (availabilityFilter !== 'ALL' && item.availabilityStatus !== availabilityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchCode = item.code.toLowerCase().includes(q);
      const matchCat = categories.find((c) => c.id === item.categoryId)?.name.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchCat) return false;
    }
    return true;
  });

  const openAddItemModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemCode('');
    setItemCategoryId(categories[0]?.id || '');
    setItemPrice('');
    setItemTaxRate('5.0');
    setItemDescription('');
    setItemIsVeg(true);
    setItemStation('MAIN_KITCHEN');
    setItemPrepTime('15');
    setActionError(null);
    setItemModalOpen(true);
  };

  const openEditItemModal = (item: MenuItemData) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCode(item.code);
    setItemCategoryId(item.categoryId);
    setItemPrice(String(item.price));
    setItemTaxRate(String(item.taxRate));
    setItemDescription(item.description || '');
    setItemIsVeg(item.isVegetarian);
    setItemStation(item.kitchenStation || 'MAIN_KITCHEN');
    setItemPrepTime(item.prepTimeMinutes ? String(item.prepTimeMinutes) : '');
    setActionError(null);
    setItemModalOpen(true);
  };

  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCatName('');
    setCatOrder(String(categories.length * 10));
    setCatActive(true);
    setActionError(null);
    setCategoryModalOpen(true);
  };

  const openEditCategoryModal = (cat: MenuCategoryData) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatOrder(String(cat.displayOrder));
    setCatActive(cat.isActive);
    setActionError(null);
    setCategoryModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);

    const res = await saveMenuItemAction({
      id: editingItem ? editingItem.id : undefined,
      categoryId: itemCategoryId,
      name: itemName,
      code: itemCode,
      description: itemDescription || undefined,
      price: parseFloat(itemPrice),
      taxRate: parseFloat(itemTaxRate) || 5.0,
      isVegetarian: itemIsVeg,
      isAvailable: editingItem ? editingItem.isAvailable : true,
      availabilityStatus: editingItem ? editingItem.availabilityStatus : 'AVAILABLE',
      prepTimeMinutes: itemPrepTime ? parseInt(itemPrepTime, 10) : undefined,
      kitchenStation: itemStation,
    });

    setIsSubmitting(false);
    if (res.success) {
      setItemModalOpen(false);
      setActionSuccess(editingItem ? 'Dish updated successfully' : 'Dish added successfully');
      setTimeout(() => setActionSuccess(null), 3000);
      window.location.reload();
    } else {
      setActionError(res.error || 'Failed to save menu item');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);

    const res = await saveMenuCategoryAction({
      id: editingCategory ? editingCategory.id : undefined,
      restaurantId,
      name: catName,
      displayOrder: parseInt(catOrder, 10) || 0,
      isActive: catActive,
    });

    setIsSubmitting(false);
    if (res.success) {
      setCategoryModalOpen(false);
      setActionSuccess(editingCategory ? 'Category updated' : 'Category created');
      setTimeout(() => setActionSuccess(null), 3000);
      window.location.reload();
    } else {
      setActionError(res.error || 'Failed to save category');
    }
  };

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceItem) return;
    setIsSubmitting(true);
    setActionError(null);

    const res = await updateMenuItemPriceAction({
      menuItemId: priceItem.id,
      price: parseFloat(newPrice),
    });

    setIsSubmitting(false);
    if (res.success) {
      setPriceModalOpen(false);
      setActionSuccess(`Price updated for ${priceItem.name}`);
      setTimeout(() => setActionSuccess(null), 3000);
      window.location.reload();
    } else {
      setActionError(res.error || 'Failed to update price');
    }
  };

  const handleUpdateAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!availabilityItem) return;
    setIsSubmitting(true);
    setActionError(null);

    const isAvail = newAvailability === 'AVAILABLE';
    const res = await setMenuItemAvailabilityAction({
      menuItemId: availabilityItem.id,
      availabilityStatus: newAvailability,
      isAvailable: isAvail,
    });

    setIsSubmitting(false);
    if (res.success) {
      setAvailabilityModalOpen(false);
      setActionSuccess(`Availability status updated for ${availabilityItem.name}`);
      setTimeout(() => setActionSuccess(null), 3000);
      window.location.reload();
    } else {
      setActionError(res.error || 'Failed to update availability');
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsSubmitting(true);
    setActionError(null);

    const res = await deleteOrArchiveMenuItemAction(itemToDelete.id);
    setIsSubmitting(false);

    if (res.success) {
      setDeleteModalOpen(false);
      const wasHard = (res.data as any)?.hardDeleted;
      setActionSuccess(
        wasHard
          ? `Dish "${itemToDelete.name}" permanently deleted.`
          : `Dish "${itemToDelete.name}" archived safely due to order history.`
      );
      setTimeout(() => setActionSuccess(null), 3000);
      window.location.reload();
    } else {
      setActionError(res.error || 'Failed to delete dish');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast / Notification */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-md flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-resort-sand">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('dishes')}
            className={cn(
              'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
              activeTab === 'dishes'
                ? 'bg-resort-forest text-white shadow-sm'
                : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
            )}
          >
            Dishes ({allItems.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={cn(
              'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
              activeTab === 'categories'
                ? 'bg-resort-forest text-white shadow-sm'
                : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
            )}
          >
            Categories ({categories.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {activeTab === 'dishes' ? (
            <Button size="sm" onClick={openAddItemModal} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-1.5" /> Add Dish
            </Button>
          ) : (
            <Button size="sm" onClick={openAddCategoryModal} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-1.5" /> Add Category
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'dishes' ? (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3.5 rounded-lg border border-resort-sand text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-resort-stone" />
              <input
                type="text"
                placeholder="Search dish or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
              />
            </div>

            <div>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
              >
                <option value="ALL">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.items.length})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
              >
                <option value="ALL">All Availability Statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="TEMPORARILY_UNAVAILABLE">Temporarily Unavailable</option>
                <option value="SEASONAL_UNAVAILABLE">Seasonal Unavailable</option>
              </select>
            </div>
          </div>

          {/* Dishes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const category = categories.find((c) => c.id === item.categoryId);
              const isOrderable =
                item.isAvailable && !item.isArchived && item.availabilityStatus === 'AVAILABLE';

              return (
                <Card
                  key={item.id}
                  className={cn(
                    'border transition-all hover:shadow-sm flex flex-col justify-between',
                    !isOrderable ? 'border-amber-200 bg-amber-50/10' : 'border-resort-sand'
                  )}
                >
                  <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                'w-2.5 h-2.5 rounded-full inline-block shrink-0',
                                item.isVegetarian ? 'bg-emerald-600' : 'bg-red-600'
                              )}
                              title={item.isVegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
                            />
                            <h4 className="font-serif font-bold text-sm text-resort-charcoal">
                              {item.name}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-resort-stone uppercase font-medium">
                              {item.code}
                            </span>
                            <span className="text-[10px] text-resort-stone bg-resort-sand/30 px-1.5 py-0.2 rounded">
                              {category?.name}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-bold text-sm text-resort-forest">
                            {formatCurrency(item.price)}
                          </span>
                          <p className="text-[10px] text-resort-stone font-mono">
                            GST {item.taxRate}%
                          </p>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-xs text-resort-stone leading-relaxed line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      {/* Badges / Status */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {item.availabilityStatus === 'AVAILABLE' && (
                          <Badge variant="success" className="text-[10px] font-medium">
                            Available
                          </Badge>
                        )}
                        {item.availabilityStatus === 'TEMPORARILY_UNAVAILABLE' && (
                          <Badge variant="warning" className="text-[10px] font-medium">
                            Temp Unavailable
                          </Badge>
                        )}
                        {item.availabilityStatus === 'SEASONAL_UNAVAILABLE' && (
                          <Badge variant="danger" className="text-[10px] font-medium">
                            Seasonal Unavailable
                          </Badge>
                        )}
                        {item.prepTimeMinutes && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-resort-stone bg-resort-sand/20 px-1.5 py-0.5 rounded">
                            <Clock className="w-2.5 h-2.5" /> {item.prepTimeMinutes}m
                          </span>
                        )}
                        <span className="text-[10px] text-resort-stone bg-resort-sand/20 px-1.5 py-0.5 rounded">
                          {item.kitchenStation}
                        </span>
                        {item.recipe && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                            <ChefHat className="w-2.5 h-2.5" /> BOM ({item.recipe.ingredients.length})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-3 border-t border-resort-sand/60 flex items-center justify-between gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-resort-charcoal hover:bg-resort-sand/40"
                          onClick={() => {
                            setPriceItem(item);
                            setNewPrice(String(item.price));
                            setActionError(null);
                            setPriceModalOpen(true);
                          }}
                          title="Change Price"
                        >
                          <DollarSign className="w-3.5 h-3.5 mr-0.5" /> Price
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-resort-charcoal hover:bg-resort-sand/40"
                          onClick={() => {
                            setAvailabilityItem(item);
                            setNewAvailability(item.availabilityStatus);
                            setActionError(null);
                            setAvailabilityModalOpen(true);
                          }}
                          title="Change Availability"
                        >
                          {item.isAvailable ? <EyeOff className="w-3.5 h-3.5 mr-0.5" /> : <Eye className="w-3.5 h-3.5 mr-0.5" />}
                          Status
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-resort-charcoal hover:bg-resort-sand/40"
                          onClick={() => openEditItemModal(item)}
                          title="Edit Dish"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setItemToDelete(item);
                            setActionError(null);
                            setDeleteModalOpen(true);
                          }}
                          title="Delete or Archive Dish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="p-8 text-center bg-white border border-dashed border-resort-sand rounded-lg text-resort-stone text-xs">
              No menu items match your search or filter criteria.
            </div>
          )}
        </div>
      ) : (
        /* Categories Table */
        <div className="bg-white rounded-lg border border-resort-sand overflow-hidden">
          <div className="p-4 border-b border-resort-sand flex items-center justify-between">
            <h3 className="font-serif font-bold text-sm text-resort-charcoal">
              Menu Categories & Display Ordering
            </h3>
            <span className="text-xs text-resort-stone">
              Ordering determines display rank on POS terminal
            </span>
          </div>

          <div className="divide-y divide-resort-sand">
            {categories.map((category) => (
              <div
                key={category.id}
                className="p-3.5 flex items-center justify-between hover:bg-resort-sand/10 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-resort-charcoal">
                      {category.name}
                    </span>
                    <Badge
                      variant={category.isActive ? 'success' : 'secondary'}
                      className="text-[10px]"
                    >
                      {category.isActive ? 'Active' : 'Hidden'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-resort-stone">
                    Display Order: <strong className="font-mono">{category.displayOrder}</strong> • {category.items.length} items configured
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => openEditCategoryModal(category)}
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT DISH */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-lg overflow-hidden my-8">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <h3 className="font-serif font-bold text-base text-resort-charcoal">
                {editingItem ? 'Edit Menu Dish' : 'Add New Menu Dish'}
              </h3>
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-4 space-y-4 text-xs">
              {actionError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="font-semibold text-resort-charcoal">Dish Name *</label>
                  <input
                    type="text"
                    required
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Wilderness Roast Chicken"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  />
                </div>

                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="font-semibold text-resort-charcoal">Code / SKU *</label>
                  <input
                    type="text"
                    required
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value.toUpperCase())}
                    placeholder="e.g. MN-CHK-01"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs font-mono uppercase focus:outline-none focus:border-resort-forest"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Category *</label>
                  <select
                    value={itemCategoryId}
                    onChange={(e) => setItemCategoryId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Price (INR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    placeholder="e.g. 450"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">GST Tax % *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={itemTaxRate}
                    onChange={(e) => setItemTaxRate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Station</label>
                  <input
                    type="text"
                    value={itemStation}
                    onChange={(e) => setItemStation(e.target.value)}
                    placeholder="MAIN_KITCHEN"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">Prep Time (Min)</label>
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={itemPrepTime}
                    onChange={(e) => setItemPrepTime(e.target.value)}
                    placeholder="15"
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Description</label>
                <textarea
                  rows={2}
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Culinary notes, allergens, side pairings..."
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={itemIsVeg}
                    onChange={(e) => setItemIsVeg(e.target.checked)}
                    className="rounded border-resort-sand text-resort-forest"
                  />
                  <span>Vegetarian Dish</span>
                </label>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItemModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving Dish...' : 'Save Dish'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT CATEGORY */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <h3 className="font-serif font-bold text-sm text-resort-charcoal">
                {editingCategory ? 'Edit Category' : 'Create Category'}
              </h3>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-4 space-y-3 text-xs">
              {actionError && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {actionError}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Category Name *</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Starters & Appetizers"
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Display Order</label>
                <input
                  type="number"
                  min="0"
                  value={catOrder}
                  onChange={(e) => setCatOrder(e.target.value)}
                  placeholder="0, 10, 20..."
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={catActive}
                    onChange={(e) => setCatActive(e.target.checked)}
                    className="rounded border-resort-sand text-resort-forest"
                  />
                  <span>Active (Visible on POS)</span>
                </label>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCategoryModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PRICE CHANGE DIALOG WITH AUDIT */}
      {priceModalOpen && priceItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <h3 className="font-serif font-bold text-sm text-resort-charcoal">
                Update Price — {priceItem.name}
              </h3>
              <button
                type="button"
                onClick={() => setPriceModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePrice} className="p-4 space-y-3 text-xs">
              {actionError && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {actionError}
                </div>
              )}

              <p className="text-resort-stone">
                Current Price: <strong className="text-resort-forest">{formatCurrency(priceItem.price)}</strong>
              </p>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">New Price (INR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest font-bold"
                />
              </div>

              <p className="text-[11px] text-resort-stone bg-resort-sand/20 p-2 rounded">
                This modification is recorded in the system audit log. Historical bills and orders will retain their locked price.
              </p>

              <div className="pt-2 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPriceModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Update Price'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: AVAILABILITY STATUS DIALOG */}
      {availabilityModalOpen && availabilityItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <h3 className="font-serif font-bold text-sm text-resort-charcoal">
                Availability — {availabilityItem.name}
              </h3>
              <button
                type="button"
                onClick={() => setAvailabilityModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateAvailability} className="p-4 space-y-3 text-xs">
              {actionError && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {actionError}
                </div>
              )}

              <div className="space-y-2">
                <label className="font-semibold text-resort-charcoal">Set Availability Lifecycle:</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 p-2 rounded border border-resort-sand/60 cursor-pointer hover:bg-emerald-50/40">
                    <input
                      type="radio"
                      name="availability"
                      value="AVAILABLE"
                      checked={newAvailability === 'AVAILABLE'}
                      onChange={() => setNewAvailability('AVAILABLE')}
                    />
                    <div>
                      <span className="font-medium text-emerald-800">Available</span>
                      <p className="text-[10px] text-resort-stone">Orderable in POS Terminal</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded border border-resort-sand/60 cursor-pointer hover:bg-amber-50/40">
                    <input
                      type="radio"
                      name="availability"
                      value="TEMPORARILY_UNAVAILABLE"
                      checked={newAvailability === 'TEMPORARILY_UNAVAILABLE'}
                      onChange={() => setNewAvailability('TEMPORARILY_UNAVAILABLE')}
                    />
                    <div>
                      <span className="font-medium text-amber-800">Temporarily Unavailable</span>
                      <p className="text-[10px] text-resort-stone">Out of stock today; 86-ed in kitchen</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded border border-resort-sand/60 cursor-pointer hover:bg-red-50/40">
                    <input
                      type="radio"
                      name="availability"
                      value="SEASONAL_UNAVAILABLE"
                      checked={newAvailability === 'SEASONAL_UNAVAILABLE'}
                      onChange={() => setNewAvailability('SEASONAL_UNAVAILABLE')}
                    />
                    <div>
                      <span className="font-medium text-red-800">Seasonal Unavailable</span>
                      <p className="text-[10px] text-resort-stone">Off-season dish; disabled from ordering</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-2 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAvailabilityModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Confirm'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: DELETE / ARCHIVE DIALOG */}
      {deleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-red-50">
              <h3 className="font-serif font-bold text-sm text-red-800 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-600" /> Remove or Archive Dish
              </h3>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {actionError && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {actionError}
                </div>
              )}

              <p className="text-resort-charcoal">
                Are you sure you want to remove <strong>{itemToDelete.name}</strong> ({itemToDelete.code})?
              </p>

              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded text-[11px] space-y-1">
                <p className="font-semibold">Foreign Key Protection Guarantee:</p>
                <p>
                  If this dish has ever been ordered on a live or historical KOT/Bill, it will be <strong>safely archived</strong> rather than hard deleted to preserve financial audit integrity.
                </p>
              </div>

              <div className="pt-2 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleDeleteItem}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Removal'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
