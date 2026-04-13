import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// POST: Create a New Reservation
router.post('/', async (req, res) => {
  const { guest, rooms, staffId, totalAmount } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert Guest
      const guestRecord = await tx.guest.upsert({
        where: { phone: guest.phone },
        update: { firstName: guest.firstName, lastName: guest.lastName },
        create: { ...guest }
      });

      // 2. Prepare Rooms (Look up RoomType IDs)
      const roomStaysData = [];
      for (const r of rooms) {
        const typeRecord = await tx.roomType.findUnique({ where: { name: r.type } });
        roomStaysData.push({
          roomTypeId: typeRecord?.id,
          startDate: new Date(r.startDate),
          endDate: new Date(r.endDate),
          adults: r.adults,
          children: r.children,
          price: r.price
        });
      }

      // 3. Create Reservation
      return await tx.reservation.create({
        data: {
          guestId: guestRecord.id,
          staffId: staffId,
          totalAmount: totalAmount,
          rooms: { create: roomStaysData }
        },
        include: { rooms: true, guest: true }
      });
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Add a Payment (Transaction) to a Reservation
router.post('/:id/pay', async (req, res) => {
  const reservationId = parseInt(req.params.id);
  const { accountId, amount, method } = req.body;

  try {
    const payment = await prisma.$transaction(async (tx) => {
      // 1. Create the Transaction
      const newTransaction = await tx.transaction.create({
        data: {
          amount,
          method,
          reservationId,
          accountId
        }
      });

      // 2. Update Account Balance
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: amount } }
      });

      // 3. Update Reservation 'received' total
      await tx.reservation.update({
        where: { id: reservationId },
        data: { received: { increment: amount } }
      });

      return newTransaction;
    });

    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: "Payment processing failed" });
  }
});

// GET: Fetch recent reservations for the sidebar
router.get('/recent', async (req, res) => {
  try {
    const recent = await prisma.reservation.findMany({
      take: 10, // Get the last 10
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        guest: true,
        rooms: {
          include: {
            roomType: true // Get the "Standard Room" etc. details
          }
        }
      }
    });
/*
    const formatted = recent.map(res => ({
      id: res.id,
      name: res.guest.firstName,
      surname: res.guest.lastName,
      phone: res.guest.phone,
      total: parseFloat(res.totalAmount),
      received: parseFloat(res.received),
      time: res.createdAt,
      rooms: res.rooms.map(r => ({
        type: r.roomType?.name || "Unknown",
        price: parseFloat(r.price),
        startDate: r.startDate,
        endDate: r.endDate
      }))
    }));*/

    res.json(recent);
  } catch (error) {
    console.error("Error fetching recent:", error);
    res.status(500).json({ error: "Could not load recent activity" });
  }
});

export default router;