import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// Get all owners with their accounts
router.get('/owners', async (req, res) => {
  const owners = await prisma.owner.findMany({ include: { accounts: true } });
  res.json(owners);
});

// Create a new Owner
router.post('/owners', async (req, res) => {
  const { name, address } = req.body;
  const owner = await prisma.owner.create({ data: { name, address } });
  res.status(201).json(owner);
});

router.delete('/owners/:id', async (req, res) => {
  try {
    await prisma.owner.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Cannot delete owner with active accounts." });
  }
});

// Get all Accounts (for your BookingPage dropdown)
router.get('/', async (req, res) => {
  const accounts = await prisma.account.findMany({
    include: { owner: { select: { name: true } } }
  });
  res.json(accounts);
});

// Create an Account for an Owner
router.post('/', async (req, res) => {
  const { title, iban, ownerId, type } = req.body; // Added type
  const account = await prisma.account.create({
    data: { 
      title, 
      iban, 
      ownerId, 
      type: type || 'BANK', // Ensure type is saved
      balance: 0 
    }
  });
  res.status(201).json(account);
});

router.put('/:id', async (req, res) => {
  try {
    const updatedAccount = await prisma.account.update({
      where: {id: parseInt(req.params.id)},
      data: req.body,
    });
    res.json(updatedAccount);
  }
  catch(err) {
    res.status(404).json({ error: "Account not found"} );
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.account.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: "Could not delete account. It might be linked to transactions." });
  }
});

export default router;