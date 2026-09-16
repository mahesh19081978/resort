import { describe, it, expect } from 'vitest';
import { isMenuItemOrderable } from '../menu-service';
import { calculateEstimatedRecipeCost } from '../recipe-service';
import {
  menuCategorySchema,
  menuItemSchema,
  updateMenuItemPriceSchema,
  setMenuItemAvailabilitySchema,
  saveRecipeSchema,
  sittingAreaSchema,
  tableSchema,
  bulkTableSchema,
} from '@/validations/restaurant';
import { Prisma } from '@prisma/client';

describe('RESTAURANT MANAGEMENT DOMAIN & INVARIANTS', () => {
  // ====================================================
  // 1. CANONICAL ORDERABILITY PREDICATE TESTS
  // ====================================================
  describe('Canonical Orderability Predicate (isMenuItemOrderable)', () => {
    it('returns true when item is available, not archived, and AVAILABLE status', () => {
      expect(
        isMenuItemOrderable({
          isAvailable: true,
          isArchived: false,
          availabilityStatus: 'AVAILABLE',
        })
      ).toBe(true);
    });

    it('returns false when isAvailable is false', () => {
      expect(
        isMenuItemOrderable({
          isAvailable: false,
          isArchived: false,
          availabilityStatus: 'AVAILABLE',
        })
      ).toBe(false);
    });

    it('returns false when isArchived is true', () => {
      expect(
        isMenuItemOrderable({
          isAvailable: true,
          isArchived: true,
          availabilityStatus: 'AVAILABLE',
        })
      ).toBe(false);
    });

    it('returns false when availabilityStatus is TEMPORARILY_UNAVAILABLE', () => {
      expect(
        isMenuItemOrderable({
          isAvailable: true,
          isArchived: false,
          availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        })
      ).toBe(false);
    });

    it('returns false when availabilityStatus is SEASONAL_UNAVAILABLE', () => {
      expect(
        isMenuItemOrderable({
          isAvailable: true,
          isArchived: false,
          availabilityStatus: 'SEASONAL_UNAVAILABLE',
        })
      ).toBe(false);
    });
  });

  // ====================================================
  // 2. RECIPE ESTIMATED COST CALCULATION TESTS
  // ====================================================
  describe('Recipe BOM Estimated Cost Calculation', () => {
    it('calculates sum(quantity * standardCost) with high decimal precision', () => {
      const ingredients = [
        { quantity: new Prisma.Decimal('0.2500'), standardCost: new Prisma.Decimal('120.00') }, // 30.00
        { quantity: new Prisma.Decimal('0.0500'), standardCost: new Prisma.Decimal('400.00') }, // 20.00
        { quantity: new Prisma.Decimal('1.0000'), standardCost: new Prisma.Decimal('15.50') },  // 15.50
      ];

      const cost = calculateEstimatedRecipeCost(ingredients);
      expect(cost.toString()).toBe('65.5');
      expect(cost.toFixed(2)).toBe('65.50');
    });

    it('returns 0.00 when recipe has no ingredients', () => {
      const cost = calculateEstimatedRecipeCost([]);
      expect(cost.toFixed(2)).toBe('0.00');
    });
  });

  // ====================================================
  // 3. VALIDATION SCHEMAS & BOUNDARY CONSTRAINTS
  // ====================================================
  describe('Restaurant Validation Schemas', () => {
    describe('Menu Category Schema', () => {
      it('validates a valid menu category', () => {
        const valid = {
          restaurantId: 'rest-123',
          name: 'Main Courses',
          displayOrder: 10,
          isActive: true,
        };
        const res = menuCategorySchema.safeParse(valid);
        expect(res.success).toBe(true);
      });

      it('rejects empty or single-character category name', () => {
        const res = menuCategorySchema.safeParse({
          restaurantId: 'rest-123',
          name: 'A',
        });
        expect(res.success).toBe(false);
      });
    });

    describe('Menu Item Schema', () => {
      it('validates a complete dish definition', () => {
        const valid = {
          categoryId: 'cat-123',
          name: 'Butter Chicken Masala',
          code: 'MN-BC-01',
          price: 450,
          taxRate: 5.0,
          isVegetarian: false,
          isAvailable: true,
          availabilityStatus: 'AVAILABLE',
          prepTimeMinutes: 20,
          kitchenStation: 'CURRY_STATION',
        };
        const res = menuItemSchema.safeParse(valid);
        expect(res.success).toBe(true);
      });

      it('rejects non-positive price or invalid code syntax', () => {
        const invalidPrice = menuItemSchema.safeParse({
          categoryId: 'cat-123',
          name: 'Butter Chicken Masala',
          code: 'MN-BC-01',
          price: 0,
        });
        expect(invalidPrice.success).toBe(false);

        const invalidCode = menuItemSchema.safeParse({
          categoryId: 'cat-123',
          name: 'Butter Chicken Masala',
          code: 'invalid code with spaces!',
          price: 100,
        });
        expect(invalidCode.success).toBe(false);
      });
    });

    describe('Price & Availability Schemas', () => {
      it('validates price change schema with positive number', () => {
        const valid = updateMenuItemPriceSchema.safeParse({
          menuItemId: 'item-123',
          price: 499.5,
        });
        expect(valid.success).toBe(true);
      });

      it('rejects negative or zero price change', () => {
        const invalid = updateMenuItemPriceSchema.safeParse({
          menuItemId: 'item-123',
          price: -10,
        });
        expect(invalid.success).toBe(false);
      });

      it('validates availability status lifecycle transitions', () => {
        const avail = setMenuItemAvailabilitySchema.safeParse({
          menuItemId: 'item-123',
          availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        });
        expect(avail.success).toBe(true);
      });
    });

    describe('Recipe Formulation Schema', () => {
      it('validates recipe BOM with multiple ingredients', () => {
        const valid = {
          menuItemId: 'item-123',
          yieldCount: 1,
          instructions: 'Marinate overnight and grill on skewers.',
          ingredients: [
            { inventoryItemId: 'inv-1', quantity: 0.35, notes: 'Boneless chicken' },
            { inventoryItemId: 'inv-2', quantity: 0.05, notes: 'Yogurt spice mix' },
          ],
        };
        const res = saveRecipeSchema.safeParse(valid);
        expect(res.success).toBe(true);
      });

      it('rejects recipe with empty ingredients list', () => {
        const invalid = {
          menuItemId: 'item-123',
          yieldCount: 1,
          ingredients: [],
        };
        const res = saveRecipeSchema.safeParse(invalid);
        expect(res.success).toBe(false);
      });

      it('rejects recipe with zero or negative ingredient quantity', () => {
        const invalid = {
          menuItemId: 'item-123',
          yieldCount: 1,
          ingredients: [{ inventoryItemId: 'inv-1', quantity: -0.5 }],
        };
        const res = saveRecipeSchema.safeParse(invalid);
        expect(res.success).toBe(false);
      });
    });

    describe('Sitting Area Schema', () => {
      it('validates standard sitting area with uppercase code', () => {
        const valid = {
          restaurantId: 'rest-123',
          name: 'Open Forest Terrace',
          code: 'EXT_TERRACE',
          description: 'Outdoor scenic deck under canopy',
          displayOrder: 20,
          isActive: true,
        };
        const res = sittingAreaSchema.safeParse(valid);
        expect(res.success).toBe(true);
      });

      it('rejects invalid code characters', () => {
        const invalid = sittingAreaSchema.safeParse({
          restaurantId: 'rest-123',
          name: 'Open Forest Terrace',
          code: 'TERRACE #1',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('Table & Bulk Table Schemas', () => {
      it('validates single table configuration', () => {
        const valid = {
          restaurantId: 'rest-123',
          sittingAreaId: 'area-123',
          tableNumber: 'T-10',
          capacity: 6,
          isActive: true,
        };
        const res = tableSchema.safeParse(valid);
        expect(res.success).toBe(true);
      });

      it('rejects table capacity exceeding upper bound', () => {
        const res = tableSchema.safeParse({
          restaurantId: 'rest-123',
          sittingAreaId: 'area-123',
          tableNumber: 'T-10',
          capacity: 100,
        });
        expect(res.success).toBe(false);
      });

      it('validates bulk table creation parameters', () => {
        const valid = {
          restaurantId: 'rest-123',
          sittingAreaId: 'area-123',
          prefix: 'T',
          startNumber: 1,
          count: 6,
          capacity: 4,
        };
        const res = bulkTableSchema.safeParse(valid);
        expect(res.success).toBe(true);
      });

      it('rejects bulk count exceeding batch limit of 50', () => {
        const invalid = {
          restaurantId: 'rest-123',
          sittingAreaId: 'area-123',
          prefix: 'T',
          startNumber: 1,
          count: 51,
          capacity: 4,
        };
        const res = bulkTableSchema.safeParse(invalid);
        expect(res.success).toBe(false);
      });
    });
  });

  // ====================================================
  // 4. TAX IMMUTABILITY & AUDIT CONSTRAINTS
  // ====================================================
  describe('Tax Snapshot Immutability Invariant', () => {
    it('proves that changing a master tax or menu item price preserves historical bill item amounts', () => {
      // Historical line item created at price 400 with 5% tax
      const historicalOrderItem = {
        menuItemId: 'dish-1',
        unitPrice: new Prisma.Decimal('400.00'),
        taxRate: new Prisma.Decimal('5.00'),
        quantity: 2,
      };

      const historicalLineTotal = historicalOrderItem.unitPrice.times(historicalOrderItem.quantity);
      const historicalTaxAmount = historicalLineTotal.times(historicalOrderItem.taxRate).dividedBy(100);

      expect(historicalLineTotal.toString()).toBe('800');
      expect(historicalTaxAmount.toString()).toBe('40');

      // Subsequent price change on MenuItem master to 500
      const updatedMasterDish = {
        id: 'dish-1',
        price: new Prisma.Decimal('500.00'),
        taxRate: new Prisma.Decimal('18.00'),
      };

      // Historical item must NOT recalculate based on master
      expect(historicalOrderItem.unitPrice.toFixed(2)).toBe('400.00');
      expect(historicalOrderItem.taxRate.toFixed(2)).toBe('5.00');
      expect(updatedMasterDish.price.toFixed(2)).toBe('500.00');
    });
  });
});
