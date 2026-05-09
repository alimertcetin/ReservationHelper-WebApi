import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

/**
 * GET /api/prices/all
 * Description: Fetches the entire pricing stack, including room-specific prices and their JSON overrides.
 * Example Usage: GET http://localhost:3000/api/prices/all
 */
router.get('/all', async (req, res) => {
  try {
    const rules = await prisma.priceRule.findMany({
      include: {
        roomTypePrices: {
          include: { roomType: true }
        }
      },
      orderBy: { priority: 'asc' }
    });
    res.json(rules);
  } catch (err) {
    console.error("Fetch Rules Error:", err);
    res.status(500).json({ error: "Failed to fetch pricing rules." });
  }
});

/**
 * PUT /api/prices/sync
 * Description: Wipes the current pricing rules and replaces them with a new stack. 
 * Handles nested creation of RoomTypePrice records with JSON overrides.
 * Example Usage:
 * PUT http://localhost:3000/api/prices/sync
 * Body: {
 *   "rules": [
 *     {
 *       "name": "Summer Season",
 *       "startDate": "2026-06-01",
 *       "endDate": "2026-08-31",
 *       "priority": 10,
 *       "pricing": [
 *         { 
 *           "roomTypeId": 1, 
 *           "price": 2000, 
 *           "overrides": [
 *             { "type": "weekday", "key": 6, "price": 2500 },
 *             { "type": "date", "key": "2026-07-15", "price": 5000 }
 *           ] 
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
router.put('/sync', async (req, res) => {
  const { rules } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Delete all existing rules (Cascade deletes RoomTypePrice automatically via Prisma schema)
      await tx.priceRule.deleteMany({});

      // 2. Create the new stack
      const createdRules = [];
      for (const rule of rules) {
        const newRule = await tx.priceRule.create({
          data: {
            name: rule.name,
            startDate: new Date(rule.startDate),
            endDate: new Date(rule.endDate),
            priority: rule.priority,
            roomTypePrices: {
              create: rule.pricing.map(p => ({
                roomTypeId: p.roomTypeId,
                price: p.price,
                overrides: p.overrides || [] // Array of {type, key, price}
              }))
            }
          }
        });
        createdRules.push(newRule);
      }
      return createdRules;
    });

    res.json({ message: "Pricing synchronized", count: result.length });
  } catch (err) {
    console.error("Sync Error:", err);
    res.status(500).json({ error: "Failed to synchronize pricing rules." });
  }
});

/**
 * GET /api/prices/suggest
 * Description: Calculates a detailed price breakdown and total suggested amount.
 * Example Usage: 
 * GET /api/prices/suggest?roomTypeId=1&startDate=2026-06-01&endDate=2026-06-05&policies=[{"policyId":3,"guestKey":"A1"},{"policyId":5}]
 */
router.get('/suggest', async (req, res) => {
  const { roomTypeId, startDate, endDate, policies: policiesJson } = req.query;

  if (!roomTypeId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing roomTypeId, startDate, or endDate" });
  }

  try {
    const rId = parseInt(roomTypeId);
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Parse applied policies from frontend (if any)
    let appliedOverlays = [];
    try {
      appliedOverlays = policiesJson ? JSON.parse(policiesJson) : [];
    } catch (e) {
      appliedOverlays = [];
    }

    // 1. Fetch relevant Data: Rules and Policy Definitions
    const [rules, dbPolicies] = await Promise.all([
      prisma.priceRule.findMany({
        where: {
          startDate: { lte: end },
          endDate: { gte: start },
          roomTypePrices: { some: { roomTypeId: rId } }
        },
        include: {
          roomTypePrices: { where: { roomTypeId: rId } }
        },
        orderBy: { priority: 'asc' }
      }),
      prisma.pricePolicy.findMany({ where: { isActive: true } })
    ]);

    let totalAmount = 0;
    const breakdown = [];
    let current = new Date(start);

    // 2. Nightly Loop
    while (current < end) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();

      // Find highest priority rule for this specific date
      const activeRule = rules.find(r => {
        const rStart = new Date(r.startDate).toISOString().split('T')[0];
        const rEnd = new Date(r.endDate).toISOString().split('T')[0];
        return dateStr >= rStart && dateStr <= rEnd;
      });

      if (!activeRule) {
        return res.status(422).json({ error: `No base price defined for ${dateStr}` });
      }

      const roomConfig = activeRule.roomTypePrices[0];
      
      // Step A: Calculate Base Night Price (including Date/Weekday Overrides in JSON)
      let nightlyBase = Number(roomConfig.price);
      if (roomConfig.overrides && Array.isArray(roomConfig.overrides)) {
        const dateOv = roomConfig.overrides.find(o => o.type === 'date' && o.key === dateStr);
        const weekOv = roomConfig.overrides.find(o => o.type === 'weekday' && o.key === dayOfWeek);
        if (dateOv) nightlyBase = Number(dateOv.price);
        else if (weekOv) nightlyBase = Number(weekOv.price);
      }

      let nightlyTotal = nightlyBase;
      const appliedOnThisNight = [];

      // Step B: Apply Dynamic Policies (GUEST and NIGHT scopes)
      appliedOverlays.forEach(overlay => {
        const policy = dbPolicies.find(p => p.id === overlay.policyId);
        if (!policy) return;

        // Apply if scope is Per Guest or Per Night
        if (policy.scope === 'GUEST' || policy.scope === 'NIGHT') {
          const impact = policy.isPercentage 
            ? nightlyBase * (Number(policy.value) / 100) 
            : Number(policy.value);
          
          nightlyTotal += impact;
          appliedOnThisNight.push({ name: policy.name, impact });
        }
      });

      totalAmount += nightlyTotal;
      breakdown.push({
        date: dateStr,
        base: nightlyBase,
        total: nightlyTotal,
        adjustments: appliedOnThisNight
      });

      current.setDate(current.getDate() + 1);
    }

    // Step C: Apply Stay-wide Policies (STAY scope)
    appliedOverlays.forEach(overlay => {
      const policy = dbPolicies.find(p => p.id === overlay.policyId);
      if (policy && policy.scope === 'STAY') {
        const impact = policy.isPercentage 
          ? totalAmount * (Number(policy.value) / 100) 
          : Number(policy.value);
        
        totalAmount += impact;
        // Stay policies don't belong to a specific night breakdown, 
        // they are added to the final suggested total.
      }
    });

    res.json({
      totalSuggestedPrice: parseFloat(totalAmount.toFixed(2)),
      breakdown
    });

  } catch (err) {
    console.error("Suggest Engine Error:", err);
    res.status(500).json({ error: "Failed to calculate suggested price" });
  }
});

/**
 * DELETE /api/prices/:id
 * Description: Deletes a specific pricing rule.
 * Example Usage: DELETE http://localhost:3000/api/prices/15
 */
router.delete('/:id', async (req, res) => {
  try {
    await prisma.priceRule.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (err) {
    console.error("Delete Rule Error:", err);
    res.status(500).json({ error: "Failed to delete pricing rule." });
  }
});

export default router;