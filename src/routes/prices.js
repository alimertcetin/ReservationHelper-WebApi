import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// Get suggested price based on room type and date
router.get('/suggest', async (req, res) => {
  const { type, startDate, endDate } = req.query;

  const activeRules = await prisma.priceRule.findMany({
    where: {
      roomType: type,
      AND: [
        { startDate: { lte: new Date(endDate) } },
        { endDate: { gte: new Date(startDate) } }
      ]
    },
    orderBy: { priority: 'desc' }
  });

  // Return the highest priority rule or a default base price
  const suggested = activeRules.length > 0 ? activeRules[0].price : 0;
  res.json({ price: suggested });
});

export default router;