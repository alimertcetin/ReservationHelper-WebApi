import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();


/**
 * PUT /sync
 * Replaces or updates the entire priority stack/rule set.
 * Used when the user clicks "PUBLISH" in PriceManager.vue
 */
router.put('/sync', async (req, res) => {
  const { rules } = req.body; // Array of { name, startDate, endDate, priority, pricing: [...] }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Wipe existing rules to prevent duplicates or orphaned priorities
      // If you need to keep ID history, you'd need a much more complex mapping logic.
      // For a "Priority Stack", a full sync is usually safer.
      await tx.priceRule.deleteMany({});

      // 2. Flatten the nested rules from Vue into individual database rows
      const flatData = rules.flatMap(rule => 
        rule.pricing.map(p => ({
          name: rule.name,
          priority: rule.priority,
          startDate: new Date(rule.startDate),
          endDate: new Date(rule.endDate),
          roomTypeId: p.roomTypeId,
          price: p.price
        }))
      );

      // 3. Bulk insert
      await tx.priceRule.createMany({
        data: flatData
      });
    });

    res.json({ message: "Priority stack published successfully" });
  } catch (err) {
    console.error("Sync Error:", err);
    res.status(500).json({ error: "Failed to sync price rules." });
  }
});

/**
 * POST /batch
 * Create rules for multiple room types at once
 */
router.post('/batch', async (req, res) => {
  const { name, assignments, startDate, endDate, priority } = req.body;
  // assignments: [{ roomTypeId: 1, price: 1000 }, { roomTypeId: 2, price: 1500 }]

  try {
    const operations = assignments.map(asm => 
      prisma.priceRule.create({
        data: {
          name,
          roomTypeId: asm.roomTypeId,
          price: asm.price,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          priority
        }
      })
    );

    await prisma.$transaction(operations);
    res.status(201).json({ message: "Batch update successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /suggest
 * Calculates the total price day-by-day.
 * Throws 422 if any date in the range lacks a PriceRule.
 */
router.get('/suggest', async (req, res) => {
  try {
    const roomTypeId = parseInt(req.query.roomTypeId);
    const { startDate, endDate, overrides } = req.query;

    let parsedOverrides = [];
    try {
      parsedOverrides = overrides ? (typeof overrides === 'string' ? JSON.parse(overrides) : overrides) : [];
    } catch (e) {
      parsedOverrides = [];
    }

    const [rules, policies] = await Promise.all([
      prisma.priceRule.findMany({
        where: { roomTypeId, startDate: { lte: new Date(endDate) }, endDate: { gte: new Date(startDate) } },
        orderBy: { priority: 'desc' }
      }),
      prisma.pricePolicy.findMany({ where: { isActive: true } })
    ]);

    let stayTotal = 0;
    let current = new Date(startDate);
    const end = new Date(endDate);

    // Helper: Calculates flat vs percentage impact
    const getImpact = (policy, currentVal) => {
      const val = Number(policy.value);
      if (policy.isPercentage) {
        return currentVal * (val / 100);
      }
      return val;
    };

    // PHASE 1: Nightly Calculations (NIGHT & GUEST scopes)
    while (current < end) {
      const currentDateStr = current.toISOString().split('T')[0];
      const rule = rules.find(r => {
        const rS = new Date(r.startDate).toISOString().split('T')[0];
        const rE = new Date(r.endDate).toISOString().split('T')[0];
        return currentDateStr >= rS && currentDateStr <= rE;
      });

      if (!rule) return res.status(422).json({ error: `No price for ${currentDateStr}` });

      let dailyTotal = Number(rule.price);

      parsedOverrides.forEach(ov => {
        const policy = policies.find(p => p.id === parseInt(ov.policyId));
        if (!policy) return;

        // Apply only if policy is scoped for Nightly or specific Guest variables
        if (policy.scope === 'NIGHT' || policy.scope === 'GUEST') {
          dailyTotal += getImpact(policy, dailyTotal);
        }
      });

      stayTotal += dailyTotal;
      current.setDate(current.getDate() + 1);
    }

    // PHASE 2: Stay Calculations (STAY scope)
    // Applied once to the total sum (e.g., Cleaning Fee, Early Check-in, % Stay Discount)
    parsedOverrides.forEach(ov => {
      const policy = policies.find(p => p.id === parseInt(ov.policyId));
      if (policy && policy.scope === 'STAY') {
        stayTotal += getImpact(policy, stayTotal);
      }
    });

    res.json({ totalSuggestedPrice: parseFloat(stayTotal.toFixed(2)) });

  } catch (err) {
    console.error("Suggest Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /all
 * Returns all price rules, typically for the PriceManager.vue
 */
router.get('/all', async (req, res) => {
  try {
    const rules = await prisma.priceRule.findMany({
      include: {
        roomType: true // So we can show the name in the UI
      },
      orderBy: [
        { startDate: 'desc' },
        { priority: 'desc' }
      ]
    });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await prisma.priceRule.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;