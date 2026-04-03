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

// Get all Accounts (for your BookingPage dropdown)
router.get('/', async (req, res) => {
  const accounts = await prisma.account.findMany({
    include: { owner: { select: { name: true } } }
  });
  res.json(accounts);
});

// Create an Account for an Owner
router.post('/', async (req, res) => {
  const { title, iban, ownerId, initialBalance } = req.body;
  const account = await prisma.account.create({
    data: { title, iban, ownerId, balance: initialBalance || 0 }
  });
  res.status(201).json(account);
});

export default router;