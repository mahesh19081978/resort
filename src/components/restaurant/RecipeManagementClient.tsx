'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { saveRecipeAction } from '@/actions/restaurant';
import { formatCurrency } from '@/lib/utils';
import {
  ChefHat,
  Search,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Calculator,
  Edit2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RecipeItemData {
  id: string;
  name: string;
  code: string;
  categoryName: string;
  price: number;
  recipe: {
    id: string;
    yieldCount: number;
    instructions?: string | null;
    estimatedCost: string;
    ingredients: {
      id: string;
      inventoryItemId: string;
      inventoryItemName: string;
      unitCode: string;
      quantity: string;
      standardCost: string;
      notes?: string | null;
    }[];
  } | null;
}

export interface InventoryItemOption {
  id: string;
  name: string;
  code: string;
  unitCode: string;
  standardCost: number;
}

export function RecipeManagementClient({
  menuItems,
  inventoryItems,
}: {
  menuItems: RecipeItemData[];
  inventoryItems: InventoryItemOption[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBOM, setFilterBOM] = useState<'ALL' | 'WITH_BOM' | 'NO_BOM'>('ALL');

  // Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<RecipeItemData | null>(null);

  // Form states
  const [yieldCount, setYieldCount] = useState<number>(1);
  const [instructions, setInstructions] = useState<string>('');
  const [ingredients, setIngredients] = useState<
    {
      inventoryItemId: string;
      quantity: string;
      notes: string;
    }[]
  >([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredItems = menuItems.filter((item) => {
    if (filterBOM === 'WITH_BOM' && !item.recipe) return false;
    if (filterBOM === 'NO_BOM' && item.recipe) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchCode = item.code.toLowerCase().includes(q);
      const matchCat = item.categoryName.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchCat) return false;
    }
    return true;
  });

  const openEditor = (item: RecipeItemData) => {
    setSelectedMenuItem(item);
    setErrorMsg(null);
    if (item.recipe) {
      setYieldCount(item.recipe.yieldCount || 1);
      setInstructions(item.recipe.instructions || '');
      setIngredients(
        item.recipe.ingredients.map((ing) => ({
          inventoryItemId: ing.inventoryItemId,
          quantity: ing.quantity,
          notes: ing.notes || '',
        }))
      );
    } else {
      setYieldCount(1);
      setInstructions('');
      setIngredients([
        {
          inventoryItemId: inventoryItems[0]?.id || '',
          quantity: '1',
          notes: '',
        },
      ]);
    }
    setEditorOpen(true);
  };

  const addIngredientRow = () => {
    setIngredients([
      ...ingredients,
      {
        inventoryItemId: inventoryItems[0]?.id || '',
        quantity: '1',
        notes: '',
      },
    ]);
  };

  const removeIngredientRow = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: string, value: string) => {
    setIngredients(
      ingredients.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    );
  };

  // Live estimated recipe cost calculation in modal
  const liveEstimatedCost = ingredients.reduce((sum, ing) => {
    const inv = inventoryItems.find((i) => i.id === ing.inventoryItemId);
    const cost = inv ? inv.standardCost : 0;
    const qty = parseFloat(ing.quantity) || 0;
    return sum + cost * qty;
  }, 0);

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMenuItem) return;

    if (ingredients.length === 0) {
      setErrorMsg('Recipe must have at least one ingredient.');
      return;
    }

    // Verify all quantities are positive numbers
    for (const ing of ingredients) {
      const q = parseFloat(ing.quantity);
      if (isNaN(q) || q <= 0) {
        setErrorMsg('All ingredient quantities must be positive numbers.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await saveRecipeAction({
      menuItemId: selectedMenuItem.id,
      yieldCount: yieldCount || 1,
      instructions: instructions || undefined,
      ingredients: ingredients.map((ing) => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: parseFloat(ing.quantity),
        notes: ing.notes || undefined,
      })),
    });

    setIsSubmitting(false);

    if (res.success) {
      setEditorOpen(false);
      setSuccessMsg(`Recipe saved for "${selectedMenuItem.name}" with zero stock deduction.`);
      setTimeout(() => setSuccessMsg(null), 3500);
      window.location.reload();
    } else {
      setErrorMsg(res.error || 'Failed to save recipe');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-md flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-resort-sand">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterBOM('ALL')}
            className={cn(
              'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
              filterBOM === 'ALL'
                ? 'bg-resort-forest text-white shadow-sm'
                : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
            )}
          >
            All Dishes ({menuItems.length})
          </button>
          <button
            onClick={() => setFilterBOM('WITH_BOM')}
            className={cn(
              'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
              filterBOM === 'WITH_BOM'
                ? 'bg-resort-forest text-white shadow-sm'
                : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
            )}
          >
            Configured Recipes ({menuItems.filter((m) => m.recipe).length})
          </button>
          <button
            onClick={() => setFilterBOM('NO_BOM')}
            className={cn(
              'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
              filterBOM === 'NO_BOM'
                ? 'bg-resort-forest text-white shadow-sm'
                : 'bg-resort-sand/40 text-resort-charcoal hover:bg-resort-sand'
            )}
          >
            Missing BOM ({menuItems.filter((m) => !m.recipe).length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-resort-stone" />
          <input
            type="text"
            placeholder="Search dish, code, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
          />
        </div>
      </div>

      {/* Dishes / Recipes Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => {
          const hasRecipe = !!item.recipe;
          const cost = hasRecipe ? parseFloat(item.recipe!.estimatedCost) : 0;
          const margin = item.price > 0 ? (((item.price - cost) / item.price) * 100).toFixed(1) : 0;

          return (
            <Card
              key={item.id}
              className={cn(
                'border transition-all hover:shadow-sm flex flex-col justify-between',
                hasRecipe ? 'border-resort-sand' : 'border-amber-200 bg-amber-50/10'
              )}
            >
              <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-serif font-bold text-sm text-resort-charcoal">
                        {item.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-resort-stone uppercase font-medium">
                          {item.code}
                        </span>
                        <span className="text-[10px] text-resort-stone bg-resort-sand/30 px-1.5 py-0.2 rounded">
                          {item.categoryName}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-sm text-resort-forest">
                        {formatCurrency(item.price)}
                      </span>
                      <p className="text-[10px] text-resort-stone">Selling Price</p>
                    </div>
                  </div>

                  {/* Recipe Stats */}
                  {hasRecipe ? (
                    <div className="p-2.5 bg-resort-sand/15 rounded border border-resort-sand/80 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-resort-stone">Estimated Cost (BOM):</span>
                        <span className="font-mono font-bold text-resort-charcoal">
                          {formatCurrency(cost)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-resort-stone">Target Margin:</span>
                        <span className={cn('font-mono font-bold', Number(margin) >= 60 ? 'text-emerald-700' : 'text-amber-700')}>
                          {margin}%
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-resort-sand/50 text-[10px] text-resort-stone space-y-0.5">
                        <span className="font-semibold text-resort-charcoal">Ingredients ({item.recipe!.ingredients.length}):</span>
                        {item.recipe!.ingredients.slice(0, 3).map((ing) => (
                          <div key={ing.id} className="flex justify-between">
                            <span>• {ing.inventoryItemName}</span>
                            <span className="font-mono">
                              {ing.quantity} {ing.unitCode}
                            </span>
                          </div>
                        ))}
                        {item.recipe!.ingredients.length > 3 && (
                          <p className="text-[10px] italic text-resort-stone pt-0.5">
                            + {item.recipe!.ingredients.length - 3} more items...
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50/60 rounded border border-dashed border-amber-200 text-center space-y-1">
                      <Layers className="w-5 h-5 text-amber-600 mx-auto opacity-70" />
                      <p className="text-xs font-semibold text-amber-900">No Recipe Configured</p>
                      <p className="text-[10px] text-amber-700">
                        Add Bill of Materials to calculate food cost and track kitchen stock.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-resort-sand/60 flex items-center justify-end">
                  <Button
                    size="sm"
                    variant={hasRecipe ? 'outline' : 'primary'}
                    className="text-xs w-full sm:w-auto"
                    onClick={() => openEditor(item)}
                  >
                    <Edit2 className="w-3 h-3 mr-1.5" />
                    {hasRecipe ? 'Edit Recipe / BOM' : 'Create Recipe / BOM'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="p-8 text-center bg-white border border-dashed border-resort-sand rounded-lg text-resort-stone text-xs">
          No recipes match your filter criteria.
        </div>
      )}

      {/* RECIPE / BOM MODAL EDITOR */}
      {editorOpen && selectedMenuItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl border border-resort-sand w-full max-w-2xl overflow-hidden my-8">
            <div className="p-4 border-b border-resort-sand flex items-center justify-between bg-resort-sand/20">
              <div>
                <h3 className="font-serif font-bold text-base text-resort-charcoal">
                  Recipe & Bill of Materials — {selectedMenuItem.name}
                </h3>
                <p className="text-[11px] text-resort-stone font-mono uppercase">
                  Dish Code: {selectedMenuItem.code} • Selling Price: {formatCurrency(selectedMenuItem.price)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="text-resort-stone hover:text-resort-charcoal text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRecipe} className="p-4 space-y-4 text-xs">
              {errorMsg && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
                  {errorMsg}
                </div>
              )}

              {/* Yield & Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">
                    Yield Count (Portions per batch) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={yieldCount}
                    onChange={(e) => setYieldCount(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-resort-charcoal">
                    Preparation Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. Sauté with olive oil on high flame for 5 min..."
                    className="w-full px-2.5 py-1.5 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                  />
                </div>
              </div>

              {/* Ingredients Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-resort-charcoal">
                    Bill of Materials Ingredients ({ingredients.length}) *
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addIngredientRow}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Ingredient
                  </Button>
                </div>

                <div className="border border-resort-sand rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-resort-sand/30 border-b border-resort-sand text-resort-charcoal font-semibold text-[11px]">
                      <tr>
                        <th className="p-2">Inventory Item</th>
                        <th className="p-2 w-28">Quantity</th>
                        <th className="p-2 w-20">Unit</th>
                        <th className="p-2 w-28">Std Cost</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-resort-sand/60">
                      {ingredients.map((ing, idx) => {
                        const inv = inventoryItems.find((i) => i.id === ing.inventoryItemId);
                        const rowCost = inv ? inv.standardCost * (parseFloat(ing.quantity) || 0) : 0;

                        return (
                          <tr key={idx} className="hover:bg-resort-sand/10">
                            <td className="p-2">
                              <select
                                value={ing.inventoryItemId}
                                onChange={(e) => updateIngredient(idx, 'inventoryItemId', e.target.value)}
                                className="w-full px-2 py-1 border border-resort-sand rounded text-xs focus:outline-none focus:border-resort-forest"
                              >
                                {inventoryItems.map((invItem) => (
                                  <option key={invItem.id} value={invItem.id}>
                                    {invItem.name} ({invItem.code})
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2">
                              <input
                                type="number"
                                step="0.0001"
                                min="0.0001"
                                required
                                value={ing.quantity}
                                onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                                className="w-full px-2 py-1 border border-resort-sand rounded text-xs font-mono focus:outline-none focus:border-resort-forest"
                              />
                            </td>

                            <td className="p-2 font-mono text-resort-stone text-[11px]">
                              {inv?.unitCode || '-'}
                            </td>

                            <td className="p-2 font-mono text-resort-charcoal text-[11px]">
                              {formatCurrency(rowCost)}
                            </td>

                            <td className="p-2 text-right">
                              {ingredients.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeIngredientRow(idx)}
                                  className="text-red-500 hover:text-red-700 p-1"
                                  title="Remove Ingredient"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Real-Time Cost Summary Box */}
              <div className="p-3 bg-resort-sand/20 rounded-md border border-resort-sand flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-resort-forest" />
                  <span className="font-semibold text-resort-charcoal">
                    Estimated Recipe Cost:
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-serif font-bold text-base text-resort-forest">
                    {formatCurrency(liveEstimatedCost)}
                  </span>
                  <p className="text-[10px] text-resort-stone">
                    Based on current standard inventory purchase cost
                  </p>
                </div>
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded text-[11px]">
                <strong>Inventory Ledger Safety Guarantee:</strong> Saving a recipe formulation calculates estimated cost only. It does <strong>not</strong> deduct stock, alter on-hand quantities, or mutate historical KOT consumption snapshots.
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditorOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving Recipe...' : 'Save Recipe Formulation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
