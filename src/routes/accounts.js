import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

/*
model Owner {
  id        Int       @id @default(autoincrement())
  name      String
  address   String?
  isActive  Boolean   @default(true) // Added
  accounts  Account[]
  createdAt DateTime  @default(now())
}*/

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
    res.json({error:err}).status(500);
  }
});

router.put('owners/:id', async (req, res) => {
  try {
    const { name, address } = res.body;
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

/*
model Account {
  id          Int         @id @default(autoincrement())
  ownerId     Int
  displayName String // e.g., "Ziraat Bank Main"
  type        AccountType @default(BANK)
  isActive    Boolean     @default(true)
  balance     Decimal     @default(0) @db.Decimal(12, 2)

  // Bank Specific Details (Nullable for CASH accounts)
  bankName String? // e.g., "Ziraat Bankası"
  iban     String? @unique

  // Relations
  transactions Transaction[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  owner        Owner?        @relation(fields: [ownerId], references: [id])
}*/

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