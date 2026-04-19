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

// Create an Account for an Owner
router.post('/', async (req, res) => {
  const { displayName, type, iban, bankName, ownerId } = req.body;

  // Simple validation
  if (type === 'BANK' && !iban) {
    return res.status(400).json({ error: "IBAN is required for bank accounts." });
  }

  try {
    const account = await prisma.account.create({
      data: {
        displayName,
        type,
        iban: type === 'BANK' ? iban : null,
        bankName: type === 'BANK' ? bankName : null,
        ownerId: parseInt(ownerId)
      }
    });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: "Could not create account" });
  }
});

// Get all Accounts (for your BookingPage dropdown)
router.get('/', async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: { owner: { select: { name: true } } }
  });
  res.json(accounts);
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
    const result = await prisma.account.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: false }
    });
    console.log(JSON.stringify(result, null, 2));
    res.status(204).send();
  } catch (err) {
    res.status(404).json({ error: "Could not delete account. It might be linked to transactions." });
  }
});

export default router;