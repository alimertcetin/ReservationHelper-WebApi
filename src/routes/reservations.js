import express from 'express';
import { prisma } from '../config/db.js';

const router = express.Router();

/**
 * 1. GET: Fetch by Date Range
 * Usage: GET /api/reservations?start=2026-04-01&end=2026-04-30
 */
router.get('/', async (req, res) => {
  const { start, end } = req.query;
  try {
    const filters = { };

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
    console.error(error);
    res.status(500).json({ error: "Failed to fetch reservations" });
  }
});

/**
 * 2. GET: Recent Activity (with Pagination)
 * Usage: GET /api/reservations/recent?page=2
 */
router.get('/recent', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const p = Math.max(1, parseInt(page));
  const l = Math.max(1, parseInt(limit));

  try {
    const recent = await prisma.reservation.findMany({
      // Adjusting your filter: Schema uses status/isActive? 
      // Ensure the 'where' matches your model fields
      take: l,
      skip: (p - 1) * l,
      orderBy: { updatedAt: 'desc' },
      include: {
        guest: true,
        rooms: { include: { roomType: true } }
      }
    });
    res.json(recent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load recent activity" });
  }
});

// --- Helper Functions ---

/**
 * Ensures we have a valid Guest record.
 * Logic: Priority to guestId, then Phone+Name match, then Create New.
 */
async function resolveGuest(tx, guestData) {
  if (guestData.id) {
    return await tx.guest.update({
      where: { id: guestData.id },
      data: guestData,
    });
  }

  // TODO: Make sure phone has specific format, consider country codes too
  // Check if a guest exists with this phone
  const existingGuest = await tx.guest.findUnique({
    where: { phone: guestData.phone }
  });

  // If phone exists AND name matches, it's the same person (Update)
  if (existingGuest && existingGuest.firstName === guestData.firstName) {
    return await tx.guest.update({
      where: { id: existingGuest.id },
      data: guestData,
    });
  }

  // If no guest or phone belongs to someone else, create new
  return await tx.guest.create({
    data: guestData,
  });
}

/**
 * Validates that the sum of room prices matches the reported total.
 */
function validatePricing(rooms, totalAmount) {
  const calculatedTotal = rooms.reduce((sum, r) => sum + Number(r.price), 0);
  if (calculatedTotal !== Number(totalAmount)) {
    return `Price mismatch: Rooms sum to ${calculatedTotal}, but total is ${totalAmount}`;
  }
  return undefined;
}

/**
 * Maps the incoming request rooms to Prisma's RoomStay creation format.
 */
function mapRoomStays(rooms) {
  return rooms.map((r) => ({
    roomTypeId: r.roomTypeId,
    startDate: new Date(r.startDate),
    endDate: new Date(r.endDate),
    price: r.price,
    policies: r.policies || undefined, // Store the JSON array
    adults: r.adults || 2,
    children: r.children || 0,
  }));
}

// --- Main Route ---

/**
 * 3. POST: Create Reservation
 * Usage: POST /api/reservations
 * Body: { "guest": { "id?": 12, "firstName": "John", "lastName": "Doe", "phone": "123", "email": "j@d.com" }, 
 * "rooms": [{ "roomTypeId": 0, "startDate": "2026-05-01", "endDate": "2026-05-05", "price": 500, "policies": [{ policyId: 1, guestKey: 'A1', scope: 'GUEST' }, { policyId: 2, scope: 'STAY' }] }],
 * "staffId": 1,
 * "totalAmount": 500,
 * "payments": [{ "amount": 250, "accountId": 12, "method": "CREDIT_CARD" }] }
 */
router.post('/', async (req, res) => {
  const { 
    guest,
    rooms,
    staffId,
    totalAmount,
    payments
  } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {

      const guestRecord = await resolveGuest(tx, guest);
      const reservation = await tx.reservation.create({
        data: {
          guestId: guestRecord.id,
          staffId: staffId,
          totalAmount: totalAmount,
          status: "PENDING",
          rooms: {
            create: mapRoomStays(rooms)
          }
        },
        include: { 
          rooms: true, 
          guest: true 
        }
      });

      // Initial Payment (If applicable)
      if (payments) {
        for (var i = 0; i < payments.length; i++) {
          let payment = payments[i];
          if (payment.amount) {
            await tx.transaction.create({
              data: {
                amount: payment.amount,
                method: payment.method,
                reservationId: reservation.id,
                accountId: payment.accountId
              }
            });
          }
        }
      }

      return reservation;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Reservation POST Error:", error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * 4. PUT: Update Reservation (Full Sync)
 * Usage: PUT /api/reservations/:id
 * Body: { 
 *   "status": "CONFIRMED", 
 *   "totalAmount": 1200,
 *   "guest": { "firstName": "Jane", ... },
 *   "rooms": [
 *      { "id": 5, "price": 600, ... }, // Existing room (Update)
 *      { "roomTypeId": 2, "price": 600, ... } // New room (Create)
 *   ],
 *   "transactions": [{ "amount": 100, "method": "CASH", "accountId": 1 }]
 * }
 */
router.put('/:id', async (req, res) => {
  const reservationId = parseInt(req.params.id);
  const {
    guest,
    rooms,
    transactions,
    status,
    staffId,
    totalAmount
  } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify Reservation Exists
      const existingRes = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { rooms: true, transactions: true }
      });
      if (!existingRes) throw new Error("Reservation not found");

      // 2. Handle Guest Update
      if (guest) {
        await tx.guest.update({
          where: { id: existingRes.guestId },
          data: {
            firstName: guest.firstName,
            lastName: guest.lastName,
            email: guest.email,
            phone: guest.phone
          }
        });
      }

      // 3. Handle RoomStays (Delete-then-Update/Create approach)
      if (rooms) {
        const roomStayIds = rooms.map(r => r.id).filter(Boolean);
        
        // Remove rooms that are no longer in the list
        await tx.roomStay.deleteMany({
          where: {
            reservationId: reservationId,
            id: { notIn: roomStayIds }
          }
        });

        // Update or Create rooms
        for (const room of rooms) {
          if (room.id) {
            await tx.roomStay.update({
              where: { id: room.id },
              data: {
                roomTypeId: room.roomTypeId,
                startDate: new Date(room.startDate),
                endDate: new Date(room.endDate),
                price: room.price,
                adults: room.adults,
                children: room.children,
                policies: room.policies
              }
            });
          } else {
            await tx.roomStay.create({
              data: {
                ...mapRoomStays([room])[0],
                reservationId: reservationId
              }
            });
          }
        }
      }

      // 4. Handle Transactions (Payments)
      if (transactions) {
        const incomingTxIds = transactions.map(t => t.id).filter(Boolean);

        await tx.transaction.deleteMany({
          where: {
            reservationId: reservationId,
            id: { notIn: incomingTxIds }
          }
        });

        for (const t of transactions) {
          if (t.id) {
            await tx.transaction.update({
              where: { id: t.id },
              data: {
                amount: t.amount,
                method: t.method,
                accountId: t.accountId
              }
            });
          } else if (t.amount) {
            await tx.transaction.create({
              data: {
                amount: t.amount,
                method: t.method,
                accountId: t.accountId,
                reservationId: reservationId
              }
            });
          }
        }
      }

      // 5. Finalize Reservation Details
      return await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: status || existingRes.status,
          staffId: staffId || existingRes.staffId,
          totalAmount: totalAmount || existingRes.totalAmount,
        },
        include: {
          guest: true,
          rooms: { include: { roomType: true } },
          transactions: { include: { account: true } }
        }
      });
    });

    res.json(result);
  } catch (error) {
    console.error("Reservation PUT Error:", error);
    res.status(400).json({ error: error.message });
  }
});

export default router;