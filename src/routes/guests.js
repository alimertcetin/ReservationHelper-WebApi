import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// Search guests by phone or name (for the search bar)
router.get('/search', async (req, res) => {
  const { q } = req.query;
  const guests = await prisma.guest.findMany({
    where: {
      OR: [
        { phone: { contains: q } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } }
      ]
    }
  });
  res.json(guests);
});

export default router;