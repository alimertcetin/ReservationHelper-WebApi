import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // ---------------------------------------------------
  // 1. ROOM TYPES
  // ---------------------------------------------------

  const roomTypesData = [
    {
      name: "Standard Room",
      capacity: 2,
      description: "Comfortable room with a city view."
    },
    {
      name: "Deluxe Room",
      capacity: 3,
      description: "Spacious room with pool view."
    },
    {
      name: "Family Suite",
      capacity: 5,
      description: "Large suite suitable for families."
    }
  ];

  const createdRoomTypes = [];

  for (const rt of roomTypesData) {
    const roomType = await prisma.roomType.upsert({
      where: { name: rt.name },
      update: {
        capacity: rt.capacity,
        description: rt.description
      },
      create: rt
    });

    createdRoomTypes.push(roomType);
  }

  // ---------------------------------------------------
  // 2. STAFF
  // ---------------------------------------------------

  const adminStaff = await prisma.staff.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Ali Mert",
      role: "ADMIN"
    }
  });

  await prisma.staff.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: "Ayşe Kaya",
      role: "RECEPTION"
    }
  });

  // ---------------------------------------------------
  // 3. OWNERS
  // ---------------------------------------------------

  const owner = await prisma.owner.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Hotel Management Group",
      address: "Istanbul, Türkiye"
    }
  });

  // ---------------------------------------------------
  // 4. ACCOUNTS
  // ---------------------------------------------------

  const bankAccount = await prisma.account.upsert({
    where: { id: 1 },
    update: {},
    create: {
      ownerId: owner.id,
      displayName: "Ziraat Bank Main",
      type: "BANK",
      details: {
        iban: "TR00 0000 0000 0000 0000 0000 00",
        branch: "Kadıköy"
      }
    }
  });

  const cashAccount = await prisma.account.upsert({
    where: { id: 2 },
    update: {},
    create: {
      ownerId: owner.id,
      displayName: "Hotel Cash Register",
      type: "CASH"
    }
  });

  // ---------------------------------------------------
  // 5. PRICE POLICIES
  // ---------------------------------------------------

  const policies = [
    {
      name: "Extra Adult Fee",
      description: "Additional charge per adult guest",
      type: "ADJUST",
      isPercentage: false,
      scope: "GUEST",
      value: 500
    },
    {
      name: "Child Discount",
      description: "Discount for children",
      type: "ADJUST",
      isPercentage: true,
      scope: "GUEST",
      value: -10
    },
    {
      name: "Weekly Stay Discount",
      description: "Discount for long stays",
      type: "ADJUST",
      isPercentage: true,
      scope: "STAY",
      value: -15
    }
  ];

  for (const policy of policies) {
    await prisma.pricePolicy.upsert({
      where: { name: policy.name },
      update: {
        description: policy.description,
        type: policy.type,
        isPercentage: policy.isPercentage,
        scope: policy.scope,
        value: policy.value
      },
      create: policy
    });
  }

  // ---------------------------------------------------
  // 6. PRICE RULES
  // ---------------------------------------------------

  const standardRule = await prisma.priceRule.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Standard Season 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      priority: 1
    }
  });

  const summerRule = await prisma.priceRule.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: "Summer Peak 2026",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-08-31"),
      priority: 10
    }
  });

  // ---------------------------------------------------
  // 7. ROOM TYPE PRICES
  // ---------------------------------------------------

  const roomTypePrices = [
    {
      roomTypeId: createdRoomTypes[0].id,
      priceRuleId: standardRule.id,
      price: 1500
    },
    {
      roomTypeId: createdRoomTypes[1].id,
      priceRuleId: standardRule.id,
      price: 2200
    },
    {
      roomTypeId: createdRoomTypes[2].id,
      priceRuleId: standardRule.id,
      price: 3500
    },
    {
      roomTypeId: createdRoomTypes[0].id,
      priceRuleId: summerRule.id,
      price: 2500,
      overrides: [
        { day: 5, price: 2800 },
        { day: 6, price: 3000 }
      ]
    }
  ];

  for (const item of roomTypePrices) {
    await prisma.roomTypePrice.upsert({
      where: {
        roomTypeId_priceRuleId: {
          roomTypeId: item.roomTypeId,
          priceRuleId: item.priceRuleId
        }
      },
      update: {
        price: item.price,
        overrides: item.overrides || null
      },
      create: item
    });
  }

  // ---------------------------------------------------
  // 8. GUEST
  // ---------------------------------------------------

  const guest = await prisma.guest.upsert({
    where: { id: 1 },
    update: {},
    create: {
      firstName: "Mehmet",
      lastName: "Yılmaz",
      phone: "+90 555 111 22 33",
      email: "mehmet@example.com"
    }
  });

  // ---------------------------------------------------
  // 9. RESERVATION
  // ---------------------------------------------------

  const reservation = await prisma.reservation.upsert({
    where: { id: 1 },
    update: {},
    create: {
      guestId: guest.id,
      staffId: adminStaff.id,
      totalAmount: 4500,
      status: "CONFIRMED"
    }
  });

  // ---------------------------------------------------
  // 10. ROOM STAY
  // ---------------------------------------------------

  await prisma.roomStay.upsert({
    where: { id: 1 },
    update: {},
    create: {
      reservationId: reservation.id,
      roomTypeId: createdRoomTypes[0].id,
      startDate: new Date("2026-07-10"),
      endDate: new Date("2026-07-13"),
      adults: 2,
      children: 1,
      price: 4500,
      policies: [
        {
          policyId: 1,
          scope: "GUEST",
          guestKey: "A1"
        }
      ]
    }
  });

  // ---------------------------------------------------
  // 11. TRANSACTIONS
  // ---------------------------------------------------

  await prisma.transaction.upsert({
    where: { id: 1 },
    update: {},
    create: {
      reservationId: reservation.id,
      accountId: bankAccount.id,
      amount: 2000,
      method: "CREDIT_CARD"
    }
  });

  await prisma.transaction.upsert({
    where: { id: 2 },
    update: {},
    create: {
      reservationId: reservation.id,
      accountId: cashAccount.id,
      amount: 2500,
      method: "CASH"
    }
  });

  // ---------------------------------------------------
  // 12. NOTES
  // ---------------------------------------------------

  await prisma.note.upsert({
    where: { id: 1 },
    update: {},
    create: {
      content: "VIP guest. Prefers quiet rooms.",
      isPinned: true,
      staffId: adminStaff.id
    }
  });

  // ---------------------------------------------------
  // 13. SYSTEM SETTINGS
  // ---------------------------------------------------

  const settings = [
    {
      key: "HOTEL_NAME",
      value: "Grand Bosphorus Hotel"
    },
    {
      key: "WHATSAPP_STAFF_GROUP_ID",
      value: "1234567890@g.us"
    },
    {
      key: "DEFAULT_CURRENCY",
      value: "TRY"
    }
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value
      },
      create: setting
    });
  }

  // ---------------------------------------------------
  // 14. MESSAGE TEMPLATES
  // ---------------------------------------------------

  const templates = [
    {
      name: "Guest Welcome",
      category: "GUEST",
      content:
        "Hello {{name}}, welcome to our hotel! Your reservation is confirmed."
    },
    {
      name: "Payment Reminder",
      category: "GUEST",
      content:
        "Dear {{name}}, your remaining balance is {{balance}}₺."
    },
    {
      name: "New Booking Notification",
      category: "STAFF",
      content:
        "🛎️ New Booking! Guest: {{name}} {{surname}}. Total: {{total}}₺."
    }
  ];

  for (const template of templates) {
    await prisma.messageTemplate.upsert({
      where: { name: template.name },
      update: {
        content: template.content,
        category: template.category
      },
      create: template
    });
  }

  console.log("✅ Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });