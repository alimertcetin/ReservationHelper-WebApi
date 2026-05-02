import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// Create an Account
router.post('/', async (req, res) => {
  const { ownerId, displayName, type, isActive, details } = req.body;

  try {
    const account = await prisma.account.create({
      data: {
        ownerId: parseInt(ownerId),
        displayName,
        type,
        details: details == undefined ? null : details,
      }
    });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: "Could not create account" });
  }
});

// Get all Accounts
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
    res.status(204).send();
  } catch (err) {
    res.status(404).json({ error: "Could not delete account. It might be linked to transactions." });
  }
});

export default router;