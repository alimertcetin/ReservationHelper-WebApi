import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// GET all policies
router.get('/', async (req, res) => {
  try {
    const policies = await prisma.pricePolicy.findMany({
      orderBy: { id: 'asc' }
    });
    res.json(policies);
  }
  catch (err) {
    res.status(500).json({error: err});
  }
});

// POST new policy
router.post('/', async (req, res) => {
  const { name, type, value, description, scope, isPercentage } = req.body;
  
  try {
    const policy = await prisma.pricePolicy.create({
      data: { 
        name, 
        description: description || null,
        type, 
        isPercentage: isPercentage || false, // Save the percentage flag
        scope: scope || "GUEST", // Save the scope
        value: parseFloat(value),
      }
    });
    res.status(201).json(policy);
  }
  catch (err) {
    console.error(err);
    res.status(400).json({ error: "Policy name must be unique or data is invalid" });
  }
});

// DELETE policy
router.delete('/:id', async (req, res) => {
  try {
  await prisma.pricePolicy.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } });
    res.status(204).send();
  }
  catch (err) {
    res.status(500).json({ error: err });
  }
});

export default router;