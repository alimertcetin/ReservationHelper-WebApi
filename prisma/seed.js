import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Create Room Types (Refactored to individual upserts)
  const roomTypesData = [
    { name: "Standard Room", capacity: 2, description: "Comfortable room with a city view." },
    { name: "Deluxe Room", capacity: 2, description: "Pool View." },
    { name: "Test Room", capacity: 4, description: "Test View." }
  ];

  const createdRoomTypes = [];
  for (const rt of roomTypesData) {
    const type = await prisma.roomType.upsert({
      where: { name: rt.name },
      update: {},
      create: rt
    });
    createdRoomTypes.push(type);
  }

  // 2. Create a Staff Member
  const staff = await prisma.staff.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Ali Mert",
      role: "ADMIN"
    }
  });

  // 3. Create an Account Owner
  const owner = await prisma.owner.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Hotel Management Group",
      address: "Istanbul, Turkey"
    }
  });

  // 4. Create a Bank Account
  await prisma.account.upsert({
    where: { id: 1 },
    update: {},
    create: {
      displayName: "Ziraat Bank Main",
      iban: "TR00 0000 0000 0000 0000 0000 00",
      type: "BANK",
      ownerId: owner.id,
      balance: 5000.00
    }
  });

  // 5. Create Price Rules
  await prisma.priceRule.createMany({
    data: [
      { 
        name: "Standard Rate", 
        startDate: new Date("2026-01-01"), 
        endDate: new Date("2030-12-31"), 
        price: 1500, 
        roomTypeId: createdRoomTypes[0].id,
        priority: 1 
      },
      { 
        name: "Summer Peak", 
        startDate: new Date("2026-06-01"), 
        endDate: new Date("2026-08-31"), 
        price: 2500, 
        roomTypeId: createdRoomTypes[0].id,
        priority: 10 
      }
    ],
    skipDuplicates: true
  });

  // 6. Create Initial System Settings
  await prisma.systemSetting.upsert({
    where: { key: "WHATSAPP_STAFF_GROUP_ID" },
    update: {},
    create: {
      key: "WHATSAPP_STAFF_GROUP_ID",
      value: "1234567890@g.us" // Placeholder
    }
  });

  // 7. Create Default Message Templates
  const templates = [
    {
      name: "Guest Welcome",
      category: "GUEST",
      content: "Hello {{name}}, welcome to our hotel! Your booking for {{total}}₺ is confirmed. Balance: {{balance}}₺."
    },
    {
      name: "New Booking Notification",
      category: "STAFF",
      content: "🛎️ New Booking! Guest: {{name}} {{surname}}. Total: {{total}}₺. Handled by: {{staffName}}."
    }
  ];

  for (const t of templates) {
    await prisma.messageTemplate.upsert({
      where: { name: t.name },
      update: { content: t.content, category: t.category },
      create: t
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