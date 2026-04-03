import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from 'dotenv';

dotenv.config(); // Load the DATABASE_URL from .env

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  const standardRoom = await prisma.roomType.upsert({
    where: { name: "Standard Room" },
    update: {},
    create: { 
      name: "Standard Room", 
      basePrice: 1000, 
      capacity: 2,
      description: "Comfortable room with a city view."
    }
  });

  // 1. Create a Staff Member
  const staff = await prisma.staff.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Ali Mert",
      role: "ADMIN"
    }
  });

  // 2. Create an Account Owner
  const owner = await prisma.owner.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Hotel Management Group",
      address: "Istanbul, Turkey"
    }
  });

  // 3. Create a Bank Account
  await prisma.account.upsert({
    where: { id: 1 },
    update: {},
    create: {
      title: "Ziraat Bank Main",
      iban: "TR00 0000 0000 0000 0000 0000 00",
      ownerId: owner.id,
      balance: 5000.00
    }
  });

  // 4. Create some default Price Rules for the suggested price logic
  await prisma.priceRule.createMany({
    data: [
      { 
        name: "Standard Rate", 
        startDate: new Date("2026-01-01"), 
        endDate: new Date("2026-12-31"), 
        price: 1500, 
        roomTypeId: standardRoom.id, // Linked via ID now
        priority: 1 
      },
      { 
        name: "Summer Peak", 
        startDate: new Date("2026-06-01"), 
        endDate: new Date("2026-08-31"), 
        price: 2500, 
        roomTypeId: standardRoom.id, // Linked via ID now
        priority: 10 
      }
    ],
    skipDuplicates: true
  });

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