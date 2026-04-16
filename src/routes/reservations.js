import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// The Single Source of Truth for restrictions
const ACCOUNT_METHOD_MAP = {
  CASH: ['CASH'],
  BANK: ['CREDIT_CARD', 'BANK_TRANSFER', 'ONLINE']
};

/**
 * 1. GET: Fetch by Date Range
 * Usage: GET /api/reservations?start=2026-04-01&end=2026-04-30&includeInactive=false
 */
router.get('/', async (req, res) => {
  const { start, end, includeInactive } = req.query;
  try {
    const filters = {
      isActive: includeInactive === 'true' ? undefined : true,
    };

    if (start && end) {
      filters.createdAt = {
        gte: new Date(start),
        lte: new Date(end),
      };
    }

    const reservations = await prisma.reservation.findMany({
      where: filters,
      include: {
        guest: true,
        rooms: { include: { roomType: true } },
        transactions: { include: { account: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reservations" });
  }
});

/**
 * 2. GET: Recent Activity (limit 10)
 * Usage: GET /api/reservations/recent
 */
router.get('/recent', async (req, res) => {
  try {
    const recent = await prisma.reservation.findMany({
      where: { isActive: true },
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: {
        guest: true,
        rooms: { include: { roomType: true } }
      }
    });
    res.json(recent);
  } catch (err) {
    res.status(500).json({ error: "Could not load recent activity: " + err });
  }
});

/**
 * 3. POST: Create Reservation
 * Usage: POST /api/reservations
 * Body: { "guest": { "firstName": "John", "lastName": "Doe", "phone": "123", "email": "j@d.com" }, 
 * "rooms": [{ "type": "Double", "startDate": "2026-05-01", "endDate": "2026-05-05", "price": 500 }],
 * "staffId": 1, "totalAmount": 500, "received": 100, "accountId": 2, "method": "CREDIT_CARD" }
 */
router.post('/', async (req, res) => {
  const { guest, rooms, staffId, totalAmount, received, accountId, method } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Upsert Guest
      const guestRecord = await tx.guest.upsert({
        where: { phone: guest.phone },
        update: { firstName: guest.firstName, lastName: guest.lastName, email: guest.email },
        create: { ...guest }
      });

      // Prepare RoomStays
      const roomStaysData = [];
      for (const r of rooms) {
        const typeRecord = await tx.roomType.findUnique({ where: { name: r.type } });
        roomStaysData.push({
          roomTypeId: typeRecord?.id,
          startDate: new Date(r.startDate),
          endDate: new Date(r.endDate),
          adults: r.adults || 2,
          children: r.children || 0,
          price: r.price
        });
      }

      // Create Reservation
      const reservation = await tx.reservation.create({
        data: {
          guestId: guestRecord.id,
          staffId: staffId,
          totalAmount: totalAmount,
          received: received || 0,
          rooms: { create: roomStaysData }
        },
        include: { rooms: true, guest: true }
      });

      // Handle Initial Payment
      if (Number(received) !== 0 && accountId) {
        await tx.transaction.create({
          data: {
            amount: received,
            method: method || "CASH",
            reservationId: reservation.id,
            accountId: accountId
          }
        });

        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: received } }
        });
      }

      return reservation;
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT: Update Reservation
 * Usage: PUT /api/reservations/1
 * Body: { "received": 500, "accountId": 2, "method": "BANK_TRANSFER" }
 */
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { totalAmount, received, status, isActive, accountId, method, staffId, guest } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get the current Reservation and the target Account
      const [oldRes, targetAccount] = await Promise.all([
        tx.reservation.findUnique({ where: { id }, select: { received: true } }),
        accountId ? tx.account.findUnique({ where: { id: accountId } }) : null
      ]);

      if (!oldRes) throw new Error("Reservation not found");

      const delta = Number(received) - Number(oldRes.received);

      // 2. Financial Validation Logic
      if (delta !== 0) {
        if (!targetAccount) throw new Error("A valid AccountId is required for financial changes.");
        if (!method) throw new Error("Payment method is required.");

        // BACKEND VALIDATION: Does the Account Type allow this Method?
        const allowedMethods = ACCOUNT_METHOD_MAP[targetAccount.type];
        if (!allowedMethods.includes(method)) {
          throw new Error(`Method ${method} is not allowed for ${targetAccount.type} accounts.`);
        }

        // 3. Log Transaction
        await tx.transaction.create({
          data: {
            amount: delta,
            method: method,
            reservationId: id,
            accountId: accountId
          }
        });

        // 4. Update Account Balance
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: delta } }
        });
      }

      // 5. Save the Reservation Changes
      return await tx.reservation.update({
        where: { id },
        data: {
          totalAmount,
          received,
          status,
          isActive,
          staffId,
          guest: guest ? {
            update: {
              firstName: guest.firstName,
              lastName: guest.lastName,
              email: guest.email
            }
          } : undefined
        },
        include: { guest: true, rooms: true }
      });
    });

    res.json(result);
  } catch (error) {
    // We send a 400 because this is usually a validation failure
    res.status(400).json({ error: error.message });
  }
});

export default router;