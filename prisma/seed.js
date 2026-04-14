import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Create Room Type (Updated: basePrice removed)
  const standardRoom = await prisma.roomType.upsert({
    where: { name: "Standard Room" },
    update: {},
    create: { 
      name: "Standard Room", 
      capacity: 2,
      description: "Comfortable room with a city view."
    },
    where: { name: "Deluxe Room" },
    update: {},
    create: { 
      name: "Deluxe Room", 
      capacity: 2,
      description: "Pool View."
    },
    where: { name: "Test Room" },
    update: {},
    create: { 
      name: "Test Room", 
      capacity: 4,
      description: "Test View."
    }
  });

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

  // 5. Create Price Rules (Standard Rate is now MANDATORY for pricing)
  await prisma.priceRule.createMany({
    data: [
      { 
        name: "Standard Rate", 
        startDate: new Date("2026-01-01"), 
        endDate: new Date("2030-12-31"), // Extended for long-term safety
        price: 1500, 
        roomTypeId: standardRoom.id,
        priority: 1 
      },
      { 
        name: "Summer Peak", 
        startDate: new Date("2026-06-01"), 
        endDate: new Date("2026-08-31"), 
        price: 2500, 
        roomTypeId: standardRoom.id,
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