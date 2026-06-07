import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// Create an Account
router.post('/', async (req, res) => {
  const { ownerId, displayName, paymentMethods, type, details } = req.body;

  try {
    const account = await prisma.account.create({
      data: {
        ownerId: parseInt(ownerId),
        displayName,
        type,
        paymentMethods,
        details: details == undefined ? null : details,
      }
    });
    res.json(account);
  } catch (err) {
    console.error("Account POST error: " + err);
    res.status(500).json({ error: "Could not create account" });
  }
});

// Get all Accounts
router.get('/', async (req, res) => {
  const showAll = req.query.includeInactive === 'true';

  try {
    const accounts = await prisma.account.findMany({
      where: showAll ? {} : { isActive: true },
      include: { owner: { select: { name: true } } }
    });

    res.json(accounts); 
  } catch (err) {
    console.error("Account GET error:", err);
    res.status(500).json({ error: "Could not get accounts" });
  }
});

// Get account by id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const account = await prisma.account.findUnique({
      where: { id: id },
      include: { transactions: true, owner: { select: { name: true } } }
    });

    res.json(account);
  } catch (err) {
    console.error("Account GET error:", err);
    res.status(500).json({ error: "Could not get accounts" });
  }
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
    console.error(err);
    res.status(404).json({ error: "Account not found"} );
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const accountId = parseInt(req.params.id);

    // 1. Fetch the account AND its related transactions in one query
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { transactions: true } // Name depends on your Prisma schema relation
    });

    // 2. Handle 404 if the account doesn't even exist
    if (!account) {
      return res.status(404).json({ error: "Account not found." });
    }

    // 3. If there are transactions, soft-delete it (isActive: false)
    if (account.transactions.length > 0) {
      await prisma.account.update({
        where: { id: accountId },
        data: { isActive: false }
      });

      // Return a 400 (Bad Request) or 200 (OK) indicating it was archived instead of deleted
      return res.status(400).json({ 
        error: "Cannot hard-delete an account with existing transaction records. Account has been deactivated instead." 
      });
    }

    // 4. If there are NO transactions, hard-delete it completely
    await prisma.account.delete({
      where: { id: accountId }
    });

    // Success response for hard-delete
    return res.status(204).send();

  } catch (err) {
    // This now ONLY catches actual system/database errors (500 Internal Server Error)
    console.error("Database error:", err);
    return res.status(500).json({ error: "An unexpected error occurred on the server." });
  }
});

export default router;