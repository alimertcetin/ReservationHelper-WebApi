import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

/**
 * PUT /sync
 * Replaces the entire pricing strategy.
 */
router.put('/sync', async (req, res) => {
  const { rules } = req.body; // Array of { name, startDate, endDate, priority, pricing: [...] }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Wipe existing to maintain a clean "Stack"
      await tx.priceRule.deleteMany({});

      // 2. Create Rules and Nested Room Prices
      for (const rule of rules) {
        await tx.priceRule.create({
          data: {
            name: rule.name,
            startDate: new Date(rule.startDate),
            endDate: new Date(rule.endDate),
            priority: rule.priority,
            roomTypePrices: {
              create: rule.pricing.map(p => ({
                roomTypeId: p.roomTypeId,
                price: p.price,
                overrides: p.overrides // Now stored per RoomType
              }))
            }
          }
        });
      }
    });

    res.json({ message: "Pricing stack synchronized successfully" });
  } catch (err) {
    console.error("Sync Error:", err);
    res.status(500).json({ error: "Failed to sync price rules." });
  }
});

/**
 * GET /suggest
 * Calculates stay total by checking Base Price vs. Day-of-Week Overrides
 */
router.get('/suggest', async (req, res) => {
  try {
    const roomTypeId = parseInt(req.query.roomTypeId);
    const { startDate, endDate, overrides } = req.query;

    if (!roomTypeId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // Parse guest-selected policies (e.g., extra bed, breakfast)
    let parsedGuestPolicies = [];
    try {
      parsedGuestPolicies = overrides ? (typeof overrides === 'string' ? JSON.parse(overrides) : overrides) : [];
    } catch (e) { parsedGuestPolicies = []; }

    // Fetch applicable rules and active global policies
    const [rules, globalPolicies] = await Promise.all([
      prisma.priceRule.findMany({
        where: {
          startDate: { lte: new Date(endDate) },
          endDate: { gte: new Date(startDate) },
          roomTypePrices: { some: { roomTypeId } }
        },
        include: {
          roomTypePrices: { where: { roomTypeId } }
        },
        orderBy: { priority: 'desc' }
      }),
      prisma.pricePolicy.findMany({ where: { isActive: true } })
    ]);

    let stayTotal = 0;
    let current = new Date(startDate);
    const end = new Date(endDate);

    const getImpact = (policy, currentVal) => {
      const val = Number(policy.value);
      return policy.isPercentage ? currentVal * (val / 100) : val;
    };

    // --- NIGHTLY CALCULATION LOOP ---
    while (current < end) {
      const currentDateStr = current.toISOString().split('T')[0];
      const currentDayOfWeek = current.getDay(); // 0 (Sun) to 6 (Sat)

      // Find highest priority rule for this day
      const rule = rules.find(r => {
        const rS = new Date(r.startDate).toISOString().split('T')[0];
        const rE = new Date(r.endDate).toISOString().split('T')[0];
        return currentDateStr >= rS && currentDateStr <= rE;
      });

      if (!rule || !rule.roomTypePrices[0]) {
        return res.status(422).json({ error: `No price defined for ${currentDateStr}` });
      }

      const rtp = rule.roomTypePrices[0];
      let basePrice = Number(rtp.price);

      // Check for Day-of-Week Overrides
      if (rtp.overrides && Array.isArray(rtp.overrides)) {
        const dayOverride = rtp.overrides.find(o => o.day === currentDayOfWeek);
        if (dayOverride) {
          basePrice = Number(dayOverride.price);
        }
      }

      let nightlyTotal = basePrice;

      // Apply Nightly/Guest Policies (Extra persons, etc.)
      parsedGuestPolicies.forEach(ov => {
        const policy = globalPolicies.find(p => p.id === parseInt(ov.policyId));
        if (policy && (policy.scope === 'NIGHT' || policy.scope === 'GUEST')) {
          nightlyTotal += getImpact(policy, nightlyTotal);
        }
      });

      stayTotal += nightlyTotal;
      current.setDate(current.getDate() + 1);
    }

    // --- FINAL STAY POLICIES ---
    parsedGuestPolicies.forEach(ov => {
      const policy = globalPolicies.find(p => p.id === parseInt(ov.policyId));
      if (policy && policy.scope === 'STAY') {
        stayTotal += getImpact(policy, stayTotal);
      }
    });

    res.json({ 
      totalSuggestedPrice: parseFloat(stayTotal.toFixed(2)),
      currency: "TRY" 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /all
 * Returns the full stack for the admin panel
 */
router.get('/all', async (req, res) => {
  try {
    const rules = await prisma.priceRule.findMany({
      include: {
        roomTypePrices: {
          include: { roomType: true }
        }
      },
      orderBy: { priority: 'desc' }
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