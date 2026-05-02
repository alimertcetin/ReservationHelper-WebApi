import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// Create a new Owner
router.post('/owners', async (req, res) => {
  const { name, address } = req.body;
  const owner = await prisma.owner.create({ data: { name, address } });
  res.status(201).json(owner);
});

// Get all owners with their accounts
router.get('/owners', async (req, res) => {
  const { includeInactive } = req.query;

  const owners = await prisma.owner.findMany({ 
    where: { isActive: includeInactive === 'true' ? undefined : true },
    include: { 
      accounts: {
        where: { isActive: includeInactive === 'true' ? undefined : true, },
        orderBy: { id:'asc'} }
    },
  });

  res.json(owners);
});

router.get('/owners/:id', async (req, res) => {
  try {
    const result = await prisma.owner.findUnique({ 
      where: { id: parseInt(req.params.id) },
      include: { accounts: true }
    });
    res.json(result); 
  }
  catch (err) {
    res.status(500).json({error:err});
  }
});

router.put('owners/:id', async (req, res) => {
  try {
    const { name, address } = req.body;
    const result = await prisma.owner.update({
      where: { id: parseInt(req.params.id)},
      data: {
        name,
        address,
      }
    });
    res.json(result);
  }
  catch (err) {
    res.status(500).json({error:err});
  }
});

router.delete('/owners/:id', async (req, res) => {
  try {
    await prisma.owner.update({
      where: { id: parseInt(req.params.id) },
      data: {isActive: false}
    });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Cannot delete owner with active accounts." });
  }
});

export default router;