import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// GET all policies
router.get('/', async (req, res) => {
  const policies = await prisma.pricePolicy.findMany({
    orderBy: { name: 'asc' }
  });
  res.json(policies);
});

// POST new policy
router.post('/', async (req, res) => {
  const { name, type, value, description, scope, isPercentage } = req.body;
  
  try {
    const policy = await prisma.pricePolicy.create({
      data: { 
        name, 
        type, 
        value: parseFloat(value),
        scope: scope || "GUEST", // Save the scope
        isPercentage: isPercentage || false, // Save the percentage flag
        description: description || null 
      }
    });
    res.status(201).json(policy);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Policy name must be unique or data is invalid" });
  }
});

// DELETE policy
router.delete('/:id', async (req, res) => {
  await prisma.pricePolicy.delete({ where: { id: parseInt(req.params.id) } });
  res.status(204).send();
});

export default router;