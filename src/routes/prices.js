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
    const { roomTypeId, startDate, endDate } = req.query;

    // 1. Strict Validation
    if (!roomTypeId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: "Missing parameters or invalid date format (YYYY-MM-DD)." });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const rId = parseInt(roomTypeId);

    if (start >= end) {
      return res.status(400).json({ error: "Check-in must be before check-out." });
    }

    // 2. Fetch all potentially relevant rules in one query
    const rules = await prisma.priceRule.findMany({
      where: {
        roomTypeId: rId,
        startDate: { lte: end },
        endDate: { gte: start }
      },
      orderBy: { priority: 'desc' } // Higher priority rules checked first in .find()
    });

    let totalSuggestedPrice = 0;
    const breakdown = [];
    let current = new Date(start);

    // 3. Day-by-Day Loop
    while (current < end) {
      const currentDateStr = current.toISOString().split('T')[0];
      
      // Find the highest priority rule for THIS specific day
      const applicableRule = rules.find(rule => {
        const ruleStart = new Date(rule.startDate).toISOString().split('T')[0];
        const ruleEnd = new Date(rule.endDate).toISOString().split('T')[0];
        return currentDateStr >= ruleStart && currentDateStr <= ruleEnd;
      });

      if (!applicableRule) {
        return res.status(422).json({ 
          error: `Pricing missing for date: ${currentDateStr}`,
          missingDate: currentDateStr 
        });
      }

      totalSuggestedPrice += Number(applicableRule.price);
      breakdown.push({
        date: currentDateStr,
        price: applicableRule.price,
        ruleName: applicableRule.name
      });

      current.setDate(current.getDate() + 1);
    }

    res.json({
      totalSuggestedPrice,
      nights: breakdown.length,
      breakdown
    });

  } catch (err) {
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