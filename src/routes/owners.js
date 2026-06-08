import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// Create a new Owner
router.post('/', async (req, res) => {
  const { name, address } = req.body;
  try {
    const owner = await prisma.owner.create({ data: { name, address } });
    res.status(201).json(owner);
  }
  catch (err) {
    console.error(err);
    res.status(500).json({error:"Can't create owner."});
  }
});

// Get all owners with their accounts
router.get('/', async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';

  try {
    const owners = await prisma.owner.findMany({ 
      where: includeInactive ? {} : { isActive: true },
      include: { 
        accounts: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { id: 'asc' } 
        }
      },
    });

    res.json(owners);
  }
  catch (error) {
    console.error(error);
    res.status(500).json({error:"Can't get owners"});
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await prisma.owner.findUnique({ 
      where: { id: id },
      include: { accounts: true }
    });
    res.json(result); 
  }
  catch (err) {
    console.error(err);
    res.status(500).json({error:"Can't get owner with id: " + id});
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { name, address } = req.body;
    const result = await prisma.owner.update({
      where: { id: id},
      data: {
        name,
        address,
      }
    });
    res.json(result);
  }
  catch (err) {
    console.error(err);
    res.status(500).json({error:"Can't update owner with id: " + id});
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: {
          id: id
        },
        data: {
          isActive: false
        }
      })
    });
    await prisma.owner.update({
      where: { id: id },
      data: { isActive: false }
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Cannot delete owner with id: " + id });
  }
});

export default router;