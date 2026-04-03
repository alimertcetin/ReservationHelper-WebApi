import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

// POST: Create a New Reservation
router.post('/', async (req, res) => {
  const { guest, rooms, staffId, totalAmount } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or Create the Guest (by Phone)
      const guestRecord = await tx.guest.upsert({
        where: { phone: guest.phone },
        update: { firstName: guest.firstName, lastName: guest.lastName, email: guest.email },
        create: { ...guest, phone: guest.phone }
      });

      // 2. Create the Reservation
      const reservation = await tx.reservation.create({
        data: {
          guestId: guestRecord.id,
          staffId: staffId,
          totalAmount: totalAmount,
          rooms: {
            create: rooms.map(room => ({
              roomType: room.type,
              startDate: new Date(room.startDate),
              endDate: new Date(room.endDate),
              adults: room.adults,
              children: room.children,
              price: room.price
            }))
          }
        },
        include: { rooms: true, guest: true }
      });

      return reservation;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Booking failed" });
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

export default router;